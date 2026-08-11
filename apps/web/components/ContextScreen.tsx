"use client";

import { useState, useEffect } from "react";
import type { Answers, QuestionDef } from "../lib/types";

interface ContextScreenProps {
  questions: QuestionDef[];
  currentAnswers: Answers;
  onSubmit: (answers: Answers) => void;
  isHighContrast: boolean;
}

export function ContextScreen({
  questions,
  currentAnswers,
  onSubmit,
  isHighContrast,
}: ContextScreenProps) {
  const [answers, setAnswers] = useState<Answers>(currentAnswers);

  /**
   * `allergenIds: []` means "I have none" to the engine (see input.ts:
   * "The form must only send [] when the user picked 없음"). An empty array is
   * also the starting value, so the group has to remember whether the user
   * actually touched it — otherwise skipping the question would be sent as an
   * answer of "no allergies", which is us answering on their behalf.
   */
  const [allergenAnswered, setAllergenAnswered] = useState(currentAnswers.allergenIds.length > 0);

  useEffect(() => {
    setAnswers(currentAnswers);
    setAllergenAnswered(currentAnswers.allergenIds.length > 0);
  }, [currentAnswers]);

  const handleSingleChange = (id: keyof Answers, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleAllergenChange = (value: string) => {
    setAllergenAnswered(true);
    setAnswers((prev) => {
      const current = prev.allergenIds;

      if (value === "NONE") {
        return { ...prev, allergenIds: [] };
      }

      if (value === "UNKNOWN") {
        return { ...prev, allergenIds: ["UNKNOWN"] };
      }

      const filtered = current.filter((v) => v !== "UNKNOWN");
      const next = filtered.includes(value)
        ? filtered.filter((v) => v !== value)
        : [...filtered, value];

      return { ...prev, allergenIds: next };
    });
  };

  const handleNumberChange = (value: string) => {
    const parsed = value.trim() === "" ? null : Number(value);
    setAnswers((prev) => ({ ...prev, maxPriceKrw: parsed }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Untouched allergy question → "did not answer", never "has none". The
    // engine stops and asks again on UNKNOWN, which is the safe direction.
    onSubmit(allergenAnswered ? answers : { ...answers, allergenIds: ["UNKNOWN"] });
  };

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        상황 입력
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
        {questions.map((q) => {
          if (q.kind === "number") {
            const inputId = `question-${q.id}`;
            return (
              <section
                key={q.id}
                className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${
                  isHighContrast ? "border-gray-600" : "border-gray-300"
                }`}
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
                  value={answers.maxPriceKrw ?? ""}
                  onChange={(e) => handleNumberChange(e.target.value)}
                  placeholder="예: 7000"
                  className={`w-full p-4 rounded-xl border-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] ${
                    isHighContrast ? "bg-black text-white border-gray-500" : "bg-white text-black border-gray-300"
                  }`}
                  style={{
                    minHeight: "var(--tap-min)",
                    fontSize: "calc(1.2rem * var(--font-scale))",
                  }}
                />
              </section>
            );
          }

          if (q.kind === "multi") {
            const allergenOptions = [
              { value: "NONE", label: "없어요 (해당 없음)" },
              ...q.options,
            ];

            const isNoneSelected = allergenAnswered && answers.allergenIds.length === 0;
            const isUnknownSelected = answers.allergenIds.includes("UNKNOWN");

            return (
              <fieldset
                key={q.id}
                className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${
                  isHighContrast ? "border-gray-600" : "border-gray-300"
                }`}
              >
                <legend
                  className="font-bold px-2"
                  style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}
                >
                  {q.label}
                </legend>
                {q.help && (
                  <p className="opacity-80 mb-2" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                    {q.help}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allergenOptions.map((opt) => {
                    const inputId = `allergen-${opt.value}`;
                    
                    let isChecked = false;
                    if (opt.value === "NONE") {
                      isChecked = isNoneSelected;
                    } else if (opt.value === "UNKNOWN") {
                      isChecked = isUnknownSelected;
                    } else {
                      isChecked = answers.allergenIds.includes(opt.value);
                    }

                    return (
                      <label
                        key={opt.value}
                        htmlFor={inputId}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                          isChecked
                            ? "border-[var(--color-accent)] bg-orange-500/10"
                            : isHighContrast ? "border-gray-700 hover:border-gray-500" : "border-gray-200 hover:border-gray-400"
                        }`}
                        style={{ minHeight: "var(--tap-min)" }}
                      >
                        <input
                          id={inputId}
                          type="checkbox"
                          name={q.id}
                          value={opt.value}
                          checked={isChecked}
                          onChange={() => handleAllergenChange(opt.value)}
                          className="w-6 h-6 rounded accent-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
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
          }

          const currentValue = (answers as any)[q.id] ?? "";
          return (
            <fieldset
              key={q.id}
              className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${
                isHighContrast ? "border-gray-600" : "border-gray-300"
              }`}
            >
              <legend
                className="font-bold px-2"
                style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}
              >
                {q.label}
              </legend>
              {q.help && (
                <p className="opacity-80 mb-2" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  {q.help}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt) => {
                  const inputId = `single-${q.id}-${opt.value}`;
                  const isChecked = currentValue === opt.value;
                  return (
                    <label
                      key={opt.value}
                      htmlFor={inputId}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        isChecked
                          ? "border-[var(--color-accent)] bg-orange-500/10"
                          : isHighContrast ? "border-gray-700 hover:border-gray-500" : "border-gray-200 hover:border-gray-400"
                        }`}
                      style={{ minHeight: "var(--tap-min)" }}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={q.id}
                        value={opt.value}
                        checked={isChecked}
                        onChange={() => handleSingleChange(q.id, opt.value)}
                        className="w-6 h-6 accent-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none"
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