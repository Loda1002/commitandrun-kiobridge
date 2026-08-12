/**
 * The chicken-store environment data, bundled into the browser.
 *
 * The engine is a pure function of (fixture, sessionContext), and the deployed
 * web app has no kit to read the fixture from — `kit/` is gitignored and never
 * ships. So the seven files below are copied verbatim from
 *   kit/environments/chicken-store/
 * and assembled here into the `PublicFixture` shape the engine expects.
 *
 * VERBATIM means byte-identical, so a drift check is one command. From the
 * project root:
 *
 *   for f in manifest candidates option-groups screens transitions safety-rules; do
 *     diff kit/environments/chicken-store/$f.json apps/web/lib/fixtures/chicken-store/$f.json
 *   done
 *   diff kit/environments/chicken-store/bindings/simulation.binding.json \
 *        apps/web/lib/fixtures/chicken-store/simulation.binding.json
 *
 * `compatibility-rules.json` and `review-mapping.json` are deliberately absent:
 * the platform executes those, the engine never reads them, and they are
 * optional on PublicFixture. Copying them would be ~8KB of rules to keep in
 * sync for nothing.
 *
 * The data is `dataClassification: SYNTHETIC_MOCK` — no real personal data.
 */
import type { EnvironmentId, PublicFixture } from "@commitandrun/engine";

import candidates from "./fixtures/chicken-store/candidates.json";
import manifest from "./fixtures/chicken-store/manifest.json";
import optionGroups from "./fixtures/chicken-store/option-groups.json";
import safetyRules from "./fixtures/chicken-store/safety-rules.json";
import screens from "./fixtures/chicken-store/screens.json";
import simulationBinding from "./fixtures/chicken-store/simulation.binding.json";
import transitions from "./fixtures/chicken-store/transitions.json";

export const ENVIRONMENT_ID: EnvironmentId = "chicken-store";

/**
 * Cast because TypeScript widens a JSON import's string literals to `string`,
 * so `environmentId: "chicken-store"` no longer satisfies `EnvironmentId`.
 * Same reason and same cast as packages/engine/scripts/check-select.ts.
 */
export const CHICKEN_STORE_FIXTURE = {
  manifest,
  candidates,
  optionGroups,
  screens,
  transitions,
  safetyRules,
  simulationBinding,
} as unknown as PublicFixture;
