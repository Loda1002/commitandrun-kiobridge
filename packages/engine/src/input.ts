/**
 * @commitandrun/engine — tidying the input.
 *
 * Turns what a form collected into the two official shapes the rest of the
 * engine and the submission expect: a `CanonicalProfile` and one of the three
 * session contexts.
 *
 * Two rules run through all of it. Nothing is guessed: a field the user did not
 * answer stays "UNKNOWN" so the engine can ask, rather than being quietly
 * filled with a plausible value. And nothing is read from the outside: the
 * timestamps are handed in, because the engine must give the same answer in the
 * browser and in the submission builder.
 *
 * Where each environment keeps its answers is not a detail we get to choose —
 * the platform's context schemas do. A chicken shop's answers are preferences,
 * a hospital's are mostly facts about the visit, and a public office splits
 * them between facts and capabilities. The three builders below follow that,
 * and `domains/*.ts` reads them back from the same places.
 *
 * Same rule as the rest of src/ — `./types.ts` is the only import allowed.
 */

import type {
  Allergen,
  AppointmentStatus,
  AuthMethod,
  BoneType,
  CanonicalProfile,
  ChickenStoreSessionContext,
  CollectionChannel,
  CupOption,
  Department,
  EnvironmentId,
  FieldMetadata,
  FieldSource,
  HospitalSessionContext,
  PublicFixture,
  PublicOfficeSessionContext,
  ServiceCategory,
  ServiceType,
  SessionContext,
  SpicyLevel,
  SupportMode,
  VisitType,
} from "./types.ts";

/** The value every question falls back to. The engine may never guess past it. */
const UNANSWERED = "UNKNOWN";

/**
 * Runtime copy of the `Allergen` union in types.ts, which is a type and so
 * cannot be checked at run time. An id outside this set is not "an allergen we
 * happen not to know" — it is an answer we failed to understand, and treating
 * it as absent would turn the allergy filter into a no-op without telling
 * anyone. Anything unrecognised becomes UNKNOWN so the engine stops and asks.
 */
const KNOWN_ALLERGENS = new Set(["PEANUT", "SOY", "MILK", "EGG", "WHEAT", "SHRIMP", UNANSWERED]);

/**
 * The answers the order form collects.
 *
 * Mirrors `Answers` in apps/web/lib/types.ts. It is redeclared rather than
 * imported because the web app maps `@commitandrun/engine` to types.ts alone —
 * the two must be kept in step by hand.
 */
export interface WebAnswers {
  serviceType: string;
  spicyLevel: string;
  boneType: string;
  cupOption: string;
  quantity: string;
  /** `["UNKNOWN"]` means the user does not know. `[]` means "I have none". */
  allergenIds: string[];
  /** null means no limit was given — not 0. */
  maxPriceKrw: number | null;
}

/** Who collected the profile and when. The engine cannot know either. */
export interface ProfileSource {
  /** Pseudonymous. Never a real identifier. */
  profileId: string;
  /** ISO 8601 UTC, e.g. "2026-08-05T07:00:00.000Z". Local time is rejected. */
  collectedAt: string;
  providerId: string;
  collectionChannel?: CollectionChannel;
  accessibility?: Partial<CanonicalProfile["accessibility"]>;
  interaction?: Partial<CanonicalProfile["interaction"]>;
  consent?: Partial<CanonicalProfile["consent"]>;
}

/** Where this session's answers came from, and which ones the user re-checked. */
export interface AnswerProvenance {
  /** ISO 8601 UTC. Handed in — this package never reads a clock. */
  capturedAt: string;
  source?: FieldSource;
  /** JSON Pointers the user confirmed on the review screen. */
  confirmedPaths?: string[];
}

/**
 * Take whatever the form posted and return a complete answer set.
 *
 * A missing field becomes "UNKNOWN" rather than disappearing, so a question the
 * user skipped is visible to the engine instead of looking like it was never
 * asked. Allergens are the one place the difference matters: an absent key is
 * "did not answer", while an empty array is the user actively saying they have
 * none. The form must only send `[]` when the user picked "없음".
 */
export function collectProfile(raw: Partial<WebAnswers> | null | undefined): WebAnswers {
  const a = raw ?? {};
  return {
    serviceType: answered(a.serviceType),
    spicyLevel: answered(a.spicyLevel),
    boneType: answered(a.boneType),
    cupOption: answered(a.cupOption),
    quantity: answered(a.quantity),
    allergenIds: a.allergenIds ? [...a.allergenIds] : [UNANSWERED],
    maxPriceKrw: typeof a.maxPriceKrw === "number" ? a.maxPriceKrw : null,
  };
}

function answered(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : UNANSWERED;
}

/**
 * Build the official profile.
 *
 * The three fixed values (`SYNTHETIC_PROFILE`, the channel, the provider) are
 * set here so no caller can get them wrong. Accessibility flags default to
 * false, which is not a guess — false is "no extra support requested", the
 * baseline every kiosk already provides.
 */
export function mapToCanonicalInput(source: ProfileSource): CanonicalProfile {
  requireUtc(source.collectedAt, "collectedAt");

  const language = source.interaction?.language ?? "ko-KR";
  // types.ts: "ko-KR" passes, bare "ko" is rejected. Catch it here rather than
  // at submission time, where the message is far less obvious.
  if (!language.includes("-")) {
    throw new Error(`mapToCanonicalInput: language must carry a region, got "${language}"`);
  }

  return {
    profileId: source.profileId,
    dataClassification: "SYNTHETIC_PROFILE",
    source: {
      collectionChannel: source.collectionChannel ?? "WEB_FORM",
      providerId: source.providerId,
      collectedAt: source.collectedAt,
    },
    accessibility: {
      largeText: false,
      simpleSteps: false,
      visualGuidance: false,
      hearingSupport: false,
      mobilitySupport: false,
      highContrast: false,
      staffAssistancePreferred: false,
      ...source.accessibility,
    },
    // Spelled out rather than spread so the keys land in the order types.ts
    // declares them, which keeps the produced JSON diffable against golden.
    interaction: {
      preferredInput: source.interaction?.preferredInput ?? "TOUCH",
      language,
      confirmationRequired: source.interaction?.confirmationRequired ?? true,
    },
    consent: {
      // Off unless the user opted in — the privacy-preserving default.
      personalization: false,
      retentionPolicy: "SESSION_ONLY",
      ...source.consent,
    },
  };
}

/**
 * Build this session's context.
 *
 * Only answered fields reach `preferences`; an unanswered one is left out so a
 * later reader cannot mistake a placeholder for a choice. Allergens are the
 * exception and are always carried, "UNKNOWN" included, because the engine has
 * to see the question is still open before it recommends anything.
 */
export function createSessionContext(
  answers: WebAnswers,
  provenance: AnswerProvenance,
  fixture?: PublicFixture,
): ChickenStoreSessionContext {
  requireUtc(provenance.capturedAt, "capturedAt");

  const fieldMetadata: Record<string, FieldMetadata> = {};
  const record = (path: string, confidence: number) => {
    fieldMetadata[path] = {
      source: provenance.source ?? "WEB_FORM",
      confidence,
      confirmedByUser: provenance.confirmedPaths?.includes(path) ?? false,
      capturedAt: provenance.capturedAt,
    };
  };

  const preferences: ChickenStoreSessionContext["preferences"] = {};
  if (isAnswered(answers.serviceType)) {
    preferences.serviceType = answers.serviceType as ServiceType;
    record("/preferences/serviceType", 1);
  }
  if (isAnswered(answers.spicyLevel)) {
    preferences.spicyLevel = answers.spicyLevel as SpicyLevel;
    record("/preferences/spicyLevel", 1);
  }
  if (isAnswered(answers.boneType)) {
    preferences.boneType = answers.boneType as BoneType;
    record("/preferences/boneType", 1);
  }
  if (isAnswered(answers.cupOption)) {
    preferences.cupOption = answers.cupOption as CupOption;
    record("/preferences/cupOption", 1);
  }
  const quantity = Number(answers.quantity);
  if (isAnswered(answers.quantity) && Number.isInteger(quantity) && quantity > 0) {
    preferences.quantity = quantity;
    record("/preferences/quantity", 1);
  }

  const allergenIds = [
    ...new Set(answers.allergenIds.map((a) => (KNOWN_ALLERGENS.has(a) ? a : UNANSWERED))),
  ] as Allergen[];
  const hardConstraints: ChickenStoreSessionContext["hardConstraints"] = { allergenIds };
  // An allergy we have not established is recorded at zero confidence, so the
  // value never passes for something the user actually told us.
  record("/hardConstraints/allergenIds", allergenIds.includes(UNANSWERED) ? 0 : 1);

  if (answers.maxPriceKrw !== null) {
    hardConstraints.maxPriceKrw = answers.maxPriceKrw;
    record("/hardConstraints/maxPriceKrw", 1);
  }

  const ctx: ChickenStoreSessionContext = {
    intent: { task: "ORDER_FOOD" },
    facts: {},
    preferences,
    hardConstraints,
    capabilities: {},
    fieldMetadata,
  };

  const signals = contextSignals(fixture, provenance.capturedAt);
  if (signals) ctx.extensions = { "COMMITANDRUN.contextSignals": signals };
  return ctx;
}

/* ===========================================================================
 * hospital
 * =========================================================================== */

/**
 * Runtime copies of the type unions, which cannot be checked at run time.
 *
 * Same reasoning as KNOWN_ALLERGENS above: a value outside these sets is not
 * "an option we happen not to know", it is an answer we failed to understand.
 * Letting it through would route someone to a desk on the strength of a string
 * nobody recognised, so it becomes UNKNOWN and the engine stops and asks.
 */
const KNOWN_VISIT_TYPES = new Set(["FIRST_VISIT", "REVISIT", "HEALTH_SCREENING", "EXAM"]);
const KNOWN_APPOINTMENT = new Set(["HAS_APPOINTMENT", "NO_APPOINTMENT"]);
const KNOWN_DEPARTMENTS = new Set([
  "INTERNAL_MEDICINE", "ORTHOPEDICS", "ENT", "RADIOLOGY", "HEALTH_SCREENING", "UNSPECIFIED",
]);
const KNOWN_SUPPORT_MODES = new Set([
  "LARGE_TEXT", "HEARING_SUPPORT", "VISUAL_GUIDANCE", "SIMPLE_STEPS", "STAFF_HELP", "GUARDIAN_MODE",
]);

/** The answers a hospital check-in form collects. */
export interface HospitalAnswers {
  visitType: string;
  appointmentStatus: string;
  /** "UNSPECIFIED" is a real answer — "미정 (안내 필요)". Only "" or UNKNOWN is not. */
  departmentId: string;
  /** Empty means no extra support requested, which is the baseline, not a gap. */
  supportModes: string[];
  /** null means the form did not ask. */
  guardianPresent: boolean | null;
}

/**
 * Build a hospital session context.
 *
 * The three routing answers land in `facts` rather than `preferences` because
 * that is what they are: things that are true of this visit, not wishes about
 * it. `medicalInferenceAllowed: false` is written every time and is not a
 * setting — it is us recording, in the submission itself, that nothing here
 * inferred a department from a symptom.
 */
export function createHospitalSessionContext(
  answers: HospitalAnswers,
  provenance: AnswerProvenance,
  fixture?: PublicFixture,
): HospitalSessionContext {
  requireUtc(provenance.capturedAt, "capturedAt");
  const { fieldMetadata, record } = recorder(provenance);

  const facts: HospitalSessionContext["facts"] = {};
  const visitType = known(answers.visitType, KNOWN_VISIT_TYPES);
  if (visitType) {
    facts.visitType = visitType as VisitType;
    record("/facts/visitType", 1);
  }
  const appointment = known(answers.appointmentStatus, KNOWN_APPOINTMENT);
  if (appointment) {
    facts.appointmentStatus = appointment as AppointmentStatus;
    record("/facts/appointmentStatus", 1);
  }
  const department = known(answers.departmentId, KNOWN_DEPARTMENTS);
  if (department) {
    facts.departmentId = department as Department;
    // "미정" is an answer about not knowing, so it is recorded as one — full
    // confidence that the user told us they do not know which department.
    record("/facts/departmentId", 1);
  }
  if (answers.guardianPresent !== null) {
    facts.guardianPresent = answers.guardianPresent;
    record("/facts/guardianPresent", 1);
  }

  const supportModes = [
    ...new Set(answers.supportModes.filter((m) => KNOWN_SUPPORT_MODES.has(m))),
  ] as SupportMode[];
  const preferences: HospitalSessionContext["preferences"] = {};
  if (supportModes.length > 0) {
    preferences.supportModes = supportModes;
    record("/preferences/supportModes", 1);
  }

  const ctx: HospitalSessionContext = {
    intent: { task: "CHECK_IN" },
    facts,
    preferences,
    // Not a toggle. The platform forbids diagnose/triage outright, and this
    // says so in the submission rather than only in our code.
    hardConstraints: { medicalInferenceAllowed: false },
    capabilities: { canUseSelfCheckIn: true },
    fieldMetadata,
  };

  const signals = contextSignals(fixture, provenance.capturedAt);
  if (signals) ctx.extensions = { "COMMITANDRUN.contextSignals": signals };
  return ctx;
}

/* ===========================================================================
 * public-office
 * =========================================================================== */

const KNOWN_CATEGORIES = new Set(["RESIDENT", "FAMILY", "INSURANCE", "TAX", "STAFF"]);
const KNOWN_AUTH_METHODS = new Set([
  "MOBILE_AUTH", "ID_CARD", "BIOMETRIC", "STAFF_ASSIST", "NONE",
]);

/** The answers a public-office guidance form collects. */
export interface PublicOfficeAnswers {
  serviceCategory: string;
  /**
   * Which KINDS of proof the user can produce today. Never the proof itself —
   * `collect_ssn` is a forbidden action and no identifier is collected here.
   */
  availableAuthMethods: string[];
  stepByStep: boolean | null;
  simpleLanguage: boolean | null;
}

/**
 * Build a public-office session context.
 *
 * `legalEligibilityInferenceAllowed: false` is written every time, for the same
 * reason the hospital records its medical equivalent: the submission itself
 * should carry the statement that entitlement was never judged.
 */
export function createPublicOfficeSessionContext(
  answers: PublicOfficeAnswers,
  provenance: AnswerProvenance,
  fixture?: PublicFixture,
): PublicOfficeSessionContext {
  requireUtc(provenance.capturedAt, "capturedAt");
  const { fieldMetadata, record } = recorder(provenance);

  const facts: PublicOfficeSessionContext["facts"] = {};
  const category = known(answers.serviceCategory, KNOWN_CATEGORIES);
  if (category) {
    facts.serviceCategory = category as ServiceCategory;
    record("/facts/serviceCategory", 1);
  }

  const preferences: PublicOfficeSessionContext["preferences"] = {};
  if (answers.stepByStep !== null) {
    preferences.stepByStep = answers.stepByStep;
    record("/preferences/stepByStep", 1);
  }
  if (answers.simpleLanguage !== null) {
    preferences.simpleLanguage = answers.simpleLanguage;
    record("/preferences/simpleLanguage", 1);
  }

  const availableAuthMethods = [
    ...new Set(answers.availableAuthMethods.filter((m) => KNOWN_AUTH_METHODS.has(m))),
  ] as AuthMethod[];
  const capabilities: PublicOfficeSessionContext["capabilities"] = {};
  if (availableAuthMethods.length > 0) {
    capabilities.availableAuthMethods = availableAuthMethods;
    record("/capabilities/availableAuthMethods", 1);
  }

  const ctx: PublicOfficeSessionContext = {
    intent: { task: "PUBLIC_SERVICE_GUIDANCE" },
    facts,
    preferences,
    hardConstraints: { legalEligibilityInferenceAllowed: false },
    capabilities,
    fieldMetadata,
  };

  const signals = contextSignals(fixture, provenance.capturedAt);
  if (signals) ctx.extensions = { "COMMITANDRUN.contextSignals": signals };
  return ctx;
}

/* ===========================================================================
 * shared
 * =========================================================================== */

/**
 * The value if we recognise it, otherwise undefined — which leaves the field
 * out of the context entirely rather than storing a placeholder a later reader
 * could mistake for a choice.
 */
function known(value: string | undefined, vocabulary: ReadonlySet<string>): string | undefined {
  const trimmed = value?.trim();
  return trimmed && vocabulary.has(trimmed) ? trimmed : undefined;
}

/** Collects provenance as fields are written, so the two cannot drift apart. */
function recorder(provenance: AnswerProvenance) {
  const fieldMetadata: Record<string, FieldMetadata> = {};
  const record = (path: string, confidence: number): void => {
    fieldMetadata[path] = {
      source: provenance.source ?? "WEB_FORM",
      confidence,
      confirmedByUser: provenance.confirmedPaths?.includes(path) ?? false,
      capturedAt: provenance.capturedAt,
    };
  };
  return { fieldMetadata, record };
}

/** Complete a hospital answer set. A missing list is empty, not absent. */
export function collectHospitalAnswers(
  raw: Partial<HospitalAnswers> | null | undefined,
): HospitalAnswers {
  const a = raw ?? {};
  return {
    visitType: answered(a.visitType),
    appointmentStatus: answered(a.appointmentStatus),
    departmentId: answered(a.departmentId),
    supportModes: a.supportModes ? [...a.supportModes] : [],
    guardianPresent: typeof a.guardianPresent === "boolean" ? a.guardianPresent : null,
  };
}

/** Complete a public-office answer set. */
export function collectPublicOfficeAnswers(
  raw: Partial<PublicOfficeAnswers> | null | undefined,
): PublicOfficeAnswers {
  const a = raw ?? {};
  return {
    serviceCategory: answered(a.serviceCategory),
    availableAuthMethods: a.availableAuthMethods ? [...a.availableAuthMethods] : [],
    stepByStep: typeof a.stepByStep === "boolean" ? a.stepByStep : null,
    simpleLanguage: typeof a.simpleLanguage === "boolean" ? a.simpleLanguage : null,
  };
}

/**
 * Normalise whatever a form posted and build the context for that environment.
 *
 * One entry point so the web app and the submission builder cannot end up
 * normalising differently — which is the whole reason the two share an engine.
 * The answer shapes have nothing in common, so the caller hands in the one that
 * matches; the vocabulary filtering inside each builder is what actually checks
 * that claim, and anything unrecognised becomes an unanswered question.
 */
export function createContextFor(
  environmentId: EnvironmentId,
  answers: Record<string, unknown> | null | undefined,
  provenance: AnswerProvenance,
  fixture?: PublicFixture,
): SessionContext {
  switch (environmentId) {
    case "chicken-store":
      return createSessionContext(
        collectProfile(answers as Partial<WebAnswers>),
        provenance,
        fixture,
      );
    case "hospital":
      return createHospitalSessionContext(
        collectHospitalAnswers(answers as Partial<HospitalAnswers>),
        provenance,
        fixture,
      );
    case "public-office":
      return createPublicOfficeSessionContext(
        collectPublicOfficeAnswers(answers as Partial<PublicOfficeAnswers>),
        provenance,
        fixture,
      );
  }
}

/**
 * What we observed about the shop itself, as opposed to what the user told us.
 *
 * Recording where the stock figure came from is the point: an explanation that
 * says "지금 품절인 메뉴는 빼고 골랐습니다" has to be traceable to something, and
 * this is that something.
 *
 * Only reported when something actually is sold out. This used to fire for every
 * fixture on the reasoning that "we checked and found none" is also evidence,
 * and the official CLI reads it the other way round: declaring a context signal
 * is a claim that the signal shaped the recommendation, so it checks the reason
 * sentences for it and fails when none mention it. Hospital and public-office
 * have no sold-out candidates, so they were declaring a signal that could not
 * appear in any explanation — `외부 맥락이 추천 이유에 반영됨` FAIL on both.
 * An empty observation is better left unsaid than declared and unused.
 * chicken-store does have one, so its signal and its submission are unchanged.
 */
function contextSignals(fixture: PublicFixture | undefined, observedAt: string) {
  if (!fixture) return null;
  const unavailable = fixture.candidates.filter((c) => !c.available).map((c) => c.candidateId);
  if (unavailable.length === 0) return null;
  return [
    {
      type: "STOCK",
      key: "unavailableCandidateIds",
      value: unavailable,
      source: `environment-fixture:${fixture.manifest.environmentId}/candidates.json#available`,
      observedAt,
    },
  ];
}

function isAnswered(value: string): boolean {
  return value !== UNANSWERED && value !== "NO_PREFERENCE" && value.length > 0;
}

/** The platform rejects local time. Fail here, where the cause is obvious. */
function requireUtc(timestamp: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(timestamp)) {
    throw new Error(`${field} must be ISO 8601 UTC ending in Z, got "${timestamp}"`);
  }
}
