"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { ENVIRONMENTS } from "../lib/fixture";
import { envColor } from "../lib/theme";

interface StartScreenProps {
  onStart: (environmentId: EnvironmentId) => void;
  accessibilityBar: React.ReactNode;
  isHighContrast: boolean;
  onDeleteProfile: () => void;
}

// 스케치 형태에 맞춘 흰색 SVG 아이콘.
// 배경색은 여기에 두지 않는다 — `lib/theme.ts` 의 ENV_COLORS 하나만 쓴다.
// 전에는 이 파일이 밝은 색(#F98C42 · #51A3FA)을, 다른 화면이 진한 색을 들고
// 있어서 같은 가게가 화면마다 다른 주황으로 보였다(팀장 지시, 2026-08-16).
const ENV_CONFIG: Record<string, { icon: React.ReactNode }> = {
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
    // `pb-32` 는 떠 있는 「직원 도움」 버튼 자리다. 그 버튼은 StaffHelp 가
    // `fixed bottom-12` 로 띄우는데, 이 화면이 화면을 꽉 채우다 보니 관공서 카드
    // 위에 얹혀 설명 문구를 덮고 있었다(1280x800 에서 268x123 만큼). 아래를 비워
    // 둔다. 버튼이 작아지면서(52px) 필요한 자리도 176px → 128px 로 줄었다.
    <main className={`fixed inset-0 w-screen h-[100dvh] flex flex-col overflow-y-auto overflow-x-hidden pb-32 ${isHighContrast ? 'bg-black text-[var(--color-fg)]' : 'bg-[#EFEFEF] text-black'}`}>

      {/* 1. 상단 배너 */}
      {/* ⚠️ 접근성 버튼 줄을 `absolute right-8` 로 띄우지 않는다. 흐름에서 빠지면
          자리를 차지하지 않아, 큰 글씨 1.5배에서 버튼이 「어디에서 쓰실 건지」
          문구 위로 348px 올라타 글자를 덮었다(1280px 실측). 지금은 보통의 flex
          칸이고, 옆자리가 모자라면 `flex-wrap` 으로 아랫줄에 내려간다 —
          겹치는 대신 배너가 한 줄 높아진다. */}
      <header className={`w-full p-4 sm:px-8 relative flex flex-col xl:flex-row xl:flex-wrap items-start xl:items-center justify-between gap-3 ${isHighContrast ? 'bg-black border-b-4 border-[var(--color-fg)]' : 'bg-white border-b-2 border-gray-300'}`}>

        {/* `items-baseline` 이 아니라 `items-center` 다(팀장 지시, 2026-08-16).
            베이스라인에 맞추면 「안녕하세요!」(41.6px 한 줄)와 「어디에서…」
            (18.4px 두 줄)의 **첫 줄 밑선**만 맞아, 두 줄짜리 문구가 통째로
            아래로 처져 위아래가 어긋나 보인다. 가운데로 맞춘다.
            `xl:basis-[30rem]` 은 아랫줄로 내려보내는 기준이다 — 인사말이 이만큼도
            못 쓰게 되면 버튼 줄이 내려간다. `flex-1` 만 두면 기준 폭이 0 이라
            영영 안 내려가고 인사말만 찌그러진다. */}
        <div className="text-left w-full flex-1 xl:basis-[30rem] pl-2 sm:pl-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-5">
          {/* 고대비 모드일 때는 선명한 글자색, 일반 모드일 때는 검정색 적용 */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={`font-black focus-visible:outline-none whitespace-nowrap ${
              isHighContrast ? 'text-[var(--color-fg)]' : 'text-black'
            }`}
            /* 4.6rem 에서 2.6rem 으로 내렸다(팀장 지시, 2026-08-16). 인사말이
               1280x800 에서 배너 높이의 절반을 먹고 있었고, 정작 눌러야 하는
               카드 셋이 그만큼 밀려 있었다. 인사는 장식이고 카드가 본문이다.
               clamp 는 그대로 둔다 — 휴대폰 폭에서 `whitespace-nowrap` 과 만나면
               가로로 넘쳐 잘린다. */
            style={{ fontSize: "calc(clamp(1.8rem, 3.4vw, 2.6rem) * var(--font-scale))" }}
          >
            안녕하세요!
          </h1>
          <p className="opacity-85 font-bold" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
            어디에서 쓰실 건지 골라 주세요.
            <br />
            로그인은 필요하지 않습니다.
          </p>
        </div>

        {/* 컨트롤 바. `shrink-0` 이라 줄어들지 않고, 자리가 없으면 통째로 내려간다. */}
        <div className="shrink-0">
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
              /* 글자는 세 카드 모두 흰색으로 고정한다(팀장 지시, 2026-08-16).
                 ⚠️ 대비는 카드마다 다르다 — 닭강정 3.26:1 · 병원 3.46:1 ·
                 관공서 4.53:1. 앞의 둘은 WCAG AA 의 본문 기준 4.5:1 을 넘지
                 못한다(카드 이름 41.6px·설명 19.2px 굵은 글씨는 큰 글씨 기준
                 3:1 은 넘는다). 밝은 색(2.37 / 2.64:1)에서 중간색으로 올린
                 결과이고, 더 올리려면 두 번째 화면 색까지 함께 진하게 내려야
                 한다. 제출 README 의 대비 신고값도 이 숫자로 적어 두었다 —
                 화면과 신고서가 어긋나지 않게 한다. */
              /* 크기를 한 단계 줄였다(팀장 지시, 2026-08-16). 다만 **작게 만들지는
                 않았다** — 이 카드는 저시력·손 떨림이 있는 분이 처음 누르는 곳이라
                 큰 표적이 그 자체로 기능이다. 아이콘 8.5→5rem, 이름 3.5→2.6rem,
                 설명 1.5→1.2rem 으로 각각 한 단계씩만 내렸고, 카드 자체의 최소
                 높이는 14→12rem 이다. 44px 기준을 넘는 것은 물론이고 여전히
                 화면 폭의 3분의 1을 차지한다. */
              className={`flex-1 w-full flex flex-col items-center justify-center rounded-[2.5rem] p-5 min-h-[12rem] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-fg)] focus-visible:ring-offset-4 ${
                isHighContrast
                  ? 'border-4 border-[var(--color-fg)] bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-fg)] hover:text-[var(--color-bg)]'
                  : 'text-white shadow-md hover:brightness-105'
              }`}
              style={isHighContrast ? undefined : { backgroundColor: envColor(env.id) }}
            >
              <span aria-hidden="true" className="mb-4 stroke-[2.5]" style={{ fontSize: "calc(clamp(2.8rem, 6.5vw, 5rem) * var(--font-scale))" }}>
                {config.icon}
              </span>

              <span className="block font-black mb-2 text-center tracking-tight" style={{ fontSize: "calc(clamp(1.6rem, 3.2vw, 2.6rem) * var(--font-scale))" }}>
                {env.name}
              </span>

              <p className="text-center leading-normal font-extrabold break-keep" style={{ fontSize: "calc(clamp(1rem, 1.7vw, 1.2rem) * var(--font-scale))" }}>
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
          명시한다 — 글자 크기에 딸려 우연히 44px 이 되게 두지 않는다.
          글자색은 완전한 검정이다 — #1a1a1a 에서 내려 #EFEFEF 바탕에서 18.25:1
          이다(팀장 지시, 2026-08-16). 고대비에서는 흰 글씨로 돌아가야 하므로
          분기를 남긴다. */}
      <footer className="w-full flex justify-center pb-3">
        <button
          type="button"
          onClick={onDeleteProfile}
          className={`font-black underline underline-offset-4 whitespace-nowrap focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 ${
            isHighContrast ? "text-[var(--color-fg)]" : "text-black"
          }`}
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
