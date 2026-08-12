"use client";

import type { EnvironmentId } from "@commitandrun/engine";
import { environmentCopy } from "../lib/fixture";
import type { CandidateView, OptionSelection } from "../lib/types";

interface ConfirmScreenProps {
  candidate: CandidateView;
  /**
   * What will actually be selected, straight from the engine — not the raw
   * answers. A menu that only comes one way gets that way whatever was asked
   * for, and the user has to approve the real thing.
   */
  selections: OptionSelection[];
  /** Decides what this screen is approving, and what it stops short of. */
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onApprove: () => void;
  onBackToContext: () => void;
}

export function ConfirmScreen({
  candidate,
  selections,
  environmentId,
  isHighContrast,
  onApprove,
  onBackToContext,
}: ConfirmScreenProps) {
  const changed = selections.filter((s) => s.userAnswer !== null && s.userAnswer !== s.optionId);
  const copy = environmentCopy(environmentId);

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {copy.confirmTitle}
      </h1>

      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-6 ${
        isHighContrast ? "border-gray-400" : "border-gray-300"
      }`}>
        <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>{copy.noun}</span>
          <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>{candidate.name}</span>
        </div>

        {/* Only the chicken shop prices anything. A check-in route has no price,
            and "0원" reads as free rather than as not applicable. */}
        {candidate.priceKrw > 0 && (
          <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
            <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>가격</span>
            <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))", color: "var(--color-accent)" }}>
              {candidate.priceKrw.toLocaleString()}원
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>선택 옵션</span>
          <div className="flex flex-wrap gap-2">
            {selections.map((selection) => (
              <span
                key={selection.groupId}
                className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}
              >
                {selection.label} {selection.optionLabel}
              </span>
            ))}
          </div>
        </div>

        {/* Say it out loud when the menu cannot be had the way it was asked for.
            Finding out after the fact is how a kiosk loses someone's trust. */}
        {changed.length > 0 && (
          <div
            className={`p-4 rounded-xl border-2 flex flex-col gap-2 ${
              isHighContrast ? "border-yellow-300" : "border-orange-500 bg-orange-50"
            }`}
            style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}
          >
            <p className="font-extrabold">고르신 것과 다른 부분이 있습니다</p>
            <ul className="flex flex-col gap-1 list-disc pl-5">
              {changed.map((selection) => (
                <li key={selection.groupId}>
                  {selection.label}: {selection.userAnswerLabel} → <strong>{selection.optionLabel}</strong>
                  {" "}— 이 {copy.noun}에는 고르신 선택지가 없습니다.
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="p-4 rounded-xl text-center font-extrabold bg-red-500/10 border-2 border-red-500" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          ⚠️ {copy.boundaryNotice}
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
        <button
          type="button"
          onClick={onBackToContext}
          className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "transparent",
            color: "var(--color-fg)",
            border: "2px solid var(--color-fg)",
            fontSize: "calc(1.2rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          다시 고를게요 (상황 입력으로)
        </button>

        <button
          type="button"
          onClick={onApprove}
          className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: "calc(1.2rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          이대로 진행할게요
        </button>
      </div>
    </main>
  );
}