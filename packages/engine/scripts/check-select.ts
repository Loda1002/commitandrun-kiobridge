// Checks filterCandidates against the submission that already passes.
// Run from the project root:  node packages/engine/scripts/check-select.ts
//
// ⚠️ "golden" below is now produced BY this engine — since the participant.ts
// wiring landed, kit/workspace/COMMITANDRUN/src/build-submission.ts writes that
// file. So a "SAME as golden" line no longer means an independent reference
// agrees with us; it means the engine still produces what it produced when the
// submission was last generated. That is a regression snapshot, which is worth
// having, but the independent verdict is
//   cd kit && npm run participant:validate -- --file <submission> --execute
import { readFile } from "node:fs/promises";
import {
  buildAlternatives,
  explainRecommendation,
  filterCandidates,
  score,
} from "../src/select.ts";
import type { ChickenStoreSessionContext, PublicFixture } from "../src/types.ts";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const golden = await read("./kit/workspace/COMMITANDRUN/output/participant-submission.json");

// A script may read the kit; the engine may not. Key names follow PublicFixture.
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

const ctx = golden.sessionContext as ChickenStoreSessionContext;
const { survivors, excluded } = filterCandidates(fixture, ctx);

console.log(`candidates: ${fixture.candidates.length} -> survivors ${survivors.length}, excluded ${excluded.length}`);
console.log("survivors :", survivors.map((c) => c.candidateId).join(", "));
console.log("");
for (const e of excluded) {
  console.log(`  ${e.candidateId}  ${e.reasonCode.padEnd(22)} [${e.tag}]  ${e.explanation}`);
}
console.log("");

// The golden submission is the reference for codes and sentences alike.
const goldenExcluded = golden.recommendation.excludedCandidates as Array<{
  candidateId: string;
  reasonCode: string;
  explanation: string;
}>;
const shape = (list: Array<{ candidateId: string; reasonCode: string; explanation: string }>) =>
  list.map((e) => `${e.candidateId}/${e.reasonCode}/${e.explanation}`);
const sameAsGolden = JSON.stringify(shape(excluded)) === JSON.stringify(shape(goldenExcluded));
console.log(sameAsGolden ? "exclusions: SAME as golden" : "exclusions: DIFFERENT from golden");
if (!sameAsGolden) {
  console.log("  mine  :", shape(excluded));
  console.log("  golden:", shape(goldenExcluded));
}

console.log("");

// --- scoring ----------------------------------------------------------------

const result = score(survivors, ctx);
const totalOf = (id: string) =>
  result.contributions[id].reduce((sum, r) => sum + r.earned, 0);

// score owns the order, tie-breaks included, so read it back rather than
// re-sorting here — a table that disagrees with the engine is worse than none.
const podium = [result.recommendedCandidateId, ...result.alternativeCandidateIds].filter(
  (id): id is string => id !== null,
);
const rest = survivors
  .map((c) => c.candidateId)
  .filter((id) => !podium.includes(id))
  .sort((a, b) => totalOf(b) - totalOf(a));

for (const [i, id] of [...podium, ...rest].entries()) {
  const name = survivors.find((c) => c.candidateId === id)!.name;
  const rows = result.contributions[id];
  const bars = rows.map((r) => `${r.label} ${r.earned.toFixed(2)}/${r.weight.toFixed(2)}`).join("  ");
  console.log(`${i + 1}등  ${id}  ${name.padEnd(12)} ${totalOf(id).toFixed(2)}   ${bars}`);
}
console.log("");
console.log("recommended :", result.recommendedCandidateId);
console.log("alternatives:", result.alternativeCandidateIds.join(" -> "));
console.log(
  "confidence  :",
  result.confidence.toFixed(2),
  "| requiresReconfirmation:",
  result.requiresReconfirmation,
);

// The three things the card says must match, whatever the numbers come out as.
const okTop = result.recommendedCandidateId === "CHICKEN-001";
const okAlts = JSON.stringify(result.alternativeCandidateIds) ===
  JSON.stringify(["CHICKEN-003", "CHICKEN-006"]);
const okWeights = Object.values(result.contributions).every(
  (rows) => rows.length === 4 && Math.abs(rows.reduce((s, r) => s + r.weight, 0) - 1) < 1e-9,
);
// --- reasons and alternatives -----------------------------------------------

const recommended = survivors.find((c) => c.candidateId === result.recommendedCandidateId)!;
const reasons = explainRecommendation(recommended, ctx, excluded);
const goldenReasons = golden.recommendation.recommendationReasons as string[];

console.log("");
for (const r of reasons) {
  console.log(`  [${r.tag.padEnd(14)}] ${r.text}`);
}
const sameReasons = JSON.stringify(reasons.map((r) => r.text)) === JSON.stringify(goldenReasons);
console.log("");
console.log(sameReasons ? "reasons: SAME as golden" : "reasons: DIFFERENT from golden");
if (!sameReasons) {
  for (const t of goldenReasons.filter((t) => !reasons.some((r) => r.text === t))) {
    console.log(`  only in golden: ${t}`);
  }
  for (const r of reasons.filter((r) => !goldenReasons.includes(r.text))) {
    console.log(`  only in mine  : ${r.text}`);
  }
}

const alternatives = buildAlternatives(result);
const okBuild = JSON.stringify(alternatives) === JSON.stringify(result.alternativeCandidateIds);

console.log("");
console.log(`  1등 CHICKEN-001            : ${okTop ? "OK" : "FAIL"}`);
console.log(`  대안 003 -> 006            : ${okAlts ? "OK" : "FAIL"}`);
console.log(`  4항목 · weight 합계 1.0    : ${okWeights ? "OK" : "FAIL"}`);
console.log(`  제외 3건 골든 일치         : ${sameAsGolden ? "OK" : "FAIL"}`);
console.log(`  이유 6문장 골든 일치       : ${sameReasons ? "OK" : "FAIL"}`);
console.log(`  buildAlternatives 일치     : ${okBuild ? "OK" : "FAIL"}  (${alternatives.join(", ")})`);
console.log("");

// Safety path: "모르겠어요" must not be read as "no allergy". Filtering cannot
// ask the user, so it must not drop anything on allergen grounds — score is
// what stops and asks instead.
const unknownCtx = {
  ...ctx,
  hardConstraints: { ...ctx.hardConstraints, allergenIds: ["UNKNOWN"] },
} as ChickenStoreSessionContext;
const unknownFiltered = filterCandidates(fixture, unknownCtx);
const guessed = unknownFiltered.excluded.filter((e) => e.reasonCode === "ALLERGEN_CONFLICT");
const unknownScored = score(unknownFiltered.survivors, unknownCtx);
console.log(
  guessed.length === 0
    ? "allergen UNKNOWN: nothing guessed away by the filter"
    : `allergen UNKNOWN: GUESSED ${guessed.length} exclusion(s) — this is a bug`,
);
console.log(
  unknownScored.recommendedCandidateId === null && unknownScored.requiresReconfirmation
    ? `allergen UNKNOWN: no recommendation, asks about ${unknownScored.reconfirmRequests[0]?.path}`
    : "allergen UNKNOWN: RECOMMENDED ANYWAY — this is a bug",
);

// No candidate exceeds the real 7,000 budget, so the rule needs a tighter one
// to be exercised at all. 5,800 leaves only the 5,500 dish standing.
const tightCtx = {
  ...ctx,
  hardConstraints: { ...ctx.hardConstraints, maxPriceKrw: 5800 },
} as ChickenStoreSessionContext;
const tight = filterCandidates(fixture, tightCtx);
const overBudget = tight.excluded.filter((e) => e.reasonCode === "PRICE_OVER_LIMIT");
console.log(
  `budget 5,800: survivors ${tight.survivors.map((c) => c.candidateId).join(", ") || "(none)"}` +
    ` | ${overBudget.length} over budget`,
);
console.log(`  e.g. ${overBudget[0]?.candidateId} — ${overBudget[0]?.explanation}`);
