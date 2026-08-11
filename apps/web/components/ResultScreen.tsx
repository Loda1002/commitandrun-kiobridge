"use client";

import { actionLabel, type RunView } from "../lib/types";

interface ResultScreenProps {
  runResult: RunView;
  isHighContrast: boolean;
  onReset: () => void;
}

export function ResultScreen({ runResult, isHighContrast, onReset }: ResultScreenProps) {
  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        실행 결과 및 안전 리포트
      </h1>

      {/* 실행 계획 10줄 (actionLabel 적용) */}
      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${
        isHighContrast ? "border-gray-400" : "border-gray-300"
      }`}>
        <h2 className="font-bold border-b pb-3" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
          📋 실행 계획 ({runResult.plan.length}단계)
        </h2>
        <ol className="flex flex-col gap-3 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          {runResult.plan.map((step, idx) => {
            const targetDesc = step.target.groupId
              ? `${step.target.groupId} · ${step.target.id}`
              : step.target.id;
            return (
              <li
                key={step.actionIndex ?? idx}
                className={`flex justify-between items-center py-2 border-b last:border-0 ${
                  isHighContrast ? "border-gray-800" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="opacity-60 w-6 text-right">{idx + 1}.</span>
                  <span>{actionLabel(step.action)}</span>
                </div>
                <span className="opacity-80 font-mono text-sm sm:text-base">
                  {idx === runResult.plan.length - 1 ? "✅ 완료" : targetDesc}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 안전 리포트 */}
      <section className={`border-4 rounded-2xl p-6 md:p-8 ${
        isHighContrast
          ? (runResult.validation.valid ? "border-green-400 bg-transparent" : "border-red-400 bg-transparent")
          : (runResult.validation.valid ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50")
      }`}>
        <h2
          className={`font-extrabold mb-8 ${
            isHighContrast
              ? (runResult.validation.valid ? "text-green-400" : "text-red-400")
              : (runResult.validation.valid ? "text-green-800" : "text-red-800")
          }`}
          style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}
        >
          {runResult.validation.valid ? "✅ 안전 확인 리포트" : "❌ 안전 확인 실패 (위험)"}
        </h2>

        <ul className="flex flex-col gap-6 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>결제 관련 동작</span>
            <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? "border-green-400" : "border-red-400"}` : (runResult.validation.valid ? "bg-green-200" : "bg-red-200")}`}>
              계획 {runResult.safety.plannedActionCount}단계 중 {runResult.safety.plannedForbiddenActionCount}건
            </span>
          </li>

          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>실제 기기 명령</span>
            <span className={`px-3 py-1 rounded-lg ${isHighContrast ? `border ${runResult.validation.valid ? "border-green-400" : "border-red-400"}` : (runResult.validation.valid ? "bg-green-200" : "bg-red-200")}`}>
              {runResult.safety.actualDeviceCommandSent ? "있음 (주의)" : "없음"}
            </span>
          </li>

          <li className={`flex justify-between items-center border-b pb-4 ${isHighContrast ? "border-gray-700" : (runResult.validation.valid ? "border-green-200" : "border-red-200")}`}>
            <span>정지 지점</span>
            <span>
              {runResult.safety.boundaryState}
              <span className="opacity-70 ml-2" style={{ fontSize: "calc(0.875rem * var(--font-scale))" }}>(결제 직전)</span>
            </span>
          </li>

          <li
            className={`flex justify-between items-center pt-2 ${
              isHighContrast ? (runResult.validation.valid ? "text-green-400" : "text-red-400") : (runResult.validation.valid ? "text-green-700" : "text-red-700")
            }`}
            style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}
          >
            <span>검증 결과</span>
            <span className={`px-6 py-2 rounded-xl ${
              isHighContrast
                ? (runResult.validation.valid ? "bg-green-400 text-black" : "bg-red-400 text-black")
                : (runResult.validation.valid ? "bg-green-600 text-white" : "bg-red-600 text-white")
            }`}>
              {runResult.validation.valid ? "PASS" : "FAIL"}
            </span>
          </li>
        </ul>
      </section>

      <button
        type="button"
        onClick={onReset}
        className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
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
        처음으로 돌아가기
      </button>
    </main>
  );
}