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

  return (
    <main className={`fixed inset-0 w-screen h-[100dvh] flex flex-col overflow-hidden ${isHighContrast ? 'bg-black text-[var(--color-fg)]' : 'bg-[#EFEFEF] text-black'}`}>
      
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
            style={{ fontSize: "calc(4.6rem * var(--font-scale))" }}
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

      {/* 2. 메인 3등분 카드 영역 */}
      <section className="flex-1 w-full h-full flex flex-row gap-4 p-4 sm:p-6 items-stretch">
        {ENVIRONMENTS.map((env) => {
          const config = ENV_CONFIG[env.id] || ENV_CONFIG["chicken-store"];
          
          return (
            <button
              key={env.id}
              type="button"
              onClick={() => onStart(env.id)}
              className={`flex-1 w-full h-full flex flex-col items-center justify-center rounded-[2.5rem] p-6 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-8 focus-visible:ring-black/20 ${
                isHighContrast 
                  ? 'border-4 border-[var(--color-fg)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)]' 
                  : `${config.bgClass} text-white shadow-md hover:brightness-105`
              }`}
            >
              <span aria-hidden="true" className="mb-6 stroke-[2.5]" style={{ fontSize: "calc(8.5rem * var(--font-scale))" }}>
                {config.icon}
              </span>
              
              <span className="block font-black mb-3 text-center tracking-tight" style={{ fontSize: "calc(3.5rem * var(--font-scale))" }}>
                {env.name}
              </span>
              
              <p className="opacity-95 text-center leading-normal font-extrabold" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>
                {env.description}
              </p>
            </button>
          );
        })}
      </section>

      {/* 3. 하단 저장된 정보 지우기 */}
      <footer className="w-full flex justify-center pb-3">
        <button 
          type="button" 
          onClick={onDeleteProfile} 
          className={`font-semibold underline underline-offset-4 transition-opacity opacity-75 hover:opacity-100 whitespace-nowrap ${
            isHighContrast ? 'text-white' : 'text-gray-600'
          }`}
          style={{ 
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