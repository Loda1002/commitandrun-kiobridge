/**
 * The one place the screens get data from.
 *
 * Screens must not import `lib/mock.ts`, and must not call `fetch` themselves.
 * Everything goes through the functions below.
 *
 * The engine runs HERE, in the browser. packages/engine/src imports nothing but
 * its own `./types.ts`, so it bundles as ordinary TypeScript and needs neither
 * the BFF nor the simulation API to answer. What this file does is translate:
 * form answers in, engine calls, and the flat view shapes in `lib/types.ts` out.
 *
 * Nothing here decides anything the engine could decide. When a sentence about
 * the user's allergies appears on screen it is because `explainRecommendation`
 * produced it from what the user actually answered — there are no canned
 * recommendations left in this path.
 */
import { FORBIDDEN_ACTIONS } from "@commitandrun/engine";
import type { Candidate, ExecutionPlan, ScoreContribution } from "@commitandrun/engine";
import { collectProfile, createSessionContext } from "@commitandrun/engine/input";
import { buildExecutionPlan } from "@commitandrun/engine/plan";
import {
  buildAlternatives,
  explainRecommendation,
  filterCandidates,
  score,
} from "@commitandrun/engine/select";

import { CHICKEN_STORE_FIXTURE as FIXTURE, ENVIRONMENT_ID } from "./fixture";
import { MOCK_ANSWERS, MOCK_QUESTIONS } from "./mock";
import type {
  Answers,
  CandidateView,
  Decision,
  ExcludedView,
  QuestionDef,
  RecommendationView,
  RunView,
  SafetyView,
} from "./types";

/**
 * Questions for the context screen.
 *
 * Still the canned list, and that is not a leftover: the questions are a UI
 * asset (wording, help text, option order), not something the engine computes.
 * The option ids in it are the fixture's own — see `option-groups.json`.
 */
export async function fetchQuestions(): Promise<QuestionDef[]> {
  return MOCK_QUESTIONS;
}

/** A form default so the context screen can be opened without typing every time. */
export function defaultAnswers(): Answers {
  return { ...MOCK_ANSWERS, allergenIds: [...MOCK_ANSWERS.allergenIds] };
}

/**
 * Filter, score, and explain. No side effects — nothing is executed here, so it
 * is safe to call again when the user changes an answer.
 *
 * Answering "모르겠어요" to the allergy question returns a result with no
 * recommendation and a reconfirm request. That is the engine refusing to guess a
 * hard constraint, not an error path — the screen has to handle it.
 */
export async function fetchRecommendation(answers: Answers): Promise<RecommendationView> {
  const ctx = toSessionContext(answers);
  const { survivors, excluded } = filterCandidates(FIXTURE, ctx);
  const result = score(survivors, ctx);

  const byId = new Map(FIXTURE.candidates.map((c) => [c.candidateId, c]));
  const view = (candidateId: string): CandidateView | null => {
    const candidate = byId.get(candidateId);
    const contributions = result.contributions[candidateId];
    return candidate && contributions ? toCandidateView(candidate, contributions) : null;
  };

  const recommendedId = result.recommendedCandidateId;
  const recommended = recommendedId === null ? null : byId.get(recommendedId) ?? null;

  return {
    recommended: recommendedId === null ? null : view(recommendedId),
    alternatives: buildAlternatives(result)
      .map(view)
      .filter((c): c is CandidateView => c !== null),
    excluded: excluded.map((e) => ({
      ...e,
      // The engine speaks candidateIds; the screen shows the dish by name.
      name: byId.get(e.candidateId)?.name ?? e.candidateId,
    })) satisfies ExcludedView[],
    // Only the recommendation we actually made gets explained. No recommendation
    // means no reasons — a sentence about a dish nobody was offered is noise at
    // best and a false safety claim at worst.
    reasons: recommended ? explainRecommendation(recommended, ctx, excluded) : [],
    confidence: result.confidence,
    requiresReconfirmation: result.requiresReconfirmation,
    reconfirmRequests: result.reconfirmRequests,
  };
}

/**
 * Build the semantic execution plan for the candidate the user approved, and
 * check it before handing it to the screen.
 *
 * `answers` comes back in because the plan needs the session context: which
 * options to select, in which order. It is the same object that produced the
 * recommendation, so the plan matches what the user was shown and approved.
 *
 * `decision.approved === false` throws rather than planning anything: an
 * unapproved plan is a safety violation by its mere existence, and
 * `buildExecutionPlan` refuses it too.
 */
export async function runPlan(decision: Decision, answers: Answers): Promise<RunView> {
  if (!decision.approved) {
    throw new Error("사용자 승인 없이는 실행할 수 없습니다.");
  }

  const plan = buildExecutionPlan({
    environmentId: ENVIRONMENT_ID,
    fixture: FIXTURE,
    candidateId: decision.candidateId,
    sessionContext: toSessionContext(answers),
    approved: decision.approved,
  });

  const errors = checkPlan(plan);
  return {
    plan: plan.actions,
    safety: toSafetyView(plan, errors.length === 0),
    validation: { valid: errors.length === 0, errors },
  };
}

/* ── form answers → session context ──────────────────────────────────────── */

/**
 * The form's answers, in the shape the engine reads.
 *
 * `collectProfile` turns a skipped question into "UNKNOWN" instead of dropping
 * it, so the engine can see the question is still open. The timestamp is passed
 * in rather than read by the engine — the engine must give the same answer here
 * and in the submission builder, so it never reads a clock of its own.
 */
function toSessionContext(answers: Answers) {
  const normalized = collectProfile({
    ...answers,
    quantity: quantityAnswer(answers.quantity),
    allergenIds: [...answers.allergenIds],
  });

  return createSessionContext(
    normalized,
    { capturedAt: new Date().toISOString(), source: "WEB_FORM" },
    // Passing the fixture is what puts the stock signal in the context, so
    // "지금 품절인 메뉴는 빼고 골랐습니다" has something behind it.
    FIXTURE,
  );
}

/**
 * The form speaks the fixture's option ids ("Q1"); the session context carries
 * quantity as the number itself. Read the mapping off the fixture rather than
 * writing the table out, so it cannot drift from `option-groups.json`.
 */
function quantityAnswer(optionId: string): string {
  const group = FIXTURE.optionGroups.find((g) => g.groupId === "QUANTITY");
  const option = group?.options.find((o) => o.id === optionId);
  // Unrecognised ids pass through untouched and land as UNKNOWN, which the
  // engine treats as unanswered. Guessing a quantity is not ours to do.
  return option?.value === undefined ? optionId : String(option.value);
}

/* ── engine result → view shapes ─────────────────────────────────────────── */

function toCandidateView(candidate: Candidate, contributions: ScoreContribution[]): CandidateView {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    // Every chicken-store candidate carries a price; the field is optional on
    // the shared Candidate type because other environments have none.
    priceKrw: candidate.price ?? 0,
    total: round2(contributions.reduce((sum, row) => sum + row.earned, 0)),
    contributions,
  };
}

/** 0.4 + 0.25 + 0.2 + 0.15 is 1.0000000000000002 in binary floating point. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ── checking our own plan ───────────────────────────────────────────────── */

/**
 * Every action the platform forbids, ours and this environment's.
 *
 * A deny-list the plan is asserted against — never something we can emit.
 */
const FORBIDDEN = new Set([...FORBIDDEN_ACTIONS, ...FIXTURE.manifest.forbiddenActions]);

/**
 * Re-check the finished plan against the environment contract.
 *
 * ⚠️ This is OUR check against the fixture, not a run of the official
 * simulation API — that lives in the kit and is not deployed. It proves the
 * plan is well-formed and stays inside the safety boundary; it does not prove
 * the simulator accepted it. The official verdict is the validator re-running
 * our submission JSON, which is a separate thing (see pm/99_HANDOFF.md).
 *
 * buildExecutionPlan already refuses to produce anything that fails these, so
 * a non-empty result means the two disagree — which is worth seeing.
 */
function checkPlan(plan: ExecutionPlan): string[] {
  const errors: string[] = [];
  const { manifest, transitions } = FIXTURE;

  if (plan.validationMode !== "SIMULATION_ONLY") errors.push("validationMode 가 변조되었습니다.");
  if (plan.executionEnvironment !== "DIGITAL_TWIN") {
    errors.push("executionEnvironment 가 변조되었습니다.");
  }
  if (plan.actualDeviceCommandSent !== false) errors.push("실제 기기 명령이 켜져 있습니다.");
  if (plan.actions.length === 0) errors.push("실행계획이 비어 있습니다.");

  plan.actions.forEach((step, index) => {
    if (FORBIDDEN.has(step.action)) errors.push(`${index + 1}단계 ${step.action} 은 금지된 동작입니다.`);
    if (!manifest.allowedActions.includes(step.action)) {
      errors.push(`${index + 1}단계 ${step.action} 은 이 환경에서 허용되지 않습니다.`);
    }
    if (!step.target?.kind || !step.target?.id) {
      errors.push(`${index + 1}단계의 대상이 비어 있습니다.`);
    }
    const legal = transitions.some(
      (t) =>
        t.from === step.expectedBeforeState &&
        t.action === step.action &&
        t.to === step.expectedAfterState,
    );
    if (!legal) {
      errors.push(
        `${index + 1}단계 ${step.expectedBeforeState} → ${step.expectedAfterState} 는 없는 상태 전환입니다.`,
      );
    }
    const previous = plan.actions[index - 1];
    if (previous && previous.expectedAfterState !== step.expectedBeforeState) {
      errors.push(`${index + 1}단계가 앞 단계가 끝난 상태에서 이어지지 않습니다.`);
    }
  });

  const last = plan.actions[plan.actions.length - 1];
  if (last && last.expectedAfterState !== manifest.reviewBoundaryState) {
    errors.push(`계획이 ${manifest.reviewBoundaryState} 가 아니라 ${last.expectedAfterState} 에서 끝납니다.`);
  }
  if (last && last.action !== manifest.requiredVerifierAction) {
    errors.push(`마지막이 확인 동작(${manifest.requiredVerifierAction})이 아닙니다.`);
  }

  return errors;
}

function toSafetyView(plan: ExecutionPlan, valid: boolean): SafetyView {
  const last = plan.actions[plan.actions.length - 1];
  return {
    safe: valid,
    plannedActionCount: plan.actions.length,
    // Counted, not asserted. The number the screen shows is the number in the
    // plan — that is the whole point of putting it on screen.
    plannedForbiddenActionCount: plan.actions.filter((a) => FORBIDDEN.has(a.action)).length,
    validationMode: plan.validationMode,
    executionEnvironment: plan.executionEnvironment,
    actualDeviceCommandSent: plan.actualDeviceCommandSent,
    boundaryState: last?.expectedAfterState ?? FIXTURE.manifest.reviewBoundaryState,
  };
}
