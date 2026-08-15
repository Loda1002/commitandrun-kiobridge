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
    <div className="flex flex-col sm:flex-row justify-center gap-4 w-full">
      <button
        type="button"
        aria-label={`큰 글씨 (현재: ${fontScale}배)`}
        onClick={onToggleFontScale}
        className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-sm"
        style={{
          minHeight: "calc(var(--tap-min) + 16px)", 
          padding: "1rem 1.5rem", 
          borderRadius: "var(--radius)",
          backgroundColor: "var(--color-accent)",
          color: "#1a1a1a", 
          fontSize: "calc(1.3rem * var(--font-scale))", 
          fontWeight: "900", 
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
          fontSize: "calc(1.3rem * var(--font-scale))", 
          fontWeight: "900",
        }}
      >
        {isHighContrast ? "일반 화면으로 변경" : "🌗 고대비 화면으로 변경"}
      </button>
    </div>
  );
}