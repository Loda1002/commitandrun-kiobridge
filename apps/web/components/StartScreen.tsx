"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { ENVIRONMENTS } from "../lib/fixture";

interface StartScreenProps {
  onStart: (environmentId: EnvironmentId) => void;
  accessibilityBar: React.ReactNode;
  isHighContrast: boolean;
  onDeleteProfile: () => void;
}

// 스케치 형태에 맞춰 버튼 배경색(theme)과 흰색 SVG 아이콘 설정
const ENV_CONFIG: Record<string, { icon: React.ReactNode; bgClass: string }> = {
  "chicken-store": { 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
        <path d="M2 7h20" />
        <path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7" />
      </svg>
    ), 
    bgClass: "bg-[#F98C42]"
  },
  "hospital": { 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6v4"/>
        <path d="M14 8h-4"/>
        <path d="M8 22V2h8v20"/>
        <path d="M4 22V10h4"/>
        <path d="M20 22V10h-4"/>
        <path d="M2 22h20"/>
      </svg>
    ), 
    bgClass: "bg-[#51A3FA]"
  },
  "public-office": { 
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="22" x2="21" y2="22"/>
        <line x1="6" y1="18" x2="6" y2="11"/>
        <line x1="10" y1="18" x2="10" y2="11"/>
        <line x1="14" y1="18" x2="14" y2="11"/>
        <line x1="18" y1="18" x2="18" y2="11"/>
        <polygon points="12 2 20 7 4 7"/>
      </svg>
    ), 
    bgClass: "bg-[#A2E037]"
  },
};

export function StartScreen({ onStart, accessibilityBar, isHighContrast, onDeleteProfile }: StartScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // `fixed inset-0` 은 일부러다 — 이 화면만 page.tsx 의 max-w-4xl 을 벗어나 화면을
  // 꽉 채운다. 다만 `overflow-hidden` 이면 안 된다. 큰 글씨 1.5배에서 내용이 화면보다
  // 길어지는데, 넘친 부분에 닿을 방법이 사라진다. 1280x800 에서 237px 이 잘리고
  // 「저장된 정보 지우기」가 화면 밖으로 나갔었다(실측). 세로로 넘치면 스크롤한다.
  return (
    // `pb-44` 는 떠 있는 「직원 도움」 버튼 자리다. 그 버튼은 StaffHelp 가
    // `fixed bottom-12` 로 띄우는데, 이 화면이 화면을 꽉 채우다 보니 관공서 카드
    // 위에 얹혀 설명 문구를 덮고 있었다(1280x800 에서 268x123 만큼). 아래를 비워
    // 둔다.
    <main className={`fixed inset-0 w-screen h-[100dvh] flex flex-col overflow-y-auto overflow-x-hidden pb-44 ${isHighContrast ? 'bg-black text-[var(--color-fg)]' : 'bg-[#EFEFEF] text-black'}`}>

      {/* 1. 상단 배너 */}
      <header className={`w-full p-6 sm:px-10 relative flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 ${isHighContrast ? 'bg-black border-b-4 border-[var(--color-fg)]' : 'bg-white border-b-2 border-gray-300'}`}>
        
        <div className="text-left w-full flex-1 pl-2 sm:pl-4 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
          {/* 고대비 모드일 때는 선명한 글자색, 일반 모드일 때는 검정색 적용 */}
          <h1 
            ref={headingRef} 
            tabIndex={-1} 
            className={`font-black focus-visible:outline-none whitespace-nowrap ${
              isHighContrast ? 'text-[var(--color-fg)]' : 'text-black'
            }`}
            /* clamp 로 좁은 화면에서 줄인다. 4.6rem 고정 + whitespace-nowrap 이면
               휴대폰 폭에서 「안녕하세요!」 가 가로로 넘쳐 잘렸다. 넓은 화면에서는
               디자인대로 4.6rem 이다. */
            style={{ fontSize: "calc(clamp(2.2rem, 6vw, 4.6rem) * var(--font-scale))" }}
          >
            안녕하세요!
          </h1>
          <p className="opacity-85 font-bold sm:pt-2" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
            어디에서 쓰실 건지 골라 주세요.
            <br />
            로그인은 필요하지 않습니다.
          </p>
        </div>

        {/* 컨트롤 바 */}
        <div className="xl:absolute xl:right-8 xl:top-1/2 xl:-translate-y-1/2">
          {accessibilityBar}
        </div>
      </header>

      {/* 2. 메인 3등분 카드 영역.
          좁은 화면에서는 세로로 쌓는다 — 375px 폭에 셋을 나란히 두면 가로로 225px 이
          넘쳐서 세 번째 카드를 누를 수가 없었다(실측). */}
      <section className="flex-1 w-full flex flex-col md:flex-row gap-4 p-4 sm:p-6 items-stretch">
        {ENVIRONMENTS.map((env) => {
          const config = ENV_CONFIG[env.id] || ENV_CONFIG["chicken-store"];

          return (
            <button
              key={env.id}
              type="button"
              onClick={() => onStart(env.id)}
              /* 글자를 흰색이 아니라 어두운 색으로 두는 이유: 카드 배경이 밝아서
                 흰 글씨는 2.37 / 2.64 / 1.58:1 로 떨어진다(실측). 관공서는 거의 안
                 보인다. 배경색은 디자인 그대로 두고 글자만 뒤집으면 7.34 / 6.60 /
                 10.98:1 이 된다. */
              className={`flex-1 w-full flex flex-col items-center justify-center rounded-[2.5rem] p-6 min-h-[14rem] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-fg)] focus-visible:ring-offset-4 ${
                isHighContrast
                  ? 'border-4 border-[var(--color-fg)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)]'
                  : `${config.bgClass} text-[#1a1a1a] shadow-md hover:brightness-105`
              }`}
            >
              <span aria-hidden="true" className="mb-6 stroke-[2.5]" style={{ fontSize: "calc(clamp(3.5rem, 10vw, 8.5rem) * var(--font-scale))" }}>
                {config.icon}
              </span>

              <span className="block font-black mb-3 text-center tracking-tight" style={{ fontSize: "calc(clamp(1.8rem, 4.5vw, 3.5rem) * var(--font-scale))" }}>
                {env.name}
              </span>

              <p className="text-center leading-normal font-extrabold break-keep" style={{ fontSize: "calc(clamp(1.05rem, 2vw, 1.5rem) * var(--font-scale))" }}>
                {env.description}
              </p>
            </button>
          );
        })}
      </section>

      {/* 3. 하단 저장된 정보 지우기 */}
      {/* 3. 하단 저장된 정보 지우기.
          ⚠️ 이 버튼은 자기신고서(participant-ux.json)가 높이와 대비를 숫자로 걸고
          있다. `opacity-75` + `text-gray-600` 이면 실효 대비가 3.68:1 로 떨어져
          신고값과 어긋난다(실측). 흐리게 만들지 않는다. 높이도 --tap-min 으로
          명시한다 — 글자 크기에 딸려 우연히 44px 이 되게 두지 않는다. */}
      <footer className="w-full flex justify-center pb-3">
        <button
          type="button"
          onClick={onDeleteProfile}
          className="font-semibold underline underline-offset-4 whitespace-nowrap text-[var(--color-fg)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
          style={{
            minHeight: "var(--tap-min)",
            fontSize: "calc(1.2rem * var(--font-scale))",
            padding: "0.5rem 1rem"
          }}
        >
          저장된 정보 지우기
        </button>
      </footer>

    </main>
  );
}
