"use client";

interface StartScreenProps {
  onStart: () => void;
  accessibilityBar: React.ReactNode;
}

export function StartScreen({ onStart, accessibilityBar }: StartScreenProps) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-12 text-center w-full">
      <div>
        <h1 className="font-extrabold" style={{ fontSize: "calc(2.5rem * var(--font-scale))" }}>
          안녕하세요!
        </h1>
        <p className="opacity-80 mt-4" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          버튼을 누르면 바로 주문을 시작할 수 있습니다.
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-md">
        <button
          type="button"
          onClick={onStart}
          className="w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95 shadow-lg"
          style={{
            minHeight: "calc(var(--tap-min) + 16px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: "calc(1.3rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          로그인 없이 시작
        </button>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-8 w-full">
        {accessibilityBar}
      </div>
    </main>
  );
}