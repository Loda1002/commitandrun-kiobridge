"use client";

import { useState, useEffect } from "react";
import type { AnyAnswers, QuestionDef } from "../lib/types";

interface ContextScreenProps {
  questions: QuestionDef[];
  currentAnswers: AnyAnswers;
  onSubmit: (answers: AnyAnswers) => void;
  isHighContrast: boolean;
  /** Shown as the heading. Each environment asks about something different. */
  title?: string;
}

/**
 * The questions for whichever environment the user picked.
 *
 * Nothing here knows what a spice level or a department is: the question list
 * comes from `lib/api.ts`, and this renders single-choice, multi-choice and
 * number inputs. That is what lets one screen serve all three kiosks.
 *
 * The one piece of real logic is telling "I have none" apart from "I never
 * answered", which matters because an empty multi-select means both. A group
 * that offers a "모르겠어요" option is one where the difference is dangerous —
 * an untouched allergy question read as "no allergies" is us answering a safety
 * question on the user's behalf. Those groups get an explicit "없어요" option
 * and, if left untouched, are submitted as UNKNOWN so the engine stops and
 * asks. Groups without that option (a hospital's support needs) are ordinary
 * preferences where blank simply means none.
 */
export function ContextScreen({
  questions,
  currentAnswers,
  onSubmit,
  isHighContrast,
  title = "상황 입력",
}: ContextScreenProps) {
  const [answers, setAnswers] = useState<AnyAnswers>(currentAnswers);

  /** Multi-choice groups the user has actually interacted with. */
  const [touched, setTouched] = useState<Set<string>>(() => initialTouched(currentAnswers));

  useEffect(() => {
    setAnswers(currentAnswers);
    setTouched(initialTouched(currentAnswers));
  }, [currentAnswers]);

  const setValue = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiChange = (q: QuestionDef, value: string) => {
    setTouched((prev) => new Set(prev).add(q.id));
    setAnswers((prev) => {
      const current = asList(prev[q.id]);

      if (value === "NONE") return { ...prev, [q.id]: [] };
      if (value === "UNKNOWN") return { ...prev, [q.id]: ["UNKNOWN"] };

      const without = current.filter((v) => v !== "UNKNOWN");
      const next = without.includes(value)
        ? without.filter((v) => v !== value)
        : [...without, value];
      return { ...prev, [q.id]: next };
    });
  };

  const handleNumberChange = (id: string, value: string) => {
    setValue(id, value.trim() === "" ? null : Number(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // An untouched question that offered "모르겠어요" is submitted as exactly
    // that — never as an answer we filled in.
    const submitted = { ...answers };
    for (const q of questions) {
      if (q.kind !== "multi" || !offersUnknown(q) || touched.has(q.id)) continue;
      submitted[q.id] = ["UNKNOWN"];
    }
    onSubmit(submitted);
  };

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {title}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
        {questions.map((q) => {
          const border = isHighContrast ? "border-gray-600" : "border-gray-300";

          if (q.kind === "number") {
            const inputId = `question-${q.id}`;
            return (
              <section
                key={q.id}
                className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${border}`}
              >
                <label
                  htmlFor={inputId}
                  className="font-bold cursor-pointer"
                  style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}
                >
                  {q.label}
                </label>
                {q.help && (
                  <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                    {q.help}
                  </p>
                )}
                <input
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  value={asNumberValue(answers[q.id])}
                  onChange={(e) => handleNumberChange(q.id, e.target.value)}
                  placeholder="예: 7000"
                  className={`w-full p-4 rounded-xl border-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] ${
                    isHighContrast
                      ? "bg-black text-white border-gray-500"
                      : "bg-white text-black border-gray-300"
                  }`}
                  style={{
                    minHeight: "var(--tap-min)",
                    fontSize: "calc(1.2rem * var(--font-scale))",
                  }}
                />
              </section>
            );
          }

          const isMulti = q.kind === "multi";
          const selected = isMulti ? asList(answers[q.id]) : [];
          const options =
            isMulti && offersUnknown(q)
              ? [{ value: "NONE", label: "없어요 (해당 없음)" }, ...q.options]
              : q.options;

          return (
            <fieldset
              key={q.id}
              className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${border}`}
            >
              <legend className="font-bold px-2" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                {q.label}
              </legend>
              {q.help && (
                <p className="opacity-80 mb-2" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  {q.help}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt) => {
                  const inputId = `${q.id}-${opt.value}`;
                  const isChecked = isMulti
                    ? opt.value === "NONE"
                      ? touched.has(q.id) && selected.length === 0
                      : selected.includes(opt.value)
                    : answers[q.id] === opt.value;

                  return (
                    <label
                      key={opt.value}
                      htmlFor={inputId}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        isChecked
                          ? "border-[var(--color-accent)] bg-orange-500/10"
                          : isHighContrast
                            ? "border-gray-700 hover:border-gray-500"
                            : "border-gray-200 hover:border-gray-400"
                      }`}
                      style={{ minHeight: "var(--tap-min)" }}
                    >
                      <input
                        id={inputId}
                        type={isMulti ? "checkbox" : "radio"}
                        name={q.id}
                        value={opt.value}
                        checked={isChecked}
                        onChange={() =>
                          isMulti ? handleMultiChange(q, opt.value) : setValue(q.id, opt.value)
                        }
                        className={`w-6 h-6 accent-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none ${
                          isMulti ? "rounded" : ""
                        }`}
                      />
                      <span className="font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                        {opt.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <button
          type="submit"
          className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-fg)",
            color: "var(--color-bg)",
            fontSize: "calc(1.3rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          추천 결과 보기
        </button>
      </form>
    </main>
  );
}

/** A question where "I do not know" is a distinct answer from "I have none". */
function offersUnknown(q: QuestionDef): boolean {
  return q.options.some((o) => o.value === "UNKNOWN");
}

function asList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function asNumberValue(value: unknown): number | string {
  return typeof value === "number" ? value : "";
}

/**
 * Coming back to the form with answers already in hand — a non-empty list means
 * the user did answer that question, whenever that was.
 */
function initialTouched(answers: AnyAnswers): Set<string> {
  const touched = new Set<string>();
  for (const [key, value] of Object.entries(answers)) {
    if (Array.isArray(value) && value.length > 0) touched.add(key);
  }
  return touched;
}
