"use client";

import { useState, useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { ENVIRONMENTS } from "../lib/fixture";
import type { AnyAnswers, CandidateView, QuestionDef } from "../lib/types";

interface StaffHelpProps {
  questions: QuestionDef[];
  answers: AnyAnswers;
  answersSubmitted: boolean;
  candidate: CandidateView | null;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
}

const NOT_ANSWERED = "아직 안 고르셨습니다";

export function StaffHelp({
  questions,
  answers,
  answersSubmitted,
  candidate,
  environmentId,
  isHighContrast,
}: StaffHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  const noun = ENVIRONMENTS.find((e) => e.id === environmentId)?.noun ?? "고르신 것";

  const rows: Array<[string, string]> = questions.map((q) => [
    q.short ?? q.label,
    describe(q, answers[q.id], answersSubmitted),
  ]);

  const closeDialog = () => {
    setIsOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus();
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeDialog();
        
        if (e.key === "Tab") {
          const focusableElements = document.getElementById("staff-help-panel")?.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements && focusableElements.length > 0) {
            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey && document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };
      
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  return (
    <div className="w-full">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => (isOpen ? closeDialog() : setIsOpen(true))}
        aria-expanded={isOpen}
        aria-controls="staff-help-panel"
        className="w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
        style={{
          minHeight: "var(--tap-min)",
          borderRadius: "var(--radius)",
          backgroundColor: "transparent",
          color: "var(--color-fg)",
          border: "2px dashed var(--color-fg)",
          fontSize: "calc(1.1rem * var(--font-scale))",
          fontWeight: "bold",
        }}
      >
        🙋 {isOpen ? "직원 도움 화면 닫기" : "직원 도움이 필요해요"}
      </button>

      {isOpen && (
        <section
          id="staff-help-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-help-title"
          className={`mt-4 border-4 rounded-2xl p-6 md:p-8 flex flex-col gap-5 ${
            isHighContrast ? "border-yellow-300 bg-transparent" : "border-orange-500 bg-orange-50"
          }`}
        >
          <h2 id="staff-help-title" ref={headingRef} tabIndex={-1} className="font-extrabold focus-visible:outline-none" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>
            직원에게 이 화면을 보여주세요
          </h2>
          <p style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            이 서비스는 직원을 자동으로 부르지 않습니다. 가까운 직원에게 이 화면을 보여주시면 지금까지 고르신 내용을 바로 확인하실 수 있습니다.
          </p>

          {candidate && (
            <p className="font-bold border-b pb-4" style={{ borderColor: "var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))" }}>
              보고 계신 {noun}: {candidate.name}
              {candidate.priceKrw > 0 && ` · ${candidate.priceKrw.toLocaleString()}원`}
            </p>
          )}

          <dl className="flex flex-col gap-3" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="opacity-80 font-bold shrink-0">{label}</dt>
                <dd className="font-bold text-right">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
            결제는 이 화면에서 진행되지 않습니다.
          </p>
          
          <button
            type="button"
            onClick={closeDialog}
            className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
            style={{ minHeight: "var(--tap-min)", borderRadius: "var(--radius)", backgroundColor: "var(--color-fg)", color: "var(--color-bg)", fontSize: "calc(1.1rem * var(--font-scale))", fontWeight: "bold" }}
          >
            닫기
          </button>
        </section>
      )}
    </div>
  );
}

function describe(q: QuestionDef, value: unknown, submitted: boolean): string {
  const labelOf = (id: string) => q.options.find((o) => o.value === id)?.label ?? id;
  if (q.kind === "number") {
    return typeof value === "number" ? `${value.toLocaleString()}${q.unit ?? ""}` : "정하지 않으셨습니다";
  }
  if (q.kind === "multi") {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    if (ids.includes("UNKNOWN")) return "모르겠다고 답하셨습니다 — 꼭 확인해 주세요";
    if (ids.length === 0) return submitted ? "없다고 답하셨습니다" : NOT_ANSWERED;
    return ids.map(labelOf).join(", ");
  }
  const id = typeof value === "string" ? value : "";
  if (id === "" || id === "UNKNOWN") return NOT_ANSWERED;
  return labelOf(id);
}