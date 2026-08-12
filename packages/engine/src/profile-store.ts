/**
 * @commitandrun/engine — remembering someone who has been here before.
 *
 * Today a returning user answers the same seven questions from scratch, and the
 * text size and contrast they set are gone the moment the screen resets. For the
 * people this service exists for, answering again IS the barrier — so a service
 * that forgets has trouble explaining why it should exist.
 *
 * These four functions decide what is worth remembering and how to put it back.
 * They do not do the remembering: `localStorage` is a browser API and this
 * package also runs in Node, so the screen owns the storage and hands the raw
 * string in and out. Same rule as the clock in input.ts — `savedAt` arrives as
 * an argument, never from a call to `Date.now()`.
 *
 * What is deliberately NOT kept is the more important half; see StoredProfile.
 *
 * Same rule as the rest of src/ — `./types.ts` is the only import allowed.
 */

import type { CanonicalProfile, EnvironmentId, PreferredInput } from "./types.ts";

/**
 * Bumped whenever the shape below changes. A store written by any other version
 * is discarded rather than migrated: the whole thing is a convenience, and the
 * cost of throwing it away is one round of questions, while the cost of
 * half-reading an old shape is a profile nobody can account for.
 */
export const STORED_PROFILE_VERSION = 1;

/**
 * The only things we are willing to carry between visits.
 *
 * The list is short on purpose. It holds no identifier, no name, no contact
 * detail — `CanonicalProfile.displayName` is left out even though it sits right
 * next to the fields we do take. Nothing here can identify the person; it only
 * describes how they like a kiosk to behave.
 *
 * It also holds no provenance. `FieldMetadata.confirmedByUser` has no home in
 * this shape, and that is the single most important decision in this file — see
 * `lastAnswers`.
 */
export interface StoredProfile {
  version: number;
  /** Same shape as `CanonicalProfile["accessibility"]`, so the two stay in step. */
  accessibility: CanonicalProfile["accessibility"];
  interaction: CanonicalProfile["interaction"];
  /**
   * What was answered last time, per environment — a hospital visit and a
   * chicken order have nothing in common, so they never share a slot.
   *
   * These are remembered ANSWERS, not established facts. "지난번엔 이렇게
   * 말씀하셨어요" is a different claim from "지금도 그렇습니다", and allergies
   * are where the difference can hurt someone: a stored `["PEANUT"]` is a
   * prompt to ask again, not permission to skip the question. So no
   * confirmation flag is stored with them, and everything recalled here comes
   * back unconfirmed — `createSessionContext` will record
   * `confirmedByUser: false` because the caller has no confirmed path to pass,
   * and the screen has to ask before the order goes anywhere.
   */
  lastAnswers: Record<string, Record<string, unknown>>;
  /** ISO 8601 UTC, handed in. Shown to the user; never used to decide anything. */
  savedAt: string;
}

const ACCESSIBILITY_KEYS = [
  "largeText",
  "simpleSteps",
  "visualGuidance",
  "hearingSupport",
  "mobilitySupport",
  "highContrast",
  "staffAssistancePreferred",
] as const;

/**
 * Runtime copy of the `PreferredInput` union in types.ts, which is a type and so
 * cannot be checked at run time. Same reasoning as `KNOWN_ALLERGENS` in
 * input.ts: storage is a value we do not control, and a word nobody recognises
 * must not ride into a submission on the strength of having been in
 * localStorage.
 */
const KNOWN_PREFERRED_INPUTS = new Set([
  "TOUCH", "VOICE", "KEYBOARD", "SWITCH", "ASSISTED", "MULTIMODAL",
]);

/**
 * Answer keys that must never reach the store.
 *
 * The three answer shapes in input.ts carry option ids only, so nothing matches
 * this today. But `answers` arrives as `Record<string, unknown>` — an untyped
 * door into a file whose one hard rule is that no personal data is written down.
 * Matching on the key name is enough here: dropping a field costs one question,
 * and storing a name or a card number is not a mistake we would get to fix
 * afterwards.
 */
const PERSONAL_KEY_PATTERN =
  /name|phone|tel|mobile|email|ssn|resident|patient|card|birth|address/i;

/**
 * Pick out the part of this session worth keeping.
 *
 * Accessibility and interaction are copied field by field rather than spread, so
 * the set of things that can leave this function is fixed by the list above and
 * not by whatever the caller's object happens to carry.
 */
export function toStoredProfile(
  profile: CanonicalProfile,
  environmentId: EnvironmentId,
  answers: Record<string, unknown>,
  savedAt: string,
): StoredProfile {
  return {
    version: STORED_PROFILE_VERSION,
    accessibility: pickAccessibility(profile.accessibility),
    // Spelled out for the same reason input.ts spells it out — the keys land in
    // the order types.ts declares them, and nothing else can come along.
    interaction: {
      preferredInput: profile.interaction.preferredInput,
      language: profile.interaction.language,
      confirmationRequired: profile.interaction.confirmationRequired,
    },
    lastAnswers: { [environmentId]: sanitizeAnswers(answers) },
    savedAt,
  };
}

/**
 * Read back what was stored, or `null` if it cannot be trusted.
 *
 * This never throws, whatever it is handed. Storage is outside our control —
 * another tab, an older build, or someone with the dev tools open can put
 * anything in it — so every failure has the same answer: forget it and ask the
 * questions again. A store we half-understand is worse than no store.
 */
export function parseStoredProfile(raw: string | null): StoredProfile | null {
  if (typeof raw !== "string" || raw.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== STORED_PROFILE_VERSION) return null;
  if (typeof parsed.savedAt !== "string") return null;

  const accessibility = readAccessibility(parsed.accessibility);
  const interaction = readInteraction(parsed.interaction);
  const lastAnswers = readLastAnswers(parsed.lastAnswers);
  if (!accessibility || !interaction || !lastAnswers) return null;

  return {
    version: STORED_PROFILE_VERSION,
    accessibility,
    interaction,
    lastAnswers,
    savedAt: parsed.savedAt,
  };
}

/**
 * Lay the remembered settings over a fresh profile.
 *
 * Everything else on `base` survives — `profileId`, `source`, `consent`, and
 * `displayName` if this session has one. Those belong to the visit happening
 * now; the store has no business overwriting them, and consent in particular is
 * never restored, so an opt-in from a previous visit cannot quietly carry over.
 */
export function applyStoredProfile(
  base: CanonicalProfile,
  stored: StoredProfile,
): CanonicalProfile {
  return {
    ...base,
    accessibility: pickAccessibility(stored.accessibility),
    interaction: {
      preferredInput: stored.interaction.preferredInput,
      language: stored.interaction.language,
      confirmationRequired: stored.interaction.confirmationRequired,
    },
  };
}

/**
 * What this person answered here last time. Empty when there is nothing to go
 * on, which is also what a caller gets for an environment they have not used —
 * the answers are keyed by environment precisely so they cannot bleed across.
 *
 * The result is a starting point for the form, not a set of established
 * answers. Nothing in it is confirmed; see `StoredProfile.lastAnswers`.
 */
export function recallAnswers(
  stored: StoredProfile | null,
  environmentId: EnvironmentId,
): Record<string, unknown> {
  const answers = ownAnswersFor(stored, environmentId);
  // Sanitised again on the way out, not because parseStoredProfile skipped it,
  // but because this is the boundary a caller keeps the result past: they get a
  // record of their own, with no array still wired back into the store.
  return answers ? sanitizeAnswers(answers) : {};
}

/* ===========================================================================
 * private
 * =========================================================================== */

function pickAccessibility(
  source: CanonicalProfile["accessibility"],
): CanonicalProfile["accessibility"] {
  const picked: Record<string, boolean> = {};
  for (const key of ACCESSIBILITY_KEYS) picked[key] = source[key];
  return picked as CanonicalProfile["accessibility"];
}

/**
 * Copy an answer set into a record that is safe to keep, which means three
 * things: no personal key survives, no array is still shared with whoever
 * handed it in, and `__proto__` is dropped rather than assigned.
 *
 * That last one is not hypothetical. `JSON.parse` turns a `"__proto__"` key
 * into a real own property, and writing it back with `record[key] = value`
 * re-points the record's prototype instead of adding an entry — so a store
 * holding one would answer for keys it visibly does not have. Here that would
 * mean an `allergenIds: []` nobody ever gave us, read as "I have no allergies",
 * and the whole reconfirm path skipped.
 */
function sanitizeAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (key === "__proto__" || PERSONAL_KEY_PATTERN.test(key)) continue;
    kept[key] = Array.isArray(value) ? [...value] : value;
  }
  return kept;
}

/** Own entry only — never something inherited from a re-pointed prototype. */
function ownAnswersFor(
  stored: StoredProfile | null,
  environmentId: EnvironmentId,
): Record<string, unknown> | undefined {
  if (!stored) return undefined;
  const answers = stored.lastAnswers[environmentId];
  return Object.prototype.hasOwnProperty.call(stored.lastAnswers, environmentId) && isRecord(answers)
    ? answers
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every flag must be present and boolean — a partial set is a different shape. */
function readAccessibility(value: unknown): CanonicalProfile["accessibility"] | null {
  if (!isRecord(value)) return null;
  const read: Record<string, boolean> = {};
  for (const key of ACCESSIBILITY_KEYS) {
    const flag = value[key];
    if (typeof flag !== "boolean") return null;
    read[key] = flag;
  }
  return read as CanonicalProfile["accessibility"];
}

function readInteraction(value: unknown): CanonicalProfile["interaction"] | null {
  if (!isRecord(value)) return null;
  const { preferredInput, language, confirmationRequired } = value;
  if (typeof preferredInput !== "string" || !KNOWN_PREFERRED_INPUTS.has(preferredInput)) {
    return null;
  }
  // The same rule mapToCanonicalInput enforces: the platform rejects a bare
  // "ko". Catching it here keeps a stale store from reaching submission time.
  if (typeof language !== "string" || !language.includes("-")) return null;
  if (typeof confirmationRequired !== "boolean") return null;
  return {
    preferredInput: preferredInput as PreferredInput,
    language,
    confirmationRequired,
  };
}

function readLastAnswers(value: unknown): Record<string, Record<string, unknown>> | null {
  if (!isRecord(value)) return null;
  const read: Record<string, Record<string, unknown>> = {};
  for (const [environmentId, answers] of Object.entries(value)) {
    // Dropped, not stored under a different name: an environment nobody can
    // name cannot be recalled, and assigning it would re-point this map's
    // prototype. See sanitizeAnswers.
    if (environmentId === "__proto__") continue;
    if (!isRecord(answers)) return null;
    // Sanitised on the way in as well as on the way out: a store written before
    // these rules existed is exactly the case the rules are for.
    read[environmentId] = sanitizeAnswers(answers);
  }
  return read;
}
