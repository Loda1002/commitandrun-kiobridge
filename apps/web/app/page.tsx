"use client";

import { useState, useEffect } from "react";
// 🚨 [절대 규칙 1 & 2 준수] mock.ts나 fetch를 직접 쓰지 않고 오직 api.ts만 부릅니다.
import { fetchRecommendation, runPlan, defaultAnswers } from "../lib/api";
import type { Answers, RecommendationView, RunView } from "../lib/types";

/**
 * 🎯 [핵심 화면] AI 자동 주문 서비스 메인 페이지
 * 
 * 우리 서비스의 차별점인 '완벽한 접근성(a11y)'과 '설명 가능한 AI(XAI)'를 보여주는 화면입니다.
 * 추후 이 화면에 실제 백엔드 데이터를 연동하실 팀원분들은 아래 주석들을 참고해 주세요.
 */
export default function Home() {
  // 1. 전역 상태 (테마 및 화면 이동)
  const [fontScale, setFontScale] = useState(1); // 글씨 배율 (1배, 1.25배, 1.5배 순환)
  const [isHighContrast, setIsHighContrast] = useState(false); // 고대비 모드 켜짐/꺼짐 상태
  const [currentStep, setCurrentStep] = useState(0); // 현재 화면 상태 (0: 시작화면, 1: 추천 결과, 2: 안전 리포트)

  // 2. API 데이터 및 로딩 상태 관리
  const [answers, setAnswers] = useState<Answers | null>(null);
  const [recView, setRecView] = useState<RecommendationView | null>(null);
  const [runResult, setRunResult] = useState<RunView | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 컴포넌트 마운트 시 기본 폼 데이터(defaultAnswers)를 미리 불러옵니다 (모두 async 취급)
  useEffect(() => {
    const initAnswers = async () => {
      try {
        const defaultAns = await defaultAnswers();
        setAnswers(defaultAns);
      } catch (error) {
        console.error("기본값을 불러오는 데 실패했습니다.", error);
      }
    };
    initAnswers();
  }, []);

  /**
   * 🔠 글씨 크기 조절 함수
   */
  const toggleFontScale = () => {
    const nextScale = fontScale === 1 ? 1.25 : fontScale === 1.25 ? 1.5 : 1;
    setFontScale(nextScale);
    document.documentElement.style.setProperty("--font-scale", nextScale.toString());
  };

  /**
   * 🌗 고대비 모드 조절 함수
   */
  const toggleContrast = () => {
    const nextContrast = !isHighContrast;
    setIsHighContrast(nextContrast);
    if (nextContrast) {
      document.documentElement.setAttribute("data-contrast", "high");
    } else {
      document.documentElement.removeAttribute("data-contrast");
    }
  };

  /**
   * 🚀 STEP 0 -> STEP 1: 추천 결과 받아오기
   */
  const handleStart = async () => {
    setIsLoading(true);
    try {
      const currentAnswers = answers || (await defaultAnswers());
      const view = await fetchRecommendation(currentAnswers);
      setRecView(view);
      setCurrentStep(1);
    } catch (error) {
      console.error("추천 결과를 불러오는 중 오류가 발생했습니다:", error);
    } finally {
      setIsLoading(false); // 0.4초 딜레이 후 화면 전환
    }
  };

  /**
   * 🛡️ STEP 1 -> STEP 2: 안전 리포트 생성하기
   */
  const handleRunPlan = async () => {
    if (!recView || !recView.recommended) return;
    setIsLoading(true);
    try {
      const run = await runPlan({
        candidateId: recView.recommended.candidateId,
        approved: true,
      });
      setRunResult(run);
      setCurrentStep(2);
    } catch (error) {
      console.error("안전 리포트를 생성하는 중 오류가 발생했습니다:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 처음으로 돌아가기 (리셋)
   */
  const handleReset = () => {
    setRecView(null);
    setRunResult(null);
    setCurrentStep(0);
  };

  /**
   * 🧩 [공통 컴포넌트] 접근성 설정 버튼 그룹
   */
  const themeButtons = (
    <div className="flex justify-center gap-3 w-full">
      <button
        onClick={toggleFontScale}
        // focus-visible: 마우스 대신 키보드(Tab)로 조작할 때 굵은 테두리가 생겨 현재 위치를 알려줍니다.
        // 테두리 색은 --color-accent 를 따라가므로 고대비 모드에서는 노란색으로 바뀝니다.
        className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-105 active:scale-95"
        style={{
          minHeight: 'var(--tap-min)', // 손떨림이 있는 분들도 쉽게 누를 수 있게 최소 44px 터치 영역을 보장합니다.
          padding: '0.5rem 1.5rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-bg)',
          fontSize: 'calc(1rem * var(--font-scale))',
          fontWeight: 'bold',
        }}
      >
        큰 글씨 (현재: {fontScale}배)
      </button>

      <button
        onClick={toggleContrast}
        className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-105 active:scale-95"
        style={{
          minHeight: 'var(--tap-min)',
          padding: '0.5rem 1.5rem',
          borderRadius: 'var(--radius)',
          backgroundColor: 'var(--color-accent)',
          color: 'var(--color-bg)',
          fontSize: 'calc(1rem * var(--font-scale))',
          fontWeight: 'bold',
        }}
      >
        {isHighContrast ? "일반 화면으로 변경" : "고대비 화면으로 변경"}
      </button>
    </div>
  );

  return (
    // 글씨가 1.5배로 커졌을 때 텍스트가 찌그러지지 않도록 좌우 폭(max-w-4xl)을 아주 넉넉하게 잡았습니다.
    <div className="min-h-screen flex flex-col p-4 sm:p-8 max-w-4xl mx-auto gap-8 w-full">
      
      {/* 주문 과정 중(Step 1, 2)에는 설정 버튼을 화면 상단에 배치합니다. */}
      {currentStep > 0 && !isLoading && (
        <header className="pb-4 border-b border-gray-300 w-full flex justify-center">
          {themeButtons}
        </header>
      )}

      {/* ==========================================================
          ⏳ 로딩 화면 (0.4초 딜레이 대응)

          animate-in / fade-in / zoom-in 은 tailwindcss-animate 의 클래스인데 그 패키지를
          안 쓴다. 오류 없이 무시되어 화면상으로는 멀쩡해 보이므로 남겨두면 다음 사람이
          "애니메이션이 걸려 있다"고 오해한다. 회전은 animate-spin(기본 제공)이 맡는다.
         ========================================================== */}
      {isLoading ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-8 text-center w-full">
          <div 
            role="status" 
            aria-label="데이터를 불러오는 중입니다"
            className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-transparent"
            style={{ borderTopColor: 'var(--color-accent)', borderBottomColor: 'var(--color-accent)' }}
          ></div>
          <p className="font-bold opacity-80" style={{ fontSize: 'calc(1.5rem * var(--font-scale))' }}>
            잠시만 기다려 주세요...
          </p>
        </main>
      ) : 

      /* ==========================================================
          📍 STEP 0: 메인 시작 화면
          기획 요건에 따라 '로그인 없이 시작(비회원)'을 기본이자 가장 눈에 띄게 배치합니다.
         ========================================================== */
      currentStep === 0 ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-12 text-center w-full">
          <div>
            <h1 className="font-extrabold" style={{ fontSize: 'calc(2.5rem * var(--font-scale))' }}>
              안녕하세요!
            </h1>
            <p className="opacity-80 mt-4" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
              버튼을 누르면 바로 주문을 시작할 수 있습니다.
            </p>
          </div>
          
          <div className="flex flex-col gap-4 w-full max-w-md">
            <button 
              onClick={handleStart}
              className="w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95 shadow-lg"
              style={{
                minHeight: 'calc(var(--tap-min) + 16px)', // 메인 버튼이라 44px보다 더 큼직하게 설정
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--color-accent)',
                color: 'var(--color-bg)',
                fontSize: 'calc(1.3rem * var(--font-scale))',
                fontWeight: 'bold',
              }}
            >
              로그인 없이 시작
            </button>
          </div>

          {/* 시작 화면에서는 설정 버튼이 메인 액션을 방해하지 않도록 맨 밑으로 내립니다. */}
          <div className="mt-8 border-t border-gray-200 pt-8 w-full">
            {themeButtons}
          </div>
        </main>
      ) : 

      /* ==========================================================
          📍 STEP 1: 맞춤형 추천 결과 화면 (Explainable AI)
          AI가 왜 이 메뉴를 추천했는지(점수), 왜 다른 건 뺐는지(알레르기 등)를 투명하게 공개합니다.
         ========================================================== */
      currentStep === 1 && recView ? (
        <main className="flex flex-col gap-8 w-full">
          <h1 className="font-extrabold text-center" style={{ fontSize: 'calc(2rem * var(--font-scale))' }}>
            맞춤형 추천 결과
          </h1>

          {/* [1위 메뉴 추천 카드 - api 동적 데이터 바인딩] */}
          {recView.recommended ? (
            <section className="border-2 rounded-2xl p-6 md:p-8" style={{ borderColor: 'var(--color-accent)' }}>
              <div className="flex justify-between items-end mb-6 border-b pb-4" style={{ borderColor: 'var(--color-fg)' }}>
                {/* 1) 메뉴 이름 동적 반영 */}
                <h2 className="font-bold" style={{ fontSize: 'calc(1.8rem * var(--font-scale))' }}>
                  {recView.recommended.name}
                </h2>
                {/* 2) 총점 100점 만점 환산 (0.94 -> 94점) */}
                <span className="font-bold" style={{ fontSize: 'calc(1.8rem * var(--font-scale))', color: 'var(--color-accent)' }}>
                  {Math.round(recView.recommended.total * 100)}점
                </span>
              </div>

              {/* 3) 막대 4줄 계산식 그대로 적용 */}
              <div className="flex flex-col gap-5 font-bold" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
                {(() => {
                  const contributions = recView.recommended!.contributions;
                  // maxWeight도 하드코딩하지 않고 데이터에서 직접 뽑아옵니다.
                  const maxWeight = Math.max(...contributions.map((c) => c.weight));

                  return contributions.map((c, idx) => {
                    // weight가 0일 경우 Infinity가 뜨는 것을 방지
                    const containerWidth = maxWeight === 0 ? "0%" : `${(c.weight / maxWeight) * 100}%`;
                    const fillWidth = c.weight === 0 ? "0%" : `${(c.earned / c.weight) * 100}%`;
                    
                    return (
                      <div key={idx} className="flex items-center gap-4">
                        <span className="w-28 shrink-0">{c.label || "항목"}</span>
                        <div className="flex-1 flex items-center h-8">
                          {/*
                            막대기 전체 통 (회색 배경)
                            dark: 접두사를 쓰지 않는 이유 — 배경색은 컴퓨터 테마가 아니라 고대비 토글이 정합니다.
                            dark:bg-gray-800 이 붙어 있으면 어두운 테마 사용자가 고대비를 켰을 때
                            검은 배경 위에 짙은 회색 통이 얹혀 대비 1.43:1 로 사라집니다. (팀장님 패치본 유지)
                          */}
                          <div
                            className="h-full bg-gray-200 rounded-full overflow-hidden border border-gray-300"
                            style={{ width: containerWidth }}
                          >
                            {/* 실제 점수만큼 주홍색으로 채워지는 영역 */}
                            <div className="h-full transition-all duration-700 ease-out" style={{ width: fillWidth, backgroundColor: 'var(--color-accent)' }} />
                          </div>
                        </div>
                        <span className="w-32 text-right shrink-0">
                          {c.earned.toFixed(2)} / {c.weight.toFixed(2)}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
              
              {/* 추천 이유 문장들 동적 렌더링.
                  dark: 를 쓰지 않는 이유는 점수 막대(위)와 같다. 배경을 정하는 주체는
                  OS 테마가 아니라 고대비 토글 하나여야 한다. */}
              {recView.reasons && recView.reasons.length > 0 && (
                <div className={`mt-8 p-5 rounded-xl ${isHighContrast ? 'border border-gray-400' : 'bg-gray-100'}`}>
                  <h3 className="font-bold mb-3" style={{ fontSize: 'calc(1.3rem * var(--font-scale))' }}>💡 AI 추천 이유</h3>
                  <ul className="flex flex-col gap-2 list-disc pl-5" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
                    {recView.reasons.map((reason, idx) => (
                      <li key={idx} className="opacity-90">{reason.text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : (
            // 추천된 메뉴가 없을 때의 방어 로직
            <div className="p-8 text-center border-2 border-dashed border-gray-400 rounded-2xl">
              <p className="font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
                조건에 맞는 메뉴가 없습니다. 직원의 도움을 받아주세요.
              </p>
            </div>
          )}

          {/* 
            4) 제외된 후보 개수(length) 및 목록 동적 바인딩 
            주의: 고대비 모드(isHighContrast)일 때는 명도 확보를 위해 연한 배경색(bg-red-50)을 지우고, 테두리와 글자를 밝은 톤으로 바꿉니다.
          */}
          <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? 'border-red-400 bg-transparent' : 'bg-red-50 border-red-500'}`}>
            <h3 
              className={`font-bold mb-5 ${isHighContrast ? 'text-red-400' : 'text-red-700'}`} 
              style={{ fontSize: 'calc(1.4rem * var(--font-scale))' }}
            >
              🚫 제외된 후보 {recView.excluded.length}개
            </h3>
            <ul className="flex flex-col gap-4" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
              {recView.excluded.map((item, idx) => (
                <li key={idx} className={`flex gap-4 items-center border-b pb-3 last:border-0 last:pb-0 ${isHighContrast ? 'border-gray-700' : 'border-red-200'}`}>
                  <span className="font-bold min-w-[160px] opacity-70 line-through">{item.name}</span>
                  <span className="flex-1 text-right">{item.explanation}</span>
                </li>
              ))}
            </ul>
          </section>

          <button 
            onClick={handleRunPlan}
            disabled={!recView.recommended} // 추천된 게 없으면 결제 차단
            className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
            style={{
              minHeight: 'calc(var(--tap-min) + 8px)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'var(--color-fg)',
              color: 'var(--color-bg)',
              fontSize: 'calc(1.3rem * var(--font-scale))',
              fontWeight: 'bold',
            }}
          >
            장바구니 담기 및 안전 리포트 보기
          </button>
        </main>
      ) : 

      /* ==========================================================
          📍 STEP 2: 안전 확인 리포트 화면 (Safety)
          AI가 임의로 결제하지 않고, 결제 직전(CART_REVIEW)에 멈췄음을 사용자에게 증명합니다.
         ========================================================== */
      currentStep === 2 && runResult ? (
        <main className="flex flex-col gap-8 w-full">
          {/* 
            [안전 리포트 영역 - 검증 결과(valid)에 따라 테마가 바뀝니다] 
            주의: 고대비 모드일 때는 시인성을 위해 연초록/연빨강 배경을 없애고 테두리 선만 밝은 초록색(green-400)/빨간색(red-400)으로 표시합니다.
          */}
          <section className={`border-4 rounded-2xl p-6 md:p-8 ${
            isHighContrast
              ? (runResult.validation.valid ? 'border-green-400 bg-transparent' : 'border-red-400 bg-transparent')
              : (runResult.validation.valid ? 'border-green-600 bg-green-50' : 'border-red-600 bg-red-50')
          }`}>
            <h2 
              className={`font-extrabold mb-8 ${
                isHighContrast 
                  ? (runResult.validation.valid ? 'text-green-400' : 'text-red-400') 
                  : (runResult.validation.valid ? 'text-green-800' : 'text-red-800')
              }`} 
              style={{ fontSize: 'calc(1.8rem * var(--font-scale))' }}
            >
              {runResult.validation.valid ? "✅ 안전 확인 리포트" : "❌ 안전 확인 실패 (위험)"}
            </h2>
            
            <ul className="flex flex-col gap-6 font-bold" style={{ fontSize: 'calc(1.2rem * var(--font-scale))' }}>
              {/* 결제 관련 동작.
                  "실행 0 / 차단 0" 을 글자로 적어 두었더니 실제 건수와 무관하게 늘 0 으로
                  보였다. 우리 구조에서 금지 action 은 계획 단계에서 막히므로 실행되거나
                  차단될 일 자체가 없고, safety 에도 그 두 수는 없다. 그래서 실제로 세는 두
                  값 — 전체 계획 단계 수와 그중 결제 관련 수 — 만 보여준다. */}
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : (runResult.validation.valid ? 'border-green-200' : 'border-red-200')}`}>
                <span>결제 관련 동작</span>
                <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? 'border-green-400' : 'border-red-400'}` : (runResult.validation.valid ? 'bg-green-200' : 'bg-red-200')}`}>
                  계획 {runResult.safety.plannedActionCount}단계 중 {runResult.safety.plannedForbiddenActionCount}건
                </span>
              </li>
              
              {/* 실제 기기 명령 여부 동적 바인딩 */}
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : (runResult.validation.valid ? 'border-green-200' : 'border-red-200')}`}>
                <span>실제 기기 명령</span>
                <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? 'border-green-400' : 'border-red-400'}` : (runResult.validation.valid ? 'bg-green-200' : 'bg-red-200')}`}>
                  {runResult.safety.actualDeviceCommandSent ? "있음 (주의)" : "없음"}
                </span>
              </li>

              {/* 정지 지점(CART_REVIEW) 동적 바인딩 */}
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : (runResult.validation.valid ? 'border-green-200' : 'border-red-200')}`}>
                <span>정지 지점</span>
                <span>
                  {runResult.safety.boundaryState} 
                  {/* 팀장님 패치 유지: 보조 설명도 큰 글씨 토글을 따라가야 하므로 text-sm 대신 배율을 곱합니다. */}
                  <span className="opacity-70 ml-2" style={{ fontSize: 'calc(0.875rem * var(--font-scale))' }}>(결제 직전)</span>
                </span>
              </li>

              {/* 검증 결과 (PASS/FAIL) 동적 처리 */}
              <li 
                className={`flex justify-between items-center pt-2 ${
                  isHighContrast ? (runResult.validation.valid ? 'text-green-400' : 'text-red-400') : (runResult.validation.valid ? 'text-green-700' : 'text-red-700')
                }`} 
                style={{ fontSize: 'calc(1.4rem * var(--font-scale))' }}
              >
                <span>검증 결과</span>
                {/* FAIL 발생 시 빨간색 뱃지로 전환 */}
                <span className={`px-6 py-2 rounded-xl ${
                  isHighContrast
                    ? (runResult.validation.valid ? 'bg-green-400 text-black' : 'bg-red-400 text-black')
                    : (runResult.validation.valid ? 'bg-green-600 text-white' : 'bg-red-600 text-white')
                }`}>
                  {runResult.validation.valid ? "PASS" : "FAIL"}
                </span>
              </li>
            </ul>
          </section>

          <button 
            onClick={handleReset}
            className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
            style={{
              minHeight: 'calc(var(--tap-min) + 8px)',
              borderRadius: 'var(--radius)',
              backgroundColor: 'transparent',
              color: 'var(--color-fg)',
              border: '2px solid var(--color-fg)',
              fontSize: 'calc(1.2rem * var(--font-scale))',
              fontWeight: 'bold',
            }}
          >
            처음으로 돌아가기
          </button>
        </main>
      ) : null}
    </div>
  );
}