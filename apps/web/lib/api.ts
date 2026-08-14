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
import type {
  Candidate,
  EnvironmentId,
  ExecutionPlan,
  PublicFixture,
  ScoreContribution,
} from "@commitandrun/engine";
import { createContextFor } from "@commitandrun/engine/input";
import {
  buildExecutionPlan,
  resolveOptionSelections,
  unsettleableGroups,
} from "@commitandrun/engine/plan";
import { findMissingAnswers } from "@commitandrun/engine/required";
import {
  buildAlternatives,
  explainRecommendation,
  filterCandidates,
  score,
} from "@commitandrun/engine/select";

import { DEFAULT_ENVIRONMENT_ID, fixtureFor } from "./fixture";
import {
  HOSPITAL_DEFAULT_ANSWERS,
  HOSPITAL_QUESTIONS,
  MOCK_ANSWERS,
  MOCK_QUESTIONS,
  PUBLIC_OFFICE_DEFAULT_ANSWERS,
  PUBLIC_OFFICE_QUESTIONS,
} from "./mock";
import type {
  AnyAnswers,
  CandidateView,
  Decision,
  ExcludedView,
  OptionSelection,
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
export async function fetchQuestions(
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): Promise<QuestionDef[]> {
  return QUESTIONS[environmentId];
}

const QUESTIONS: Record<EnvironmentId, QuestionDef[]> = {
  "chicken-store": MOCK_QUESTIONS,
  hospital: HOSPITAL_QUESTIONS,
  "public-office": PUBLIC_OFFICE_QUESTIONS,
};

/**
 * A blank answer set for the environment, so a screen can open its form without
 * knowing which questions are on it.
 *
 * Only the chicken shop is prefilled, and only because it is the demo everyone
 * walks through. The other two start empty — prefilling a hospital form would
 * be us answering questions about someone's visit on their behalf.
 */
export function defaultAnswers(
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): AnyAnswers {
  switch (environmentId) {
    case "chicken-store":
      return { ...MOCK_ANSWERS, allergenIds: [...MOCK_ANSWERS.allergenIds] };
    case "hospital":
      return { ...HOSPITAL_DEFAULT_ANSWERS, supportModes: [] };
    case "public-office":
      return { ...PUBLIC_OFFICE_DEFAULT_ANSWERS, availableAuthMethods: [] };
  }
}

/**
 * A blank answer set — what the form opens on, and what "처음으로" resets to.
 *
 * Written out per environment rather than derived from the question list
 * because one field is deliberately not blank: the chicken shop's quantity
 * starts at one, which is what the radio has always shown pre-selected. Every
 * other field starts empty, and an empty field is what makes the engine ask
 * rather than assume.
 */
export function emptyAnswers(
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): AnyAnswers {
  switch (environmentId) {
    case "chicken-store":
      return {
        serviceType: "",
        spicyLevel: "",
        boneType: "",
        cupOption: "",
        quantity: "Q1",
        allergenIds: [],
        maxPriceKrw: null,
      };
    case "hospital":
      return { ...HOSPITAL_DEFAULT_ANSWERS, supportModes: [] };
    case "public-office":
      return { ...PUBLIC_OFFICE_DEFAULT_ANSWERS, availableAuthMethods: [] };
  }
}

/** One question the form may not be submitted with, and what to say about it. */
export interface MissingQuestion {
  /** The form's own question id, so a screen can find the field. */
  id: string;
  /** The engine's sentence. Shown as-is — the screen has none of its own. */
  message: string;
}

/**
 * The required questions the form may not be submitted with. Empty means it may.
 *
 * The engine decides this, not the screen. A screen that judged "answered" on
 * its own would eventually disagree with the submission about the same session,
 * and the submission is what gets scored.
 *
 * ⚠️ Two different things come back, and the message is the only thing that
 * tells them apart — carry it through rather than reducing this to a list of
 * ids. One is a question nobody answered ("맵기를 골라 주세요"). The other is a
 * set of answers that are each on offer and impossible together: 초진 · 예약
 * 있음 · 내과 is three real answers and no desk in the fixture is all three, so
 * the engine names each answer that would open one up if it changed. Flagging
 * those with the generic "필수 응답" tells someone who did answer them that they
 * did not, and there is nothing they can do about it — which is the dead end
 * this whole gate exists to remove.
 *
 * Translating the answer is the whole job here. `findMissingAnswers` reports the
 * fixture's `groupId` (`SPICY_LEVEL`), the form keys off the question id
 * (`spicyLevel`), and the two never match — that mismatch is why the first
 * attempt at this silently flagged nothing (pm/22). The bridge is the JSON
 * Pointer the engine also returns: its last segment IS the question id, for all
 * eleven groups across the three environments, because `input.ts` writes each
 * answer to a context field named after the form field it came from. `groupId`
 * is the fallback so a group that outgrows that table still surfaces by name
 * rather than vanishing.
 */
export function findMissing(
  answers: AnyAnswers,
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): MissingQuestion[] {
  const fixture = fixtureFor(environmentId);
  const ctx = toSessionContext(answers, environmentId);
  return findMissingAnswers(fixture, ctx)
    .filter((m) => !isUnanswerableHere(environmentId, m.groupId))
    .map((m) => ({ id: m.path.split("/").pop() || m.groupId, message: m.message }));
}

/**
 * ⚠️ TEMPORARY — one group, and it should be deleted rather than grown.
 *
 * Hospital's SUPPORT group is `required: true` and the engine only counts it
 * answered once `/preferences/supportModes` is non-empty. There is no way for
 * this screen to make that happen for someone who needs no support: the
 * question offers 큰 글씨 / 청각 지원 / 직원 도움 and nothing else, and the
 * profile vocabulary (`SupportMode`) has no "none" member — `input.ts` filters
 * unknown values out and then skips the field entirely when the list is empty.
 * Gating on it locks every user who needs no accessibility support out of the
 * hospital flow, which is a worse dead end than the one this whole change
 * removes.
 *
 * Public-office looks the same and is not: AUTH_METHOD is satisfied by
 * "직원 확인이 필요해요" (`STAFF_ASSIST`), which anyone can honestly pick.
 *
 * The engine is not wrong here — `check-required.ts` asserts this SUPPORT
 * behaviour deliberately ("If it were counted as answered this would be 3"), so
 * changing it is a design decision that belongs to whoever owns `required.ts`,
 * not a patch to slip in from the screen. Written up in pm/22 for that call.
 * When it lands, delete this function and the `.filter` above.
 */
function isUnanswerableHere(environmentId: EnvironmentId, groupId: string): boolean {
  return environmentId === "hospital" && groupId === "SUPPORT";
}

/**
 * Filter, score, and explain. No side effects — nothing is executed here, so it
 * is safe to call again when the user changes an answer.
 *
 * Answering "모르겠어요" to the allergy question returns a result with no
 * recommendation and a reconfirm request. That is the engine refusing to guess a
 * hard constraint, not an error path — the screen has to handle it.
 */
export async function fetchRecommendation(
  answers: AnyAnswers,
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): Promise<RecommendationView> {
  const fixture = fixtureFor(environmentId);
  const ctx = toSessionContext(answers, environmentId);
  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const result = score(survivors, ctx);

  const byId = new Map(fixture.candidates.map((c) => [c.candidateId, c]));
  const view = (candidateId: string): CandidateView | null => {
    const candidate = byId.get(candidateId);
    const contributions = result.contributions[candidateId];
    if (!candidate || !contributions) return null;
    return {
      ...toCandidateView(candidate, contributions),
      blockedReason: blockedReason(fixture, candidateId, ctx),
    };
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
 * What ordering this candidate will actually select, group by group.
 *
 * The approval screen shows this rather than the raw answers, because the two
 * can differ: a menu that only comes in one spice level gets that level
 * whatever was asked for. Asking someone to approve their request while
 * planning something else is not consent.
 *
 * Not a plan and not approval-gated — nothing here can be executed. It throws
 * for the same reasons planning would (unknown or sold-out candidate, a
 * required group the user never answered), which is better felt here, before
 * the user commits, than one screen later.
 */
export function previewOrder(
  candidateId: string,
  answers: AnyAnswers,
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): OptionSelection[] {
  return resolveOptionSelections(
    fixtureFor(environmentId),
    candidateId,
    toSessionContext(answers, environmentId),
  );
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
export async function runPlan(
  decision: Decision,
  answers: AnyAnswers,
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): Promise<RunView> {
  if (!decision.approved) {
    throw new Error("사용자 승인 없이는 실행할 수 없습니다.");
  }

  const fixture = fixtureFor(environmentId);
  const plan = buildExecutionPlan({
    environmentId,
    fixture,
    candidateId: decision.candidateId,
    sessionContext: toSessionContext(answers, environmentId),
    approved: decision.approved,
  });

  const errors = checkPlan(plan, fixture);
  return {
    plan: plan.actions,
    safety: toSafetyView(plan, fixture, errors.length === 0),
    validation: { valid: errors.length === 0, errors },
  };
}

/**
 * Whether this candidate can be planned with the answers as they stand, said in
 * the words of the questions that are in the way — or null when it can.
 *
 * Asked of `plan.ts` rather than worked out here. Two implementations of "can
 * this be planned" that can disagree would put the screen and the plan back out
 * of step, which is the fault this whole thing keeps re-introducing.
 *
 * An unknown or sold-out candidate throws instead of answering, and that is not
 * a blocked reason — nothing the user answers would change it. It is also not
 * reachable from here, because scoring never puts one on the podium.
 */
function blockedReason(
  fixture: PublicFixture,
  candidateId: string,
  ctx: ReturnType<typeof toSessionContext>,
): string | null {
  const blocked = unsettleableGroups(fixture, candidateId, ctx);
  if (blocked.length === 0) return null;

  // Phrased so no Korean particle has to follow the label. The labels come out
  // of the fixture and end in every kind of syllable — "예약 여부", "방문 유형",
  // "진료과" — and a sentence that glues 로/으로 onto them is wrong half the time.
  const labels = blocked.map(
    (groupId) => fixture.optionGroups.find((g) => g.groupId === groupId)?.label ?? groupId,
  );
  return `이 경로는 지금 답하신 내용으로 진행할 수 없습니다. 다시 보실 항목: ${labels.join(" · ")}.`;
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
function toSessionContext(answers: AnyAnswers, environmentId: EnvironmentId) {
  const fixture = fixtureFor(environmentId);
  return createContextFor(
    environmentId,
    forEngine(answers, environmentId, fixture),
    { capturedAt: new Date().toISOString(), source: "WEB_FORM" },
    // Passing the fixture is what puts the stock signal in the context, so
    // "지금 품절인 메뉴는 빼고 골랐습니다" has something behind it.
    fixture,
  );
}

/**
 * Translate the two places a form's values are not the values the engine reads.
 *
 * A form only ever produces strings, and the session contexts do not: a
 * quantity is a number, and "step by step" is a boolean. Nothing here invents a
 * value — an answer we do not recognise passes through untouched and lands as
 * unanswered, which is what makes the engine stop and ask instead of guessing.
 */
function forEngine(
  answers: AnyAnswers,
  environmentId: EnvironmentId,
  fixture: PublicFixture,
): AnyAnswers {
  if (environmentId === "chicken-store") {
    return { ...answers, quantity: quantityAnswer(answers.quantity, fixture) };
  }
  const out = { ...answers };
  for (const key of BOOLEAN_ANSWERS) {
    if (key in out) out[key] = asBoolean(out[key]);
  }
  return out;
}

/** Form fields the session context carries as booleans rather than strings. */
const BOOLEAN_ANSWERS = ["guardianPresent", "stepByStep", "simpleLanguage"];

/** null means "not answered" — never false, which is an answer. */
function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

/**
 * The form speaks the fixture's option ids ("Q1"); the session context carries
 * quantity as the number itself. Read the mapping off the fixture rather than
 * writing the table out, so it cannot drift from `option-groups.json`.
 */
function quantityAnswer(optionId: unknown, fixture: PublicFixture): string {
  const group = fixture.optionGroups.find((g) => g.groupId === "QUANTITY");
  const option = group?.options.find((o) => o.id === optionId);
  // Unrecognised ids pass through untouched and land as UNKNOWN, which the
  // engine treats as unanswered. Guessing a quantity is not ours to do.
  return option?.value === undefined ? String(optionId ?? "") : String(option.value);
}

/* ── engine result → view shapes ─────────────────────────────────────────── */

/** The score half of a card. `blockedReason` is filled in by the caller. */
function toCandidateView(
  candidate: Candidate,
  contributions: ScoreContribution[],
): Omit<CandidateView, "blockedReason"> {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    // Only the chicken shop prices anything. A hospital check-in route and a
    // civil service have no price, and 0 is how a screen is told to say nothing
    // about cost rather than to say it is free.
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
 * A deny-list the plan is asserted against — never something we can emit. Each
 * environment bans its own on top of the shared payment ones: a hospital also
 * bans `diagnose` and `triage`, a public office `issue_document` and
 * `collect_ssn`.
 */
function forbiddenIn(fixture: PublicFixture): Set<string> {
  return new Set([...FORBIDDEN_ACTIONS, ...fixture.manifest.forbiddenActions]);
}

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
function checkPlan(plan: ExecutionPlan, fixture: PublicFixture): string[] {
  const errors: string[] = [];
  const { manifest, transitions } = fixture;
  const FORBIDDEN = forbiddenIn(fixture);

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

function toSafetyView(plan: ExecutionPlan, fixture: PublicFixture, valid: boolean): SafetyView {
  const last = plan.actions[plan.actions.length - 1];
  const FORBIDDEN = forbiddenIn(fixture);
  return {
    safe: valid,
    plannedActionCount: plan.actions.length,
    // Counted, not asserted. The number the screen shows is the number in the
    // plan — that is the whole point of putting it on screen.
    plannedForbiddenActionCount: plan.actions.filter((a) => FORBIDDEN.has(a.action)).length,
    validationMode: plan.validationMode,
    executionEnvironment: plan.executionEnvironment,
    actualDeviceCommandSent: plan.actualDeviceCommandSent,
    boundaryState: last?.expectedAfterState ?? fixture.manifest.reviewBoundaryState,
  };
}
