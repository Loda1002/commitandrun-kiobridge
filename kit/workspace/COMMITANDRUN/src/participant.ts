/**
 * COMMITANDRUN — the nine participant steps.
 *
 * The thinking lives in packages/engine, not here. That package is pure
 * TypeScript that imports nothing but its own types, so the same functions
 * produce the recommendation in the deployed web app and the submission below.
 * One implementation, two callers — a screen that says one thing while the
 * submission says another is the failure this arrangement rules out.
 *
 * What this file does is translate. The engine speaks its own result shapes;
 * the platform's schemas are closed (`additionalProperties: false`) and drop
 * fields the engine carries for the UI. Three translations matter:
 *
 *   1. `ExclusionReason.tag` is stripped. recommendation.schema.json allows only
 *      candidateId · reasonCode · explanation · reasonText inside
 *      excludedCandidates, and rejects anything else.
 *   2. `recommendationReasons` is string[]. The engine returns {tag, text}
 *      objects, so only `.text` is kept.
 *   3. `contributions` and `reconfirmRequests` have nowhere to go. Recommendation
 *      itself is a closed object; the per-criterion numbers go into
 *      `scoreBreakdown`, which the schema leaves free-form.
 *
 * ── where our signatures differ from the participant guide ──
 * Four steps take one more argument than the guide's stub, because the stub's
 * inputs are not enough to do the job honestly:
 *   recommend           + excluded    the guide has filterCandidates record its
 *                                     exclusions "for STEP 6", but never passes
 *                                     them anywhere
 *   explainRecommendation + recommended, excluded
 *                                     needs the candidate's own attributes, and
 *                                     the exclusions it is claiming credit for
 *   collectUserDecision + recorded    the approval happens on a screen, not here
 *   buildExecutionPlan  + ctx         the plan selects the options the user
 *                                     chose, which live in the session context
 * Nothing calls these functions but `buildSubmission` below and
 * `participant:progress`; the platform grades participant-submission.json.
 *
 * ⚠️ The engine is imported by relative path because it lives in our repo, not
 * in the kit. That is fine for building the submission — the organizers re-run
 * the produced JSON, not this file — but it does mean this file cannot be
 * copied into a bare kit and run.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type {
  AnySessionContext, Candidate, ExecutionPlan, ParticipantSubmission, PublicFixture,
  Recommendation, UserDecision, UserProfile,
} from "@kiobridge/participant-sdk";

import {
  createContextFor as engineCreateContextFor,
  mapToCanonicalInput as engineMapToCanonicalInput,
} from "../../../../packages/engine/src/input.ts";
import { buildExecutionPlan as engineBuildExecutionPlan } from "../../../../packages/engine/src/plan.ts";
import {
  buildAlternatives as engineBuildAlternatives,
  explainRecommendation as engineExplainRecommendation,
  filterCandidates as engineFilterCandidates,
  score as engineScore,
} from "../../../../packages/engine/src/select.ts";
import type {
  Candidate as EngineCandidate,
  EngineResult,
  ExclusionReason,
  PublicFixture as EngineFixture,
  SessionContext as EngineSessionContext,
} from "../../../../packages/engine/src/types.ts";

/** 환경마다 스키마가 다르므로 도메인별 SessionContext 를 합집합으로 다룹니다. */
type SessionContext = AnySessionContext;

/** 참가팀 서비스가 수집한 원본 입력 (형식 자유 — 웹폼/음성/QR/챗봇 무엇이든). */
export type RawUserInput = Record<string, unknown>;

/**
 * The shape our own `input/raw-user-input.json` happens to have.
 *
 * RawUserInput is deliberately free-form on the platform's side, so this is the
 * one place that knows what our collection channel actually writes.
 */
interface CollectedInput {
  collectionChannel?: string;
  profileId: string;
  providerId: string;
  collectedAt: string;
  accessibility?: Record<string, boolean>;
  interaction?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  session: {
    capturedAt: string;
    source?: string;
    confirmedPaths?: string[];
    /** 환경마다 묻는 것이 달라 모양이 다릅니다. 어휘 검사는 엔진이 합니다. */
    answers: Record<string, unknown>;
  };
  decision: { approved: boolean; confirmedAt?: string; note?: string };
}

/**
 * The engine mirrors the kit's contract types by hand (see the copied block in
 * packages/engine/src/types.ts) so it can run in a browser with no kit present.
 * The two declarations are the same shape but not the same identity, so the
 * boundary is crossed here, once, in named helpers rather than inline casts.
 */
const asEngineContext = (ctx: SessionContext) => ctx as unknown as EngineSessionContext;
const asEngineFixture = (fixture: PublicFixture) => fixture as unknown as EngineFixture;
const asEngineCandidates = (list: Candidate[]) => list as unknown as EngineCandidate[];

/* ═══════════════════════════ 1. 수집 ═══════════════════════════ */

/**
 * STEP 1 — collectProfile
 *
 * 사용자에게서 정보를 받습니다. 우리 서비스의 수집 채널은 웹폼이고, 그 결과가
 * `input/raw-user-input.json` 입니다. 이 빌더는 화면 없이 도는 배치이므로 그때
 * 수집해 둔 내용을 읽습니다.
 *
 * 로그인은 요구하지 않습니다. 실제 주민등록번호·전화번호·카드번호는 수집하지
 * 않으며, 파일 안의 값은 전부 합성 데이터입니다.
 */
export async function collectProfile(
  environmentId = "chicken-store",
): Promise<RawUserInput> {
  // 환경마다 묻는 것이 다르므로 수집 결과도 파일이 따로입니다. 닭강정집은 이미
  // 기록된 SHA-256 이 이 파일 이름에 걸려 있어 그대로 둡니다.
  const name =
    environmentId === "chicken-store" ? "raw-user-input.json" : `${environmentId}-input.json`;
  const file = path.join(import.meta.dirname, "..", "input", name);
  return JSON.parse(readFileSync(file, "utf8")) as RawUserInput;
}

/**
 * STEP 2 — mapToCanonicalInput
 *
 * 수집한 임의 형식 데이터를 오래 유지되는 CanonicalProfile 로 옮깁니다.
 * 이번 세션에만 해당하는 값(오늘 고른 메뉴·맵기)은 여기 넣지 않습니다 —
 * 그건 STEP 3 의 sessionContext 몫입니다.
 *
 * `collectedAt` 이 UTC Z 가 아니면 엔진이 여기서 거절합니다. 제출 시점에
 * INVALID_UTC_TIMESTAMP 로 튕기는 것보다 원인이 훨씬 분명합니다.
 */
export function mapToCanonicalInput(raw: RawUserInput): UserProfile {
  const input = raw as unknown as CollectedInput;
  return engineMapToCanonicalInput({
    profileId: input.profileId,
    providerId: input.providerId,
    collectedAt: input.collectedAt,
    collectionChannel: input.collectionChannel as never,
    accessibility: input.accessibility as never,
    interaction: input.interaction as never,
    consent: input.consent as never,
  }) as unknown as UserProfile;
}

/**
 * STEP 3 — createSessionContext
 *
 * 이번 이용에만 해당하는 맥락을 만듭니다. 알레르기·예산은 hardConstraints,
 * 맵기·형태처럼 양보 가능한 것은 preferences 로 갈라 둡니다. 답하지 않은 항목은
 * 채우지 않고 비워 두며, 알레르기만은 "UNKNOWN" 인 채로 실어 보냅니다 —
 * 질문이 아직 열려 있다는 사실 자체가 추천을 멈추는 근거이기 때문입니다.
 *
 * fixture 를 넘기면 품절 신호가 `extensions["COMMITANDRUN.contextSignals"]` 에
 * 기록됩니다. "지금 품절인 메뉴는 빼고 골랐습니다" 라는 설명의 출처입니다.
 */
export function createSessionContext(raw: RawUserInput, fixture: PublicFixture): SessionContext {
  const { session } = raw as unknown as CollectedInput;
  return engineCreateContextFor(
    fixture.manifest.environmentId as never,
    session.answers,
    {
      capturedAt: session.capturedAt,
      source: session.source as never,
      confirmedPaths: session.confirmedPaths,
    },
    asEngineFixture(fixture),
  ) as unknown as SessionContext;
}

/* ═══════════════════════════ 2. 추천 ═══════════════════════════ */

/**
 * STEP 4 — filterCandidates
 *
 * hardConstraints 를 위반하는 후보를 **점수를 깎는 게 아니라 뺍니다.**
 * 알레르기 충돌 · 품절 · 예산 초과 · 이용 방식 불가 순서로 보며, 한 후보는 한 번만
 * 제외됩니다. 품절인 땅콩 메뉴는 "품절" 이 아니라 "알레르기" 로 보고됩니다 —
 * 안전이 재고보다 먼저입니다.
 *
 * 알레르기가 UNKNOWN 이면 여기서는 아무것도 빼지 않습니다. 필터는 되물을 수
 * 없으므로 판단하지 않고, 멈추고 묻는 일은 STEP 5 가 합니다.
 */
export function filterCandidates(candidates: Candidate[], ctx: SessionContext): Candidate[] {
  return partition(candidates, ctx).survivors as unknown as Candidate[];
}

/**
 * 살아남은 후보와 제외 사유를 함께 돌려줍니다.
 *
 * 엔진의 filterCandidates 는 fixture 를 받지만 `fixture.candidates` 만 읽습니다
 * (packages/engine/src/select.ts 에서 확인). 후보 목록만 가진 이 단계에서 부를 수
 * 있는 이유입니다.
 */
function partition(candidates: Candidate[], ctx: SessionContext) {
  const fixtureLike = { candidates: asEngineCandidates(candidates) } as EngineFixture;
  return engineFilterCandidates(fixtureLike, asEngineContext(ctx));
}

/**
 * STEP 5 — recommend
 *
 * 남은 후보의 순위를 정하고 1순위를 고릅니다. 기준 네 개(포장 가능 0.40 ·
 * 맵기 0.25 · 순살 0.20 · 예산 0.15)의 가중치 합은 1.0 이고, 각 기준은
 * 충족/미충족만 있습니다 — 절반쯤 찬 막대는 아무도 설명할 수 없기 때문입니다.
 * 동점이면 원하신 맵기에 가까운 쪽, 그다음 싼 쪽 순으로 올립니다.
 *
 * 알레르기를 확인하지 못했으면 추천 자체를 하지 않고 `requiresReconfirmation`
 * 을 세웁니다. 사용자가 UNKNOWN 이라고 한 값을 임의로 정해서 고르지 않습니다.
 */
export function recommend(
  candidates: Candidate[],
  ctx: SessionContext,
  _profile: UserProfile,
  excluded: ExclusionReason[],
): Recommendation {
  const result = engineScore(asEngineCandidates(candidates), asEngineContext(ctx));
  const podium = [result.recommendedCandidateId, ...result.alternativeCandidateIds].filter(
    (id): id is string => id !== null,
  );

  return {
    recommendedCandidateId: result.recommendedCandidateId,
    alternativeCandidateIds: result.alternativeCandidateIds,
    // `tag` is dropped here — the schema's excludedCandidates is closed and
    // rejects it. It exists for the web UI, which groups reasons by it.
    excludedCandidates: excluded.map(({ candidateId, reasonCode, explanation }) => ({
      candidateId,
      reasonCode,
      explanation,
    })),
    scoreBreakdown: scoreBreakdown(result, podium),
    // explainRecommendation fills this in — kept non-empty by buildSubmission.
    recommendationReasons: [],
    unmetConditions: unmetConditions(result),
    confidence: result.confidence,
    requiresReconfirmation: result.requiresReconfirmation,
  };
}

/**
 * Per-criterion numbers for the podium, keyed by candidateId.
 *
 * The kit's TypeScript declares `scoreBreakdown: Record<string, number>`, but
 * recommendation.schema.json says only `{"type": "object"}` and the accepted
 * submission nests one object per candidate. CLAUDE.md 1절: where the docs and
 * the schema disagree, the schema wins — so this is nested, and cast.
 */
function scoreBreakdown(result: EngineResult, podium: string[]): Recommendation["scoreBreakdown"] {
  const out: Record<string, Record<string, number>> = {};
  for (const id of podium) {
    const rows = result.contributions[id];
    if (!rows) continue;
    const entry: Record<string, number> = {
      total: round2(rows.reduce((sum, row) => sum + row.earned, 0)),
    };
    for (const row of rows) entry[row.key] = row.earned;
    out[id] = entry;
  }
  return out as unknown as Recommendation["scoreBreakdown"];
}

/** What the user asked for that the recommendation could not give them. */
function unmetConditions(result: EngineResult): string[] {
  const id = result.recommendedCandidateId;
  if (id === null) return [];
  return (result.contributions[id] ?? []).filter((row) => row.earned === 0).map((row) => row.label);
}

/** 0.4 + 0.25 + 0.2 + 0.15 is 1.0000000000000002 in binary floating point. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * STEP 6 — explainRecommendation
 *
 * 왜 이것을 추천했는지 사용자의 말로 설명합니다. 문장마다 "[근거] + [무엇을
 * 했는지]" 형태이고, **실제로 참인 문장만** 나옵니다 — 맞추지 못한 맵기를
 * 맞췄다고 하는 것은 아무 말도 안 하는 것보다 나쁩니다. 알레르기 문장은
 * 사용자가 알레르기를 등록했고 실제로 그 사유로 뺀 후보가 있을 때만 붙습니다.
 *
 * "AI가 추천했습니다" · "최적의 선택입니다" 같은 문장은 만들지 않습니다.
 */
export function explainRecommendation(
  _rec: Recommendation,
  ctx: SessionContext,
  recommended: Candidate,
  excluded: ExclusionReason[],
): string[] {
  return engineExplainRecommendation(
    recommended as unknown as EngineCandidate,
    asEngineContext(ctx),
    excluded,
  ).map((reason) => reason.text);
}

/**
 * STEP 7 — buildAlternatives
 *
 * 1순위가 뜻과 다를 때 돌아갈 길입니다. 순위는 STEP 5 가 이미 동점까지 갈라
 * 정해 두었으므로 그 답을 읽습니다 — 서로 어긋날 수 있는 두 개의 순위를 두는
 * 것이 하나를 두는 것보다 나쁩니다. 제외된 후보는 절대 되살아나지 않습니다.
 */
export function buildAlternatives(_candidates: Candidate[], rec: Recommendation): string[] {
  return engineBuildAlternatives({
    alternativeCandidateIds: rec.alternativeCandidateIds,
  } as EngineResult);
}

/* ═══════════════════════ 3. 승인과 실행계획 ═══════════════════════ */

/**
 * STEP 8 — collectUserDecision
 *
 * 최종 확인 화면에서 손님이 누른 결과입니다. 자동 추천을 자동 실행으로 잇지
 * 않습니다.
 *
 * 추천이 없으면 기록이 무엇이든 승인으로 읽지 않습니다. 손님은 볼 수 없는 것을
 * 승인할 수 없습니다.
 *
 * ⚠️ `requiresReconfirmation` 만으로 막지 않습니다. 그 값은 원인이 둘이고
 * (되물을 것이 남았다 / 확신이 LOW_CONFIDENCE_THRESHOLD 미만이다) 둘을 같게
 * 다루면 화면과 어긋납니다. 화면은 앞의 경우 추천을 아예 그리지 않고 진행
 * 버튼도 주지 않지만, 뒤의 경우 주의 문구를 얹고 손님이 직접 판단하게 합니다.
 * 앞의 경우는 엔진이 `recommendedCandidateId` 를 null 로 돌려주므로
 * (select.ts 의 `mayRecommend`) 아래 조건 하나로 같은 판정이 납니다.
 */
export async function collectUserDecision(
  rec: Recommendation,
  recorded: CollectedInput["decision"],
): Promise<UserDecision> {
  const offered = rec.recommendedCandidateId !== null;
  if (!offered || !recorded.approved) {
    return {
      approved: false,
      decision: "REJECT",
      note: offered
        ? "손님이 승인하지 않았습니다."
        : "추천을 드릴 수 없는 상태라 승인 화면을 띄우지 않았습니다.",
    };
  }
  return {
    approved: true,
    decision: "APPROVE",
    confirmedAt: recorded.confirmedAt,
    note: recorded.note,
  };
}

/**
 * STEP 9 — buildExecutionPlan
 *
 * 승인된 결정을 의미 기반 실행계획으로 바꿉니다. target 은 {kind, id, groupId?}
 * 의미 대상이고 좌표·automationId·컨트롤 ID 는 쓰지 않습니다. 상태 전이는
 * fixture.transitions 에서 읽어 채우므로 환경의 상태 기계가 바뀌면 계획도 따라
 * 갑니다.
 *
 * 계획은 `manifest.reviewBoundaryState` 에서 멈추고 필수 verifier 를 실행합니다.
 * 결제·본인확인 완료·행정처리 확정 Action 은 만들지 않습니다 — 차단되더라도
 * 계획에 들어 있기만 하면 실패입니다.
 *
 * 승인하지 않았으면 actions 는 빈 배열입니다.
 */
export function buildExecutionPlan(
  decision: UserDecision,
  rec: Recommendation,
  fixture: PublicFixture,
  ctx: SessionContext,
): ExecutionPlan {
  const candidateId = rec.recommendedCandidateId;
  if (!decision.approved || candidateId === null) {
    return {
      planId: `PLAN-COMMITANDRUN-${candidateId ?? "NONE"}`,
      validationMode: "SIMULATION_ONLY",
      executionEnvironment: "DIGITAL_TWIN",
      actualDeviceCommandSent: false,
      actions: [],
    } as ExecutionPlan;
  }

  return engineBuildExecutionPlan({
    environmentId: fixture.manifest.environmentId,
    fixture: asEngineFixture(fixture),
    candidateId,
    sessionContext: asEngineContext(ctx),
    approved: decision.approved,
  }) as unknown as ExecutionPlan;
}

/* ═══════════════════════════ 조립 ═══════════════════════════ */

/**
 * The nine steps in order.
 *
 * Pure with respect to the clock: every timestamp comes from the collected
 * input, so the same input file produces a byte-identical submission every run.
 * That is what makes the recorded SHA-256 mean anything.
 */
export async function buildSubmission(
  fixture: PublicFixture,
  teamId: string,
): Promise<ParticipantSubmission> {
  const raw = await collectProfile(fixture.manifest.environmentId);
  const input = raw as unknown as CollectedInput;

  const profile = mapToCanonicalInput(raw);
  const sessionContext = createSessionContext(raw, fixture);

  const { survivors, excluded } = partition(fixture.candidates, sessionContext);
  const candidates = survivors as unknown as Candidate[];

  const recommendation = recommend(candidates, sessionContext, profile, excluded);
  const recommended = candidates.find((c) => c.candidateId === recommendation.recommendedCandidateId);
  recommendation.recommendationReasons = recommended
    ? explainRecommendation(recommendation, sessionContext, recommended, excluded)
    : [];
  recommendation.alternativeCandidateIds = buildAlternatives(candidates, recommendation);

  const userDecision = await collectUserDecision(recommendation, input.decision);
  const executionPlan = buildExecutionPlan(userDecision, recommendation, fixture, sessionContext);

  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId,
    environmentId: fixture.manifest.environmentId,
    profile, sessionContext, recommendation, userDecision, executionPlan,
  } as ParticipantSubmission;
}
