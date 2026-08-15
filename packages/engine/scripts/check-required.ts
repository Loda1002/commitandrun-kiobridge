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

// SUPPORT is required and answerFor reports "NONE" (지원 없음) for it when
// nothing was picked. That counts as an answer, so this is 3 and not 4 — the
// fixture lists 지원 없음 among the group's options, which is the fixture saying
// that needing nothing is a choice. pm/24 ⑫.
//
// Someone who needs no support and someone who has not reached the question
// produce the same context, and the screen's multi-select cannot tell them
// apart either. Gating on it locked the first person out of the hospital flow
// entirely, and both callers grew their own workaround for that.
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

// The user ⑫ is about: every question answered, no support needed. This is the
// person who could not get past the hospital's first screen.
const hospitalNoSupport = findMissingAnswers(
  hospital,
  createContextFor(
    "hospital",
    {
      visitType: "FIRST_VISIT",
      appointmentStatus: "NO_APPOINTMENT",
      departmentId: "INTERNAL_MEDICINE",
      supportModes: [],
    },
    { capturedAt: CAPTURED_AT },
  ),
);
// ...and the reason it passes is the fixture, not a special case for one group
// id. Take 지원 없음 off the SUPPORT group and the same user is gated again.
// Without this row, "SUPPORT is answered because there is a way to answer it"
// would read the same as "SUPPORT is never gated", which is a different and
// much weaker thing to have built.
const withoutNone = {
  ...hospital,
  optionGroups: hospital.optionGroups.map((g) =>
    g.groupId === "SUPPORT" ? { ...g, options: g.options.filter((o) => o.id !== "NONE") } : g,
  ),
} as PublicFixture;
const hospitalNoNoneOption = findMissingAnswers(withoutNone, nothing("hospital"));
// ⚠️ Which mechanism reported it, not just that something did. SUPPORT lands in
// this list two ways — unanswered ("…골라 주세요"), or answered and unservable
// ("…진행할 수 있는 곳이 없습니다") — and only the first is the fixture check
// doing its job. Counting entries passed with `isOffered` deleted, because the
// unservable branch picked it up instead and printed the same four ids.
const supportSaysUnanswered = hospitalNoNoneOption
  .find((m) => m.groupId === "SUPPORT")?.message.endsWith("골라 주세요.") ?? false;

line(
  "hospital       아무것도 안 고름 -> 3건",
  hospitalEmpty.length === 3 &&
    ids(hospitalEmpty) === "VISIT_TYPE · APPOINTMENT · DEPARTMENT" &&
    hospitalFull.length === 0 &&
    ids(hospitalOffFixture) === "DEPARTMENT",
);
line(
  "hospital       지원 필요 없는 사람도 통과 -> 0건",
  hospitalNoSupport.length === 0,
);
line(
  "hospital       픽스처가 지원 없음을 안 주면 다시 4건",
  hospitalNoNoneOption.length === 4 &&
    ids(hospitalNoNoneOption) === "VISIT_TYPE · APPOINTMENT · DEPARTMENT · SUPPORT" &&
    supportSaysUnanswered,
);
console.log(`    ${ids(hospitalEmpty)}`);
console.log(`    fixture 에 없는 값(ENT) -> ${ids(hospitalOffFixture)} 1건`);
console.log(`    지원 없음 옵션을 뺀 사본 -> ${ids(hospitalNoNoneOption)}`);

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
