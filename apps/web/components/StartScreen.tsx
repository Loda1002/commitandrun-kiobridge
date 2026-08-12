"use client";

import type { EnvironmentId } from "@commitandrun/engine";
import { ENVIRONMENTS } from "../lib/fixture";

interface StartScreenProps {
  onStart: (environmentId: EnvironmentId) => void;
  accessibilityBar: React.ReactNode;
}

/**
 * Pick a kiosk, then start.
 *
 * The three environments come from `ENVIRONMENTS`, whose names are read off the
 * fixtures themselves, so a card cannot end up calling a place something the
 * environment data does not. Each card says what that kiosk will NOT do —
 * a hospital does not judge symptoms, a public office does not judge
 * entitlement — because that boundary is the thing worth knowing before you
 * start, not something to discover in the small print afterwards.
 *
 * The layout here is deliberately plain; `pm/16` hands the visual design to
 * @NyoungF. What must survive a redesign is one button per environment, each
 * reachable by keyboard and at least `--tap-min` tall.
 */
export function StartScreen({ onStart, accessibilityBar }: StartScreenProps) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-10 text-center w-full">
      <div>
        <h1 className="font-extrabold" style={{ fontSize: "calc(2.5rem * var(--font-scale))" }}>
          안녕하세요!
        </h1>
        <p className="opacity-80 mt-4" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          어디에서 쓰실 건지 골라 주세요. 로그인은 필요하지 않습니다.
        </p>
      </div>

      <ul className="flex flex-col gap-4 w-full max-w-md list-none">
        {ENVIRONMENTS.map((env) => (
          <li key={env.id}>
            <button
              type="button"
              onClick={() => onStart(env.id)}
              className="w-full text-left p-5 border-2 border-gray-300 hover:border-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform hover:scale-[1.02] active:scale-95"
              style={{
                minHeight: "calc(var(--tap-min) + 16px)",
                borderRadius: "var(--radius)",
                backgroundColor: "transparent",
                color: "var(--color-fg)",
              }}
            >
              <span
                className="block font-bold"
                style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}
              >
                {env.name}
              </span>
              <span
                className="block opacity-80 mt-1"
                style={{ fontSize: "calc(1rem * var(--font-scale))" }}
              >
                {env.description}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-gray-200 pt-8 w-full">{accessibilityBar}</div>
    </main>
  );
}
