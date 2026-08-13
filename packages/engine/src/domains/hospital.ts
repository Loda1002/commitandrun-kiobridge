/**
 * hospital — checking in at the front desk.
 *
 * What the user is choosing between is a check-in route, not a diagnosis. The
 * platform forbids `diagnose`, `triage`, `recommend_treatment` and
 * `assign_department_final` outright, and the rule behind those bans reaches
 * further than the action list: we never work out which department someone
 * needs. The department is something the user tells us, and if they have not
 * told us we ask — the fixture even ships a "미정 (안내 필요)" route for exactly
 * that answer. Every sentence in `explain` is written so a reader can tell that
 * the machine matched what they said rather than judging what is wrong with them.
 *
 * The other thing this domain gets right on purpose: the staff-help route is
 * never filtered away. A candidate that claims no visit type of its own is the
 * way out of the kiosk, and a kiosk you can get stuck in is the problem we are
 * here to fix. It survives every mismatch rule and scores honestly low, so it
 * shows up as a visible alternative rather than as a recommendation.
 */

import {
  isAnswered,
  quoteParticle,
  registerDomain,
  type DomainCriterion,
  type DomainRule,
  type DomainSpec,
} from "../domain.ts";
import type {
  AppointmentStatus,
  Candidate,
  Department,
  ExclusionReason,
  HospitalSessionContext,
  OptionGroup,
  RecommendationReason,
  ReconfirmRequest,
  SessionContext,
  SupportMode,
  VisitType,
} from "../types.ts";

const VISIT_TYPE_LABEL: Record<string, string> = {
  FIRST_VISIT: "초진",
  REVISIT: "재진",
  HEALTH_SCREENING: "건강검진",
  EXAM: "검사",
};

const APPOINTMENT_LABEL: Record<string, string> = {
  HAS_APPOINTMENT: "예약 있음",
  NO_APPOINTMENT: "예약 없음",
};

const DEPARTMENT_LABEL: Record<string, string> = {
  INTERNAL_MEDICINE: "내과",
  ORTHOPEDICS: "정형외과",
  RADIOLOGY: "영상의학과",
  HEALTH_SCREENING: "건강검진센터",
  UNSPECIFIED: "미정",
};

/**
 * Which SUPPORT option backs which profile support mode.
 *
 * The kiosk offers four buttons and the profile vocabulary has six modes, so the
 * translation is not one-to-one. A mode with no button here is not silently
 * approximated — see `answerFor`.
 */
const SUPPORT_OPTION_BY_MODE: Partial<Record<SupportMode, string>> = {
  LARGE_TEXT: "LARGE_TEXT",
  HEARING_SUPPORT: "HEARING",
  STAFF_HELP: "STAFF_HELP",
};

function ctxOf(ctx: SessionContext): HospitalSessionContext {
  return ctx as HospitalSessionContext;
}

/**
 * The route that applies to anyone: it declares no visit type of its own.
 *
 * Recognised from the data rather than by candidate id, so the fixture stays in
 * charge. This is the escape hatch, and the mismatch rules step around it.
 */
function isFallbackRoute(candidate: Candidate): boolean {
  return candidate.attributes?.visitType === undefined;
}

/* ===========================================================================
 * Filtering
 * =========================================================================== */

/** Closed for the day. Scoring it down is not enough — it cannot be used. */
const unavailable: DomainRule = (candidate) => {
  if (candidate.available) return null;
  return {
    candidateId: candidate.candidateId,
    reasonCode: "CANDIDATE_UNAVAILABLE",
    explanation: "지금은 이용할 수 없는 접수 경로입니다.",
    tag: "AVAILABILITY",
  };
};

/**
 * Runs before the visit-type rule because it is the sharper fact: someone who
 * booked and someone who walked in follow different desks even for the same
 * kind of visit, and naming the appointment is the more useful sentence.
 */
const appointmentMismatch: DomainRule = (candidate, raw) => {
  if (isFallbackRoute(candidate)) return null;
  const wanted = ctxOf(raw).facts.appointmentStatus;
  if (!isAnswered(wanted)) return null;

  const here = candidate.attributes?.appointmentStatus as AppointmentStatus | undefined;
  if (here === undefined || here === wanted) return null;

  return {
    candidateId: candidate.candidateId,
    reasonCode: "APPOINTMENT_MISMATCH",
    explanation:
      here === "NO_APPOINTMENT"
        ? "예약이 없는 분을 위한 안내라 예약이 있는 경우와 맞지 않습니다."
        : "예약이 있는 분을 위한 안내라 예약이 없는 경우와 맞지 않습니다.",
    tag: "CONTEXT",
  };
};

/** A route for a different kind of visit than the one the user told us about. */
const visitTypeMismatch: DomainRule = (candidate, raw) => {
  if (isFallbackRoute(candidate)) return null;
  const wanted = ctxOf(raw).facts.visitType;
  if (!isAnswered(wanted)) return null;

  const here = candidate.attributes?.visitType as VisitType | undefined;
  if (here === undefined || here === wanted) return null;

  const hereLabel = VISIT_TYPE_LABEL[here] ?? here;
  const wantedLabel = VISIT_TYPE_LABEL[String(wanted)] ?? String(wanted);
  return {
    candidateId: candidate.candidateId,
    reasonCode: "VISIT_TYPE_MISMATCH",
    explanation:
      `${hereLabel} 접수 경로라 ${wantedLabel}${quoteParticle(wantedLabel)} ` +
      `알려주신 것과 맞지 않습니다.`,
    tag: "CONTEXT",
  };
};

/**
 * A desk that only serves a department other than the one the user named.
 *
 * This is not us working out which department someone needs — the opposite. It
 * reads only what the user told us and drops the desks that cannot honour it,
 * so the recommendation never arrives at a route that would have to overwrite
 * the answer on the way to a plan. Without it `plan.ts` was quietly selecting
 * 내과 for someone who typed 정형외과 in 32 of the 40 answer combinations, which
 * is `SELECTED_DEPARTMENT_MISMATCH` in the official error catalogue and the
 * "증상→진료과 추론" line in our own CLAUDE.md.
 *
 * Two candidates are deliberately spared. The staff-help route is the way out
 * and never claims a department, and neither does 비예약 초진 안내 — both carry
 * `UNSPECIFIED`, the fixture's own "안내 필요". A route that decides nothing
 * cannot be in conflict with an answer.
 *
 * "미정" counts as an answer here, not as silence: someone who says they have
 * not decided is telling us not to send them to a specific department's desk.
 */
const departmentMismatch: DomainRule = (candidate, raw) => {
  if (isFallbackRoute(candidate)) return null;
  const wanted = ctxOf(raw).facts.departmentId;
  if (!isAnswered(wanted)) return null;

  const here = candidate.attributes?.departmentId as Department | undefined;
  if (here === undefined || here === "UNSPECIFIED" || here === wanted) return null;

  const hereLabel = DEPARTMENT_LABEL[here] ?? here;
  if (wanted === "UNSPECIFIED") {
    return {
      candidateId: candidate.candidateId,
      reasonCode: "DEPARTMENT_MISMATCH",
      explanation: `진료과를 아직 안 정하셔서 ${hereLabel} 전용 접수 경로는 빼고 골랐습니다.`,
      tag: "CONTEXT",
    };
  }

  const wantedLabel = DEPARTMENT_LABEL[String(wanted)] ?? String(wanted);
  return {
    candidateId: candidate.candidateId,
    reasonCode: "DEPARTMENT_MISMATCH",
    explanation:
      `${hereLabel} 접수 경로라 ${wantedLabel}${quoteParticle(wantedLabel)} ` +
      `알려주신 것과 맞지 않습니다. 증상으로 진료과를 판단하지 않았습니다.`,
    tag: "CONTEXT",
  };
};

/* ===========================================================================
 * Scoring
 * =========================================================================== */

const CRITERIA: DomainCriterion[] = [
  {
    key: "visitTypeMatch",
    label: "방문 유형 일치",
    weight: 0.4,
    met: (c, raw) => {
      const wanted = ctxOf(raw).facts.visitType;
      if (!isAnswered(wanted)) return false;
      return c.attributes?.visitType === wanted;
    },
  },
  {
    key: "appointmentMatch",
    label: "예약 여부 일치",
    weight: 0.3,
    met: (c, raw) => {
      const wanted = ctxOf(raw).facts.appointmentStatus;
      if (!isAnswered(wanted)) return false;
      return c.attributes?.appointmentStatus === wanted;
    },
  },
  {
    key: "departmentMatch",
    label: "진료과 일치",
    weight: 0.2,
    met: (c, raw) => {
      const wanted = ctxOf(raw).facts.departmentId;
      if (!isAnswered(wanted)) return false;
      return c.attributes?.departmentId === wanted;
    },
  },
  {
    key: "supportModeMatch",
    label: "필요한 지원 제공",
    weight: 0.1,
    met: (c, raw) => {
      const wanted = ctxOf(raw).preferences.supportModes ?? [];
      if (wanted.length === 0) return false;
      const supports = (c.supports ?? {}) as Record<string, unknown>;
      // Every requested mode has to be covered; partly covered is not covered.
      return wanted.every((mode) => supports[SUPPORTS_KEY_BY_MODE[mode] ?? ""] === true);
    },
  },
];

/** Support mode → the flag a candidate advertises it with in `supports`. */
const SUPPORTS_KEY_BY_MODE: Partial<Record<SupportMode, string>> = {
  LARGE_TEXT: "largeText",
  HEARING_SUPPORT: "hearingSupport",
  STAFF_HELP: "staffHelp",
};

/**
 * How a requested support is named when we have to say we did not match it.
 * Written as a whole subject phrase rather than a noun plus a fixed particle,
 * for the same reason the sentences below are whole sentences.
 */
const SUPPORT_NEED_LABEL: Partial<Record<SupportMode, string>> = {
  LARGE_TEXT: "필요하다고 하신 큰 글씨는",
  HEARING_SUPPORT: "필요하다고 하신 청각 지원은",
  STAFF_HELP: "필요하다고 하신 직원 도움은",
};

/**
 * Accessibility first, then a real route over the escape hatch.
 *
 * The support criterion carries 0.10 against 0.70 for visit type and
 * appointment, so it can never overturn a lead on the answers themselves — and
 * it should not, because being routed to the wrong desk with good captions is
 * still the wrong desk. Where it can decide is between two routes that matched
 * the answers equally, and there it should: the review found us recommending a
 * route with no hearing support over one that had it, at the same score.
 *
 * Only ties move, so nothing already submitted changes.
 */
function tiebreak(a: Candidate, b: Candidate, raw: SessionContext): number {
  const bySupport = unmetSupportCount(a, raw) - unmetSupportCount(b, raw);
  if (bySupport !== 0) return bySupport;
  return Number(isFallbackRoute(a)) - Number(isFallbackRoute(b));
}

/** How many of the requested support modes this route does not provide. */
function unmetSupportCount(candidate: Candidate, raw: SessionContext): number {
  const wanted = ctxOf(raw).preferences.supportModes ?? [];
  const supports = (candidate.supports ?? {}) as Record<string, unknown>;
  return wanted.filter((mode) => supports[SUPPORTS_KEY_BY_MODE[mode] ?? ""] !== true).length;
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

  const visitType = ctx.facts.visitType;
  if (isAnswered(visitType) && recommended.attributes?.visitType === visitType) {
    const label = VISIT_TYPE_LABEL[String(visitType)] ?? String(visitType);
    push("CONTEXT", `${label}${quoteParticle(label)} 알려주셔서 ${label} 접수를 안내드립니다.`);
  }

  const appointment = ctx.facts.appointmentStatus;
  if (isAnswered(appointment) && recommended.attributes?.appointmentStatus === appointment) {
    push(
      "CONTEXT",
      appointment === "HAS_APPOINTMENT"
        ? "예약이 있다고 하셔서 예약 접수 경로를 먼저 보여드립니다."
        : "예약이 없다고 하셔서 현장 접수 경로를 안내드립니다.",
    );
  }

  const department = ctx.facts.departmentId;
  if (isAnswered(department) && recommended.attributes?.departmentId === department) {
    const label = DEPARTMENT_LABEL[String(department)] ?? String(department);
    push(
      "CONTEXT",
      `${label}${quoteParticle(label)} 알려주신 대로 ${label} 접수로 맞췄습니다. ` +
        `증상으로 진료과를 판단하지 않았습니다.`,
    );
  }

  const supportModes = ctx.preferences.supportModes ?? [];
  const supports = (recommended.supports ?? {}) as Record<string, unknown>;

  // Said before the sentences that credit the supports we did match, because it
  // is the one the reader needs first. Until now the accessibility sentences
  // only ever fired when the recommendation happened to provide what was asked
  // for, so someone who told us they cannot hear well and was handed a route
  // with no hearing support was told nothing at all about it — the single
  // largest gap the review named. The support criterion is worth 0.10 against
  // 0.70 for visit type and appointment, so it cannot turn the ranking over on
  // its own; saying plainly what was not matched, and that the alternatives are
  // where to look, is the honest way to close that.
  const unmet = supportModes.filter((m) => supports[SUPPORTS_KEY_BY_MODE[m] ?? ""] !== true);
  for (const mode of unmet) {
    const need = SUPPORT_NEED_LABEL[mode];
    if (!need) continue;
    push(
      "ACCESSIBILITY",
      `${need} 이 접수 경로에서는 제공되지 않습니다. 아래 대안에서 지원이 되는 경로를 고르실 수 있습니다.`,
    );
  }

  for (const mode of supportModes) {
    if (supports[SUPPORTS_KEY_BY_MODE[mode] ?? ""] !== true) continue;
    if (mode === "HEARING_SUPPORT") {
      push("ACCESSIBILITY", "청각 지원이 필요하다고 하셔서 자막·청각 보조가 되는 경로를 골랐습니다.");
    } else if (mode === "LARGE_TEXT") {
      push("ACCESSIBILITY", "큰 글씨가 필요하다고 하셔서 큰 글씨로 안내되는 경로를 골랐습니다.");
    } else if (mode === "STAFF_HELP") {
      push("ACCESSIBILITY", "직원 도움이 필요하다고 하셔서 직원이 함께 진행하는 경로를 골랐습니다.");
    }
  }

  if (excluded.length > 0) {
    push(
      "CONTEXT",
      `알려주신 내용과 맞지 않는 접수 경로 ${excluded.length}개는 빼고 골랐습니다.`,
    );
  }

  // Always last, and always present: the way out does not depend on the answers.
  push("SAFETY", "잘 맞지 않으면 직원 도움 요청으로 바로 넘어가실 수 있습니다.");
  return reasons;
}

/**
 * The three facts a check-in route is built from. None of them may be guessed:
 * routing someone to the wrong desk costs them their place in the queue, and
 * inferring a department from anything at all is the line we do not cross.
 */
function reconfirm(raw: SessionContext): ReconfirmRequest[] {
  const ctx = ctxOf(raw);
  const requests: ReconfirmRequest[] = [];

  if (!isAnswered(ctx.facts.visitType)) {
    requests.push({
      path: "/facts/visitType",
      question: "오늘 어떤 일로 오셨나요? 초진·재진·건강검진·검사 중에서 골라 주세요.",
      because: "방문 유형에 따라 접수하는 곳이 달라서, 확인하지 못하면 안내해 드릴 수 없습니다.",
    });
  }

  if (!isAnswered(ctx.facts.appointmentStatus)) {
    requests.push({
      path: "/facts/appointmentStatus",
      question: "예약하고 오셨나요?",
      because: "예약 여부에 따라 접수 창구가 달라집니다.",
    });
  }

  if (!isAnswered(ctx.facts.departmentId)) {
    requests.push({
      path: "/facts/departmentId",
      question: "어느 진료과로 가시는지 알려주세요. 모르시면 '미정 (안내 필요)'을 골라 주세요.",
      because:
        "증상을 보고 진료과를 판단하지 않습니다. 알려주신 진료과로만 안내해 드릴 수 있습니다.",
    });
  }

  return requests;
}

/**
 * Hospital answers live in `facts` — they are things that are true of the visit,
 * not wishes. The one exception is the support group, which is a preference and
 * speaks a different vocabulary than the kiosk buttons.
 */
function answerFor(group: OptionGroup, raw: SessionContext): unknown {
  const ctx = ctxOf(raw);
  switch (group.groupId) {
    case "VISIT_TYPE":
      return ctx.facts.visitType;
    case "APPOINTMENT":
      return ctx.facts.appointmentStatus;
    case "DEPARTMENT":
      return ctx.facts.departmentId as Department | undefined;
    case "SUPPORT": {
      const modes = ctx.preferences.supportModes ?? [];
      const mapped = modes.map((m) => SUPPORT_OPTION_BY_MODE[m]).find((id) => id !== undefined);
      // "지원 없음" is not a guess: it is the baseline every kiosk already
      // provides, and it is what asking for a mode this kiosk has no button for
      // honestly amounts to. The request survives in the profile either way.
      return mapped ?? "NONE";
    }
    default:
      return undefined;
  }
}

export const HOSPITAL: DomainSpec = registerDomain({
  environmentId: "hospital",
  task: "CHECK_IN",
  candidateNoun: "접수 경로",
  rules: [unavailable, appointmentMismatch, visitTypeMismatch, departmentMismatch],
  criteria: CRITERIA,
  tiebreak,
  explain,
  reconfirm,
  answerFor,
  candidateAction: "select_flow",
  actionByGroupKind: {
    visit_type: "select_visit_type",
    appointment: "check_appointment",
    department: "select_department",
    support: "select_support",
  },
});
