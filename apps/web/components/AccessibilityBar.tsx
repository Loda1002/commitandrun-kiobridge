"use client";

interface AccessibilityBarProps {
  fontScale: number;
  isHighContrast: boolean;
  onToggleFontScale: () => void;
  onToggleContrast: () => void;
  isStartScreen?: boolean;
}

export function AccessibilityBar({
  fontScale,
  isHighContrast,
  onToggleFontScale,
  onToggleContrast,
  isStartScreen = false,
}: AccessibilityBarProps) {
  /**
   * 시작 화면의 두 버튼만 **가로로 늘리고 글씨를 키우며 줄바꿈을 막는다**
   * (팀장 지시, 2026-08-16). 1280px 에서 20.8px 두 줄(99px 높이)이던 것이
   * 25.6px 한 줄이 된다. 높이는 그대로 두고 좌우 여백만 1.2 → 2rem 이다.
   *
   * ⚠️ 글씨를 고정 크기로 키우고 `whitespace-nowrap` 을 걸면 좁은 화면에서
   * 가로로 넘친다 — 640px·1.25배에서 두 버튼이 733px 을 먹고 화면 밖으로
   * 나갔던 적이 있다. 그래서 두 가지를 함께 건다.
   *   ① 크기를 vw 에 묶어 좁은 화면에서는 도로 작아지게 한다.
   *   ② 두 버튼이 나란히 서는 지점을 640px 에서 768px 로 올린다. 그 아래에서는
   *      위아래로 쌓이므로 한 줄짜리 글씨도 폭을 다 쓸 수 있다.
   * 확대 200% 상당에서 가로 스크롤이 없다는 것은 제출 문서의 신고 항목이다.
   */
  const labelFontSize = isStartScreen
    ? "calc(clamp(1.05rem, 2vw, 1.6rem) * var(--font-scale))"
    : "calc(1.3rem * var(--font-scale))";
  const labelWrap = isStartScreen ? "whitespace-nowrap" : "break-keep";

  return (
    <div className={`flex flex-col justify-center gap-3 w-full ${isStartScreen ? "md:flex-row" : "sm:flex-row"}`}>
      {/* 큰 글씨 버튼: 시작 화면에서는 노란 배경/검정 글씨.
          ⚠️ 고대비 판정을 시작 화면 판정보다 **먼저** 본다. 순서를 뒤집으면 고대비를
          켠 채 시작 화면에 있을 때 이 분기가 이겨서 노란색이 그대로 남는다.
          테두리는 팀장 지시로 뺐다(2026-08-16). 노랑(#FFE600)은 흰 머리띠 위에서
          면 대비가 1.2:1 이라 경계가 흐려지므로, 대신 `shadow-md` 그림자가 경계를
          맡는다. 글자 대비(검정 위 노랑, 15.9:1)는 테두리와 무관하게 그대로다.

          두 번째 화면부터의 기본 상태는 **환경색 바탕에 흰 글씨**다
          (팀장 지시, 2026-08-16). 카드·테두리와 같은 색·같은 글자색이라 화면이
          넘어가도 같은 버튼으로 읽힌다. 흰 글씨 대비는 주황 3.26 · 파랑 3.46 ·
          초록 4.53:1 이고, 이 글씨는 20.8px 900 굵기라 큰 글씨 기준 3:1 을
          넘는다. 시작 화면의 노란 버튼은 흰 글씨면 1.27:1 이라 그대로 검정이다. */}
      <button
        type="button"
        aria-label={`큰 글씨 (현재: ${fontScale}배)`}
        onClick={onToggleFontScale}
        className={`flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-md ${
          isHighContrast
            ? "bg-[var(--color-bg)] text-[var(--color-fg)] border-2 border-[var(--color-fg)]"
            : isStartScreen
              ? "bg-[#FFE600] text-black"
              : "bg-[var(--color-accent,#FFE600)] text-white"
        }`}
        style={{
          minHeight: "calc(var(--tap-min) + 12px)",
          padding: isStartScreen ? "0.9rem 2.75rem" : "1rem 1.5rem",
          borderRadius: "var(--radius)",
          fontSize: labelFontSize,
          fontWeight: "900",
        }}
      >
        <span className={`flex items-center justify-center gap-2 ${labelWrap}`}>
          <svg className="shrink-0" xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" x2="16.65" y1="21" y2="16.65"/>
            <line x1="11" x2="11" y1="8" y2="14"/>
            <line x1="8" x2="14" y1="11" y2="11"/>
          </svg>
          큰 글씨 (현재: {fontScale}배)
        </span>
      </button>

      {/* 고대비 화면 변경 버튼.
          고대비를 켠 상태에서 이 버튼이 **순백으로 채워져** 있었다 — 1280px 에서
          27,224px² 로, 그 화면에서 가장 밝은 면이었다(실측). 눌린 상태를 알리려고
          채운 것이므로 채움은 그대로 두되 **노란색(#ffe600)으로** 바꾼다. 검정
          글씨 대비 15.9:1 이고, 흰색보다 내보내는 빛이 22% 적다. */}
      <button
        type="button"
        aria-pressed={isHighContrast}
        onClick={onToggleContrast}
        className={`flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-md ${
          isHighContrast
            ? "bg-[var(--color-accent)] text-black border-2 border-[var(--color-accent)]"
            : isStartScreen
              ? "border-4 border-black bg-black text-white"
              : "bg-black text-white"
        }`}
        style={{
          minHeight: "calc(var(--tap-min) + 12px)",
          padding: isStartScreen ? "0.9rem 2.75rem" : "1rem 1.5rem",
          borderRadius: "var(--radius)",
          fontSize: labelFontSize,
          fontWeight: "900",
        }}
      >
        <span className={`flex items-center justify-center gap-2 ${labelWrap}`}>
          {isHighContrast ? (
            "일반 화면으로 변경"
          ) : (
            <>
              <svg className="shrink-0" xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 18a6 6 0 0 0 0-12v12z"/>
              </svg>
              고대비 화면으로 변경
            </>
          )}
        </span>
      </button>
    </div>
  );
}