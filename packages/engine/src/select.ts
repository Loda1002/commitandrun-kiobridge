/**
 * @commitandrun/engine — choosing a candidate and saying why.
 *
 * Step 6 (filterCandidates, score) plus the two step 7 functions that read the
 * result (explainRecommendation, buildAlternatives). They live here rather than
 * in input.ts because they share the Korean label tables with the exclusion
 * sentences, and user-facing wording split across files drifts apart.
 *
 * Removes candidates the user must not be offered, says why in a sentence the
 * user can read, then ranks what is left. Showing what we dropped and what each
 * criterion earned is the part of our submission the other teams do not have,
 * so the explanations matter as much as the numbers.
 *
 * Same rule as the rest of src/ — `./types.ts` is the only import allowed, so
 * this file also runs in the deployed web app where the kit does not exist.
 */

import {
  LOW_CONFIDENCE_THRESHOLD,
  type Allergen,
  type Candidate,
  type ChickenStoreSessionContext,
  type EngineResult,
  type ExclusionReason,
  type PublicFixture,
  type ReconfirmRequest,
  type RecommendationReason,
  type ScoreContribution,
  type ServiceType,
  type SessionContext,
  type SpicyLevel,
} from "./types.ts";

/** Values that mean "the user did not tell us". Never treated as an answer. */
const NOT_ANSWERED = new Set(["UNKNOWN", "NO_PREFERENCE"]);

/** Korean names for the sentence shown to the user. Codes never reach the UI. */
const ALLERGEN_LABEL: Record<Allergen, string> = {
  PEANUT: "견과류",
  SOY: "대두",
  MILK: "우유",
  EGG: "달걀",
  WHEAT: "밀",
  SHRIMP: "새우",
  UNKNOWN: "확인되지 않은 재료",
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  DINE_IN: "매장 이용",
  TAKE_OUT: "포장",
};

/**
 * One filtering rule. Returns the exclusion when the candidate must go, or null
 * when this rule has nothing to say about it.
 */
type Rule = (candidate: Candidate, ctx: ChickenStoreSessionContext) => ExclusionReason | null;

/**
 * Rules run in this order, and a candidate is only ever excluded once — so a
 * sold-out peanut dish is reported as the allergy, not the stock level. Safety
 * outranks availability, availability outranks a hard constraint the user set,
 * and all of them outrank what the user merely prefers.
 */
const RULES: Rule[] = [allergenConflict, unavailable, overBudget, serviceTypeMismatch];

/** SessionContextBase's index signature stops TS narrowing on intent.task alone. */
function isChickenStore(ctx: SessionContext): ctx is ChickenStoreSessionContext {
  return ctx.intent.task === "ORDER_FOOD";
}

export function filterCandidates(
  fixture: PublicFixture,
  ctx: SessionContext,
): { survivors: Candidate[]; excluded: ExclusionReason[] } {
  if (!isChickenStore(ctx)) {
    throw new Error(`filterCandidates: expected an ORDER_FOOD context, got ${ctx.intent.task}`);
  }

  const excluded: ExclusionReason[] = [];
  const removed = new Set<string>();

  for (const rule of RULES) {
    for (const candidate of fixture.candidates) {
      if (removed.has(candidate.candidateId)) continue;
      const reason = rule(candidate, ctx);
      if (!reason) continue;
      removed.add(candidate.candidateId);
      excluded.push(reason);
    }
  }

  const survivors = fixture.candidates.filter((c) => !removed.has(c.candidateId));
  return { survivors, excluded };
}

/**
 * The candidate contains something the user is allergic to.
 *
 * "UNKNOWN" is dropped from the comparison on purpose: it means the user has
 * not told us yet, and matching it against nothing would quietly clear every
 * dish. Turning that silence into a question is `score`'s job — it raises
 * requiresReconfirmation. Filtering cannot ask, so it must not decide.
 */
function allergenConflict(
  candidate: Candidate,
  ctx: ChickenStoreSessionContext,
): ExclusionReason | null {
  const declared = (ctx.hardConstraints.allergenIds ?? []).filter((a) => a !== "UNKNOWN");
  if (declared.length === 0) return null;

  const inDish = (candidate.attributes?.allergenIds as Allergen[] | undefined) ?? [];
  const hits = declared.filter((a) => inDish.includes(a));
  if (hits.length === 0) return null;

  const labels = hits.map((a) => ALLERGEN_LABEL[a] ?? a).join("·");
  return {
    candidateId: candidate.candidateId,
    reasonCode: "ALLERGEN_CONFLICT",
    explanation: `등록하신 ${labels} 알레르기와 겹쳐 제외했습니다.`,
    tag: "SAFETY",
  };
}

/** Sold out. Scoring it down is not enough — it cannot be ordered at all. */
function unavailable(candidate: Candidate): ExclusionReason | null {
  if (candidate.available) return null;
  return {
    candidateId: candidate.candidateId,
    reasonCode: "UNAVAILABLE",
    explanation: "지금 품절이라 고를 수 없습니다.",
    tag: "AVAILABILITY",
  };
}

/**
 * Costs more than the user said they would spend. `maxPriceKrw` sits in
 * hardConstraints, so it excludes rather than merely scoring low — offering a
 * menu the user already ruled out is not a recommendation.
 */
function overBudget(candidate: Candidate, ctx: ChickenStoreSessionContext): ExclusionReason | null {
  const limit = ctx.hardConstraints.maxPriceKrw;
  if (limit === undefined || candidate.price === undefined) return null;
  if (candidate.price <= limit) return null;

  return {
    candidateId: candidate.candidateId,
    reasonCode: "PRICE_OVER_LIMIT",
    explanation: `정하신 예산 ${won(limit)}원보다 비싸서 제외했습니다.`,
    tag: "USER_PREFERENCE",
  };
}

/** 7000 -> "7,000". Done by hand so the sentence cannot vary by locale data. */
function won(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The candidate cannot be served the way the user is taking it. */
function serviceTypeMismatch(
  candidate: Candidate,
  ctx: ChickenStoreSessionContext,
): ExclusionReason | null {
  const wanted = ctx.preferences.serviceType;
  if (!wanted || NOT_ANSWERED.has(wanted)) return null;

  const supported = candidate.supportedOptions?.SERVICE_TYPE;
  if (!supported || supported.includes(wanted)) return null;

  return {
    candidateId: candidate.candidateId,
    reasonCode: "SERVICE_TYPE_MISMATCH",
    explanation: explainServiceType(wanted, supported),
    tag: "USER_PREFERENCE",
  };
}

function explainServiceType(wanted: ServiceType, supported: string[]): string {
  const wantedLabel = SERVICE_TYPE_LABEL[wanted] ?? wanted;
  if (supported.length === 1) {
    const onlyLabel = SERVICE_TYPE_LABEL[supported[0]] ?? supported[0];
    return `${onlyLabel} 전용이라 ${wantedLabel}으로는 받을 수 없습니다.`;
  }
  return `${wantedLabel}으로는 받을 수 없는 메뉴라 제외했습니다.`;
}

/* ===========================================================================
 * Scoring — four criteria, weights adding up to 1.0.
 * =========================================================================== */

/**
 * One scoring criterion. `met` is deliberately all-or-nothing: the UI draws
 * `earned / weight` as a bar, and a half-filled bar nobody can explain is worse
 * than an empty one the user immediately understands.
 */
interface Criterion {
  key: string;
  label: string;
  weight: number;
  met: (candidate: Candidate, ctx: ChickenStoreSessionContext) => boolean;
}

const CRITERIA: Criterion[] = [
  {
    key: "serviceTypeMatch",
    label: "포장 가능",
    weight: 0.4,
    met: (c, ctx) => {
      const wanted = ctx.preferences.serviceType;
      if (!wanted || NOT_ANSWERED.has(wanted)) return false;
      return c.supportedOptions?.SERVICE_TYPE?.includes(wanted) ?? false;
    },
  },
  {
    key: "spicyLevelMatch",
    label: "맵기 일치",
    weight: 0.25,
    met: (c, ctx) => {
      const wanted = ctx.preferences.spicyLevel;
      if (!wanted || NOT_ANSWERED.has(wanted)) return false;
      return c.attributes?.spicyLevel === wanted;
    },
  },
  {
    key: "boneTypeMatch",
    label: "순살 일치",
    weight: 0.2,
    met: (c, ctx) => {
      const wanted = ctx.preferences.boneType;
      if (!wanted || NOT_ANSWERED.has(wanted)) return false;
      return c.attributes?.boneType === wanted;
    },
  },
  {
    key: "priceWithinLimit",
    label: "예산 여유",
    weight: 0.15,
    // Anything over budget was already excluded by `overBudget`, so for a
    // survivor this bar is always full. It stays in the chart as reassurance —
    // "this fits what you said you would spend" — not to separate candidates.
    met: (c, ctx) => {
      const limit = ctx.hardConstraints.maxPriceKrw;
      if (limit === undefined || c.price === undefined) return false;
      return c.price <= limit;
    },
  },
];

/** How far apart two spice levels are. Only used to break a tie. */
const SPICY_ORDER: Record<string, number> = { MILD: 0, MEDIUM: 1, HOT: 2 };

export function score(survivors: Candidate[], ctx: SessionContext): EngineResult {
  if (!isChickenStore(ctx)) {
    throw new Error(`score: expected an ORDER_FOOD context, got ${ctx.intent.task}`);
  }

  const contributions: Record<string, ScoreContribution[]> = {};
  const totals = new Map<string, number>();

  // Every survivor is scored, not just the ones that make the podium — the UI
  // shows the full comparison, and the caller trims it for the submission.
  for (const candidate of survivors) {
    const rows: ScoreContribution[] = CRITERIA.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      earned: c.met(candidate, ctx) ? c.weight : 0,
    }));
    contributions[candidate.candidateId] = rows;
    totals.set(candidate.candidateId, round2(rows.reduce((sum, r) => sum + r.earned, 0)));
  }

  const ranked = [...survivors].sort((a, b) => compare(a, b, totals, ctx));
  const top = ranked[0];
  const confidence = top ? (totals.get(top.candidateId) ?? 0) : 0;

  const reconfirmRequests = collectReconfirmRequests(ctx);
  // An unanswered allergy question outranks any score we could compute.
  const mayRecommend = reconfirmRequests.length === 0;

  return {
    recommendedCandidateId: mayRecommend && top ? top.candidateId : null,
    alternativeCandidateIds: mayRecommend ? ranked.slice(1, 3).map((c) => c.candidateId) : [],
    // filterCandidates owns the exclusion list; the caller merges the two.
    excluded: [],
    contributions,
    // explainRecommendation (step 7) fills this in.
    reasons: [],
    confidence,
    requiresReconfirmation: !mayRecommend || confidence < LOW_CONFIDENCE_THRESHOLD,
    reconfirmRequests,
  };
}

/**
 * Highest score wins. Everything after that only settles ties, so the order is
 * never left to however the fixture happened to list its candidates:
 * closest spice level, then cheapest, then candidateId so runs are repeatable.
 */
function compare(
  a: Candidate,
  b: Candidate,
  totals: Map<string, number>,
  ctx: ChickenStoreSessionContext,
): number {
  const byTotal = (totals.get(b.candidateId) ?? 0) - (totals.get(a.candidateId) ?? 0);
  if (byTotal !== 0) return byTotal;

  const bySpice = spicyDistance(a, ctx) - spicyDistance(b, ctx);
  if (bySpice !== 0) return bySpice;

  const byPrice = (a.price ?? Infinity) - (b.price ?? Infinity);
  if (byPrice !== 0) return byPrice;

  return a.candidateId.localeCompare(b.candidateId);
}

function spicyDistance(candidate: Candidate, ctx: ChickenStoreSessionContext): number {
  const wanted = ctx.preferences.spicyLevel;
  if (!wanted || NOT_ANSWERED.has(wanted)) return 0;
  const here = SPICY_ORDER[candidate.attributes?.spicyLevel as SpicyLevel];
  const there = SPICY_ORDER[wanted];
  if (here === undefined || there === undefined) return 0;
  return Math.abs(here - there);
}

/**
 * What the engine refuses to guess. "모르겠어요" on an allergy is not "no
 * allergy" — we stop and ask instead of recommending something that could hurt.
 */
function collectReconfirmRequests(ctx: ChickenStoreSessionContext): ReconfirmRequest[] {
  if (!ctx.hardConstraints.allergenIds?.includes("UNKNOWN")) return [];
  return [
    {
      path: "/hardConstraints/allergenIds",
      question: "드시면 안 되는 재료가 있으신가요? 없으시면 '없음'을 골라 주세요.",
      because: "알레르기를 확인하지 못한 상태로는 안전하게 추천해 드릴 수 없습니다.",
    },
  ];
}

/** 0.4 + 0.25 + 0.2 + 0.15 is 1.0000000000000002 in binary floating point. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ===========================================================================
 * Explaining the result.
 * =========================================================================== */

/**
 * Whole sentences per value rather than one template with the value dropped in.
 * Korean particles change with the word ("순살을" but "뼈를"), and a template
 * that gets that wrong reads as broken to the person we are trying to help.
 */
const SERVICE_TYPE_SENTENCE: Record<string, string> = {
  TAKE_OUT: "포장으로 받으신다고 하셔서 포장이 되는 메뉴만 남겼습니다.",
  DINE_IN: "매장에서 드신다고 하셔서 매장 이용이 되는 메뉴만 남겼습니다.",
};

const BONE_TYPE_SENTENCE: Record<string, string> = {
  BONELESS: "순살을 고르셔서 뼈 없는 메뉴를 위에 두었습니다.",
  BONE: "뼈를 고르셔서 뼈 있는 메뉴를 위에 두었습니다.",
};

/** Every one of these ends in a consonant, so one template fits all three. */
const SPICY_LABEL: Record<string, string> = {
  MILD: "순한맛",
  MEDIUM: "보통맛",
  HOT: "매운맛",
};

/**
 * Why this candidate, in the user's own language.
 *
 * Every sentence is "[근거] + [무엇을 했는지]", and each one is only emitted
 * when it is actually true of this recommendation — claiming we matched the
 * spice level when we did not is worse than saying nothing. "AI가 추천했습니다"
 * is not an explanation and is never produced.
 */
export function explainRecommendation(
  recommended: Candidate,
  ctx: SessionContext,
  excluded: ExclusionReason[],
): RecommendationReason[] {
  if (!isChickenStore(ctx)) {
    throw new Error(`explainRecommendation: expected an ORDER_FOOD context, got ${ctx.intent.task}`);
  }

  const reasons: RecommendationReason[] = [];
  const push = (tag: RecommendationReason["tag"], text: string) => reasons.push({ tag, text });

  const serviceType = ctx.preferences.serviceType;
  if (
    serviceType &&
    !NOT_ANSWERED.has(serviceType) &&
    recommended.supportedOptions?.SERVICE_TYPE?.includes(serviceType) &&
    SERVICE_TYPE_SENTENCE[serviceType]
  ) {
    push("USER_PREFERENCE", SERVICE_TYPE_SENTENCE[serviceType]);
  }

  const spicyLevel = ctx.preferences.spicyLevel;
  if (spicyLevel && recommended.attributes?.spicyLevel === spicyLevel && SPICY_LABEL[spicyLevel]) {
    const label = SPICY_LABEL[spicyLevel];
    push("USER_PREFERENCE", `${label}을 고르셔서 ${label}으로 나오는 메뉴를 먼저 보여드렸습니다.`);
  }

  const boneType = ctx.preferences.boneType;
  if (boneType && recommended.attributes?.boneType === boneType && BONE_TYPE_SENTENCE[boneType]) {
    push("USER_PREFERENCE", BONE_TYPE_SENTENCE[boneType]);
  }

  const declaredAllergens = (ctx.hardConstraints.allergenIds ?? []).filter((a) => a !== "UNKNOWN");
  if (declaredAllergens.length > 0 && hasCode(excluded, "ALLERGEN_CONFLICT")) {
    const labels = declaredAllergens.map((a) => ALLERGEN_LABEL[a] ?? a).join("·");
    push("SAFETY", `등록하신 ${labels} 알레르기와 겹치는 메뉴는 아예 빼고 골랐습니다.`);
  }

  if (hasCode(excluded, "UNAVAILABLE")) {
    push("AVAILABILITY", "매장 재고를 확인해 지금 품절인 메뉴는 빼고 골랐습니다.");
  }

  const limit = ctx.hardConstraints.maxPriceKrw;
  if (limit !== undefined && recommended.price !== undefined && recommended.price <= limit) {
    push("USER_PREFERENCE", `예산 ${won(limit)}원 안에서 ${won(recommended.price)}원인 메뉴를 골랐습니다.`);
  }

  return reasons;
}

function hasCode(excluded: ExclusionReason[], reasonCode: string): boolean {
  return excluded.some((e) => e.reasonCode === reasonCode);
}

/**
 * The runners-up. `score` already ranked everything and broke the ties, so this
 * reads its answer instead of ranking a second time — two rankings that can
 * disagree with each other is worse than one.
 *
 * `count` can only narrow: score keeps two alternatives, so asking for more
 * still returns two.
 */
export function buildAlternatives(result: EngineResult, count = 2): string[] {
  return result.alternativeCandidateIds.slice(0, count);
}
