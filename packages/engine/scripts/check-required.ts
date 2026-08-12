// Checks findMissingAnswers against all three environments' real fixtures.
// Run from the project root:  node packages/engine/scripts/check-required.ts
import { readFile } from "node:fs/promises";
import { createContextFor } from "../src/input.ts";
import { findMissingAnswers } from "../src/required.ts";
import type { EnvironmentId, PublicFixture } from "../src/types.ts";

const CAPTURED_AT = "2026-08-05T07:00:00.000Z";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));

/** Same fixture assembly build-submission.ts uses. */
async function loadFixture(environmentId: EnvironmentId): Promise<PublicFixture> {
  const base = `./kit/environments/${environmentId}`;
  return {
    manifest: await read(`${base}/manifest.json`),
    candidates: await read(`${base}/candidates.json`),
    optionGroups: await read(`${base}/option-groups.json`),
    screens: await read(`${base}/screens.json`),
    transitions: await read(`${base}/transitions.json`),
    safetyRules: await read(`${base}/safety-rules.json`),
    simulationBinding: await read(`${base}/bindings/simulation.binding.json`),
  } as unknown as PublicFixture;
}

const width = (s: string) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);
const line = (label: string, ok: boolean) => {
  if (!ok) process.exitCode = 1;
  console.log(`  ${label}${" ".repeat(Math.max(1, 44 - width(label)))}: ${ok ? "OK" : "FAIL"}`);
};

/** Nothing answered at all — the path a judge takes by clicking straight through. */
const nothing = (environmentId: EnvironmentId) =>
  createContextFor(environmentId, {}, { capturedAt: CAPTURED_AT });

const ids = (list: { groupId: string }[]) => list.map((m) => m.groupId).join(" · ");

/* --- chicken-store --------------------------------------------------------- */

const chicken = await loadFixture("chicken-store");
const chickenEmpty = findMissingAnswers(chicken, nothing("chicken-store"));

line(
  "chicken-store  아무것도 안 고름 -> 4건",
  chickenEmpty.length === 4 &&
    ids(chickenEmpty) === "SERVICE_TYPE · SPICY_LEVEL · BONE_TYPE · QUANTITY",
);
console.log(`    ${ids(chickenEmpty)}`);
for (const m of chickenEmpty) console.log(`    ${m.path.padEnd(28)} ${m.message}`);

// CUP is the one optional group in the fixture, so it must never be demanded.
line(
  "chicken-store  CUP 은 선택이라 빠진다",
  !chickenEmpty.some((m) => m.groupId === "CUP") &&
    chicken.optionGroups.find((g) => g.groupId === "CUP")?.required === false,
);

// Every required group answered, CUP still untouched — nothing left to ask.
const chickenFull = findMissingAnswers(
  chicken,
  createContextFor(
    "chicken-store",
    {
      serviceType: "TAKE_OUT",
      spicyLevel: "HOT",
      boneType: "BONELESS",
      quantity: "1",
      allergenIds: ["PEANUT"],
    },
    { capturedAt: CAPTURED_AT },
  ),
);
line("chicken-store  다 고르면 0건", chickenFull.length === 0);

/* --- hospital -------------------------------------------------------------- */

const hospital = await loadFixture("hospital");
const hospitalEmpty = findMissingAnswers(hospital, nothing("hospital"));

// SUPPORT is required and answerFor reports "NONE" for it when nothing was
// picked — a baseline the domain supplies so a plan can be built, not an answer.
// If it were counted as answered this would be 3.
const hospitalFull = findMissingAnswers(
  hospital,
  createContextFor(
    "hospital",
    {
      visitType: "FIRST_VISIT",
      appointmentStatus: "NO_APPOINTMENT",
      departmentId: "INTERNAL_MEDICINE",
      supportModes: ["LARGE_TEXT"],
    },
    { capturedAt: CAPTURED_AT },
  ),
);
// "ENT" is a real Department in the official vocabulary but the fixture's
// DEPARTMENT group does not list it, so nobody can have picked it here. Letting
// it through would light the progress button on a choice plan.ts then refuses
// to plan ("ENT is not an option of DEPARTMENT").
const hospitalOffFixture = findMissingAnswers(
  hospital,
  createContextFor(
    "hospital",
    {
      visitType: "FIRST_VISIT",
      appointmentStatus: "NO_APPOINTMENT",
      departmentId: "ENT",
      supportModes: ["LARGE_TEXT"],
    },
    { capturedAt: CAPTURED_AT },
  ),
);

line(
  "hospital       아무것도 안 고름 -> 4건",
  hospitalEmpty.length === 4 &&
    ids(hospitalEmpty) === "VISIT_TYPE · APPOINTMENT · DEPARTMENT · SUPPORT" &&
    hospitalFull.length === 0 &&
    ids(hospitalOffFixture) === "DEPARTMENT",
);
console.log(`    ${ids(hospitalEmpty)}`);
console.log(`    fixture 에 없는 값(ENT) -> ${ids(hospitalOffFixture)} 1건`);

/* --- public-office --------------------------------------------------------- */

const office = await loadFixture("public-office");
const officeEmpty = findMissingAnswers(office, nothing("public-office"));

const officeFull = findMissingAnswers(
  office,
  createContextFor(
    "public-office",
    { serviceCategory: "RESIDENT", availableAuthMethods: ["ID_CARD"] },
    { capturedAt: CAPTURED_AT },
  ),
);
line(
  "public-office  아무것도 안 고름 -> 2건",
  officeEmpty.length === 2 &&
    ids(officeEmpty) === "CATEGORY · AUTH_METHOD" &&
    officeFull.length === 0,
);
console.log(`    ${ids(officeEmpty)}`);
