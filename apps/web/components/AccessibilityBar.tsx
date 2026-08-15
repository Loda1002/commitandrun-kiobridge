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
  return (
    <div className="flex flex-col sm:flex-row justify-center gap-3 w-full">
      {/* 큰 글씨 버튼: 테두리 없이 노란 배경/검정 글씨 유지 */}
      <button
        type="button"
        aria-label={`큰 글씨 (현재: ${fontScale}배)`}
        onClick={onToggleFontScale}
        className={`flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-md ${
          isStartScreen 
            ? "bg-[#FFE600] text-black" 
            : isHighContrast 
              ? "bg-[var(--color-bg)] text-[var(--color-fg)] border-2 border-[var(--color-fg)]" 
              : "bg-[var(--color-accent,#FFE600)] text-[var(--color-accent-fg,#000000)]"
        }`}
        style={{
          minHeight: "calc(var(--tap-min) + 12px)", 
          padding: isStartScreen ? "0.9rem 1.2rem" : "1rem 1.5rem", 
          borderRadius: "var(--radius)",
          fontSize: "calc(1.3rem * var(--font-scale))", 
          fontWeight: "900", 
        }}
      >
        <span className="flex items-center justify-center gap-2 whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" x2="16.65" y1="21" y2="16.65"/>
            <line x1="11" x2="11" y1="8" y2="14"/>
            <line x1="8" x2="14" y1="11" y2="11"/>
          </svg>
          큰 글씨 (현재: {fontScale}배)
        </span>
      </button>

      {/* 고대비 화면 변경 버튼 */}
      <button
        type="button"
        aria-pressed={isHighContrast}
        onClick={onToggleContrast}
        className={`flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-md ${
          isStartScreen 
            ? "border-4 border-black bg-black text-white" 
            : isHighContrast 
              ? "bg-[var(--color-fg)] text-[var(--color-bg)] border-2 border-[var(--color-fg)]" 
              : "bg-black text-white"
        }`}
        style={{
          minHeight: "calc(var(--tap-min) + 12px)",
          padding: isStartScreen ? "0.9rem 1.2rem" : "1rem 1.5rem",
          borderRadius: "var(--radius)",
          fontSize: "calc(1.3rem * var(--font-scale))", 
          fontWeight: "900",
        }}
      >
        <span className="flex items-center justify-center gap-2 whitespace-nowrap">
          {isHighContrast ? (
            "일반 화면으로 변경"
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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