"use client";

import { useState, useEffect } from "react";
import { fetchQuestions, fetchRecommendation, previewOrder, runPlan } from "../lib/api";
import type {
  Answers,
  CandidateView,
  OptionSelection,
  QuestionDef,
  RecommendationView,
  RunView,
} from "../lib/types";

import { AccessibilityBar } from "../components/AccessibilityBar";
import { StartScreen } from "../components/StartScreen";
import { ContextScreen } from "../components/ContextScreen";
import { RecommendScreen } from "../components/RecommendScreen";
import { ConfirmScreen } from "../components/ConfirmScreen";
import { ResultScreen } from "../components/ResultScreen";
import { StaffHelp } from "../components/StaffHelp";

const EMPTY_ANSWERS: Answers = {
  serviceType: "",
  spicyLevel: "",
  boneType: "",
  cupOption: "",
  quantity: "Q1",
  allergenIds: [],
  maxPriceKrw: null,
};

export default function Home() {
  const [fontScale, setFontScale] = useState(1);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const [questions, setQuestions] = useState<QuestionDef[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [recView, setRecView] = useState<RecommendationView | null>(null);
  /**
   * What the user is taking forward. Starts as the top pick, but an alternative
   * can replace it — the recommendation is a suggestion, not a decision.
   */
  const [chosen, setChosen] = useState<CandidateView | null>(null);
  /** What that choice will actually be ordered with. Shown on the approval screen. */
  const [selections, setSelections] = useState<OptionSelection[]>([]);
  const [runResult, setRunResult] = useState<RunView | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  /**
   * The engine refuses rather than guesses, so a call can legitimately fail —
   * approving a menu without saying how you want to receive it, for one. The
   * button used to do nothing at all in that case; say what happened instead.
   */
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchQuestions().then(setQuestions).catch(console.error);
  }, []);

  const toggleFontScale = () => {
    const nextScale = fontScale === 1 ? 1.25 : fontScale === 1.25 ? 1.5 : 1;
    setFontScale(nextScale);
    document.documentElement.style.setProperty("--font-scale", nextScale.toString());
  };

  const toggleContrast = () => {
    const nextContrast = !isHighContrast;
    setIsHighContrast(nextContrast);
    if (nextContrast) {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
  };

  const handleStart = () => {
    setCurrentStep(1);
  };

  const handleContextSubmit = async (userAnswers: Answers) => {
    setAnswers(userAnswers);
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const view = await fetchRecommendation(userAnswers);
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
      // Work out what this menu will actually be ordered with before showing
      // the approval screen. If the engine refuses, the user finds out here
      // rather than after pressing the button that says "진행할게요".
      setSelections(previewOrder(candidate.candidateId, answers));
      setChosen(candidate);
      setCurrentStep(3);
    } catch (error) {
      console.error("주문 내용 확인 실패:", error);
      setErrorMessage(
        "이 메뉴로는 진행할 수 없습니다. 아직 고르지 않은 항목이 있는지 확인하고 다시 답해 주세요.",
      );
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
      // The same answers that produced the recommendation: the plan has to be
      // for the order the user was actually shown and approved.
      const run = await runPlan({ candidateId: chosen.candidateId, approved: true }, answers);
      setRunResult(run);
      setCurrentStep(4);
    } catch (error) {
      console.error("실행 계획 실행 실패:", error);
      setErrorMessage(
        "주문을 진행하지 못했습니다. 아직 고르지 않은 항목이 있는지 확인하고 다시 답해 주세요.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setAnswers(EMPTY_ANSWERS);
    setRecView(null);
    setChosen(null);
    setSelections([]);
    setRunResult(null);
    setErrorMessage(null);
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

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-8 max-w-4xl mx-auto gap-8 w-full">
      {currentStep > 0 && !isLoading && (
        <header className="pb-4 border-b border-gray-300 w-full flex justify-center">
          {a11yBar}
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
            <p
              role="alert"
              className="rounded-xl p-4 font-bold border-2 border-red-500 bg-red-500/10"
              style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}
            >
              ⚠️ {errorMessage}
            </p>
          )}

          {currentStep === 0 && (
            <StartScreen onStart={handleStart} accessibilityBar={a11yBar} />
          )}

          {currentStep === 1 && (
            <ContextScreen
              questions={questions}
              currentAnswers={answers}
              onSubmit={handleContextSubmit}
              isHighContrast={isHighContrast}
            />
          )}

          {currentStep === 2 && recView && (
            <RecommendScreen
              recView={recView}
              isHighContrast={isHighContrast}
              onChoose={handleChoose}
              onBackToContext={handleBackToContext}
            />
          )}

          {currentStep === 3 && chosen && (
            <ConfirmScreen
              candidate={chosen}
              selections={selections}
              isHighContrast={isHighContrast}
              onApprove={handleApprove}
              onBackToContext={handleBackToContext}
            />
          )}

          {currentStep === 4 && runResult && (
            <ResultScreen
              runResult={runResult}
              isHighContrast={isHighContrast}
              onReset={handleReset}
            />
          )}

          {/* Same place on every screen. A kiosk you can get stuck in is the
              problem we are fixing, so the way out never moves. */}
          <div className="mt-auto pt-6 border-t border-gray-300 w-full">
            <StaffHelp
              answers={answers}
              answersSubmitted={recView !== null}
              candidate={chosen ?? recView?.recommended ?? null}
              isHighContrast={isHighContrast}
            />
          </div>
        </>
      )}
    </div>
  );
}