// Checks the step 7 input functions against the submission that already passes.
// Run from the project root:  node packages/engine/scripts/check-input.ts
import { readFile } from "node:fs/promises";
import { collectProfile, createSessionContext, mapToCanonicalInput } from "../src/input.ts";
import type { PublicFixture } from "../src/types.ts";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const golden = await read("./kit/workspace/COMMITANDRUN/output/participant-submission.json");

const CAPTURED_AT = "2026-08-05T07:00:00.000Z";

// What the order form would have posted for the golden session.
const answers = collectProfile({
  serviceType: "TAKE_OUT",
  spicyLevel: "HOT",
  boneType: "BONELESS",
  cupOption: "PAPER",
  quantity: "1",
  allergenIds: ["PEANUT"],
  maxPriceKrw: 7000,
});

const profile = mapToCanonicalInput({
  profileId: "COMMITANDRUN-PROFILE-001",
  providerId: "COMMITANDRUN",
  collectedAt: CAPTURED_AT,
  accessibility: { largeText: true, simpleSteps: true, visualGuidance: true, highContrast: true },
  interaction: { preferredInput: "TOUCH", language: "ko-KR", confirmationRequired: true },
  consent: { personalization: true, retentionPolicy: "SESSION_ONLY" },
});

// The shop-side signals come from the fixture, so the check needs it too.
const base = "./kit/environments/chicken-store";
const fixture = {
  manifest: await read(`${base}/manifest.json`),
  candidates: await read(`${base}/candidates.json`),
  optionGroups: await read(`${base}/option-groups.json`),
  screens: await read(`${base}/screens.json`),
  transitions: await read(`${base}/transitions.json`),
  safetyRules: await read(`${base}/safety-rules.json`),
  simulationBinding: await read(`${base}/bindings/simulation.binding.json`),
} as unknown as PublicFixture;

const ctx = createSessionContext(
  answers,
  {
    capturedAt: CAPTURED_AT,
    source: "WEB_FORM",
    confirmedPaths: [
      "/hardConstraints/allergenIds",
      "/preferences/serviceType",
      "/preferences/spicyLevel",
    ],
  },
  fixture,
);

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
const line = (label: string, ok: boolean) => console.log(`  ${label.padEnd(34)}: ${ok ? "OK" : "FAIL"}`);

console.log("profile vs golden.profile");
line("profileId · dataClassification", profile.profileId === golden.profile.profileId &&
  profile.dataClassification === golden.profile.dataClassification);
line("source", same(profile.source, golden.profile.source));
line("accessibility", same(profile.accessibility, golden.profile.accessibility));
line("interaction", same(profile.interaction, golden.profile.interaction));
line("consent", same(profile.consent, golden.profile.consent));
line("whole profile", same(profile, golden.profile));

console.log("");
console.log("sessionContext vs golden.sessionContext");
line("intent · facts · capabilities", same(ctx.intent, golden.sessionContext.intent) &&
  same(ctx.facts, golden.sessionContext.facts) &&
  same(ctx.capabilities, golden.sessionContext.capabilities));
line("preferences", same(ctx.preferences, golden.sessionContext.preferences));
line("hardConstraints", same(ctx.hardConstraints, golden.sessionContext.hardConstraints));

// fieldMetadata is deliberately fuller than golden's, so compare the shared keys
// and report the extra ones instead of calling the difference a failure.
const goldenMeta = golden.sessionContext.fieldMetadata as Record<string, unknown>;
const sharedOk = Object.keys(goldenMeta).every((k) => k in ctx.fieldMetadata);
const extra = Object.keys(ctx.fieldMetadata).filter((k) => !(k in goldenMeta));
line("fieldMetadata covers golden's keys", sharedOk);
console.log(`  fieldMetadata: ${Object.keys(ctx.fieldMetadata).length} entries, golden has ${Object.keys(goldenMeta).length}`);
console.log(`  extra paths  : ${extra.join(", ") || "(none)"}`);
console.log(`  confirmed    : ${Object.entries(ctx.fieldMetadata).filter(([, m]) => m.confirmedByUser).map(([p]) => p).join(", ")}`);

line("extensions (stock signal)", same(ctx.extensions, golden.sessionContext.extensions));

// Without a fixture there is nothing observed to report, so the key stays off
// rather than being present and empty.
const noFixture = createSessionContext(answers, { capturedAt: CAPTURED_AT });
line("no fixture -> no extensions", noFixture.extensions === undefined);

console.log("");
console.log("safety paths");

// Nothing answered: every question must stay open, not become a default.
const empty = collectProfile(undefined);
const emptyCtx = createSessionContext(empty, { capturedAt: CAPTURED_AT });
line("no answers -> no preferences", Object.keys(emptyCtx.preferences).length === 0);
line("no answers -> allergens UNKNOWN", same(emptyCtx.hardConstraints.allergenIds, ["UNKNOWN"]));
line(
  "unknown allergy -> confidence 0",
  emptyCtx.fieldMetadata["/hardConstraints/allergenIds"].confidence === 0,
);

// "I have none" is a real answer and must not be turned back into UNKNOWN.
const noneCtx = createSessionContext(collectProfile({ allergenIds: [] }), { capturedAt: CAPTURED_AT });
line("declared none -> stays empty", same(noneCtx.hardConstraints.allergenIds, []));

// An allergen code we do not recognise must become a question, never silence.
const typoCtx = createSessionContext(collectProfile({ allergenIds: ["PEANUTS"] }), {
  capturedAt: CAPTURED_AT,
});
line("unknown allergen code -> UNKNOWN", same(typoCtx.hardConstraints.allergenIds, ["UNKNOWN"]));

let rejectedLocalTime = false;
try {
  mapToCanonicalInput({ profileId: "P", providerId: "T", collectedAt: "2026-08-05T07:00:00" });
} catch {
  rejectedLocalTime = true;
}
line("local time rejected", rejectedLocalTime);

let rejectedBareLanguage = false;
try {
  mapToCanonicalInput({
    profileId: "P",
    providerId: "T",
    collectedAt: CAPTURED_AT,
    interaction: { language: "ko" },
  });
} catch {
  rejectedBareLanguage = true;
}
line("bare language tag rejected", rejectedBareLanguage);
