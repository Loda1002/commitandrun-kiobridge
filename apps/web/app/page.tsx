"use client";

import { useState, useEffect } from "react";
import type { EnvironmentId, CanonicalProfile } from "@commitandrun/engine";
import {
  emptyAnswers,
  fetchQuestions,
  fetchRecommendation,
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

// 🔥 프로필 저장소 함수 임포트
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

// [접근성 2-3] 진행 상황 라벨
const STEP_LABELS = ["상황 입력", "추천 결과", "최종 확인", "실행 결과"];

/**
 * 환경별 강조색. 600 계열이라 흰 바탕에서 어두운 글자와 4.5:1 을 넘긴다.
 *
 * ⚠️ 고대비 모드에서는 쓰지 않는다. 아래에서 이 값을 `--color-accent` 로 인라인
 * 선언하는데, 인라인 선언은 `globals.css` 의 `:root[data-contrast="high"]` 보다
 * 가까운 조상이라 노란색(#ffe600)을 덮어버린다. 실제로 덮여 있었다 — root 는
 * #ffe600 인데 버튼이 실제로 읽는 값은 #ea580c 였다. 고대비를 켜도 강조색만 평상시
 * 그대로였다는 뜻이고, 이 화면에서 강조색은 포커스 링과 점수 막대가 쓴다.
 */
const THEME_COLORS: Record<string, string> = {
  "chicken-store": "#ea580c",
  hospital: "#2563eb",
  "public-office": "#059669",
};

// 🔥 엔진의 CanonicalProfile 규격을 맞추기 위한 기본 프로필 생성기
function buildBaseProfile(isHighContrast: boolean, fontScale: number): CanonicalProfile {
  return {
    accessibility: {
      largeText: fontScale > 1, // 1배율 이상이면 큰 글씨로 간주
      simpleSteps: false,
      visualGuidance: false,
      hearingSupport: false,
      mobilitySupport: false,
      highContrast: isHighContrast,
      staffAssistancePreferred: false,
    },
    interaction: {
      preferredInput: "TOUCH",
      language: "ko-KR",
      confirmationRequired: false,
    },
  } as CanonicalProfile; // 필요한 속성만 채워서 전달 (엔진은 이 두 속성만 읽음)
}

export default function Home() {
  const [fontScale, setFontScale] = useState(1);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // [요건 1] 현재 환경(키오스크) 식별자 상태
  const [environmentId, setEnvironmentId] = useState<EnvironmentId>(DEFAULT_ENVIRONMENT_ID);
  const [questions, setQuestions] = useState<QuestionDef[]>([]);
  const [answers, setAnswers] = useState<AnyAnswers>(emptyAnswers(DEFAULT_ENVIRONMENT_ID));
  const [recView, setRecView] = useState<RecommendationView | null>(null);
  const [chosen, setChosen] = useState<CandidateView | null>(null);
  const [selections, setSelections] = useState<OptionSelection[]>([]);
  const [runResult, setRunResult] = useState<RunView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 🔥 스크린리더 안내용 상태
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    fetchQuestions(environmentId).then(setQuestions).catch(console.error);
  }, [environmentId]);

  // 🔥 앱 최초 진입 시 로컬스토리지에서 프로필 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem("kiobridge.profile");
      if (raw) {
        const stored = parseStoredProfile(raw);
        if (stored) {
          const baseProfile = buildBaseProfile(false, 1);
          const profile = applyStoredProfile(baseProfile, stored);
          if (profile) {
            // 엔진은 largeText 플래그만 주므로 화면 단위(1.5)로 변환
            if (profile.accessibility.largeText) {
              setFontScale(1.5);
              document.documentElement.style.setProperty("--font-scale", "1.5");
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

  // 🔥 프로필 저장 공통 함수
  const saveProfile = (scale: number, contrast: boolean, currentAns: AnyAnswers, currentEnv: EnvironmentId) => {
    try {
      const baseProfile = buildBaseProfile(contrast, scale);
      const stored = toStoredProfile(
        baseProfile, 
        currentEnv, 
        currentAns as Record<string, unknown>, 
        new Date().toISOString()
      );
      localStorage.setItem("kiobridge.profile", JSON.stringify(stored));
    } catch (e) {
      console.error("프로필 저장 실패:", e);
    }
  };

  // 🔥 프로필 삭제 공통 함수
  const handleDeleteProfile = () => {
    localStorage.removeItem("kiobridge.profile");
    setFontScale(1);
    setIsHighContrast(false);
    document.documentElement.style.setProperty("--font-scale", "1");
    document.documentElement.removeAttribute("data-contrast");
    setAnswers(emptyAnswers(environmentId));
    
    setStatusMessage("저장된 정보가 모두 삭제되었습니다.");
    setTimeout(() => setStatusMessage(""), 3000);
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
    
    // 🔥 이전 폼 답변 복원
    try {
      const raw = localStorage.getItem("kiobridge.profile");
      if (raw) {
        const stored = parseStoredProfile(raw);
        if (stored) {
          const recalled = recallAnswers(stored, picked);
          if (recalled) {
            // 🔥 핵심: 알레르기 항목은 무조건 다시 묻도록 복원 데이터에서 강제 삭제
            for (const key of Object.keys(recalled)) {
              if (key.toLowerCase().includes("allergen") || key.toLowerCase().includes("allergy")) {
                delete recalled[key];
              }
            }
            // 빈 기본값 위에 알레르기가 제거된 복원값만 덮어씌움
            initialAns = { ...initialAns, ...recalled } as AnyAnswers;
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
    setCurrentStep(0); // 환경 선택(StartScreen)으로 완전 복귀
  };

  const a11yBar = (
    <AccessibilityBar
      fontScale={fontScale}
      isHighContrast={isHighContrast}
      onToggleFontScale={toggleFontScale}
      onToggleContrast={toggleContrast}
    />
  );

  // 고대비일 때는 아무것도 넣지 않는다 — 넣으면 그게 곧 노란색을 덮는 선언이 된다.
  const accentStyle = isHighContrast
    ? undefined
    : ({
        "--color-accent": THEME_COLORS[environmentId] ?? THEME_COLORS["chicken-store"],
      } as React.CSSProperties);

  return (
    <div
      className="min-h-screen flex flex-col p-4 sm:p-8 max-w-4xl mx-auto gap-8 w-full relative pb-24"
      style={accentStyle}
    >
      {/* 🔥 스크린리더를 위한 상태 메시지 읽기 영역 */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      {currentStep > 0 && !isLoading && (
        <header className="pb-4 border-b border-gray-300 w-full flex flex-col gap-6">
          {a11yBar}
          {/* [접근성 2-3] 진행 상황 인디케이터 (aria-current 적용) */}
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
          {/* [결함 방어] 세션 10/12 - 엔진 거절 시 죽지 않고 alert 띄우는 로직 보존 */}
          {errorMessage && (
            <p role="alert" className="rounded-xl p-4 font-bold border-2 border-red-500 bg-red-500/10" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              ⚠️ {errorMessage}
            </p>
          )}

          {currentStep === 0 && <StartScreen onStart={handleStart} accessibilityBar={a11yBar} isHighContrast={isHighContrast} onDeleteProfile={handleDeleteProfile} />}
          {currentStep === 1 && <ContextScreen questions={questions} currentAnswers={answers} onSubmit={handleContextSubmit} isHighContrast={isHighContrast} environmentId={environmentId} onReset={handleReset} />}
          {currentStep === 2 && recView && <RecommendScreen recView={recView} environmentId={environmentId} isHighContrast={isHighContrast} onChoose={handleChoose} onBackToContext={handleBackToContext} />}
          {currentStep === 3 && chosen && <ConfirmScreen candidate={chosen} selections={selections} environmentId={environmentId} isHighContrast={isHighContrast} onApprove={handleApprove} onBackToContext={handleBackToContext} />}
          {currentStep === 4 && runResult && <ResultScreen runResult={runResult} environmentId={environmentId} isHighContrast={isHighContrast} onReset={handleReset} onDeleteProfile={handleDeleteProfile} />}

          {/* [결함 방어] 세션 10/12 - 키오스크에 갇히지 않게 StaffHelp 고정 */}
          <div className="mt-auto pt-6 border-t border-gray-300 w-full">
            <StaffHelp questions={questions} answers={answers} answersSubmitted={recView !== null} candidate={chosen ?? recView?.recommended ?? null} environmentId={environmentId} isHighContrast={isHighContrast} />
          </div>
        </>
      )}
    </div>
  );
}