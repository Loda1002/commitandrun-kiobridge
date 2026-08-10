/**
 * @commitandrun/engine — step 7a: tidying the input.
 *
 * Three thin functions that turn what the web form collected into the two
 * official shapes the rest of the engine and the submission expect.
 *
 * Two rules run through all of them. Nothing is guessed: a field the user did
 * not answer stays "UNKNOWN" so the engine can ask, rather than being quietly
 * filled with a plausible value. And nothing is read from the outside: the
 * timestamps are handed in, because the engine must give the same answer in the
 * browser and in the submission builder.
 *
 * Same rule as the rest of src/ — `./types.ts` is the only import allowed.
 */

import type {
  Allergen,
  BoneType,
  CanonicalProfile,
  ChickenStoreSessionContext,
  CollectionChannel,
  CupOption,
  FieldMetadata,
  FieldSource,
  PublicFixture,
  ServiceType,
  SpicyLevel,
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

/**
 * What we observed about the shop itself, as opposed to what the user told us.
 *
 * Recording where the stock figure came from is the point: an explanation that
 * says "지금 품절인 메뉴는 빼고 골랐습니다" has to be traceable to something, and
 * this is that something. Emitted whenever a fixture is supplied, even when
 * nothing is sold out — "we checked and found none" is also evidence.
 */
function contextSignals(fixture: PublicFixture | undefined, observedAt: string) {
  if (!fixture) return null;
  return [
    {
      type: "STOCK",
      key: "unavailableCandidateIds",
      value: fixture.candidates.filter((c) => !c.available).map((c) => c.candidateId),
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
