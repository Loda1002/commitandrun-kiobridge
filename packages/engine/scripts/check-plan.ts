// Verifies buildExecutionPlan against the submission that already passes.
// Run from the project root:  node packages/engine/scripts/check-plan.ts
import { readFile, writeFile } from "node:fs/promises";
import { buildExecutionPlan } from "../src/plan.ts";
import type { PublicFixture } from "../src/types.ts";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const golden = await read("./kit/workspace/COMMITANDRUN/output/participant-submission.json");

// The fixture is normally handed in by the caller. Here we assemble it from the
// kit's environment files — a script may read the kit, the engine may not.
// Key names follow PublicFixture in ../src/types.ts.
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

const mine = buildExecutionPlan({
  environmentId: "chicken-store",
  fixture,
  candidateId: golden.recommendation.recommendedCandidateId,
  sessionContext: golden.sessionContext,
  approved: true,
});

const same = JSON.stringify(mine.actions) === JSON.stringify(golden.executionPlan.actions);
console.log(same ? "SAME as golden" : "DIFFERENT from golden");
if (!same) {
  console.log("mine  :", JSON.stringify(mine.actions, null, 1));
  console.log("golden:", JSON.stringify(golden.executionPlan.actions, null, 1));
}

// The three safety flags are checked here too, not just at the type level.
console.log(
  "flags :",
  mine.planId,
  mine.validationMode,
  mine.executionEnvironment,
  `actualDeviceCommandSent=${mine.actualDeviceCommandSent}`,
);

// approved: false must abort instead of producing a plan.
try {
  buildExecutionPlan({
    environmentId: "chicken-store",
    fixture,
    candidateId: golden.recommendation.recommendedCandidateId,
    sessionContext: golden.sessionContext,
    approved: false,
  });
  console.log("approved=false: NOT REJECTED — this is a bug");
} catch {
  console.log("approved=false: rejected as expected");
}

// Write a copy for the official validator. Never overwrite the real submission.
await writeFile(
  "./kit/workspace/COMMITANDRUN/output/_check-plan.json",
  JSON.stringify({ ...golden, executionPlan: mine }, null, 2),
);
console.log("wrote kit/workspace/COMMITANDRUN/output/_check-plan.json");
