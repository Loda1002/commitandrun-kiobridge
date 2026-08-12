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
    <div className="flex justify-center gap-3 w-full">
      <button
        type="button"
        // [접근성 2-2] 글자 크기는 3단계이므로 현재 배율을 라벨에 직접 명시
        aria-label={`글자 크기 (지금 ${Math.round(fontScale * 100)}%)`}
        onClick={onToggleFontScale}
        className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-105 active:scale-95"
        style={{
          minHeight: "var(--tap-min)", // [디자인] 터치 영역 44px 이상 엄수
          padding: "0.5rem 1.5rem",
          borderRadius: "var(--radius)",
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg)",
          fontSize: "calc(1rem * var(--font-scale))", // [디자인] 고정 픽셀(text-sm 등) 배제
          fontWeight: "bold",
        }}
      >
        큰 글씨 (현재: {fontScale}배)
      </button>

      <button
        type="button"
        // [접근성 2-2] 고대비 모드 켜짐/꺼짐 상태를 스크린리더에 전달
        aria-pressed={isHighContrast}
        onClick={onToggleContrast}
        className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-105 active:scale-95"
        style={{
          minHeight: "var(--tap-min)",
          padding: "0.5rem 1.5rem",
          borderRadius: "var(--radius)",
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg)",
          fontSize: "calc(1rem * var(--font-scale))",
          fontWeight: "bold",
        }}
      >
        {isHighContrast ? "일반 화면으로 변경" : "고대비 화면으로 변경"}
      </button>
    </div>
  );
}