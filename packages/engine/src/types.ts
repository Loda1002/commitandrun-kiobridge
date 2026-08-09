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

/* ===========================================================================
 * Engine input — what the engine is fed.
 *
 * Everything below this line is COPIED BY HAND from the competition kit. It is
 * deliberately not imported: this package also runs in the deployed web app,
 * where the kit is not installed, so an import would break at build time.
 *
 * Sources mirrored (kit v5.1.6 RC4):
 *   kit/packages/profile-contract/src/enums.ts  — the official vocabularies
 *   kit/packages/profile-contract/src/types.ts  — CanonicalProfile, session contexts
 *   kit/packages/contracts/src/index.ts         — Candidate, PublicFixture
 *
 * If the kit is upgraded, re-check this block against those three files.
 * =========================================================================== */

// --- Official vocabularies (profile-contract/src/enums.ts) ------------------

export type CollectionChannel =
  | "WEB_FORM" | "MOBILE_APP" | "VOICE" | "CHATBOT" | "ASSISTED_INPUT" | "IMPORTED" | "OTHER";

export type PreferredInput = "TOUCH" | "VOICE" | "KEYBOARD" | "SWITCH" | "ASSISTED" | "MULTIMODAL";

export type RetentionPolicy = "SESSION_ONLY" | "UNTIL_USER_DELETES" | "NOT_STORED";

export type FieldSource =
  | "WEB_FORM" | "MOBILE_APP" | "VOICE" | "CHATBOT" | "ASSISTED_INPUT" | "IMPORTED"
  | "INFERRED" | "DEFAULTED" | "OTHER";

export type ServiceType = "DINE_IN" | "TAKE_OUT" | "NO_PREFERENCE" | "UNKNOWN";
export type SpicyLevel = "MILD" | "MEDIUM" | "HOT" | "NO_PREFERENCE" | "UNKNOWN";
export type BoneType = "BONE" | "BONELESS" | "NO_PREFERENCE" | "UNKNOWN";
export type CupOption = "PAPER" | "REGULAR" | "NONE" | "NO_PREFERENCE" | "UNKNOWN";
export type Allergen = "PEANUT" | "SOY" | "MILK" | "EGG" | "WHEAT" | "SHRIMP" | "UNKNOWN";

export type VisitType = "FIRST_VISIT" | "REVISIT" | "HEALTH_SCREENING" | "EXAM" | "UNKNOWN";
export type AppointmentStatus = "HAS_APPOINTMENT" | "NO_APPOINTMENT" | "UNKNOWN";
export type Department =
  | "INTERNAL_MEDICINE" | "ORTHOPEDICS" | "ENT" | "RADIOLOGY" | "HEALTH_SCREENING" | "UNSPECIFIED";
export type SupportMode =
  | "LARGE_TEXT" | "HEARING_SUPPORT" | "VISUAL_GUIDANCE" | "SIMPLE_STEPS" | "STAFF_HELP" | "GUARDIAN_MODE";

export type ServiceCategory = "RESIDENT" | "FAMILY" | "INSURANCE" | "TAX" | "STAFF" | "UNKNOWN";
export type AuthMethod =
  | "MOBILE_AUTH" | "ID_CARD" | "BIOMETRIC" | "STAFF_ASSIST" | "NONE" | "UNKNOWN";

export type IntentTask = "ORDER_FOOD" | "CHECK_IN" | "PUBLIC_SERVICE_GUIDANCE" | "PRACTICE";

/** Classification of the fixture data the platform hands us. */
export type DataClassification = "ACTUAL_EXTRACTED" | "SYNTHETIC_MOCK" | "PENDING_REAL_DEVICE";

// --- Profile (profile-contract/src/types.ts) --------------------------------

/** Long-lived, relatively stable information about the user. */
export interface CanonicalProfile {
  /** Pseudonymous id. NEVER a real identifier. */
  profileId: string;
  displayName?: string;
  dataClassification: "SYNTHETIC_PROFILE";
  source: {
    collectionChannel: CollectionChannel;
    providerId: string;
    /** ISO 8601 UTC, e.g. "2026-08-05T07:00:00.000Z". Local time is rejected. */
    collectedAt: string;
  };
  accessibility: {
    largeText: boolean;
    simpleSteps: boolean;
    visualGuidance: boolean;
    hearingSupport: boolean;
    mobilitySupport: boolean;
    highContrast: boolean;
    staffAssistancePreferred: boolean;
  };
  interaction: {
    preferredInput: PreferredInput;
    /** BCP 47 WITH region — "ko-KR" passes, bare "ko" is rejected. */
    language: string;
    confirmationRequired: boolean;
  };
  consent: {
    personalization: boolean;
    retentionPolicy: RetentionPolicy;
  };
}

/** The kit still exports this v4 alias; the task card uses this name. */
export type UserProfile = CanonicalProfile;

/** Provenance & trust for one normalized value. */
export interface FieldMetadata {
  source: FieldSource;
  /** 0..1 — how confident our own normalizer is. */
  confidence: number;
  confirmedByUser: boolean;
  capturedAt?: string;
  normalizerId?: string;
  /** Hash only — never the raw utterance or personal value. */
  originalValueHash?: string;
}

/**
 * Information that applies to THIS kiosk session only.
 *
 *  intent          — what the user is trying to do now
 *  facts           — objective, established truths
 *  preferences     — soft wishes; a mismatch lowers score, it does not exclude
 *  hardConstraints — violating these MUST exclude a candidate
 *  capabilities    — what the user can actually use right now
 *  fieldMetadata   — provenance keyed by JSON Pointer into this object
 */
export interface SessionContextBase {
  intent: { task: IntentTask; [k: string]: unknown };
  facts: Record<string, unknown>;
  preferences: Record<string, unknown>;
  hardConstraints: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  fieldMetadata: Record<string, FieldMetadata>;
  /**
   * Team-namespaced extensions, e.g. "COMMITANDRUN.contextSignals".
   * The kit's TS type omits this, but session-context-base.schema.json declares
   * it and our submission uses it — so it belongs here.
   */
  extensions?: Record<string, unknown>;
}

export interface ChickenStoreSessionContext extends SessionContextBase {
  intent: { task: "ORDER_FOOD" };
  facts: Record<string, never>;
  preferences: {
    serviceType?: ServiceType;
    spicyLevel?: SpicyLevel;
    boneType?: BoneType;
    cupOption?: CupOption;
    quantity?: number;
  };
  hardConstraints: {
    allergenIds?: Allergen[];
    maxPriceKrw?: number;
  };
  capabilities: Record<string, never>;
}

export interface HospitalSessionContext extends SessionContextBase {
  intent: { task: "CHECK_IN" };
  facts: {
    visitType?: VisitType;
    appointmentStatus?: AppointmentStatus;
    departmentId?: Department;
    guardianPresent?: boolean;
  };
  preferences: { supportModes?: SupportMode[] };
  /** Medical inference is never allowed — the field exists to make that explicit. */
  hardConstraints: { medicalInferenceAllowed?: false };
  capabilities: { canUseSelfCheckIn?: boolean };
}

export interface PublicOfficeSessionContext extends SessionContextBase {
  intent: { task: "PUBLIC_SERVICE_GUIDANCE"; requestedServiceId?: string };
  facts: { serviceCategory?: ServiceCategory };
  preferences: { stepByStep?: boolean; simpleLanguage?: boolean };
  hardConstraints: { legalEligibilityInferenceAllowed?: false };
  capabilities: { availableAuthMethods?: AuthMethod[] };
}

/**
 * One context type covering the three official environments.
 * Sandbox is practice-only and is intentionally left out, matching
 * `EnvironmentId` and `ENVIRONMENT_BOUNDARY` above.
 */
export type SessionContext =
  | ChickenStoreSessionContext
  | HospitalSessionContext
  | PublicOfficeSessionContext;

// --- Environment fixture (contracts/src/index.ts) ---------------------------

/** One thing the user can pick: a menu item, a department, a civil service. */
export interface Candidate {
  candidateId: string;
  name: string;
  domain: EnvironmentId;
  /** false means sold out / closed. Filtering must drop these, not just score them down. */
  available: boolean;
  dataClassification: DataClassification;
  price?: number;
  description?: string;
  /** groupId -> allowed option ids. Used by semantic validation. */
  supportedOptions?: Record<string, string[]>;
  attributes?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  supports?: Record<string, unknown>;
}

export interface OptionValue {
  id: string;
  label: string;
  /** Optional numeric payload (e.g. QUANTITY). */
  value?: number;
}

export interface OptionGroup {
  groupId: string;
  label: string;
  required: boolean;
  /** Semantic target kind this group backs (e.g. "service_type"). */
  kind?: string;
  /** When true the plan may select several values (e.g. support modes). */
  multiSelect?: boolean;
  options: OptionValue[];
}

export interface ScreenDef {
  state: string;
  title: string;
  /** Semantic target kinds selectable on this screen. */
  targetKinds: string[];
  progress: number;
  isFinalReview?: boolean;
  hint?: string;
}

/** Legal state move. The plan's expectedBefore/AfterState must follow these. */
export interface Transition {
  from: string;
  action: string;
  to: string;
  /** e.g. "readOnly" for verifier actions. */
  guards?: string[];
}

export type SafetyRuleId =
  | "REQUIRE_USER_CONFIRMATION"
  | "BLOCK_PAYMENT_ACTION"
  | "BLOCK_ACTUAL_DEVICE_COMMAND"
  | "UNKNOWN_STATE_STOP"
  | "STATE_MISMATCH_STOP"
  | "UNAVAILABLE_CANDIDATE_BLOCK"
  | "ALLERGEN_CONFLICT_BLOCK"
  | "FINAL_BOUNDARY_STOP"
  | "VERIFY_CART_READ_ONLY";

export interface SafetyRuleDef {
  ruleId: SafetyRuleId;
  description: string;
  severity: "BLOCK" | "STOP";
}

export interface EnvironmentManifest {
  environmentId: EnvironmentId;
  name: string;
  displayName?: string;
  description: string;
  summary: string;
  testFocus: string;
  fixtureVersion: string;
  dataClassification: DataClassification;
  states: string[];
  initialState: string;
  /** The plan must stop here. See ENVIRONMENT_BOUNDARY above. */
  reviewBoundaryState: string;
  requiredVerifierAction: string;
  terminalState: string;
  allowedActions: string[];
  /** Emitting any of these fails the run. See FORBIDDEN_ACTIONS above. */
  forbiddenActions: string[];
  sandbox?: boolean;
  inputContract: {
    version: string;
    schemaRef: string;
    vocabularyRef: string;
  };
  supportedProfileContractVersions: string[];
}

export type SimulationTemplate =
  | "LANDING"
  | "TWO_COLUMN_SELECTION"
  | "FOUR_CARD_GRID"
  | "OPTION_GROUP_LIST"
  | "ORDER_REVIEW"
  | "HOSPITAL_REVIEW"
  | "PUBLIC_SERVICE_REVIEW"
  | "BASIC_SANDBOX_REVIEW";

export interface SimulationScreenBinding {
  template: SimulationTemplate;
  dataSource?: "candidates" | "option-groups" | "review";
  /** groupIds rendered on this screen when dataSource === "option-groups". */
  groups?: string[];
  /** Cards per page for FOUR_CARD_GRID. A kiosk shows a page, not a list. */
  pageSize?: number;
  navigation?: { enabled: boolean; classification: "SYNTHETIC_MOCK" };
}

export interface SimulationBinding {
  driver: "SIMULATION";
  screens: Record<string, SimulationScreenBinding>;
}

/**
 * The environment data the platform hands us. Layout templates only — it
 * carries no coordinates and no profile data.
 *
 * `compatibilityRules` and `reviewMapping` are left opaque on purpose: the
 * platform executes them, the engine never reads them. Transcribing that rule
 * DSL would be ~150 lines we would then have to keep in sync for nothing. If we
 * ever want to self-check against them, copy the shapes from
 * kit/packages/contracts/src/index.ts and narrow these two fields then.
 */
export interface PublicFixture {
  manifest: EnvironmentManifest;
  candidates: Candidate[];
  optionGroups: OptionGroup[];
  screens: ScreenDef[];
  transitions: Transition[];
  safetyRules: SafetyRuleDef[];
  simulationBinding: SimulationBinding;
  compatibilityRules?: unknown;
  reviewMapping?: unknown;
}

// --- The input itself -------------------------------------------------------

/**
 * Everything the engine needs to produce an EngineResult.
 *
 * The engine is a pure function of this: same input, same output. No clock, no
 * network, no file system — the web app and the submission builder must be able
 * to call it and get identical results.
 */
export interface EngineInput {
  environmentId: EnvironmentId;
  fixture: PublicFixture;
  profile: UserProfile;
  sessionContext: SessionContext;
}
