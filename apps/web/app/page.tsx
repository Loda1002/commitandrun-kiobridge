"use client";

import { useState } from "react";

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

  /**
   * 🔠 글씨 크기 조절 함수
   * 버튼을 누를 때마다 배율이 순환하며, 최상단 CSS 변수(--font-scale)를 변경해 화면 전체 글씨를 한 번에 키웁니다.
   */
  const toggleFontScale = () => {
    const nextScale = fontScale === 1 ? 1.25 : fontScale === 1.25 ? 1.5 : 1;
    setFontScale(nextScale);
    document.documentElement.style.setProperty("--font-scale", nextScale.toString());
  };

  /**
   * 🌗 고대비 모드 조절 함수
   * 켜지면 html 태그에 data-contrast="high"를 붙여, globals.css에 미리 세팅해둔 고대비 색상으로 전체를 덮어씌웁니다.
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
   * 🧩 [공통 컴포넌트] 접근성 설정 버튼 그룹
   * 첫 화면에서는 아래에, 다음 화면부터는 맨 위에 보여야 하므로 재사용하기 쉽게 변수로 분리했습니다.
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
      {currentStep > 0 && (
        <header className="pb-4 border-b border-gray-300 w-full flex justify-center">
          {themeButtons}
        </header>
      )}

      {/* ==========================================================
          📍 STEP 0: 메인 시작 화면
          기획 요건에 따라 '로그인 없이 시작(비회원)'을 기본이자 가장 눈에 띄게 배치합니다.
         ========================================================== */}
      {currentStep === 0 && (
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
              onClick={() => setCurrentStep(1)}
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
      )}

      {/* ==========================================================
          📍 STEP 1: 맞춤형 추천 결과 화면 (Explainable AI)
          AI가 왜 이 메뉴를 추천했는지(점수), 왜 다른 건 뺐는지(알레르기 등)를 투명하게 공개합니다.
         ========================================================== */}
      {currentStep === 1 && (
        <main className="flex flex-col gap-8 w-full">
          <h1 className="font-extrabold text-center" style={{ fontSize: 'calc(2rem * var(--font-scale))' }}>
            맞춤형 추천 결과
          </h1>

          {/* [1위 메뉴 추천 카드] */}
          <section className="border-2 rounded-2xl p-6 md:p-8" style={{ borderColor: 'var(--color-accent)' }}>
            <div className="flex justify-between items-end mb-6 border-b pb-4" style={{ borderColor: 'var(--color-fg)' }}>
              <h2 className="font-bold" style={{ fontSize: 'calc(1.8rem * var(--font-scale))' }}>매운 순살 닭강정</h2>
              <span className="font-bold" style={{ fontSize: 'calc(1.8rem * var(--font-scale))', color: 'var(--color-accent)' }}>94점</span>
            </div>

            {/* 
              📊 [막대그래프 데이터 바인딩 가이드]
              추후 백엔드 데이터 연결 시 아래 공식을 사용하세요:
              - containerWidth: 항목별 '만점'의 비율 (최고 만점인 0.40을 100%로 잡고 비례 계산)
              - fillWidth: 해당 항목 안에서 '획득 점수'의 비율 (0.15점 만점에 0.09점이면 60%)
            */}
            <div className="flex flex-col gap-5 font-bold" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
              {[
                { label: '포장 가능', containerWidth: '100%',  fillWidth: '100%', text: '0.40 / 0.40' },
                { label: '맵기 일치', containerWidth: '62.5%', fillWidth: '100%', text: '0.25 / 0.25' },
                { label: '순살 일치', containerWidth: '50%',   fillWidth: '100%', text: '0.20 / 0.20' },
                { label: '예산 여유', containerWidth: '37.5%', fillWidth: '60%',  text: '0.09 / 0.15' },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <span className="w-28 shrink-0">{item.label}</span>
                  <div className="flex-1 flex items-center h-8">
                    {/*
                      막대기 전체 통 (회색 배경)
                      dark: 접두사를 쓰지 않는 이유 — 배경색은 컴퓨터 테마가 아니라 고대비 토글이 정합니다.
                      dark:bg-gray-800 이 붙어 있으면 어두운 테마 사용자가 고대비를 켰을 때
                      검은 배경 위에 짙은 회색 통이 얹혀 대비 1.43:1 로 사라집니다.
                    */}
                    <div
                      className="h-full bg-gray-200 rounded-full overflow-hidden border border-gray-300"
                      style={{ width: item.containerWidth }}
                    >
                      {/* 실제 점수만큼 주홍색으로 채워지는 영역 */}
                      <div className="h-full transition-all duration-700 ease-out" style={{ width: item.fillWidth, backgroundColor: 'var(--color-accent)' }} />
                    </div>
                  </div>
                  <span className="w-32 text-right shrink-0">{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 
            [제외된 후보 영역] 
            주의: 고대비 모드(isHighContrast)일 때는 명도 확보를 위해 연한 배경색(bg-red-50)을 지우고, 테두리와 글자를 밝은 톤으로 바꿉니다.
          */}
          <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? 'border-red-400 bg-transparent' : 'bg-red-50 border-red-500'}`}>
            <h3 
              className={`font-bold mb-5 ${isHighContrast ? 'text-red-400' : 'text-red-700'}`} 
              style={{ fontSize: 'calc(1.4rem * var(--font-scale))' }}
            >
              🚫 제외된 후보 3개
            </h3>
            <ul className="flex flex-col gap-4" style={{ fontSize: 'calc(1.1rem * var(--font-scale))' }}>
              <li className={`flex gap-4 items-center border-b pb-3 last:border-0 last:pb-0 ${isHighContrast ? 'border-gray-700' : 'border-red-200'}`}>
                <span className="font-bold min-w-[160px] opacity-70 line-through">땅콩 토핑 닭강정</span>
                <span className="flex-1 text-right">등록하신 <strong>견과류 알레르기</strong>와 겹칩니다</span>
              </li>
              <li className={`flex gap-4 items-center border-b pb-3 last:border-0 last:pb-0 ${isHighContrast ? 'border-gray-700' : 'border-red-200'}`}>
                <span className="font-bold min-w-[160px] opacity-70 line-through">품절 닭강정</span>
                <span className="flex-1 text-right">지금 <strong>품절</strong>이라 고를 수 없습니다</span>
              </li>
              <li className="flex gap-4 items-center">
                <span className="font-bold min-w-[160px] opacity-70 line-through">매장 전용 닭강정</span>
                <span className="flex-1 text-right">매장 이용 전용이라 <strong>포장으로는 못 받습니다</strong></span>
              </li>
            </ul>
          </section>

          <button 
            onClick={() => setCurrentStep(2)}
            className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
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
      )}

      {/* ==========================================================
          📍 STEP 2: 안전 확인 리포트 화면 (Safety)
          AI가 임의로 결제하지 않고, 결제 직전(CART_REVIEW)에 멈췄음을 사용자에게 증명합니다.
         ========================================================== */}
      {currentStep === 2 && (
        <main className="flex flex-col gap-8 w-full">
          {/* 
            [안전 리포트 영역] 
            주의: 고대비 모드일 때는 시인성을 위해 연초록 배경을 없애고 테두리 선만 밝은 초록색(green-400)으로 표시합니다.
          */}
          <section className={`border-4 rounded-2xl p-6 md:p-8 ${isHighContrast ? 'border-green-400 bg-transparent' : 'border-green-600 bg-green-50'}`}>
            <h2 
              className={`font-extrabold mb-8 ${isHighContrast ? 'text-green-400' : 'text-green-800'}`} 
              style={{ fontSize: 'calc(1.8rem * var(--font-scale))' }}
            >
              안전 확인 리포트
            </h2>
            
            <ul className="flex flex-col gap-6 font-bold" style={{ fontSize: 'calc(1.2rem * var(--font-scale))' }}>
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : 'border-green-200'}`}>
                <span>결제 관련 동작</span>
                {/* 뱃지도 고대비일 때는 배경 대신 외곽선 뱃지로 변경하여 글자가 묻히지 않게 합니다. */}
                <span className={`px-3 py-1 rounded-lg ${isHighContrast ? 'border border-green-400' : 'bg-green-200'}`}>
                  0건 (계획 0 / 실행 0 / 차단 0)
                </span>
              </li>
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : 'border-green-200'}`}>
                <span>실제 기기 명령</span>
                <span className={`px-3 py-1 rounded-lg ${isHighContrast ? 'border border-green-400' : 'bg-green-200'}`}>
                  없음
                </span>
              </li>
              <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? 'border-gray-700' : 'border-green-200'}`}>
                <span>정지 지점</span>
                {/* 보조 설명도 큰 글씨 토글을 따라가야 하므로 text-sm 대신 배율을 곱합니다. */}
                <span>CART_REVIEW <span className="opacity-70" style={{ fontSize: 'calc(0.875rem * var(--font-scale))' }}>(결제 직전)</span></span>
              </li>
              <li 
                className={`flex justify-between items-center pt-2 ${isHighContrast ? 'text-green-400' : 'text-green-700'}`} 
                style={{ fontSize: 'calc(1.4rem * var(--font-scale))' }}
              >
                <span>검증 결과</span>
                {/* PASS 뱃지는 고대비일 때 눈에 확 띄도록 '밝은 초록 바탕 + 검은색 글자' 조합을 씁니다. */}
                <span className={`px-6 py-2 rounded-xl ${isHighContrast ? 'bg-green-400 text-black' : 'bg-green-600 text-white'}`}>
                  PASS
                </span>
              </li>
            </ul>
          </section>

          <button 
            onClick={() => setCurrentStep(0)}
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
      )}
    </div>
  );
}