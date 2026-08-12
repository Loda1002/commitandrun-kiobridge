// Runs all three environments end to end and checks the five things that have
// to hold in every one of them.
// Run from the project root:  node packages/engine/scripts/check-domains.ts
//
// The reference is each environment's own submission — the file the official
// validator passed. So an OK here means the engine still produces what was
// submitted, not that an independent source agrees with it. The independent
// verdict is still
//   cd kit && npm run participant:validate -- --file <submission> --execute
//
// The last two lines are the ones the whole safety claim rests on: every plan
// stops at its environment's review boundary with that environment's verifier
// action, and no plan carries an action either deny-list names.
import { readFile } from "node:fs/promises";
import { registeredEnvironments } from "../src/domain.ts";
// Registers the three official domains, same as select.ts and plan.ts.
import "../src/domains/index.ts";
import { buildExecutionPlan } from "../src/plan.ts";
import { filterCandidates, score } from "../src/select.ts";
import { ENVIRONMENT_BOUNDARY, FORBIDDEN_ACTIONS } from "../src/types.ts";
import type { EnvironmentId, PublicFixture, SessionContext } from "../src/types.ts";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));

/** The submission the official validator passed, per environment. */
const SUBMISSION: Record<EnvironmentId, string> = {
  "chicken-store": "participant-submission.json",
  hospital: "hospital-submission.json",
  "public-office": "public-office-submission.json",
};

/** A script may read the kit; the engine may not. Key names follow PublicFixture. */
async function loadFixture(environmentId: EnvironmentId): Promise<PublicFixture> {
  const base = `./kit/environments/${environmentId}`;
  return {
    manifest: await read(`${base}/manifest.json`),
    candidates: await read(`${base}/candidates.json`),
    optionGroups: await read(`${base}/option-groups.json`),
    screens: await read(`${base}/screens.json`),
    transitions: await read(`${base}/transitions.json`),
    safetyRules: await read(`${base}/safety-rules.json`),
    simulationBinding: await read(`${base}/bindings/simulation.binding.json`),
  } as unknown as PublicFixture;
}

// Hangul and CJK take two terminal columns, so pad on display width.
const width = (s: string) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);
const line = (label: string, ok: boolean, detail = "") => {
  if (!ok) process.exitCode = 1;
  const pad = " ".repeat(Math.max(1, 38 - width(label)));
  console.log(`  ${label}${pad}: ${ok ? "OK" : "FAIL"}${detail ? `  ${detail}` : ""}`);
};

/** Compared on the three fields a submission carries; `tag` is ours alone. */
const shape = (list: Array<{ candidateId: string; reasonCode: string; explanation: string }>) =>
  list.map((e) => `${e.candidateId}/${e.reasonCode}/${e.explanation}`);

/** Filled in as each environment is checked, for the closing summary. */
const verifiers: string[] = [];
let deniedTotal = 0;
let outsideTotal = 0;

async function checkEnvironment(environmentId: EnvironmentId): Promise<void> {
  const fixture = await loadFixture(environmentId);
  const golden = await read(`./kit/workspace/COMMITANDRUN/output/${SUBMISSION[environmentId]}`);
  const ctx = golden.sessionContext as SessionContext;
  const { manifest } = fixture;

  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const result = score(survivors, ctx);

  /* --- 1. the bar chart adds up ------------------------------------------- */

  // Every candidate is scored on the same criteria, and those weights are a
  // whole: a chart that sums to 0.9 is a candidate quietly losing 10 points
  // nobody can point at on the screen.
  const contributions = Object.values(result.contributions);
  const criteriaCounts = new Set(contributions.map((rows) => rows.length));
  line(
    "가중치 합계 1.0",
    contributions.length > 0 &&
      criteriaCounts.size === 1 &&
      contributions.every(
        (rows) => Math.abs(rows.reduce((sum, r) => sum + r.weight, 0) - 1) < 1e-9,
      ),
    `${[...criteriaCounts].join("/")}항목 × ${contributions.length}후보`,
  );

  /* --- 2. the same candidates are refused, for the same stated reason ------ */

  const goldenExcluded = golden.recommendation.excludedCandidates as Array<{
    candidateId: string;
    reasonCode: string;
    explanation: string;
  }>;
  line(
    `제외 ${excluded.length}건`,
    JSON.stringify(shape(excluded)) === JSON.stringify(shape(goldenExcluded)),
    excluded.map((e) => `${e.candidateId}/${e.reasonCode}`).join(" · ") || "(없음)",
  );

  /* --- 3. the same winner, and the same way out ---------------------------- */

  const alternatives = result.alternativeCandidateIds;
  line(
    `1등 · 대안 ${alternatives.length}개`,
    result.recommendedCandidateId === golden.recommendation.recommendedCandidateId &&
      JSON.stringify(alternatives) ===
        JSON.stringify(golden.recommendation.alternativeCandidateIds),
    `${result.recommendedCandidateId} / ${alternatives.join(" -> ") || "(없음)"}`,
  );

  /* --- 4. the plan stops where the environment says to stop ---------------- */

  if (result.recommendedCandidateId === null) {
    line("실행계획", false, "추천이 없어 계획을 세울 수 없다");
    return;
  }

  const plan = buildExecutionPlan({
    environmentId,
    fixture,
    candidateId: result.recommendedCandidateId,
    sessionContext: ctx,
    approved: true,
  });
  const last = plan.actions.at(-1);
  const boundary = ENVIRONMENT_BOUNDARY[environmentId];
  line(
    `실행계획 ${plan.actions.length}단계 · ${manifest.reviewBoundaryState}`,
    JSON.stringify(plan.actions) === JSON.stringify(golden.executionPlan.actions) &&
      last?.expectedAfterState === manifest.reviewBoundaryState &&
      last?.action === manifest.requiredVerifierAction &&
      // types.ts carries its own copy of this pair and nothing in src/ reads it,
      // so a fixture that moved its boundary would leave that table stale and
      // unnoticed. Checked here because this is the only place both are open.
      boundary.boundaryState === manifest.reviewBoundaryState &&
      boundary.verifierAction === manifest.requiredVerifierAction,
    `마지막 ${last?.action}`,
  );
  if (last?.action) verifiers.push(last.action);

  /* --- 5. nothing the platform forbids ------------------------------------- */

  // Both lists: ours in types.ts and the environment's own in the manifest.
  // buildExecutionPlan already refuses to emit either, so this is the artifact
  // being read back rather than the guard being trusted.
  const denied = new Set([...FORBIDDEN_ACTIONS, ...manifest.forbiddenActions]);
  const hits = plan.actions.filter((a) => denied.has(a.action));
  const outside = plan.actions.filter((a) => !manifest.allowedActions.includes(a.action));
  deniedTotal += hits.length;
  outsideTotal += outside.length;
  line(
    `금지 동작 ${hits.length}건`,
    hits.length === 0 && outside.length === 0,
    outside.length === 0 ? "허용 목록 안" : `허용 목록 밖 ${outside.length}건`,
  );
}

for (const environmentId of registeredEnvironments()) {
  console.log(`===== ${environmentId} =====`);
  try {
    await checkEnvironment(environmentId);
  } catch (error) {
    // One environment's regression must not take the other two down with it.
    // The failures worth reporting here are exactly the ones that throw — a
    // candidate that cannot be planned, a route that no longer reaches the
    // boundary — and this script exists to report all three in one run.
    line("예외 없이 끝난다", false, error instanceof Error ? error.message : String(error));
  }
  console.log("");
}

/* --- the two claims the submission stands on, across all three ------------- */

const expectedVerifiers = registeredEnvironments().map(
  (id) => ENVIRONMENT_BOUNDARY[id].verifierAction,
);
console.log("===== 3환경 공통 =====");
line(
  "마지막이 그 환경의 확인 동작",
  JSON.stringify(verifiers) === JSON.stringify(expectedVerifiers),
  verifiers.join(" · ") || "(없음)",
);
line(
  `금지 동작 총 ${deniedTotal}건`,
  deniedTotal === 0 && outsideTotal === 0,
  outsideTotal === 0 ? "허용 목록 안" : `허용 목록 밖 ${outsideTotal}건`,
);
