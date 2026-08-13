"use client";

interface AccessibilityBarProps {
  fontScale: number;
  isHighContrast: boolean;
  onToggleFontScale: () => void;
  onToggleContrast: () => void;
}

export function AccessibilityBar({
  fontScale,
  isHighContrast,
  onToggleFontScale,
  onToggleContrast,
}: AccessibilityBarProps) {
  return (
    // 🔥 모바일에서는 위아래로 큼직하게 쌓이고, 넓은 화면에서는 반반 나눠 가지도록 수정
    <div className="flex flex-col sm:flex-row justify-center gap-4 w-full">
      <button
        type="button"
        aria-label={`글자 크기 (지금 ${Math.round(fontScale * 100)}%)`}
        onClick={onToggleFontScale}
        // 🔥 flex-1을 주어 버튼이 화면 너비를 시원하게 꽉 채우도록 변경
        className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm"
        style={{
          minHeight: "calc(var(--tap-min) + 16px)", // 터치 영역 훨씬 크게 확보
          padding: "1rem 1.5rem", // 상하 여백 대폭 증가
          borderRadius: "var(--radius)",
          backgroundColor: "var(--color-accent)",
          color: "#1a1a1a", 
          fontSize: "calc(1.3rem * var(--font-scale))", // 🔥 1rem -> 1.3rem으로 기본 글씨 크기 30% 증가
          fontWeight: "900", // 글씨를 가장 두껍게(Black/Extrabold) 변경
        }}
      >
        🔍 큰 글씨 (현재: {fontScale}배)
      </button>

      <button
        type="button"
        aria-pressed={isHighContrast}
        onClick={onToggleContrast}
        className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm"
        style={{
          minHeight: "calc(var(--tap-min) + 16px)",
          padding: "1rem 1.5rem",
          borderRadius: "var(--radius)",
          backgroundColor: "var(--color-accent)",
          color: "#1a1a1a", 
          fontSize: "calc(1.3rem * var(--font-scale))", // 🔥 1rem -> 1.3rem으로 껑충 키움
          fontWeight: "900",
        }}
      >
        {isHighContrast ? "일반 화면으로 변경" : "🌗 고대비 화면으로 변경"}
      </button>
    </div>
  );
}