/**
 * public-office — finding your way to the right civil service.
 *
 * What the user is choosing between is a guidance path: which counter, what to
 * bring, which way to prove who you are. What this domain never does is decide
 * whether someone qualifies. `auto_eligibility_decision` and `issue_document`
 * are forbidden actions, and the reasoning behind them binds here too — we
 * match the category the user picked and the ways they can authenticate, and we
 * say out loud that entitlement was not judged. Getting told "you do not
 * qualify" by a kiosk, wrongly, is the failure mode worth designing against.
 *
 * `collect_ssn` is forbidden as well, which is why nothing in this file reads or
 * stores an identifier: the auth method is a *kind* of proof, never the proof.
 *
 * As at the hospital, the staff-consultation route survives every mismatch rule.
 * It is the way out, and it has to still be there when nothing else fits.
 */

import {
  isAnswered,
  registerDomain,
  type DomainCriterion,
  type DomainRule,
  type DomainSpec,
} from "../domain.ts";
import type {
  AuthMethod,
  Candidate,
  ExclusionReason,
  OptionGroup,
  PublicOfficeSessionContext,
  RecommendationReason,
  ReconfirmRequest,
  ServiceCategory,
  SessionContext,
} from "../types.ts";

const CATEGORY_LABEL: Record<string, string> = {
  RESIDENT: "주민등록",
  FAMILY: "가족관계",
  INSURANCE: "건강보험",
  TAX: "지방세",
  STAFF: "직원 상담",
};

const AUTH_METHOD_LABEL: Record<string, string> = {
  MOBILE_AUTH: "모바일 인증",
  ID_CARD: "신분증 인증",
  BIOMETRIC: "생체 인증",
  STAFF_ASSIST: "직원 확인",
  NONE: "인증 없음",
};

function ctxOf(ctx: SessionContext): PublicOfficeSessionContext {
  return ctx as PublicOfficeSessionContext;
}

/**
 * The staff-consultation route. Recognised by the category the fixture gives it
 * rather than by candidate id, so the data stays in charge.
 */
function isStaffRoute(candidate: Candidate): boolean {
  return candidate.attributes?.serviceCategory === "STAFF";
}

/** The ways this service will accept as proof of who you are. */
function acceptedMethods(candidate: Candidate): string[] {
  const required = candidate.requirements?.authenticationMethods;
  return Array.isArray(required) ? (required as string[]) : [];
}

/* ===========================================================================
 * Filtering
 * =========================================================================== */

/** This counter is closed. */
const unavailable: DomainRule = (candidate) => {
  if (candidate.available) return null;
  return {
    candidateId: candidate.candidateId,
    reasonCode: "CANDIDATE_UNAVAILABLE",
    explanation: "지금은 안내해 드릴 수 없는 업무입니다.",
    tag: "AVAILABILITY",
  };
};

/** A different field of business than the one the user picked. */
const categoryMismatch: DomainRule = (candidate, raw) => {
  if (isStaffRoute(candidate)) return null;
  const wanted = ctxOf(raw).facts.serviceCategory;
  if (!isAnswered(wanted)) return null;

  const here = candidate.attributes?.serviceCategory as ServiceCategory | undefined;
  if (here === undefined || here === wanted) return null;

  const hereLabel = CATEGORY_LABEL[here] ?? here;
  const wantedLabel = CATEGORY_LABEL[String(wanted)] ?? String(wanted);
  return {
    candidateId: candidate.candidateId,
    reasonCode: "REQUESTED_SERVICE_MISMATCH",
    explanation: `${hereLabel} 분야 업무라 이번에 고르신 ${wantedLabel} 분야와 다릅니다.`,
    tag: "USER_PREFERENCE",
  };
};

/**
 * The user cannot prove who they are in any way this service accepts.
 *
 * This is about the means of proof, not about entitlement: "you have no way to
 * authenticate here today" is a fact about the counter, while "you do not
 * qualify" would be a judgement we are not allowed to make. The staff route is
 * exempt, so someone carrying nothing still has somewhere to go.
 */
const authMethodUnavailable: DomainRule = (candidate, raw) => {
  if (isStaffRoute(candidate)) return null;
  const available = ctxOf(raw).capabilities.availableAuthMethods ?? [];
  if (!isAnswered(available)) return null;

  const accepted = acceptedMethods(candidate);
  if (accepted.length === 0 || accepted.some((m) => available.includes(m as AuthMethod))) {
    return null;
  }

  const labels = accepted.map((m) => AUTH_METHOD_LABEL[m] ?? m).join("·");
  return {
    candidateId: candidate.candidateId,
    reasonCode: "AUTH_METHOD_UNAVAILABLE",
    explanation: `${labels}이 있어야 처리되는 업무인데 오늘 쓰실 수 있는 방법에 없습니다.`,
    tag: "CONTEXT",
  };
};

/* ===========================================================================
 * Scoring
 * =========================================================================== */

const CRITERIA: DomainCriterion[] = [
  {
    key: "categoryMatch",
    label: "민원 분야 일치",
    weight: 0.4,
    met: (c, raw) => {
      const wanted = ctxOf(raw).facts.serviceCategory;
      if (!isAnswered(wanted)) return false;
      return c.attributes?.serviceCategory === wanted;
    },
  },
  {
    key: "authMethodMatch",
    label: "인증 방식 사용 가능",
    weight: 0.35,
    met: (c, raw) => {
      const available = ctxOf(raw).capabilities.availableAuthMethods ?? [];
      if (!isAnswered(available)) return false;
      return acceptedMethods(c).some((m) => available.includes(m as AuthMethod));
    },
  },
  {
    key: "guidanceModeMatch",
    label: "쉬운 단계별 안내",
    weight: 0.25,
    met: (c, raw) => {
      const preferences = ctxOf(raw).preferences;
      // Nothing requested means nothing to match — an empty bar the user can
      // read, rather than a point awarded for a question they never answered.
      if (preferences.stepByStep !== true && preferences.simpleLanguage !== true) return false;
      const supports = (c.supports ?? {}) as Record<string, unknown>;
      return supports.stepByStep === true;
    },
  },
];

/** A real service beats the staff desk when they tie — the desk is the way out. */
function tiebreak(a: Candidate, b: Candidate): number {
  return Number(isStaffRoute(a)) - Number(isStaffRoute(b));
}

/* ===========================================================================
 * Explaining
 * =========================================================================== */

function explain(
  recommended: Candidate,
  raw: SessionContext,
  excluded: ExclusionReason[],
): RecommendationReason[] {
  const ctx = ctxOf(raw);
  const reasons: RecommendationReason[] = [];
  const push = (tag: RecommendationReason["tag"], text: string) => reasons.push({ tag, text });

  const category = ctx.facts.serviceCategory;
  if (isAnswered(category) && recommended.attributes?.serviceCategory === category) {
    const label = CATEGORY_LABEL[String(category)] ?? String(category);
    push("USER_PREFERENCE", `${label} 분야 업무를 고르셔서 ${label} 분야만 남겼습니다.`);
  }

  const available = ctx.capabilities.availableAuthMethods ?? [];
  const usable = acceptedMethods(recommended).filter((m) => available.includes(m as AuthMethod));
  if (usable.length > 0) {
    const labels = usable.map((m) => AUTH_METHOD_LABEL[m] ?? m).join("과 ");
    push("CONTEXT", `${labels}을 쓰실 수 있다고 하셔서 그 방법으로 처리되는 업무를 보여드립니다.`);
  }

  const supports = (recommended.supports ?? {}) as Record<string, unknown>;
  if ((ctx.preferences.stepByStep === true || ctx.preferences.simpleLanguage === true) &&
      supports.stepByStep === true) {
    push("ACCESSIBILITY", "단계별 안내와 쉬운 문장을 켜셔서 절차를 한 단계씩 나눠 안내합니다.");
  }

  if (excluded.length > 0) {
    push("USER_PREFERENCE", `고르신 분야와 맞지 않는 업무 ${excluded.length}개는 빼고 골랐습니다.`);
  }

  // Both of these are said every time, whatever the answers were. The first is
  // the boundary the platform draws; the second is the way out.
  push("SAFETY", "자격이 되는지는 판단하지 않았습니다. 필요한 서류와 인증수단만 안내드립니다.");
  push("SAFETY", "원하시면 직원 상담 요청으로 바로 넘어가실 수 있습니다.");
  return reasons;
}

/**
 * Two things must be established before anything can be guided: what the user
 * came to do, and how they can prove who they are. Neither may be guessed —
 * guessing the first sends them to the wrong counter, and guessing the second
 * is us deciding what they are carrying.
 */
function reconfirm(raw: SessionContext): ReconfirmRequest[] {
  const ctx = ctxOf(raw);
  const requests: ReconfirmRequest[] = [];

  if (!isAnswered(ctx.facts.serviceCategory)) {
    requests.push({
      path: "/facts/serviceCategory",
      question: "어떤 일로 오셨나요? 주민등록·가족관계·건강보험·지방세 중에서 골라 주세요.",
      because: "분야를 알아야 어느 창구로 가시는지 안내해 드릴 수 있습니다.",
    });
  }

  if (!isAnswered(ctx.capabilities.availableAuthMethods ?? [])) {
    requests.push({
      path: "/capabilities/availableAuthMethods",
      question: "오늘 신분을 확인할 수 있는 방법이 있으신가요? 모바일 인증 또는 신분증을 골라 주세요.",
      because:
        "업무마다 받는 확인 방법이 달라서, 확인하지 못하면 되는 업무를 골라 드릴 수 없습니다.",
    });
  }

  return requests;
}

/**
 * The category is a fact about the visit; the auth method is a capability the
 * user has today.
 *
 * The auth method has to be one this counter actually puts on screen, not just
 * the first one the user is carrying. `AuthMethod` has values this fixture does
 * not offer (`BIOMETRIC`, `NONE`), and `plan.ts` does not narrow that away: it
 * throws on a value the group has no option for, before it ever gets to the
 * per-candidate check. So someone arriving with `["BIOMETRIC", "ID_CARD"]` would
 * be stopped over the first entry while the second was sitting right there.
 *
 * When none of them is offered here, this returns undefined — on this kiosk's
 * terms the user has not chosen yet. That matters most for the staff desk,
 * whose only legal value is `STAFF_ASSIST`: `plan.ts` fills a required group
 * that leaves exactly one value, so the way out stays open for someone whose
 * means of proof this counter cannot take.
 */
function answerFor(group: OptionGroup, raw: SessionContext): unknown {
  const ctx = ctxOf(raw);
  switch (group.groupId) {
    case "CATEGORY":
      return ctx.facts.serviceCategory;
    case "AUTH_METHOD": {
      const available = ctx.capabilities.availableAuthMethods ?? [];
      return available.find((method) => group.options.some((o) => o.id === method));
    }
    default:
      return undefined;
  }
}

export const PUBLIC_OFFICE: DomainSpec = registerDomain({
  environmentId: "public-office",
  task: "PUBLIC_SERVICE_GUIDANCE",
  candidateNoun: "민원 업무",
  rules: [unavailable, categoryMismatch, authMethodUnavailable],
  criteria: CRITERIA,
  tiebreak,
  explain,
  reconfirm,
  answerFor,
  candidateAction: "select_service",
  actionByGroupKind: {
    category: "select_category",
    auth_method: "select_auth_method",
  },
});
