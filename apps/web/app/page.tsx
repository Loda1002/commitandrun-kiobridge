"use client";

import { useState, useEffect } from "react";
import type { EnvironmentId, CanonicalProfile } from "@commitandrun/engine";
import {
  emptyAnswers,
  fetchQuestions,
  fetchRecommendation,
  findUnknownRequired,
  previewOrder,
  runPlan,
} from "../lib/api";
import { DEFAULT_ENVIRONMENT_ID } from "../lib/fixture";
import type {
  AnyAnswers,
  CandidateView,
  OptionSelection,
  QuestionDef,
  RecommendationView,
  RunView,
} from "../lib/types";

import { 
  toStoredProfile, 
  parseStoredProfile, 
  applyStoredProfile, 
  recallAnswers 
} from "@commitandrun/engine/profile-store";

import { AccessibilityBar } from "../components/AccessibilityBar";
import { StartScreen } from "../components/StartScreen";
import { ContextScreen } from "../components/ContextScreen";
import { RecommendScreen } from "../components/RecommendScreen";
import { ConfirmScreen } from "../components/ConfirmScreen";
import { ResultScreen } from "../components/ResultScreen";
import { StaffHelp } from "../components/StaffHelp";

const STEP_LABELS = ["상황 입력", "추천 결과", "최종 확인", "실행 결과"];

/**
 * 환경별 강조색. 흰 바탕에서 4.5:1 을 넘긴다 (4.60 / 4.55 / 4.53, 실측).
 *
 * 시작 화면 카드가 쓰는 밝은 색(#F98C42 · #51A3FA)과 **색상은 같고 명도만 낮춘
 * 값**이다. 카드는 큰 면적이라 밝아도 되지만, 이 값은 **읽는 글자**에도 쓰인다 —
 * 진행 단계 칩의 흰 글씨와 추천 이유 상자의 제목이 그것이다. 밝은 쪽을 그대로
 * 쓰면 관공서가 흰 바탕에서 1.58:1 로 떨어져 글자가 사라진다(실측).
 * (관공서 카드는 2026-08-16 부터 이 진한 초록 #5A8214 을 그대로 쓴다.)
 *
 * ⚠️ 고대비 모드에서는 쓰지 않는다. 아래에서 이 값을 `--color-accent` 로 인라인
 * 선언하는데, 인라인 선언은 `globals.css` 의 `:root[data-contrast="high"]` 보다
 * 가까운 조상이라 노란색(#ffe600)을 덮어버린다. 실제로 덮여 있었다 — root 는
 * #ffe600 인데 버튼이 실제로 읽는 값은 #ea580c 였다.
 */
const THEME_COLORS: Record<string, string> = {
  "chicken-store": "#C35306",
  hospital: "#0773E7",
  "public-office": "#5A8214",
};

/**
 * 병원의 supportModes 배열에만 접근성 요청이 들어오므로 해당 필드만 엄격하게 검사합니다.
 * (관공서의 STAFF_ASSIST 나 STAFF 등 일반 답변이 오탐되어 거짓 정보가 저장되는 것을 방지)
 */
function buildBaseProfile(isHighContrast: boolean, fontScale: number, currentAns?: AnyAnswers): CanonicalProfile {
  const modes = Array.isArray(currentAns?.supportModes) ? currentAns.supportModes : [];
  
  return {
    accessibility: {
      largeText: fontScale > 1 || modes.includes("LARGE_TEXT"),
      simpleSteps: false,
      visualGuidance: false,
      hearingSupport: modes.includes("HEARING_SUPPORT"),
      mobilitySupport: false,
      highContrast: isHighContrast,
      staffAssistancePreferred: modes.includes("STAFF_HELP"),
    },
    interaction: {
      preferredInput: "TOUCH",
      language: "ko-KR",
      confirmationRequired: false,
    },
  } as CanonicalProfile;
}

/**
 * 알레르기에 관한 것을 걷어낸 답변.
 *
 * 저장할 때와 되살릴 때 **양쪽에** 건다. 되살릴 때만 걸었더니 선언 자체는
 * localStorage 에 그대로 남아 있었다 — 되돌려주기엔 민감하다고 판단해 놓고
 * 디스크에는 쓰고 있었던 것이고, 둘 중 나쁜 쪽이 그것이다.
 * 되살리는 쪽 검사를 남겨 두는 이유는, 이 수정 이전에 이미 저장해 둔 브라우저가
 * 아직 그 값을 들고 있기 때문이다.
 */
const withoutAllergies = (answers: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...answers };
  for (const key of Object.keys(out)) {
    const lowered = key.toLowerCase();
    if (lowered.includes("allergen") || lowered.includes("allergy")) delete out[key];
  }
  return out;
};

export default function Home() {
  const [fontScale, setFontScale] = useState(1);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const [environmentId, setEnvironmentId] = useState<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  const [questions, setQuestions] = useState<QuestionDef[]>([]);
  const [answers, setAnswers] = useState<AnyAnswers>(emptyAnswers(DEFAULT_ENVIRONMENT_ID));
  const [recView, setRecView] = useState<RecommendationView | null>(null);
  const [chosen, setChosen] = useState<CandidateView | null>(null);
  const [selections, setSelections] = useState<OptionSelection[]>([]);
  const [runResult, setRunResult] = useState<RunView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isRestored, setIsRestored] = useState(false);
  const [restoredSavedAt, setRestoredSavedAt] = useState<string | null>(null);

  /**
   * 「모르겠어요」로 답하고 넘어온 필수 질문들의 이름.
   *
   * 상황 입력 화면은 이제 이것 때문에 사람을 막지 않는다 — 모른다고 말한 사람에게
   * 다시 고르라고 하는 화면이었다(팀장 지시, 2026-08-16). 대신 추천을 그리기 전에
   * 여기서 한 번 되묻는다. 비어 있으면 평소대로 추천이 나온다.
   */
  const [unknownNotices, setUnknownNotices] = useState<string[]>([]);
  /** 다른 화면에서 직원을 부를 때 올리는 숫자. StaffHelp 가 이걸 보고 호출을 건다. */
  const [staffCallRequest, setStaffCallRequest] = useState(0);
  /** 호출이 걸려 있는가. 호출 자체는 StaffHelp 가 들고 있고 여기는 표시용이다. */
  const [staffCalled, setStaffCalled] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => {
        setStatusMessage("");
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  useEffect(() => {
    fetchQuestions(environmentId).then(setQuestions).catch(console.error);
  }, [environmentId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("kiobridge.profile");
      if (raw) {
        const stored = parseStoredProfile(raw);
        if (stored) {
          setStatusMessage("저장된 화면 설정과 글씨 크기를 불러왔습니다.");
          setRestoredSavedAt(stored.savedAt);
          
          const baseProfile = buildBaseProfile(false, 1);
          const profile = applyStoredProfile(baseProfile, stored);
          if (profile) {
            if (profile.accessibility.largeText) {
              // StoredProfile 은 largeText 를 참/거짓으로만 들고 있어 1.25 와 1.5 를
              // 구분하지 못한다 — 125% 를 고른 사람이 150% 로 돌아오고 있었다.
              // 그래서 배율을 같은 키에 나란히 적어 두고 여기서 읽는다.
              // 그 값이 없는(이 수정 이전에 저장된) 브라우저에서는 **큰 글씨로 치는
              // 가장 작은 단계**로 돌아간다. 위로 올려 잡으면 사용자가 일부러 고른
              // 크기를 우리가 바꾸는 것이 된다.
              const savedScale = (JSON.parse(raw) as { fontScale?: unknown }).fontScale;
              const scale = typeof savedScale === "number" && savedScale > 1 ? savedScale : 1.25;
              setFontScale(scale);
              document.documentElement.style.setProperty("--font-scale", String(scale));
            }
            if (profile.accessibility.highContrast) {
              setIsHighContrast(true);
              document.documentElement.setAttribute("data-contrast", "high");
            }
          }
        }
      }
    } catch (e) {
      console.error("프로필 복원 실패:", e);
    }
  }, []);

  const saveProfile = (scale: number, contrast: boolean, currentAns: AnyAnswers, currentEnv: EnvironmentId) => {
    try {
      const baseProfile = buildBaseProfile(contrast, scale, currentAns);
      const stored = toStoredProfile(
        baseProfile,
        currentEnv,
        withoutAllergies(currentAns as Record<string, unknown>),
        new Date().toISOString()
      );
      // 배율은 StoredProfile 안이 아니라 그 **옆에** 싣는다. 엔진 계약을 건드리지
      // 않으면서 1.25 와 1.5 를 구분하기 위해서다. parseStoredProfile 은 자기가 아는
      // 필드만 골라 다시 만들므로(profile-store.ts) 이 형제 필드를 그냥 무시한다.
      localStorage.setItem(
        "kiobridge.profile",
        JSON.stringify({ ...stored, fontScale: scale }),
      );
    } catch (e) {
      console.error("프로필 저장 실패:", e);
    }
  };

  const handleDeleteProfile = () => {
    const hasProfile = localStorage.getItem("kiobridge.profile") !== null;
    if (hasProfile) {
      localStorage.removeItem("kiobridge.profile");
      setStatusMessage("저장된 정보를 지웠습니다. 글자 크기와 화면 설정도 기본값으로 돌아갑니다.");
    } else {
      setStatusMessage("지울 정보가 없습니다. 이 기기에 저장된 것이 없습니다.");
    }
    
    setFontScale(1);
    setIsHighContrast(false);
    document.documentElement.style.setProperty("--font-scale", "1");
    document.documentElement.removeAttribute("data-contrast");
    setAnswers(emptyAnswers(environmentId));
    setIsRestored(false);
    setRestoredSavedAt(null);
  };

  const toggleFontScale = () => {
    const nextScale = fontScale === 1 ? 1.25 : fontScale === 1.25 ? 1.5 : 1;
    setFontScale(nextScale);
    document.documentElement.style.setProperty("--font-scale", nextScale.toString());
    saveProfile(nextScale, isHighContrast, answers, environmentId);
  };

  const toggleContrast = () => {
    const nextContrast = !isHighContrast;
    setIsHighContrast(nextContrast);
    if (nextContrast) {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
    saveProfile(fontScale, nextContrast, answers, environmentId);
  };

  const handleStart = (picked: EnvironmentId) => {
    setEnvironmentId(picked);
    let initialAns = emptyAnswers(picked);
    setIsRestored(false);
    setRestoredSavedAt(null); 
    
    try {
      const raw = localStorage.getItem("kiobridge.profile");
      if (raw) {
        const stored = parseStoredProfile(raw);
        if (stored) {
          const recalled = recallAnswers(stored, picked);
          if (recalled && Object.keys(recalled).length > 0) {
            setIsRestored(true);
            setRestoredSavedAt(stored.savedAt); 
            // 알레르기 항목은 무조건 다시 묻는다. 지금은 저장할 때도 걷어내지만
            // (withoutAllergies), 이 수정 전에 저장해 둔 브라우저는 아직 들고 있다.
            initialAns = { ...initialAns, ...withoutAllergies(recalled) } as AnyAnswers;
          }
        }
      }
    } catch (e) {
      console.error("답변 복원 실패:", e);
    }
    
    setAnswers(initialAns);
    setCurrentStep(1);
  };

  const handleContextSubmit = async (userAnswers: AnyAnswers) => {
    setAnswers(userAnswers);
    saveProfile(fontScale, isHighContrast, userAnswers, environmentId);
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // 모른다고 하신 항목은 화면 이름 그대로 옮긴다. 엔진의 「…을 골라 주세요」는
      // 안 고른 사람에게 하는 말이라 여기서는 쓰지 않는다.
      setUnknownNotices(
        findUnknownRequired(userAnswers, environmentId).map(
          (u) => questions.find((q) => q.id === u.id)?.short
            ?? questions.find((q) => q.id === u.id)?.label
            ?? u.message,
        ),
      );
      const view = await fetchRecommendation(userAnswers, environmentId);
      setRecView(view);
      setCurrentStep(2);
    } catch (error) {
      console.error("추천 결과 조회 실패:", error);
      setErrorMessage("추천을 만들지 못했습니다. 답변을 확인하고 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoose = (candidate: CandidateView) => {
    setErrorMessage(null);
    try {
      setSelections(previewOrder(candidate.candidateId, answers, environmentId));
      setChosen(candidate);
      setCurrentStep(3);
    } catch (error) {
      console.error("주문 내용 확인 실패:", error);
      setErrorMessage("이 메뉴로는 진행할 수 없습니다. 아직 고르지 않은 항목이 있는지 확인하고 다시 답해 주세요.");
    }
  };

  const handleBackToContext = () => {
    setErrorMessage(null);
    setCurrentStep(1);
  };

  const handleApprove = async () => {
    if (!chosen) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const run = await runPlan(
        { candidateId: chosen.candidateId, approved: true },
        answers,
        environmentId,
      );
      setRunResult(run);
      setCurrentStep(4);
    } catch (error) {
      console.error("실행 계획 실행 실패:", error);
      setErrorMessage("주문을 진행하지 못했습니다. 아직 고르지 않은 항목이 있는지 확인하고 다시 답해 주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setEnvironmentId(DEFAULT_ENVIRONMENT_ID);
    setAnswers(emptyAnswers(DEFAULT_ENVIRONMENT_ID));
    setRecView(null);
    setChosen(null);
    setSelections([]);
    setRunResult(null);
    setErrorMessage(null);
    setIsRestored(false);
    setRestoredSavedAt(null);
    setUnknownNotices([]);
    setCurrentStep(0);
  };

  // 👇 여기에 isStartScreen 속성을 전달하여 현재 단계가 0일 때만 true가 되도록 변경했습니다.
  const a11yBar = (
    <AccessibilityBar
      fontScale={fontScale}
      isHighContrast={isHighContrast}
      onToggleFontScale={toggleFontScale}
      onToggleContrast={toggleContrast}
      isStartScreen={currentStep === 0}
    />
  );

  const accentStyle = isHighContrast
    ? undefined
    : ({
        "--color-accent": THEME_COLORS[environmentId] ?? THEME_COLORS["chicken-store"],
      } as React.CSSProperties);

  return (
    <div
      /* 위아래 여백을 32px 에서 20px 로 줄였다. 상황 입력이 한 화면에 들어가야
         하는데(팀장 지시 2026-08-16) 1280x800 에서 30px 이 모자랐다. 좌우 여백은
         그대로다. */
      className="min-h-screen flex flex-col p-4 sm:px-8 sm:py-5 max-w-4xl mx-auto gap-6 w-full relative pb-24"
      style={accentStyle}
    >
      {statusMessage && (
        <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-4xl pointer-events-none">
          <div 
            role="status" 
            aria-live="polite"
            className="w-full bg-gray-800 text-white font-bold p-5 rounded-2xl text-center shadow-2xl"
            style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}
          >
            {statusMessage}
          </div>
        </div>
      )}

      {currentStep > 0 && !isLoading && (
        <header className="pb-4 border-b border-gray-300 w-full flex flex-col gap-6">
          {a11yBar}
          <nav aria-label="진행 상황" className="w-full">
            <ol 
              className="flex justify-between items-center rounded-full p-2" 
              style={{ 
                backgroundColor: isHighContrast ? 'transparent' : '#f3f4f6', 
                border: isHighContrast ? '2px solid var(--color-fg)' : 'none' 
              }}
            >
              {STEP_LABELS.map((label, idx) => {
                const stepNumber = idx + 1;
                const isActive = currentStep === stepNumber;
                const isPassed = currentStep > stepNumber;
                return (
                  <li
                    key={label}
                    aria-current={isActive ? "step" : undefined}
                    className={`flex-1 text-center font-bold rounded-full py-2 transition-colors ${
                      isActive 
                        ? "bg-[var(--color-accent)] text-[var(--color-bg)] shadow-md" 
                        : isPassed ? "opacity-80" : "opacity-40"
                    }`}
                    style={{ fontSize: "calc(0.9rem * var(--font-scale))" }}
                  >
                    <span className="hidden sm:inline">{stepNumber}. </span>{label}
                  </li>
                );
              })}
            </ol>
          </nav>
        </header>
      )}

      {isLoading ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-8 text-center w-full">
          <div
            role="status"
            aria-label="데이터를 불러오는 중입니다"
            className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-transparent"
            style={{ borderTopColor: "var(--color-accent)", borderBottomColor: "var(--color-accent)" }}
          />
          <p className="font-bold opacity-80" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>
            잠시만 기다려 주세요...
          </p>
        </main>
      ) : (
        <>
          {errorMessage && (
            <p role="alert" className="rounded-xl p-4 font-bold border-2 border-red-500 bg-red-500/10" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              ⚠️ {errorMessage}
            </p>
          )}

          {currentStep === 0 && <StartScreen onStart={handleStart} accessibilityBar={a11yBar} isHighContrast={isHighContrast} onDeleteProfile={handleDeleteProfile} />}
          
          {currentStep === 1 && (
            <ContextScreen 
              questions={questions} 
              currentAnswers={answers} 
              onChange={(newAnswers) => {
                setAnswers(newAnswers);
                saveProfile(fontScale, isHighContrast, newAnswers, environmentId);
              }}
              onSubmit={handleContextSubmit} 
              isHighContrast={isHighContrast} 
              environmentId={environmentId} 
              onReset={handleReset} 
              isRestored={isRestored} 
              restoredSavedAt={restoredSavedAt} 
            />
          )}

          {currentStep === 2 && recView && <RecommendScreen recView={recView} environmentId={environmentId} isHighContrast={isHighContrast} onChoose={handleChoose} onBackToContext={handleBackToContext} unknownNotices={unknownNotices} onCallStaff={() => setStaffCallRequest((n) => n + 1)} staffCalled={staffCalled} />}
          {currentStep === 3 && chosen && <ConfirmScreen candidate={chosen} selections={selections} environmentId={environmentId} isHighContrast={isHighContrast} onApprove={handleApprove} onBackToContext={handleBackToContext} />}
          {currentStep === 4 && runResult && <ResultScreen runResult={runResult} environmentId={environmentId} isHighContrast={isHighContrast} onReset={handleReset} onDeleteProfile={handleDeleteProfile} />}

          {/* 감싸는 상자를 두지 않는다. 「직원 도움」 버튼은 `fixed` 로 떠 있어서
              흐름에 자리를 차지하지 않는데, `mt-auto pt-6 border-t` 상자만 남아
              모든 화면 아래에 빈 줄과 구분선을 57px 씩 그리고 있었다. */}
          <StaffHelp questions={questions} answers={answers} answersSubmitted={recView !== null} candidate={chosen ?? recView?.recommended ?? null} environmentId={environmentId} isHighContrast={isHighContrast} callRequest={staffCallRequest} onCallStateChange={setStaffCalled} />
        </>
      )}
    </div>
  );
}