"use client";

import { useState, useEffect } from "react";
import { fetchQuestions, fetchRecommendation, runPlan } from "../lib/api";
import type { Answers, QuestionDef, RecommendationView, RunView } from "../lib/types";

import { AccessibilityBar } from "../components/AccessibilityBar";
import { StartScreen } from "../components/StartScreen";
import { ContextScreen } from "../components/ContextScreen";
import { RecommendScreen } from "../components/RecommendScreen";
import { ConfirmScreen } from "../components/ConfirmScreen";
import { ResultScreen } from "../components/ResultScreen";

// 대회 요건: 사용자가 직접 고르기 전에는 아무것도 미리 선택되어 있지 않아야 함 (개수만 기본 Q1)
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
  const [currentStep, setCurrentStep] = useState(0); // 0: 시작, 1: 상황입력, 2: 추천결과, 3: 최종확인, 4: 결과+안전리포트

  const [questions, setQuestions] = useState<QuestionDef[]>([]);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [recView, setRecView] = useState<RecommendationView | null>(null);
  const [runResult, setRunResult] = useState<RunView | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  // Step 0 -> Step 1 (상황 입력 화면)
  const handleStart = () => {
    setCurrentStep(1);
  };

  // Step 1 -> Step 2 (상황 입력 완료 -> 추천 결과 API 호출)
  const handleContextSubmit = async (userAnswers: Answers) => {
    setAnswers(userAnswers);
    setIsLoading(true);
    try {
      const view = await fetchRecommendation(userAnswers);
      setRecView(view);
      setCurrentStep(2);
    } catch (error) {
      console.error("추천 결과 조회 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 -> Step 3 (추천 결과 -> 최종 확인 화면)
  const handleRecommendNext = () => {
    setCurrentStep(3);
  };

  // 다시 상황 입력 화면(Step 1)으로 이동
  const handleBackToContext = () => {
    setCurrentStep(1);
  };

  // Step 3 -> Step 4 (사람 승인 게이트 -> 실행 계획 + 안전 리포트 API 호출)
  const handleApprove = async () => {
    if (!recView || !recView.recommended) return;
    setIsLoading(true);
    try {
      const run = await runPlan({
        candidateId: recView.recommended.candidateId,
        approved: true, // 사용자가 직접 버튼을 눌렀을 때만 true 전달
      });
      setRunResult(run);
      setCurrentStep(4);
    } catch (error) {
      console.error("실행 계획 실행 실패:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setAnswers(EMPTY_ANSWERS);
    setRecView(null);
    setRunResult(null);
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
              onNext={handleRecommendNext}
              onBackToContext={handleBackToContext}
            />
          )}

          {currentStep === 3 && recView && recView.recommended && (
            <ConfirmScreen
              candidate={recView.recommended}
              answers={answers}
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
        </>
      )}
    </div>
  );
}