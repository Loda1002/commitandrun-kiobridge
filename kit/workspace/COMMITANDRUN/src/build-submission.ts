/**
 * Produce participant-submission.json from our own code.
 *
 * Run from anywhere — paths resolve from this file, not the shell's cwd:
 *
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts
 *   node kit/workspace/COMMITANDRUN/src/build-submission.ts --out output/participant-submission.json
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
const ENVIRONMENT_ID = "chicken-store";
const DEFAULT_OUT = "output/_generated-submission.json";

/** kit/workspace/COMMITANDRUN/src → kit/ */
const KIT_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const WORKSPACE = path.join(KIT_ROOT, "workspace", TEAM_ID);
const ENVIRONMENT = path.join(KIT_ROOT, "environments", ENVIRONMENT_ID);

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));

const fixture = {
  manifest: read(path.join(ENVIRONMENT, "manifest.json")),
  candidates: read(path.join(ENVIRONMENT, "candidates.json")),
  optionGroups: read(path.join(ENVIRONMENT, "option-groups.json")),
  screens: read(path.join(ENVIRONMENT, "screens.json")),
  transitions: read(path.join(ENVIRONMENT, "transitions.json")),
  safetyRules: read(path.join(ENVIRONMENT, "safety-rules.json")),
  simulationBinding: read(path.join(ENVIRONMENT, "bindings", "simulation.binding.json")),
} as unknown as PublicFixture;

const outArg = process.argv.indexOf("--out");
const outFile = path.join(WORKSPACE, outArg === -1 ? DEFAULT_OUT : process.argv[outArg + 1]);

const submission = await buildSubmission(fixture, TEAM_ID);
writeFileSync(outFile, `${JSON.stringify(submission, null, 2)}\n`, "utf8");

const { recommendation: rec, executionPlan: plan, userDecision } = submission;
console.log(`wrote ${path.relative(KIT_ROOT, outFile)}`);
console.log("");
console.log(`recommended  : ${rec.recommendedCandidateId}`);
console.log(`alternatives : ${rec.alternativeCandidateIds.join(" -> ")}`);
console.log(`excluded     : ${rec.excludedCandidates.map((e) => `${e.candidateId}/${e.reasonCode}`).join(", ")}`);
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
