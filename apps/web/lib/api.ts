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


import { explainAlternative } from "../../../packages/engine/src/alternative";
import { relaxationOptions, explainRelaxation } from "../../../packages/engine/src/relax";


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

export interface MissingQuestion {
  id: string;
  message: string;
}

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
 * 1. apps/web/lib/fixtures/hospital/option-groups.json:43 에는 이미 {"id":"NONE","label":"지원 없음"} 이 있습니다
 * 2. apps/web/lib/mock.ts:192-196 화면 질문에는 3개뿐입니다. NONE 이 빠져 있습니다
 * 3. packages/engine/src/types.ts:204-205 SupportMode 어휘에 NONE 이 없습니다
 * 4. packages/engine/src/input.ts:271-273, 327-334 어휘에 없는 값은 걷어내고, 남은 게 없으면 preferences.supportModes 를 아예 안 만듭니다.
 *
 * 위 이유로 화면에 「지원 없음」 버튼을 추가해도 아무것도 바뀌지 않으며 엔진은 여전히 "안 답함"으로 봅니다.
 * 이 임시 조치를 제거하는 시점은 pm/24 에서 @lde451 님이 required.ts 쪽 작업을 완료했을 때입니다.
 */
function isUnanswerableHere(environmentId: EnvironmentId, groupId: string): boolean {
  return environmentId === "hospital" && groupId === "SUPPORT";
}

export async function fetchRecommendation(
  answers: AnyAnswers,
  environmentId: EnvironmentId = DEFAULT_ENVIRONMENT_ID,
): Promise<RecommendationView> {
  const fixture = fixtureFor(environmentId);
  const ctx = toSessionContext(answers, environmentId);
  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const result = score(survivors, ctx);

  const byId = new Map(fixture.candidates.map((c) => [c.candidateId, c]));
  
  const recommendedId = result.recommendedCandidateId;
  const recommended = recommendedId === null ? null : byId.get(recommendedId) ?? null;

  const view = (candidateId: string): CandidateView | null => {
    const candidate = byId.get(candidateId);
    const contributions = result.contributions[candidateId];
    if (!candidate || !contributions) return null;

    let alternativeExplanation: string | undefined = undefined;
    if (recommendedId !== null && candidateId !== recommendedId) {
      try {
        alternativeExplanation = explainAlternative(result, candidateId);
      } catch (e) {
        console.error("explainAlternative 실패:", e);
      }
    }

    return {
      ...toCandidateView(candidate, contributions),
      blockedReason: blockedReason(fixture, candidateId, ctx),
      alternativeExplanation,
    };
  };

  const relaxationSuggestions: string[] = [];
  if (recommendedId === null) {
    // 제약 조건별로 제안이 다를 수 있으므로 발생한 모든 제안 문구를 수집하여 뷰에 전달합니다.
    for (const option of relaxationOptions(fixture, ctx)) {
      try {
        relaxationSuggestions.push(explainRelaxation(fixture, ctx, option));
      } catch (e) {
        console.error("explainRelaxation 실패:", e);
      }
    }
  }

  return {
    recommended: recommendedId === null ? null : view(recommendedId),
    alternatives: buildAlternatives(result)
      .map(view)
      .filter((c): c is CandidateView => c !== null),
    excluded: excluded.map((e) => ({
      ...e,
      name: byId.get(e.candidateId)?.name ?? e.candidateId,
    })) satisfies ExcludedView[],
    reasons: recommended ? explainRecommendation(recommended, ctx, excluded) : [],
    confidence: result.confidence,
    requiresReconfirmation: result.requiresReconfirmation,
    reconfirmRequests: result.reconfirmRequests,
    relaxationSuggestions,
  };
}

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

function blockedReason(
  fixture: PublicFixture,
  candidateId: string,
  ctx: ReturnType<typeof toSessionContext>,
): string | null {
  const blocked = unsettleableGroups(fixture, candidateId, ctx);
  if (blocked.length === 0) return null;

  const labels = blocked.map(
    (groupId) => fixture.optionGroups.find((g) => g.groupId === groupId)?.label ?? groupId,
  );
  return `이 경로는 지금 답하신 내용으로 진행할 수 없습니다. 다시 보실 항목: ${labels.join(" · ")}.`;
}

function toSessionContext(answers: AnyAnswers, environmentId: EnvironmentId) {
  const fixture = fixtureFor(environmentId);
  return createContextFor(
    environmentId,
    forEngine(answers, environmentId, fixture),
    { capturedAt: new Date().toISOString(), source: "WEB_FORM" },
    fixture,
  );
}

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

const BOOLEAN_ANSWERS = ["guardianPresent", "stepByStep", "simpleLanguage"];

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function quantityAnswer(optionId: unknown, fixture: PublicFixture): string {
  const group = fixture.optionGroups.find((g) => g.groupId === "QUANTITY");
  const option = group?.options.find((o) => o.id === optionId);
  return option?.value === undefined ? String(optionId ?? "") : String(option.value);
}

function toCandidateView(
  candidate: Candidate,
  contributions: ScoreContribution[],
): Omit<CandidateView, "blockedReason"> {
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    priceKrw: candidate.price ?? 0,
    total: round2(contributions.reduce((sum, row) => sum + row.earned, 0)),
    contributions,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function forbiddenIn(fixture: PublicFixture): Set<string> {
  return new Set([...FORBIDDEN_ACTIONS, ...fixture.manifest.forbiddenActions]);
}

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
    plannedForbiddenActionCount: plan.actions.filter((a) => FORBIDDEN.has(a.action)).length,
    validationMode: plan.validationMode,
    executionEnvironment: plan.executionEnvironment,
    actualDeviceCommandSent: plan.actualDeviceCommandSent,
    boundaryState: last?.expectedAfterState ?? fixture.manifest.reviewBoundaryState,
  };
}