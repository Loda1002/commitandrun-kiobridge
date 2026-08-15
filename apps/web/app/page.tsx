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

const THEME_COLORS: Record<string, string> = {
  "chicken-store": "#ea580c",
  hospital: "#2563eb",
  "public-office": "#059669",
};

// 병원의 supportModes 배열에만 접근성 요청이 들어오므로 해당 필드만 엄격하게 검사합니다.
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
    setCurrentStep(0); 
  };

  const a11yBar = (
    <AccessibilityBar
      fontScale={fontScale}
      isHighContrast={isHighContrast}
      onToggleFontScale={toggleFontScale}
      onToggleContrast={toggleContrast}
    />
  );

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

          {currentStep === 2 && recView && <RecommendScreen recView={recView} environmentId={environmentId} isHighContrast={isHighContrast} onChoose={handleChoose} onBackToContext={handleBackToContext} />}
          {currentStep === 3 && chosen && <ConfirmScreen candidate={chosen} selections={selections} environmentId={environmentId} isHighContrast={isHighContrast} onApprove={handleApprove} onBackToContext={handleBackToContext} />}
          {currentStep === 4 && runResult && <ResultScreen runResult={runResult} environmentId={environmentId} isHighContrast={isHighContrast} onReset={handleReset} onDeleteProfile={handleDeleteProfile} />}

          <div className="mt-auto pt-6 border-t border-gray-300 w-full">
            <StaffHelp questions={questions} answers={answers} answersSubmitted={recView !== null} candidate={chosen ?? recView?.recommended ?? null} environmentId={environmentId} isHighContrast={isHighContrast} />
          </div>
        </>
      )}
    </div>
  );
}