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

const ENV_CONFIG: Record<string, { icon: string; theme: string }> = {
  "chicken-store": { icon: "🍗", theme: "border-orange-300 bg-orange-50 hover:border-orange-500 hover:bg-orange-100" },
  "hospital": { icon: "🏥", theme: "border-blue-300 bg-blue-50 hover:border-blue-500 hover:bg-blue-100" },
  "public-office": { icon: "🏛️", theme: "border-emerald-300 bg-emerald-50 hover:border-emerald-500 hover:bg-emerald-100" },
};

export function StartScreen({ onStart, accessibilityBar, isHighContrast, onDeleteProfile }: StartScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-10 text-center w-full">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="font-extrabold focus-visible:outline-none" style={{ fontSize: "calc(2.5rem * var(--font-scale))" }}>
          안녕하세요!
        </h1>
        <p className="opacity-80 mt-4" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          어디에서 쓰실 건지 골라 주세요. 로그인은 필요하지 않습니다.
        </p>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full list-none p-0">
        {ENVIRONMENTS.map((env) => {
          const config = ENV_CONFIG[env.id] || ENV_CONFIG["chicken-store"];
          const cardClass = isHighContrast
            ? "border-4 border-[var(--color-fg)] hover:border-[var(--color-accent)] bg-transparent"
            : `border-4 ${config.theme} shadow-sm`;

          return (
            <li key={env.id} className="flex h-full">
              <button
                type="button"
                onClick={() => onStart(env.id)}
                className={`flex flex-col w-full text-center items-center justify-center p-8 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none hover:scale-[1.02] active:scale-95 ${cardClass}`}
                style={{
                  minHeight: "calc(var(--tap-min) + 32px)",
                  borderRadius: "calc(var(--radius) * 1.5)",
                  color: "var(--color-fg)",
                }}
              >
                <span aria-hidden="true" className="mb-4" style={{ fontSize: "calc(3.5rem * var(--font-scale))" }}>
                  {config.icon}
                </span>
                <span className="block font-extrabold mb-2" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>
                  {env.name}
                </span>
                <span className="block opacity-80 break-keep font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  {env.description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-gray-200 pt-8 w-full">
        {accessibilityBar}
        <button 
          type="button" 
          onClick={onDeleteProfile} 
          className="w-full mt-6 underline font-medium hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)]" 
          style={{ minHeight: "var(--tap-min)", fontSize: "calc(1.1rem * var(--font-scale))", padding: "0.5rem" }}
        >
          저장된 정보 지우기
        </button>
      </div>
    </main>
  );
}