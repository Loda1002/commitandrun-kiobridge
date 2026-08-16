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
import { envColor } from "../lib/theme";
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

/**
 * 이제 묻지 않는 항목을 걷어낸 답변. 되살릴 때만 건다.
 *
 * 컵(`cupOption`)은 2026-08-16 에 질문에서 뺐다 — 환경 데이터가 `required: false`
 * 로 둔 선택 항목이고, 이용 방식을 고르면 어차피 매장 규칙으로 따라오기 때문이다.
 * 그런데 그 전에 저장해 둔 브라우저는 아직 그 값을 들고 있다. 그대로 되살리면
 * **화면 어디에도 없는 답이 최종 확인 화면에 뜬다** — 고른 적 없는 컵을 승인하라고
 * 하는 셈이고, 화면에 그 답을 고칠 자리가 없으니 되돌아가도 지울 수가 없다.
 */
const withoutUnasked = (answers: Record<string, unknown>): Record<string, unknown> => {
  const out = { ...answers };
  delete out.cupOption;
  return out;
};

/**
 * 되살린 답 중에 **사람이 실제로 고른 것**이 하나라도 있는가.
 *
 * 전에는 `Object.keys(recalled).length > 0` 이었다. 그런데 저장되는 답 묶음은
 * 빈 칸까지 자리를 갖고 있어서(`emptyAnswers`), **아무것도 안 고른 사람의
 * 프로필도 키는 다 차 있다.** 그래서 시작 화면에서 고대비나 큰 글씨를 한 번
 * 누른 것만으로 다음 화면에 「지난번에 답하신 내용을 채워 두었습니다」가 떴다 —
 * 채워 둔 것이 없는데 그렇게 말하니 사실이 아니고, 그 상자가 72px 을 먹어
 * 1280x720 에서 진행 버튼을 화면 밖으로 밀어냈다(실측, 2026-08-16).
 *
 * 그 두 가지가 하필 **접근성 설정을 켜는 사람**에게만 일어난다. 이 서비스가
 * 가장 먼저 챙겨야 하는 사람이다.
 *
 * 그래서 「키가 있는가」가 아니라 「빈 양식과 다른가」로 판정한다. 수량처럼
 * 처음부터 기본값이 들어 있는 칸은 기본값 그대로면 고른 것으로 세지 않는다.
 */
const hasRealAnswer = (
  restorable: Record<string, unknown>,
  picked: EnvironmentId,
): boolean => {
  const blank = emptyAnswers(picked) as Record<string, unknown>;
  return Object.entries(restorable).some(([key, value]) => {
    const base = blank[key];
    if (Array.isArray(value) || Array.isArray(base)) {
      return JSON.stringify(value ?? []) !== JSON.stringify(base ?? []);
    }
    return value !== base;
  });
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
  /** 「처음으로」에서 올린다. 앞사람의 호출을 다음 사람 화면에 남기지 않는다. */
  const [staffCancelRequest, setStaffCancelRequest] = useState(0);

  /**
   * 되묻기 화면이 떠 있는가 — 그 화면은 자기 흐름 안에 직원 호출 버튼을 갖고 있어서,
   * 떠 있는 버튼까지 두면 똑같은 것이 둘이 되고 실제로 겹쳤다(실측).
   * 판정은 RecommendScreen 의 게이트 조건과 같은 식이다. 한쪽만 고치면 어긋나므로
   * 그 조건을 바꿀 때는 여기도 함께 본다.
   */
  const reconfirming =
    currentStep === 2 &&
    recView !== null &&
    (recView.reconfirmRequests.length > 0 || unknownNotices.length > 0);

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
          // 알레르기 항목은 무조건 다시 묻는다. 지금은 저장할 때도 걷어내지만
          // (withoutAllergies), 이 수정 전에 저장해 둔 브라우저는 아직 들고 있다.
          const restorable = withoutUnasked(withoutAllergies(recalled ?? {}));
          if (hasRealAnswer(restorable, picked)) {
            setIsRestored(true);
            setRestoredSavedAt(stored.savedAt);
            initialAns = { ...initialAns, ...restorable } as AnyAnswers;
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
    setStaffCancelRequest((n) => n + 1);
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

  /**
   * 강조색은 `lib/theme.ts` 의 환경색 하나를 그대로 쓴다. 시작 화면 카드와 같은
   * 값이라 화면이 넘어가도 같은 주황·파랑이다(팀장 지시, 2026-08-16).
   *
   * ⚠️ 고대비 모드에서는 선언하지 않는다. 여기서 `--color-accent` 를 인라인으로
   * 주면 `globals.css` 의 `:root[data-contrast="high"]` 보다 가까운 조상이라
   * 노란색(#ffe600)을 덮어버린다. 실제로 덮여 있었다 — root 는 #ffe600 인데
   * 버튼이 읽는 값은 #ea580c 였다.
   */
  const accentStyle = isHighContrast
    ? undefined
    : ({ "--color-accent": envColor(environmentId) } as React.CSSProperties);

  return (
    <div
      /* 위아래 여백을 32 → 20 → 12px 로 줄여 왔다. 상황 입력이 한 화면에 들어가야
         하는데(팀장 지시 2026-08-16) 기준을 1280x**720** 으로 내리면서 다시 모자랐다.
         800 이 아니라 720 인 이유는 그것이 흔한 노트북 창 높이이고, 세션 32 가
         800 에서 「넘침 0」으로 재 둔 화면이 720 에서 65~70px 넘쳤기 때문이다.
         좌우 여백과 글자 크기, 44px 터치 영역은 건드리지 않는다. */
      className="min-h-screen flex flex-col p-4 sm:px-8 sm:py-2 max-w-4xl mx-auto gap-4 w-full relative"
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
        <header className="pb-2 border-b border-gray-300 w-full flex flex-col gap-3">
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
                        ? "bg-[var(--color-accent)] shadow-md"
                        : isPassed ? "opacity-80" : "opacity-40"
                    }`}
                    /* 지금 단계 칩의 글자만 검정으로 고정한다.
                       이 칩은 0.9rem(=14.4px) 이라 굵은 글씨여도 WCAG 의 큰 글씨
                       기준(18.66px)에 못 미쳐 본문 기준 4.5:1 을 지켜야 한다.
                       전에는 `--color-bg` 를 썼는데, 보통 화면에서 그것은 흰색이라
                       환경색 위에서 3.26 / 3.46 / 4.53:1 이었다 — 셋 중 둘이 미달.
                       검정으로 내리면 6.45 / 6.07 / 4.64:1 로 셋 다 넘는다.
                       고대비에서도 맞다: 노랑(#ffe600) 위 검정은 15.9:1 이고,
                       `--color-bg` 가 어차피 검정이라 그쪽 생김새는 안 바뀐다.
                       ⚠️ `--color-fg`(#1a1a1a) 로는 관공서가 3.84:1 로 모자란다.
                       순검정이어야 한다. */
                    style={{ fontSize: "calc(0.9rem * var(--font-scale))", color: isActive ? "#000000" : undefined }}
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
              answersSubmitted={recView !== null}
            />
          )}

          {currentStep === 2 && recView && <RecommendScreen recView={recView} environmentId={environmentId} isHighContrast={isHighContrast} onChoose={handleChoose} onBackToContext={handleBackToContext} unknownNotices={unknownNotices} onCallStaff={() => setStaffCallRequest((n) => n + 1)} staffCalled={staffCalled} />}
          {currentStep === 3 && chosen && <ConfirmScreen candidate={chosen} selections={selections} environmentId={environmentId} isHighContrast={isHighContrast} onApprove={handleApprove} onBackToContext={handleBackToContext} />}
          {currentStep === 4 && runResult && <ResultScreen runResult={runResult} environmentId={environmentId} isHighContrast={isHighContrast} onReset={handleReset} onDeleteProfile={handleDeleteProfile} />}
        </>
      )}

      {/* 감싸는 상자를 두지 않는다. 「직원 도움」 버튼은 `fixed` 로 떠 있어서
          흐름에 자리를 차지하지 않는데, `mt-auto pt-6 border-t` 상자만 남아
          모든 화면 아래에 빈 줄과 구분선을 57px 씩 그리고 있었다.

          ⚠️ 로딩 분기 **바깥**이다. 안에 두면 추천을 계산하는 잠깐 사이에 이
          컴포넌트가 통째로 내려갔다 올라오고, 그때마다 걸어 둔 호출과 기다린
          시간이 사라진다. 「직원 오는 중 3:12」를 보고 있던 사람이 다음 화면에서
          「직원 부르기」를 다시 만나면, 부른 적이 없다는 뜻으로 읽고 또 누른다
          (팀장 지시, 2026-08-16). */}
      <StaffHelp questions={questions} answers={answers} answersSubmitted={recView !== null} candidate={chosen ?? recView?.recommended ?? null} environmentId={environmentId} isHighContrast={isHighContrast} callRequest={staffCallRequest} cancelRequest={staffCancelRequest} onCallStateChange={setStaffCalled} triggerHidden={reconfirming || isLoading} />
    </div>
  );
}