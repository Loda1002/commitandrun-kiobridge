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
        onClick={onToggleFontScale}
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
        큰 글씨 (현재: {fontScale}배)
      </button>

      <button
        type="button"
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