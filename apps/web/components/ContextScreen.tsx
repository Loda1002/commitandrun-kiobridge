"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import type { AnyAnswers, QuestionDef } from "../lib/types";
import { findMissing } from "../lib/api";

interface ContextScreenProps {
  questions: QuestionDef[];
  currentAnswers: AnyAnswers;
  onChange?: (answers: AnyAnswers) => void;
  onSubmit: (answers: AnyAnswers) => void;
  isHighContrast: boolean;
  title?: string;
  environmentId: EnvironmentId;
  onReset?: () => void;
  isRestored?: boolean;
  restoredSavedAt?: string | null;
}

const THEMES: Record<string, { border: string; selected: string }> = {
  "chicken-store": { border: "border-orange-300", selected: "border-orange-500 bg-orange-50" },
  "hospital": { border: "border-blue-300", selected: "border-blue-500 bg-blue-50" },
  "public-office": { border: "border-emerald-300", selected: "border-emerald-500 bg-emerald-50" },
};

export function ContextScreen({
  questions,
  currentAnswers,
  onChange,
  onSubmit,
  isHighContrast,
  title = "상황 입력",
  environmentId,
  onReset,
  isRestored,
  restoredSavedAt,
}: ContextScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRefs = useRef<Record<string, HTMLElement | null>>({});
  
  const [answers, setAnswers] = useState<AnyAnswers>(currentAnswers);
  const [touched, setTouched] = useState<Set<string>>(() => initialTouched(currentAnswers));
  const [showErrors, setShowErrors] = useState(false);

  const theme = THEMES[environmentId] || THEMES["chicken-store"];

  /**
   * question id -> the engine's sentence, asked again on every change.
   *
   * ⚠️ Do not go back to holding a list and deleting entries as fields are
   * edited. Two of the engine's answers are about the answer set rather than
   * one field: 초진 · 예약 있음 · 내과 flags all three, and changing any one of
   * them clears all three at once. A held list only forgot the field that was
   * touched, so the button stayed disabled after the user had already fixed the
   * problem, with no field left to edit that would unlock it — a dead end with
   * no error on screen, which is worse than the one the gate removes.
   */
  const missing = useMemo(
    () =>
      showErrors
        ? Object.fromEntries(findMissing(answers, environmentId).map((m) => [m.id, m.message]))
        : {},
    [showErrors, answers, environmentId],
  );

  useEffect(() => {
    headingRef.current?.focus();
    setAnswers(currentAnswers);
    setTouched(initialTouched(currentAnswers));
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상태 유실을 방지하기 위해 onChange를 항상 최신 상태의 참조로 유지합니다.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 답변 상태가 바뀔 때마다 안전하게 부모(page.tsx)에게 전달합니다. (연타 버그 완벽 방지)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChangeRef.current?.(answers);
  }, [answers]);

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
      const next = without.includes(value) ? without.filter((v) => v !== value) : [...without, value];
      return { ...prev, [q.id]: next };
    });
  };

  const handleNumberChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value.trim() === "" ? null : Number(value) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 필수 응답 검사. 어느 질문이 필수인지도, 답이 찼는지도 엔진이 정한다
    // — 화면이 직접 판정하면 화면과 제출본이 같은 답을 두고 다른 말을 하게 된다.
    // 무엇이 필수인지는 fixture 의 optionGroups[].required 가 정하므로, 환경이
    // 늘거나 fixture 가 바뀌어도 이 파일은 따라간다. (경위는 pm/22)
    const found = findMissing(answers, environmentId);

    if (found.length > 0) {
      setShowErrors(true);
      inputRefs.current[found[0].id]?.focus();
      return;
    }

    setShowErrors(false);
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

      {isRestored && (
        <div role="status" className={`border-2 rounded-2xl p-6 font-bold flex flex-col gap-2 ${isHighContrast ? "border-[var(--color-accent)]" : "border-blue-400 bg-blue-50 text-blue-900"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          <p>지난번에 답하신 내용을 채워 두었습니다. 지금도 맞는지 확인해 주세요.</p>
          {restoredSavedAt && <p className="opacity-70" style={{ fontSize: "calc(0.9rem * var(--font-scale))" }}>저장 일시: {restoredSavedAt}</p>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8 w-full">
        {questions.map((q) => {
          const errorMessage = missing[q.id];
          const isError = errorMessage !== undefined;
          
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
                </div>
                {isError && (
                  <p id={`${q.id}-error`} aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                    ⚠️ {errorMessage}
                  </p>
                )}
                {q.help && <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
                <input
                  ref={(el) => { inputRefs.current[q.id] = el; }}
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  aria-invalid={isError}
                  aria-describedby={isError ? `${q.id}-error` : undefined}
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
            <fieldset
              key={q.id}
              aria-describedby={isError ? `${q.id}-error` : undefined}
              className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 transition-colors ${baseBorder}`}
            >
              {/* legend 는 fieldset 의 첫 자식이어야 그룹 이름 노릇을 한다. div 로
                  감싸면 스크린리더가 "맵기는 어떻게 해드릴까요?" 를 잃고 선택지만
                  읽는다 — 그래서 에러 표시를 legend 안에 넣는다. 한 번 감쌌다가
                  6개 그룹이 전부 이름을 잃은 적이 있다 (pm/22 2번). */}
              <legend className="font-bold px-2 w-full flex justify-between items-center gap-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                <span>{q.label}</span>
              </legend>
              {isError && (
                <p id={`${q.id}-error`} aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                  ⚠️ {errorMessage}
                </p>
              )}
              {isRestored && environmentId === "chicken-store" && q.id === "allergenIds" && (
                <p role="status" className={`font-bold p-3 rounded-lg mt-2 mb-2 ${isHighContrast ? "bg-gray-800 text-yellow-300" : "bg-orange-100 text-orange-800"}`} style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  드시면 안 되는 재료는 안전을 위해 매번 다시 여쭙니다.
                </p>
              )}
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
            disabled={Object.keys(missing).length > 0}
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