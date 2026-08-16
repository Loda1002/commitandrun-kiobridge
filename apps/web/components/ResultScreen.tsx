"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { actionLabel, stateLabel, type RunView } from "../lib/types";
import { ENVIRONMENTS, displayCandidateName, environmentCopy, fixtureFor } from "../lib/fixture";
import { envColor } from "../lib/theme";
import evidence from "../public/simulation-evidence.json";

type StepTarget = { kind: string; id: string; groupId?: string };

const EVIDENCE_ROWS: Array<[string, string]> = [
  ["result", String(evidence.result)],
  ["stopType", String(evidence.stopType)],
  ["boundaryReached", String(evidence.boundaryReached)],
  ["requiredVerifierExecuted", String(evidence.requiredVerifierExecuted)],
  ["plannedPaymentActionCount", String(evidence.plannedPaymentActionCount)],
  ["actualDeviceCommandSent", String(evidence.actualDeviceCommandSent)],
];

const EVIDENCE_DATE = String(evidence.createdAt).slice(0, 10);

const EVIDENCE_ENVIRONMENT_NAME =
  ENVIRONMENTS.find((e) => e.id === evidence.environmentId)?.name ?? evidence.environmentId;

interface ResultScreenProps {
  runResult: RunView;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onReset: () => void;
  onDeleteProfile: () => void; 
}

export function ResultScreen({ runResult, environmentId, isHighContrast, onReset, onDeleteProfile }: ResultScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = environmentCopy(environmentId);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const targetLabel = (target: StepTarget): string => {
    const fixture = fixtureFor(environmentId);
    if (target.kind === "candidate") {
      const candidate = fixture.candidates.find((c) => c.candidateId === target.id);
      if (candidate) return displayCandidateName(candidate.candidateId, candidate.name);
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
      {/* 제목은 「실행 결과 및 안전 리포트」였다. 그것은 심사위원이 읽을 말이지
          키오스크 앞에 선 사람이 읽을 말이 아니다(팀장 지시, 2026-08-16).
          하러 온 일이 끝났다는 것을 먼저 말하고, 바로 아래에서 **무엇을 일부러
          안 했는지**를 한 줄로 말한다. 뒤의 검사표와 증거는 그대로 남는다. */}
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {copy.doneTitle}
      </h1>

      <p className="text-center font-bold break-keep leading-snug opacity-90" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
        {copy.boundaryNotice}
      </p>

      {/* 여기서 화면이 둘로 갈린다. 위는 하러 오신 일이 끝났다는 말이고, 아래는
          그 일을 저희가 어떻게 했는지 펼쳐 놓은 자리다 — 실행 계획·자체 안전
          검사·공식 시뮬레이터 증거 셋 다 심사와 검증을 위한 것이지, 키오스크 앞에
          선 분이 읽고 판단할 것이 아니다(팀장 지시, 2026-08-16).

          **감추지 않고 선만 긋는다.** 「무엇을 시켰는지」를 숨기지 않는 것이 이
          서비스의 약속이라 접어 두기는 해도 지우지는 않는다. 대신 여기까지 읽으면
          된다고 말해 주면, 읽을 필요가 없는 분은 멈출 수 있고 심사위원은 어디부터
          보면 되는지 알 수 있다.

          점선인 것도 뜻이 있다 — 실선은 「다른 이야기가 시작된다」이지만 점선은
          「여기서 끊어도 된다」에 가깝다. 색은 환경색이라 화면의 다른 구분과
          같은 계열로 읽히고, 고대비에서는 회색이다(노란 강조색은 이 자리에
          쓰기엔 너무 세다 — 덜 중요한 것을 가리키는 선이다). */}
      <div
        className={`border-t-2 border-dashed pt-5 flex flex-col gap-2 ${isHighContrast ? "border-gray-500" : ""}`}
        style={isHighContrast ? undefined : { borderColor: envColor(environmentId) }}
      >
        <p className="font-extrabold break-keep leading-snug" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
          여기까지가 이용하시는 데 필요한 내용입니다
        </p>
        <p className="opacity-80 font-medium break-keep leading-snug" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
          아래는 저희 서비스가 뒤에서 무엇을 했는지 그대로 펼쳐 둔 자리입니다.
          창업팀과 심사위원이 확인하시라고 남겨 두었으니, 이용하러 오신 분은
          읽지 않으셔도 됩니다.
        </p>
      </div>

      {/* 실행 계획은 접어 둔다. 사람이 방금 화면에서 직접 고른 것을 기계
          말투로 다시 늘어놓는 목록이라, 첫 화면에 있을 것이 아니다. 지우지는
          않는다 — 「무엇을 시켰는지」를 감추지 않는 것이 이 서비스의 약속이고,
          심사에서도 보는 자리다. */}
      <details className={`border-2 rounded-2xl p-6 md:p-8 group ${isHighContrast ? "border-gray-400 bg-transparent" : "border-gray-300 bg-white"}`}>
        <summary className="font-bold cursor-pointer list-none flex justify-between items-center gap-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] rounded-lg" style={{ fontSize: "calc(1.4rem * var(--font-scale))", minHeight: "var(--tap-min)" }}>
          <span>📋 무엇을 시켰는지 보기 ({runResult.plan.length}단계)</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        <ol className="flex flex-col gap-3 font-bold mt-6 border-t pt-4" style={{ fontSize: "calc(1.1rem * var(--font-scale))", borderColor: "var(--color-fg)" }}>
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
      </details>

      <section className={`border-4 rounded-2xl p-6 md:p-8 ${isHighContrast ? (runResult.validation.valid ? "border-green-400 bg-transparent" : "border-red-400 bg-transparent") : (runResult.validation.valid ? "border-green-600 bg-green-50 shadow-md" : "border-red-600 bg-red-50 shadow-md")}`}>
        <h2 className={`font-extrabold mb-2 ${isHighContrast ? (runResult.validation.valid ? "text-green-400" : "text-red-400") : (runResult.validation.valid ? "text-green-800" : "text-red-800")}`} style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>
          {runResult.validation.valid ? "✅ 자체 안전 검사 결과" : "❌ 안전 검사 실패 (위험)"}
        </h2>
        <p className="opacity-80 mb-6 font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
          방금 만든 순서를 저희 안전 규칙과 하나씩 맞춰 본 결과입니다. 공식 시뮬레이터 검사는 아래에 따로 있습니다.
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

      <details className={`border-2 rounded-2xl p-6 md:p-8 group ${isHighContrast ? "border-gray-400 bg-transparent" : "border-gray-300 bg-gray-50"}`}>
        {/* `minHeight` 은 위의 「무엇을 시켰는지 보기」와 같은 이유로 명시한다.
            빼 두면 글자 높이만큼인 34px 이 되어 44px 터치 기준에 못 미쳤다(실측). */}
        <summary className="font-bold cursor-pointer list-none flex justify-between items-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] rounded-lg" style={{ fontSize: "calc(1.4rem * var(--font-scale))", minHeight: "var(--tap-min)" }}>
          <span>🛡️ 공식 시뮬레이터 검증 증거 확인</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        
        <div className="mt-6 flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--color-fg)" }}>
          <p className={`font-extrabold ${isHighContrast ? "text-yellow-300" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            ⚠️ 방금 하신 이 세션의 결과가 아닙니다
          </p>
          <p className="opacity-80 font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
            {EVIDENCE_DATE}에 <strong>{EVIDENCE_ENVIRONMENT_NAME}</strong> 제출본을 공식 시뮬레이터로
            돌려 본 기록입니다. 아래 값은 그때 나온 파일에서 그대로 읽어 옵니다.
            <a href="/simulation-evidence.json" target="_blank" rel="noopener noreferrer" className={`ml-2 underline font-bold ${isHighContrast ? "text-yellow-300" : "text-blue-700"}`}>
              [원본 JSON 파일 보기]
            </a>
          </p>

          <ul className="flex flex-col gap-3 font-medium mt-2" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {EVIDENCE_ROWS.map(([key, value], idx) => (
              <li
                key={key}
                className={`flex justify-between gap-4 pb-2 ${idx < EVIDENCE_ROWS.length - 1 ? `border-b ${isHighContrast ? "border-gray-700" : "border-gray-200"}` : ""}`}
              >
                <span className="break-all">{key}</span>
                <strong className="text-right">{value}</strong>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <button type="button" onClick={onReset} className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))", fontWeight: "bold" }}>
        처음으로 돌아가기
      </button>

      <button 
        type="button" 
        onClick={onDeleteProfile} 
        className="w-full mt-2 underline font-medium hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)]" 
        style={{ minHeight: "var(--tap-min)", fontSize: "calc(1.1rem * var(--font-scale))", padding: "0.5rem" }}
      >
        저장된 정보 지우기
      </button>
    </main>
  );
}