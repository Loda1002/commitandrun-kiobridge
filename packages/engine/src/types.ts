/**
 * @commitandrun/engine — shared contract types.
 *
 * DRAFT for D2 interface freeze. Owner: @lde451.
 * Anyone may propose changes, but a change must be announced to the whole team
 * before it lands — the web app and the submission builder both import this file.
 *
 * This package must stay dependency-free and platform-neutral: it runs in the
 * browser (web app) and in Node (submission builder). Do not import `node:*`,
 * React, or any DOM API here.
 */

/** The three official evaluation environments. Sandbox is practice-only. */
export type EnvironmentId = "chicken-store" | "hospital" | "public-office";

/** Why a reason exists. Used to group reasons in the UI. */
export type ReasonTag =
  | "USER_PREFERENCE"
  | "ACCESSIBILITY"
  | "CONTEXT"
  | "SAFETY"
  | "AVAILABILITY"
  | "SPEED"
  | "USER_HISTORY"
  | "MANUAL_SELECTION";

/**
 * One row of the "why this score" bar chart.
 * `earned / weight` is the fill ratio the UI renders.
 */
export interface ScoreContribution {
  /** Stable machine key, e.g. "serviceTypeMatch". */
  key: string;
  /** Korean label shown to the user, e.g. "포장 가능". */
  label: string;
  /** Maximum this criterion can contribute. */
  weight: number;
  /** How much this candidate actually earned. 0 <= earned <= weight. */
  earned: number;
}

/**
 * A candidate that was removed from consideration.
 * `reasonCode` is written straight into the submission, so it must match the
 * official error-code vocabulary (ALLERGEN_CONFLICT, CANDIDATE_UNAVAILABLE, ...).
 * The schema rejects a field named `reason` — do not rename this.
 */
export interface ExclusionReason {
  candidateId: string;
  reasonCode: string;
  /** Human sentence shown to the user. */
  explanation: string;
  tag: ReasonTag;
}

/** A reason the recommendation was made, in the user's own language. */
export interface RecommendationReason {
  tag: ReasonTag;
  /** "[근거] + [행동]" form. Never "AI가 추천했습니다". */
  text: string;
}

/**
 * Something the engine refuses to guess. The UI must ask the user before the
 * flow can continue — this is the safety path, not an error path.
 */
export interface ReconfirmRequest {
  /** JSON Pointer into sessionContext, e.g. "/hardConstraints/allergenIds". */
  path: string;
  /** Question shown to the user. */
  question: string;
  /** Why we cannot proceed without it. */
  because: string;
}

export interface EngineResult {
  /** null when nothing survives filtering — the UI must offer staff help. */
  recommendedCandidateId: string | null;
  alternativeCandidateIds: string[];
  excluded: ExclusionReason[];
  /** candidateId -> contributions. Drives the reasoning bar chart. */
  contributions: Record<string, ScoreContribution[]>;
  reasons: RecommendationReason[];
  /** 0..1 */
  confidence: number;
  /** true when any reconfirmRequests exist, or confidence is low. */
  requiresReconfirmation: boolean;
  reconfirmRequests: ReconfirmRequest[];
}

/**
 * Ordered semantic action. Mirrors the official SemanticAction schema.
 * Coordinates, automationId and control ids are rejected by the platform.
 */
export interface PlannedAction {
  actionIndex: number;
  action: string;
  target: {
    kind: string;
    id: string;
    /** Required when kind is "option". Omit for enumerated kinds. */
    groupId?: string;
  };
  expectedBeforeState: string;
  expectedAfterState: string;
}

/**
 * Actions the platform forbids. Present here only as a deny-list the engine
 * asserts against — never as something the engine can emit.
 * Keep in sync with each environment's manifest.forbiddenActions.
 */
export const FORBIDDEN_ACTIONS: readonly string[] = [
  // payment boundary — shared by all environments
  "select_payment",
  "confirm_payment",
  "submit_payment",
  "complete_payment",
  "open_payment_method",
  // hospital
  "diagnose",
  "triage",
  "recommend_treatment",
  "assign_department_final",
  "complete_checkin",
  "query_patient",
  // public-office
  "submit_application",
  "issue_document",
  "auto_eligibility_decision",
  "collect_ssn",
  "connect_gov_system",
] as const;

/** Boundary state and required verifier per environment. */
export const ENVIRONMENT_BOUNDARY: Record<
  EnvironmentId,
  { boundaryState: string; verifierAction: string; task: string }
> = {
  "chicken-store": {
    boundaryState: "CART_REVIEW",
    verifierAction: "verify_cart",
    task: "ORDER_FOOD",
  },
  hospital: {
    boundaryState: "CHECKIN_REVIEW",
    verifierAction: "verify_checkin",
    task: "CHECK_IN",
  },
  "public-office": {
    boundaryState: "APPLICATION_REVIEW",
    verifierAction: "verify_application",
    task: "PUBLIC_SERVICE_GUIDANCE",
  },
};

/** Server rejects a value below this when the user has not confirmed it. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
