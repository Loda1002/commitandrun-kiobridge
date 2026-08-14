"use client";

import { useState, useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import type { AnyAnswers, QuestionDef } from "../lib/types";
import { findMissing } from "../lib/api";

interface ContextScreenProps {
  questions: QuestionDef[];
  currentAnswers: AnyAnswers;
  onSubmit: (answers: AnyAnswers) => void;
  isHighContrast: boolean;
  title?: string;
  environmentId: EnvironmentId;
  onReset?: () => void;
}

const THEMES: Record<string, { border: string; selected: string }> = {
  "chicken-store": { border: "border-orange-300", selected: "border-orange-500 bg-orange-50" },
  "hospital": { border: "border-blue-300", selected: "border-blue-500 bg-blue-50" },
  "public-office": { border: "border-emerald-300", selected: "border-emerald-500 bg-emerald-50" },
};

export function ContextScreen({
  questions,
  currentAnswers,
  onSubmit,
  isHighContrast,
  title = "상황 입력",
  environmentId,
  onReset,
}: ContextScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRefs = useRef<Record<string, HTMLElement | null>>({});
  
  const [answers, setAnswers] = useState<AnyAnswers>(currentAnswers);
  const [touched, setTouched] = useState<Set<string>>(() => initialTouched(currentAnswers));
  const [missingIds, setMissingIds] = useState<string[]>([]);

  const theme = THEMES[environmentId] || THEMES["chicken-store"];

  useEffect(() => {
    headingRef.current?.focus();
    setAnswers(currentAnswers);
    setTouched(initialTouched(currentAnswers));
  }, [currentAnswers]);

  const setValue = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    if (missingIds.includes(id)) {
      setMissingIds((prev) => prev.filter((missingId) => missingId !== id));
    }
  };

  const handleMultiChange = (q: QuestionDef, value: string) => {
    setTouched((prev) => new Set(prev).add(q.id));
    setAnswers((prev) => {
      const current = asList(prev[q.id]);
      if (value === "NONE") return { ...prev, [q.id]: [] };
      if (value === "UNKNOWN") return { ...prev, [q.id]: ["UNKNOWN"] };
      const without = current.filter((v) => v !== "UNKNOWN");
      const next = without.includes(value) ? without.filter((v) => v !== value) : [...without, value];
      return { ...prev, [q.id]: next };
    });
    if (missingIds.includes(q.id)) {
      setMissingIds((prev) => prev.filter((missingId) => missingId !== q.id));
    }
  };

  const handleNumberChange = (id: string, value: string) => {
    setValue(id, value.trim() === "" ? null : Number(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const missing = findMissing(answers, environmentId);

    if (missing.length > 0) {
      setMissingIds(missing);
      inputRefs.current[missing[0]]?.focus(); 
      return;
    }
    
    setMissingIds([]);
    const submitted = { ...answers };
    
    for (const q of questions) {
      if (q.kind !== "multi" || !offersUnknown(q) || touched.has(q.id)) continue;
      submitted[q.id] = ["UNKNOWN"];
    }
    
    onSubmit(submitted);
  };

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {title}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
        {questions.map((q) => {
          const isError = missingIds.includes(q.id);
          
          // 🔥 [수정] 고대비 모드일 때는 하얀 배경(bg-red-50)을 빼고 살짝 투명한 붉은 톤(bg-red-500/10)만 줍니다!
          const baseBorder = isError 
            ? (isHighContrast ? "border-red-400 bg-red-500/10" : "border-red-500 bg-red-50") 
            : (isHighContrast ? "border-gray-600 bg-transparent" : theme.border);

          if (q.kind === "number") {
            const inputId = `question-${q.id}`;
            return (
              <section key={q.id} className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 transition-colors ${baseBorder}`}>
                <div className="flex justify-between items-center">
                  <label htmlFor={inputId} className="font-bold cursor-pointer" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                    {q.label}
                  </label>
                  {isError && <span aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>⚠️ 필수 응답</span>}
                </div>
                {q.help && <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
                <input
                  ref={(el) => { inputRefs.current[q.id] = el; }}
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  value={asNumberValue(answers[q.id])}
                  onChange={(e) => handleNumberChange(q.id, e.target.value)}
                  placeholder="예: 7000"
                  className={`w-full p-4 rounded-xl border-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] ${
                    isHighContrast ? "bg-black text-white border-gray-500" : "bg-white text-black border-gray-300"
                  }`}
                  style={{ minHeight: "var(--tap-min)", fontSize: "calc(1.2rem * var(--font-scale))" }}
                />
              </section>
            );
          }

          const isMulti = q.kind === "multi";
          const selected = isMulti ? asList(answers[q.id]) : [];
          const options = isMulti && offersUnknown(q) ? [{ value: "NONE", label: "없어요 (해당 없음)" }, ...q.options] : q.options;

          return (
            <fieldset key={q.id} className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 transition-colors ${baseBorder}`}>
              <legend className="font-bold px-2 w-full flex justify-between items-center gap-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                <span>{q.label}</span>
                {isError && <span aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>⚠️ 필수 응답</span>}
              </legend>
              {q.help && <p className="opacity-80 mb-2" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt, idx) => {
                  const inputId = `${q.id}-${opt.value}`;
                  const isChecked = isMulti ? (opt.value === "NONE" ? touched.has(q.id) && selected.length === 0 : selected.includes(opt.value)) : answers[q.id] === opt.value;
                  const selectedClass = isHighContrast ? "border-[var(--color-accent)] bg-gray-800" : theme.selected;
                  const unselectedClass = isHighContrast ? "border-gray-700 hover:border-gray-500 bg-transparent" : "border-gray-200 hover:border-gray-400 bg-transparent";

                  return (
                    <label key={opt.value} htmlFor={inputId} className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${isChecked ? selectedClass : unselectedClass}`} style={{ minHeight: "var(--tap-min)" }}>
                      <input
                        ref={(el) => { if (idx === 0) inputRefs.current[q.id] = el; }}
                        id={inputId}
                        type={isMulti ? "checkbox" : "radio"}
                        name={q.id}
                        value={opt.value}
                        checked={isChecked}
                        onChange={() => isMulti ? handleMultiChange(q, opt.value) : setValue(q.id, opt.value)}
                        className={`w-6 h-6 accent-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none ${isMulti ? "rounded" : ""}`}
                      />
                      <span className="font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none"
              style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
            >
              처음으로 가기
            </button>
          )}
          <button
            type="submit"
            disabled={missingIds.length > 0}
            className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:hover:scale-100"
            style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-fg)", color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
          >
            추천 결과 보기
          </button>
        </div>
      </form>
    </main>
  );
}

function offersUnknown(q: QuestionDef): boolean { return q.options.some((o) => o.value === "UNKNOWN"); }
function asList(value: unknown): string[] { return Array.isArray(value) ? (value as string[]) : []; }
function asNumberValue(value: unknown): number | string { return typeof value === "number" ? value : ""; }
function initialTouched(answers: AnyAnswers): Set<string> {
  const touched = new Set<string>();
  for (const [key, value] of Object.entries(answers)) {
    if (Array.isArray(value) && value.length > 0) touched.add(key);
  }
  return touched;
}