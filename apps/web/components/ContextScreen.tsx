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

    // [요건 5] 필수 응답 검사. 어느 질문이 필수인지도, 답이 찼는지도 엔진이 정한다
    // — 화면이 직접 판정하면 화면과 제출본이 같은 답을 두고 다른 말을 하게 된다.
    // 무엇이 필수인지는 fixture 의 optionGroups[].required 가 정하므로, 환경이
    // 늘거나 fixture 가 바뀌어도 이 파일은 따라간다. (경위는 pm/22)
    const missing = findMissing(answers, environmentId);

    // 미응답 발생 시 UI 처리: 에러 등록 후 첫 누락 필드로 포커스 이동
    if (missing.length > 0) {
      setMissingIds(missing);
      inputRefs.current[missing[0]]?.focus(); 
      return;
    }
    
    setMissingIds([]);
    const submitted = { ...answers };
    
    // 2. [팀장님 핵심 지시사항] 손 안 댄 것과 "없다고 답함" 분리
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
          const baseBorder = isError ? "border-red-500 bg-red-50" : (isHighContrast ? "border-gray-600" : theme.border);

          if (q.kind === "number") {
            const inputId = `question-${q.id}`;
            return (
              <section key={q.id} className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 transition-colors ${baseBorder}`}>
                <div className="flex justify-between items-center">
                  <label htmlFor={inputId} className="font-bold cursor-pointer" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                    {q.label}
                  </label>
                  {isError && <span aria-live="polite" className="text-red-600 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>⚠️ 필수 응답</span>}
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
              {/* legend 는 fieldset 의 첫 자식이어야 그룹 이름 노릇을 한다. div 로
                  감싸면 스크린리더가 "맵기는 어떻게 해드릴까요?" 를 잃고 선택지만
                  읽는다 — 그래서 에러 표시를 legend 안에 넣는다. 한 번 감쌌다가
                  6개 그룹이 전부 이름을 잃은 적이 있다 (pm/22 2번). */}
              <legend className="font-bold px-2 w-full flex justify-between items-center gap-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                <span>{q.label}</span>
                {isError && <span aria-live="polite" className="text-red-600 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>⚠️ 필수 응답</span>}
              </legend>
              {q.help && <p className="opacity-80 mb-2" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {options.map((opt, idx) => {
                  const inputId = `${q.id}-${opt.value}`;
                  const isChecked = isMulti ? (opt.value === "NONE" ? touched.has(q.id) && selected.length === 0 : selected.includes(opt.value)) : answers[q.id] === opt.value;
                  const selectedClass = isHighContrast ? "border-[var(--color-accent)] bg-gray-800" : theme.selected;
                  const unselectedClass = isHighContrast ? "border-gray-700 hover:border-gray-500" : "border-gray-200 hover:border-gray-400";

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

        <button
          type="submit"
          disabled={missingIds.length > 0}
          className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:hover:scale-100"
          style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-fg)", color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
        >
          추천 결과 보기
        </button>
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