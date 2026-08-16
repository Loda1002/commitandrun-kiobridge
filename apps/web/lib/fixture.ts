/**
 * The three environments' data, bundled into the browser.
 *
 * The engine is a pure function of (fixture, sessionContext), and the deployed
 * web app has no kit to read a fixture from — `kit/` is gitignored and never
 * ships. So the seven files per environment are copied verbatim from
 *   kit/environments/<id>/
 * and assembled here into the `PublicFixture` shape the engine expects.
 *
 * VERBATIM means identical content. Drift check, from the project root:
 *
 *   for e in chicken-store hospital public-office; do
 *     for f in manifest candidates option-groups screens transitions safety-rules; do
 *       diff --strip-trailing-cr kit/environments/$e/$f.json apps/web/lib/fixtures/$e/$f.json
 *     done
 *     diff --strip-trailing-cr kit/environments/$e/bindings/simulation.binding.json \
 *          apps/web/lib/fixtures/$e/simulation.binding.json
 *   done
 *
 * ⚠️ `--strip-trailing-cr` is not optional on Windows. The copies under
 * apps/web are tracked by git and come back out of it with CRLF endings, while
 * kit/ is untracked and keeps LF. Without the flag every file reports as
 * different and the check tells you nothing.
 *
 * `compatibility-rules.json` and `review-mapping.json` are deliberately absent:
 * the platform executes those, the engine never reads them, and they are
 * optional on PublicFixture. Copying them would be ~8KB of rules to keep in
 * sync for nothing.
 *
 * All of it is `dataClassification: SYNTHETIC_MOCK` — no real personal data.
 */
import type { EnvironmentId, PublicFixture } from "@commitandrun/engine";

import chickenCandidates from "./fixtures/chicken-store/candidates.json";
import chickenManifest from "./fixtures/chicken-store/manifest.json";
import chickenOptionGroups from "./fixtures/chicken-store/option-groups.json";
import chickenSafetyRules from "./fixtures/chicken-store/safety-rules.json";
import chickenScreens from "./fixtures/chicken-store/screens.json";
import chickenBinding from "./fixtures/chicken-store/simulation.binding.json";
import chickenTransitions from "./fixtures/chicken-store/transitions.json";

import hospitalCandidates from "./fixtures/hospital/candidates.json";
import hospitalManifest from "./fixtures/hospital/manifest.json";
import hospitalOptionGroups from "./fixtures/hospital/option-groups.json";
import hospitalSafetyRules from "./fixtures/hospital/safety-rules.json";
import hospitalScreens from "./fixtures/hospital/screens.json";
import hospitalBinding from "./fixtures/hospital/simulation.binding.json";
import hospitalTransitions from "./fixtures/hospital/transitions.json";

import officeCandidates from "./fixtures/public-office/candidates.json";
import officeManifest from "./fixtures/public-office/manifest.json";
import officeOptionGroups from "./fixtures/public-office/option-groups.json";
import officeSafetyRules from "./fixtures/public-office/safety-rules.json";
import officeScreens from "./fixtures/public-office/screens.json";
import officeBinding from "./fixtures/public-office/simulation.binding.json";
import officeTransitions from "./fixtures/public-office/transitions.json";

/**
 * Cast because TypeScript widens a JSON import's string literals to `string`,
 * so `environmentId: "chicken-store"` no longer satisfies `EnvironmentId`.
 * Same reason and same cast as packages/engine/scripts/check-select.ts.
 */
const assemble = (parts: {
  manifest: unknown;
  candidates: unknown;
  optionGroups: unknown;
  screens: unknown;
  transitions: unknown;
  safetyRules: unknown;
  simulationBinding: unknown;
}) => parts as unknown as PublicFixture;

export const CHICKEN_STORE_FIXTURE = assemble({
  manifest: chickenManifest,
  candidates: chickenCandidates,
  optionGroups: chickenOptionGroups,
  screens: chickenScreens,
  transitions: chickenTransitions,
  safetyRules: chickenSafetyRules,
  simulationBinding: chickenBinding,
});

export const HOSPITAL_FIXTURE = assemble({
  manifest: hospitalManifest,
  candidates: hospitalCandidates,
  optionGroups: hospitalOptionGroups,
  screens: hospitalScreens,
  transitions: hospitalTransitions,
  safetyRules: hospitalSafetyRules,
  simulationBinding: hospitalBinding,
});

export const PUBLIC_OFFICE_FIXTURE = assemble({
  manifest: officeManifest,
  candidates: officeCandidates,
  optionGroups: officeOptionGroups,
  screens: officeScreens,
  transitions: officeTransitions,
  safetyRules: officeSafetyRules,
  simulationBinding: officeBinding,
});

const FIXTURES: Record<EnvironmentId, PublicFixture> = {
  "chicken-store": CHICKEN_STORE_FIXTURE,
  hospital: HOSPITAL_FIXTURE,
  "public-office": PUBLIC_OFFICE_FIXTURE,
};

export function fixtureFor(environmentId: EnvironmentId): PublicFixture {
  return FIXTURES[environmentId];
}

/**
 * What the user is picking a kiosk for.
 *
 * `noun` is what this environment offers, so a screen can say "메뉴를 골라
 * 주세요" or "접수 경로를 골라 주세요" without a switch of its own. The order
 * here is the order the start screen shows them in.
 */
export interface EnvironmentChoice {
  id: EnvironmentId;
  /** The fixture's own display name, so the two cannot drift. */
  name: string;
  /** What the user is choosing between here — "메뉴", "접수 경로", "민원 업무". */
  noun: string;
  description: string;
  /** Heading on the approval screen. */
  confirmTitle: string;
  /**
   * Heading on the result screen.
   *
   * The screen used to open with "실행 결과 및 안전 리포트", which is what the
   * judges need to read, not the person standing at the kiosk. They need to know
   * the thing they came to do is ready — and, right underneath, `boundaryNotice`
   * tells them what was deliberately left undone.
   */
  doneTitle: string;
  /**
   * What the run will and will not do, said on the approval screen.
   *
   * Every environment stops before something irreversible, and it is a
   * different something each time — a payment, a real check-in, an actual
   * application. A screen that promises the wrong boundary is worse than one
   * that promises none, which is why this is per-environment copy rather than
   * one sentence about shopping baskets.
   */
  boundaryNotice: string;
}

export const ENVIRONMENTS: EnvironmentChoice[] = [
  {
    id: "chicken-store",
    name: CHICKEN_STORE_FIXTURE.manifest.displayName ?? CHICKEN_STORE_FIXTURE.manifest.name,
    noun: "메뉴",
    description: "메뉴와 옵션을 골라 주문을 준비합니다. 결제는 하지 않습니다.",
    confirmTitle: "주문 최종 확인",
    doneTitle: "주문 준비가 끝났습니다",
    boundaryNotice: "장바구니 담기까지만 진행되며, 결제는 하지 않습니다.",
  },
  {
    id: "hospital",
    name: HOSPITAL_FIXTURE.manifest.displayName ?? HOSPITAL_FIXTURE.manifest.name,
    noun: "접수 경로",
    description: "어디로 접수하실지 안내합니다. 증상을 묻거나 진료과를 판단하지 않습니다.",
    confirmTitle: "접수 내용 확인",
    doneTitle: "접수 준비가 끝났습니다",
    boundaryNotice: "접수 내용 확인까지만 진행되며, 실제 접수는 직원이 진행합니다.",
  },
  {
    id: "public-office",
    name: PUBLIC_OFFICE_FIXTURE.manifest.displayName ?? PUBLIC_OFFICE_FIXTURE.manifest.name,
    noun: "민원 업무",
    description: "필요한 서류와 절차를 안내합니다. 자격이 되는지는 판단하지 않습니다.",
    confirmTitle: "신청 내용 확인",
    doneTitle: "신청 준비가 끝났습니다",
    boundaryNotice: "신청 내용 확인까지만 진행되며, 신청·발급은 하지 않습니다.",
  },
];

/** The copy for one environment. Throws for an id we have no wording for. */
export function environmentCopy(environmentId: EnvironmentId): EnvironmentChoice {
  const found = ENVIRONMENTS.find((e) => e.id === environmentId);
  if (!found) throw new Error(`environmentCopy: nothing written for ${environmentId}`);
  return found;
}

/** The environment the app opens on. */
export const DEFAULT_ENVIRONMENT_ID: EnvironmentId = "chicken-store";

/** @deprecated Use `DEFAULT_ENVIRONMENT_ID`, or the id the user picked. */
export const ENVIRONMENT_ID: EnvironmentId = DEFAULT_ENVIRONMENT_ID;
