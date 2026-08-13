"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { actionLabel, stateLabel, type RunView } from "../lib/types";
import { fixtureFor } from "../lib/fixture";

type StepTarget = { kind: string; id: string; groupId?: string };

interface ResultScreenProps {
  runResult: RunView;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onReset: () => void;
}

export function ResultScreen({ runResult, environmentId, isHighContrast, onReset }: ResultScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const targetLabel = (target: StepTarget): string => {
    const fixture = fixtureFor(environmentId);
    if (target.kind === "candidate") {
      const candidate = fixture.candidates.find((c) => c.candidateId === target.id);
      if (candidate) return candidate.name;
    }
    if (target.kind === "review") {
      const screen = fixture.screens.find((s) => s.state === target.id);
      if (screen) return screen.title;
    }
    const group = fixture.optionGroups.find((g) => target.groupId ? g.groupId === target.groupId : g.kind === target.kind);
    const option = group?.options.find((o) => o.id === target.id);
    if (group && option) return `${group.label} · ${option.label}`;
    if (group) return group.label;
    return target.groupId ? `${target.groupId} · ${target.id}` : target.id;
  };

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        실행 결과 및 안전 리포트
      </h1>

      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isHighContrast ? "border-gray-400" : "border-gray-300 bg-white"}`}>
        <h2 className="font-bold border-b pb-3" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
          📋 실행 계획 ({runResult.plan.length}단계)
        </h2>
        <ol className="flex flex-col gap-3 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          {runResult.plan.map((step, idx) => {
            const isLast = idx === runResult.plan.length - 1;
            return (
              <li key={step.actionIndex ?? idx} className={`flex justify-between items-center py-2 border-b last:border-0 ${isHighContrast ? "border-gray-800" : "border-gray-200"}`}>
                <div className="flex items-center gap-3">
                  <span className="opacity-60 w-6 text-right">{idx + 1}.</span>
                  <span>{actionLabel(step.action, environmentId)}</span>
                </div>
                <span className="opacity-80 font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  {isLast ? "✅ 완료" : targetLabel(step.target)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={`border-4 rounded-2xl p-6 md:p-8 ${isHighContrast ? (runResult.validation.valid ? "border-green-400 bg-transparent" : "border-red-400 bg-transparent") : (runResult.validation.valid ? "border-green-600 bg-green-50 shadow-md" : "border-red-600 bg-red-50 shadow-md")}`}>
        <h2 className={`font-extrabold mb-2 ${isHighContrast ? (runResult.validation.valid ? "text-green-400" : "text-red-400") : (runResult.validation.valid ? "text-green-800" : "text-red-800")}`} style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>
          {runResult.validation.valid ? "✅ 자체 안전 검사 결과" : "❌ 안전 검사 실패 (위험)"}
        </h2>
        <p className="opacity-80 mb-6 font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
          우리 서비스가 실행계획을 자체 안전 규칙에 대조해 본 결과입니다. (공식 시뮬레이터가 아닙니다)
        </p>
        <ul className="flex flex-col gap-6 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>결제 관련 동작</span>
            <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? "border-green-400" : "border-red-400"}` : (runResult.validation.valid ? "bg-green-200" : "bg-red-200")}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              계획 {runResult.safety.plannedActionCount}단계 중 {runResult.safety.plannedForbiddenActionCount}건
            </span>
          </li>
          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>실제 기기 명령</span>
            <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? "border-green-400" : "border-red-400"}` : (runResult.validation.valid ? "bg-green-200" : "bg-red-200")}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              {runResult.safety.actualDeviceCommandSent ? "있음 (주의)" : "없음"}
            </span>
          </li>
          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>정지 지점</span>
            <span>
              {stateLabel(runResult.safety.boundaryState)}
              <span className="opacity-70 ml-2" style={{ fontSize: "calc(0.875rem * var(--font-scale))" }}>
                {environmentId === "chicken-store" ? "(결제 직전)" : "(사람이 이어서 합니다)"}
              </span>
            </span>
          </li>
          <li className={`flex justify-between items-center pt-2 ${isHighContrast ? (runResult.validation.valid ? "text-green-400" : "text-red-400") : (runResult.validation.valid ? "text-green-700" : "text-red-700")}`} style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
            <span>검증 결과</span>
            <span className={`px-6 py-2 rounded-xl ${isHighContrast ? (runResult.validation.valid ? "bg-green-400 text-black" : "bg-red-400 text-black") : (runResult.validation.valid ? "bg-green-600 text-white" : "bg-red-600 text-white")}`}>
              {runResult.validation.valid ? "이상 없음 (PASS)" : "문제 있음 (FAIL)"}
            </span>
          </li>
        </ul>
      </section>

      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isHighContrast ? "border-gray-400 bg-transparent" : "border-gray-300 bg-gray-50"}`}>
        <h2 className="font-bold border-b pb-3" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
          🛡️ 공식 시뮬레이터 검증 증거
        </h2>
        <p className="font-bold text-red-600" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          ⚠️ 2026-08-13 닭강정집 제출본에 대한 기록
        </p>
        <ul className="flex flex-col gap-3 font-medium" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          <li className={`flex justify-between border-b pb-2 ${isHighContrast ? "border-gray-700" : "border-gray-200"}`}>
            <span>stopType</span>
            <strong>NORMAL_BOUNDARY_STOP</strong>
          </li>
          <li className={`flex justify-between border-b pb-2 ${isHighContrast ? "border-gray-700" : "border-gray-200"}`}>
            <span>boundaryReached</span>
            <strong>true</strong>
          </li>
          <li className={`flex justify-between pb-2`}>
            <span>plannedPaymentActionCount</span>
            <strong>0</strong>
          </li>
        </ul>
      </section>

      <button type="button" onClick={onReset} className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))", fontWeight: "bold" }}>
        처음으로 돌아가기
      </button>
    </main>
  );
}