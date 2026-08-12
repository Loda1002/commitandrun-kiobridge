/**
 * chicken-store — ordering food.
 *
 * The rules, weights and sentences that used to live inline in `select.ts` and
 * `plan.ts`. Moved here unchanged: this environment's submission is the one the
 * organisers score, so the refactor that made room for the other two had to
 * leave its output byte-for-byte identical.
 *
 * What the user is choosing between is a dish. What can hurt them is an
 * allergen, so that rule runs first and an unanswered allergy question stops the
 * recommendation outright rather than being read as "no allergies".
 */

import {
  NOT_ANSWERED,
  registerDomain,
  type DomainCriterion,
  type DomainRule,
  type DomainSpec,
} from "../domain.ts";
import type {
  Allergen,
  Candidate,
  ChickenStoreSessionContext,
  ExclusionReason,
  OptionGroup,
  RecommendationReason,
  ReconfirmRequest,
  ServiceType,
  SessionContext,
  SpicyLevel,
} from "../types.ts";

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
 * Which `preferences` key answers which fixture option group. The fixture names
 * the groups; only this bridge is ours, so it lives with the domain rather than
 * being guessed from the group label.
 */
const PREFERENCE_KEY_BY_GROUP: Record<string, string> = {
  SERVICE_TYPE: "serviceType",
  SPICY_LEVEL: "spicyLevel",
  BONE_TYPE: "boneType",
  CUP: "cupOption",
  QUANTITY: "quantity",
};

/** How far apart two spice levels are. Only used to break a tie. */
const SPICY_ORDER: Record<string, number> = { MILD: 0, MEDIUM: 1, HOT: 2 };

/** Narrowing helper — the base index signature stops TS narrowing on task alone. */
function ctxOf(ctx: SessionContext): ChickenStoreSessionContext {
  return ctx as ChickenStoreSessionContext;
}

/* ===========================================================================
 * Filtering
 * =========================================================================== */

/**
 * The candidate contains something the user is allergic to.
 *
 * "UNKNOWN" is dropped from the comparison on purpose: it means the user has
 * not told us yet, and matching it against nothing would quietly clear every
 * dish. Turning that silence into a question is `reconfirm`'s job. Filtering
 * cannot ask, so it must not decide.
 */
const allergenConflict: DomainRule = (candidate, raw) => {
  const ctx = ctxOf(raw);
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
};

/** Sold out. Scoring it down is not enough — it cannot be ordered at all. */
const unavailable: DomainRule = (candidate) => {
  if (candidate.available) return null;
  return {
    candidateId: candidate.candidateId,
    reasonCode: "CANDIDATE_UNAVAILABLE",
    explanation: "지금 품절이라 고를 수 없습니다.",
    tag: "AVAILABILITY",
  };
};

/**
 * Costs more than the user said they would spend. `maxPriceKrw` sits in
 * hardConstraints, so it excludes rather than merely scoring low — offering a
 * menu the user already ruled out is not a recommendation.
 */
const overBudget: DomainRule = (candidate, raw) => {
  const ctx = ctxOf(raw);
  const limit = ctx.hardConstraints.maxPriceKrw;
  if (limit === undefined || candidate.price === undefined) return null;
  if (candidate.price <= limit) return null;

  return {
    candidateId: candidate.candidateId,
    reasonCode: "PRICE_LIMIT_EXCEEDED",
    explanation: `정하신 예산 ${won(limit)}원보다 비싸서 제외했습니다.`,
    tag: "USER_PREFERENCE",
  };
};

/** The candidate cannot be served the way the user is taking it. */
const serviceTypeMismatch: DomainRule = (candidate, raw) => {
  const ctx = ctxOf(raw);
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
};

function explainServiceType(wanted: ServiceType, supported: string[]): string {
  const wantedLabel = SERVICE_TYPE_LABEL[wanted] ?? wanted;
  if (supported.length === 1) {
    const onlyLabel = SERVICE_TYPE_LABEL[supported[0]] ?? supported[0];
    return `${onlyLabel} 전용이라 ${wantedLabel}으로는 받을 수 없습니다.`;
  }
  return `${wantedLabel}으로는 받을 수 없는 메뉴라 제외했습니다.`;
}

/** 7000 -> "7,000". Done by hand so the sentence cannot vary by locale data. */
function won(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* ===========================================================================
 * Scoring
 * =========================================================================== */

const CRITERIA: DomainCriterion[] = [
  {
    key: "serviceTypeMatch",
    label: "포장 가능",
    weight: 0.4,
    met: (c, raw) => {
      const wanted = ctxOf(raw).preferences.serviceType;
      if (!wanted || NOT_ANSWERED.has(wanted)) return false;
      return c.supportedOptions?.SERVICE_TYPE?.includes(wanted) ?? false;
    },
  },
  {
    key: "spicyLevelMatch",
    label: "맵기 일치",
    weight: 0.25,
    met: (c, raw) => {
      const wanted = ctxOf(raw).preferences.spicyLevel;
      if (!wanted || NOT_ANSWERED.has(wanted)) return false;
      return c.attributes?.spicyLevel === wanted;
    },
  },
  {
    key: "boneTypeMatch",
    label: "순살 일치",
    weight: 0.2,
    met: (c, raw) => {
      const wanted = ctxOf(raw).preferences.boneType;
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
    met: (c, raw) => {
      const limit = ctxOf(raw).hardConstraints.maxPriceKrw;
      if (limit === undefined || c.price === undefined) return false;
      return c.price <= limit;
    },
  },
];

/**
 * Closest spice level first, then cheapest. Only reached when two candidates
 * scored identically, which happens more often than it sounds: three of the
 * eight dishes match on all four criteria for a typical answer set.
 */
function tiebreak(a: Candidate, b: Candidate, raw: SessionContext): number {
  const ctx = ctxOf(raw);
  const bySpice = spicyDistance(a, ctx) - spicyDistance(b, ctx);
  if (bySpice !== 0) return bySpice;
  return (a.price ?? Infinity) - (b.price ?? Infinity);
}

function spicyDistance(candidate: Candidate, ctx: ChickenStoreSessionContext): number {
  const wanted = ctx.preferences.spicyLevel;
  if (!wanted || NOT_ANSWERED.has(wanted)) return 0;
  const here = SPICY_ORDER[candidate.attributes?.spicyLevel as SpicyLevel];
  const there = SPICY_ORDER[wanted];
  if (here === undefined || there === undefined) return 0;
  return Math.abs(here - there);
}

/* ===========================================================================
 * Explaining
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
 * Every sentence is "[근거] + [무엇을 했는지]", and each one is only emitted
 * when it is actually true of this recommendation — claiming we matched the
 * spice level when we did not is worse than saying nothing. "AI가 추천했습니다"
 * is not an explanation and is never produced.
 */
function explain(
  recommended: Candidate,
  raw: SessionContext,
  excluded: ExclusionReason[],
): RecommendationReason[] {
  const ctx = ctxOf(raw);
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

  if (hasCode(excluded, "CANDIDATE_UNAVAILABLE")) {
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
 * "모르겠어요" on an allergy is not "no allergy" — we stop and ask instead of
 * recommending something that could hurt.
 */
function reconfirm(raw: SessionContext): ReconfirmRequest[] {
  const ctx = ctxOf(raw);
  if (!ctx.hardConstraints.allergenIds?.includes("UNKNOWN")) return [];
  return [
    {
      path: "/hardConstraints/allergenIds",
      // Quotes the option the form actually offers. A question that points at a
      // button the user cannot find is worse than one that points at nothing —
      // keep this in step with the allergy question in apps/web.
      question: "드시면 안 되는 재료가 있으신가요? 없으시면 '없어요 (해당 없음)'을 골라 주세요.",
      because: "알레르기를 확인하지 못한 상태로는 안전하게 추천해 드릴 수 없습니다.",
    },
  ];
}

/** Answers all live in `preferences` here; QUANTITY is carried as a number. */
function answerFor(group: OptionGroup, raw: SessionContext): unknown {
  const preferences = ctxOf(raw).preferences as Record<string, unknown>;
  return preferences[PREFERENCE_KEY_BY_GROUP[group.groupId] ?? group.groupId];
}

export const CHICKEN_STORE: DomainSpec = registerDomain({
  environmentId: "chicken-store",
  task: "ORDER_FOOD",
  candidateNoun: "메뉴",
  // Safety outranks availability, availability outranks a hard constraint the
  // user set, and all of them outrank what the user merely prefers.
  rules: [allergenConflict, unavailable, overBudget, serviceTypeMismatch],
  criteria: CRITERIA,
  tiebreak,
  explain,
  reconfirm,
  answerFor,
  candidateAction: "select_menu",
  actionByGroupKind: {
    service_type: "select_service",
    option: "select_option",
  },
});
