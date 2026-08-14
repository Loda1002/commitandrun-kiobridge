"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { actionLabel, stateLabel, type RunView } from "../lib/types";
import { ENVIRONMENTS, fixtureFor } from "../lib/fixture";
import evidence from "../public/simulation-evidence.json";

/** What a plan step points at, straight from PlannedAction["target"]. */
type StepTarget = { kind: string; id: string; groupId?: string };

/**
 * The official simulator's own verdict, read from the file the panel links to.
 *
 * Imported rather than typed out, so the numbers on screen and the JSON a judge
 * downloads cannot say different things — the first version of this panel had
 * the three values written into the JSX and a link to a file that was not
 * there, which is a claim nobody could check. The file is a byte-for-byte copy
 * of `kit/submission-output/COMMITANDRUN/simulation-evidence.json`, produced by
 * `participant:package`; `kit/` is gitignored and absent from the deployed
 * bundle, so the copy under `public/` is what ships.
 *
 * ⚠️ It is a record of one run of the chicken-store submission, not of the
 * session the user just finished. The panel says so, and says which — every
 * word of that comes out of this file rather than being written here.
 */
const EVIDENCE_ROWS: Array<[string, string]> = [
  ["result", String(evidence.result)],
  ["stopType", String(evidence.stopType)],
  ["boundaryReached", String(evidence.boundaryReached)],
  ["requiredVerifierExecuted", String(evidence.requiredVerifierExecuted)],
  ["plannedPaymentActionCount", String(evidence.plannedPaymentActionCount)],
  ["actualDeviceCommandSent", String(evidence.actualDeviceCommandSent)],
];

/** "2026-08-13" — the day the run in the file was recorded, in the file's words. */
const EVIDENCE_DATE = String(evidence.createdAt).slice(0, 10);

/** Which kiosk the run was of — named, because it is not always this one. */
const EVIDENCE_ENVIRONMENT_NAME =
  ENVIRONMENTS.find((e) => e.id === evidence.environmentId)?.name ?? evidence.environmentId;

// 🔥 여기서 onDeleteProfile 타입을 추가로 받아주어야 합니다!
interface ResultScreenProps {
  runResult: RunView;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onReset: () => void;
  onDeleteProfile: () => void; 
}

export function ResultScreen({ runResult, environmentId, isHighContrast, onReset, onDeleteProfile }: ResultScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  /**
   * Names a plan step's target in Korean without a hand-written table: every
   * word comes out of the fixture the engine planned against.
   *
   * `target.kind` is what joins the two. An option group declares the kind it
   * backs (`OptionGroup.kind`, e.g. "visit_type"), and only the generic
   * "option" kind carries a `groupId` — the enumerated kinds do not. Matching
   * on `groupId` alone therefore misses most hospital and public-office steps,
   * and comparing an absent `groupId` against an absent field matches
   * everything: that is how every step ended up labelled "방문 유형".
   */
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

    // Nothing in the fixture claims this target. Show it raw rather than
    // guessing — a wrong Korean label is worse than an untranslated code.
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

      {/* 접힌 채로 시작한다. 위의 "자체 안전 검사"와 달리 이건 공식 시뮬레이터
          출력이고, 둘을 나란히 펼쳐 두면 방금 한 세션이 공식 검증을 받았다는
          인상을 준다 — 받지 않았다. */}
      <details className={`border-2 rounded-2xl p-6 md:p-8 group ${isHighContrast ? "border-gray-400 bg-transparent" : "border-gray-300 bg-gray-50"}`}>
        <summary className="font-bold cursor-pointer list-none flex justify-between items-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] rounded-lg" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
          <span>🛡️ 공식 시뮬레이터 검증 증거 확인</span>
          <span className="group-open:rotate-180 transition-transform">▼</span>
        </summary>
        
        <div className="mt-6 flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--color-fg)" }}>
          <p className={`font-extrabold ${isHighContrast ? "text-yellow-300" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            ⚠️ 방금 하신 이 세션의 결과가 아닙니다
          </p>
          <p className="opacity-80 font-medium" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
            {EVIDENCE_DATE}에 <strong>{EVIDENCE_ENVIRONMENT_NAME}</strong> 제출본을 공식 시뮬레이터로
            한 번 돌린 기록입니다. 아래 값은 그 파일에서 그대로 읽어 온 것입니다.
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

      {/* 🔥 삭제 버튼 추가된 부분! */}
      <button 
        type="button" 
        onClick={onDeleteProfile} 
        className="w-full mt-2 underline opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] transition-opacity" 
        style={{ fontSize: "calc(1.1rem * var(--font-scale))", padding: "0.5rem" }}
      >
        저장된 정보 지우기
      </button>
    </main>
  );
}