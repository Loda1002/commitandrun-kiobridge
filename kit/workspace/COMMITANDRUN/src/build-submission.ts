/**
 * Produce participant-submission.json from our own code.
 *
 * Run from anywhere — paths resolve from this file, not the shell's cwd:
 *
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts --out output/participant-submission.json
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts --env hospital
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts --all
 *
 * `--all` writes the three official submissions to their usual names, which is
 * what to run before packaging.
 *
 * `--input <name>` reads a different collected input from `input/` — a second
 * customer in the same environment. Used for the safe-stop cases, which have to
 * land on their own output name so the three official submissions keep the
 * SHA-256 already on record. Always pass `--out` with it.
 *
 * Then check it the official way, with the simulation API running:
 *
 *   cd kit && npm run start:api
 *   cd kit && npm run participant:validate -- --file ./workspace/COMMITANDRUN/output/<file> --execute
 *
 * A script may read the kit; the engine may not. Key names follow PublicFixture.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PublicFixture } from "@kiobridge/participant-sdk";
import { buildSubmission } from "./participant.ts";

const TEAM_ID = "COMMITANDRUN";

/** Where each environment's submission goes when `--all` is used. */
const OFFICIAL_OUT: Record<string, string> = {
  "chicken-store": "output/participant-submission.json",
  hospital: "output/hospital-submission.json",
  "public-office": "output/public-office-submission.json",
};

const DEFAULT_OUT = "output/_generated-submission.json";

/** kit/workspace/COMMITANDRUN/src → kit/ */
const KIT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const WORKSPACE = path.join(KIT_ROOT, "workspace", TEAM_ID);

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

function loadFixture(environmentId: string): PublicFixture {
  const dir = path.join(KIT_ROOT, "environments", environmentId);
  return {
    manifest: read(path.join(dir, "manifest.json")),
    candidates: read(path.join(dir, "candidates.json")),
    optionGroups: read(path.join(dir, "option-groups.json")),
    screens: read(path.join(dir, "screens.json")),
    transitions: read(path.join(dir, "transitions.json")),
    safetyRules: read(path.join(dir, "safety-rules.json")),
    simulationBinding: read(path.join(dir, "bindings", "simulation.binding.json")),
  } as unknown as PublicFixture;
}

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

const all = process.argv.includes("--all");
const environments = all ? Object.keys(OFFICIAL_OUT) : [arg("--env") ?? "chicken-store"];

for (const environmentId of environments) {
  const fixture = loadFixture(environmentId);
  const out = all ? OFFICIAL_OUT[environmentId] : arg("--out") ?? DEFAULT_OUT;
  const outFile = path.join(WORKSPACE, out);

  // `--all` is the official three, which always read their own default input.
  const submission = await buildSubmission(fixture, TEAM_ID, all ? undefined : arg("--input"));
  writeFileSync(outFile, `${JSON.stringify(submission, null, 2)}\n`, "utf8");

  const { recommendation: rec, executionPlan: plan, userDecision } = submission;
  console.log(`\n── ${environmentId} ──────────────────────────────────────`);
  console.log(`wrote ${path.relative(KIT_ROOT, outFile)}`);
  console.log("");
  console.log(`recommended  : ${rec.recommendedCandidateId}`);
  console.log(`alternatives : ${rec.alternativeCandidateIds.join(" -> ") || "(none)"}`);
  console.log(`excluded     : ${rec.excludedCandidates.map((e) => `${e.candidateId}/${e.reasonCode}`).join(", ") || "(none)"}`);
  console.log(`confidence   : ${rec.confidence}  | requiresReconfirmation: ${rec.requiresReconfirmation}`);
  console.log(`reasons      : ${rec.recommendationReasons.length}`);
  console.log(`decision     : ${userDecision.decision} (approved=${userDecision.approved})`);
  console.log(
    `plan         : ${plan.actions.length} actions, ends at ` +
      `${plan.actions.at(-1)?.expectedAfterState ?? "(none)"} via ${plan.actions.at(-1)?.action ?? "(none)"}`,
  );
  console.log(
    `flags        : ${plan.validationMode} ${plan.executionEnvironment} ` +
      `actualDeviceCommandSent=${plan.actualDeviceCommandSent}`,
  );
}
