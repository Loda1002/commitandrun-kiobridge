// Checks the profile store: what it keeps, what it refuses to keep, and what a
// round trip through a string does to a remembered allergy.
// Run from the project root:  node packages/engine/scripts/check-profile-store.ts
import { collectProfile, createSessionContext, mapToCanonicalInput } from "../src/input.ts";
import {
  applyStoredProfile,
  parseStoredProfile,
  recallAnswers,
  toStoredProfile,
} from "../src/profile-store.ts";
import type { WebAnswers } from "../src/input.ts";
import type { CanonicalProfile } from "../src/types.ts";

const CAPTURED_AT = "2026-08-05T07:00:00.000Z";
const SAVED_AT = "2026-08-13T02:00:00.000Z";

/** The settings a low-vision user turned on last visit. */
const profile = mapToCanonicalInput({
  profileId: "COMMITANDRUN-PROFILE-001",
  providerId: "COMMITANDRUN",
  collectedAt: CAPTURED_AT,
  accessibility: { largeText: true, simpleSteps: true, visualGuidance: true, highContrast: true },
  interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
  consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
});

// mapToCanonicalInput takes no displayName, so attach one here — the store has
// to drop it even when the profile it is handed carries one.
const named: CanonicalProfile = { ...profile, displayName: "홍길동" };

// A plain literal rather than the WebAnswers value, because toStoredProfile
// takes the untyped shape the screen actually posts.
const rawAnswers = {
  serviceType: "TAKE_OUT",
  spicyLevel: "HOT",
  boneType: "BONELESS",
  cupOption: "PAPER",
  quantity: "1",
  allergenIds: ["PEANUT"],
  maxPriceKrw: 7000,
};

// What the screen would write to localStorage, and read back next visit.
const written = JSON.stringify(toStoredProfile(named, "chicken-store", rawAnswers, SAVED_AT));
const stored = parseStoredProfile(written);

/** Deep compare that ignores key order — JSON object key order carries no meaning. */
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, val]) => [k, stable(val)]),
        )
      : v;
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// Hangul and CJK take two terminal columns, so pad on display width.
const width = (s: string) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);
const line = (label: string, ok: boolean) => {
  if (!ok) process.exitCode = 1;
  console.log(`  ${label}${" ".repeat(Math.max(1, 43 - width(label)))}: ${ok ? "OK" : "FAIL"}`);
};

/* --- 1. the settings survive ------------------------------------------------ */

// A first-time profile: every accessibility flag off, which is what a returning
// user would be handed before the store is applied.
const fresh = mapToCanonicalInput({
  profileId: "COMMITANDRUN-PROFILE-001",
  providerId: "COMMITANDRUN",
  collectedAt: CAPTURED_AT,
});
const restored = stored ? applyStoredProfile(fresh, stored) : null;

line(
  "저장 후 되살리면 접근성 설정이 같다",
  restored !== null &&
    same(restored.accessibility, named.accessibility) &&
    same(restored.interaction, named.interaction) &&
    // the visit happening now still owns everything else
    same(restored.source, fresh.source) &&
    same(restored.consent, fresh.consent),
);

/* --- 2. the name does not -------------------------------------------------- */

line(
  "displayName 은 저장되지 않는다",
  stored !== null &&
    !("displayName" in stored) &&
    !written.includes("displayName") &&
    !written.includes("홍길동") &&
    restored?.displayName === undefined,
);

/* --- 3-5. anything unreadable becomes null, and nothing throws -------------- */

let threw = false;
const parseSafely = (raw: unknown): unknown => {
  try {
    return parseStoredProfile(raw as string | null);
  } catch {
    threw = true;
    return "THREW";
  }
};

const brokenInputs = [
  "{not json",
  "",
  "[]",
  "42",
  '"a string"',
  "null",
  '{"version":1}',
  '{"version":1,"accessibility":{"largeText":"yes"},"interaction":{},"lastAnswers":{},"savedAt":"x"}',
  // a language the platform rejects must not survive a round trip either
  '{"version":1,"accessibility":' +
    JSON.stringify(stored?.accessibility) +
    ',"interaction":{"preferredInput":"TOUCH","language":"ko","confirmationRequired":true}' +
    ',"lastAnswers":{},"savedAt":"x"}',
];
line("깨진 JSON -> null", brokenInputs.every((raw) => parseSafely(raw) === null) && !threw);

const otherVersion = written.replace('"version":1', '"version":2');
line(
  "모르는 version -> null",
  parseSafely(otherVersion) === null && parseSafely(written.replace('"version":1,', "")) === null,
);

line(
  "null 입력 -> null",
  parseSafely(null) === null && parseSafely(undefined) === null && !threw,
);

/* --- 6. the allergy comes back as a question, not as an answer -------------- */

// Last visit the user confirmed the peanut allergy on the review screen.
const before = createSessionContext(collectProfile(rawAnswers as Partial<WebAnswers>), {
  capturedAt: CAPTURED_AT,
  confirmedPaths: ["/hardConstraints/allergenIds"],
});

// This visit: the answers come out of the store, and nothing has been confirmed.
const recalled = recallAnswers(stored, "chicken-store");
const after = createSessionContext(collectProfile(recalled as Partial<WebAnswers>), {
  capturedAt: CAPTURED_AT,
});

line(
  "되살린 알레르기는 confirmedByUser=false",
  before.fieldMetadata["/hardConstraints/allergenIds"].confirmedByUser === true &&
    after.fieldMetadata["/hardConstraints/allergenIds"].confirmedByUser === false &&
    // the allergy itself is still remembered — it is the confirmation that is gone
    same(after.hardConstraints.allergenIds, ["PEANUT"]) &&
    // and there is nowhere in the stored shape for a confirmation to hide
    !written.includes("confirmedByUser") &&
    !written.includes("fieldMetadata"),
);

/* --- 7. one environment's answers stay in that environment ------------------ */

// An answer must only come back from the slot it was put in. The nastiest way
// to break that is not a wrong environment id but "__proto__": JSON.parse makes
// it a real key, and writing it back re-points the map's prototype, so the map
// answers for an environment it visibly has no entry for. The store below has
// no hospital entry — anything recalled for hospital came out of the prototype.
// An injected `allergenIds: []` reads as "저는 알레르기 없어요" and would skip
// the reconfirm the user never got asked for.
const injected = parseStoredProfile(
  written.replace(
    '"lastAnswers":{"chicken-store"',
    '"lastAnswers":{"__proto__":{"hospital":{"visitType":"REVISIT","allergenIds":[]}},"chicken-store"',
  ),
);

line(
  "다른 환경의 답변은 섞이지 않는다",
  Object.keys(recallAnswers(stored, "hospital")).length === 0 &&
    Object.keys(recallAnswers(stored, "public-office")).length === 0 &&
    recalled.spicyLevel === "HOT" &&
    Object.keys(recallAnswers(null, "chicken-store")).length === 0 &&
    // the smuggled slot is gone, and the real one is untouched
    same(recallAnswers(injected, "chicken-store"), recalled) &&
    Object.keys(recallAnswers(injected, "hospital")).length === 0,
);
