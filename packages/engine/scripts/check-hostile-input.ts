// What the engine does when the input is wrong. Run from the project root:
//   node packages/engine/scripts/check-hostile-input.ts
//
// check-input.ts walks the seven paths a well-formed answer set takes. This is
// the other side: values the collection channel should never send, and one
// question asked of every one of them —
//
//   does the engine ever fill an unknown with a plausible guess?
//
// It may answer UNKNOWN, it may exclude, it may ask again, it may stop. Those
// are all fine. Picking something that looks right and carrying on is not, and
// the whole claim of this product rests there: a kiosk that guesses which
// department you need, or which allergen you meant, is worse than one that says
// it does not know.
//
// The contexts here are built through createContextFor, which is what
// apps/web's toSessionContext and the submission builder both call — so these
// are answers that can actually reach the engine, not hand-made states.
import { readFile } from "node:fs/promises";
import { getDomain, isAnswered, registeredEnvironments } from "../src/domain.ts";
// Registers the three official domains, same as select.ts and plan.ts.
import "../src/domains/index.ts";
import { createContextFor } from "../src/input.ts";
import { buildExecutionPlan, unsettleableGroups } from "../src/plan.ts";
import { findMissingAnswers } from "../src/required.ts";
import { filterCandidates, score } from "../src/select.ts";
import type {
  ChickenStoreSessionContext, EnvironmentId, HospitalSessionContext, PublicFixture,
} from "../src/types.ts";

const read = async (p: string) => JSON.parse(await readFile(p, "utf8"));

/** A script may read the kit; the engine may not. Key names follow PublicFixture. */
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

const PROVENANCE = { capturedAt: "2026-08-05T07:00:00.000Z", source: "WEB_FORM" } as const;

// Hangul and CJK take two terminal columns, so pad on display width.
const width = (s: string) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);

let checks = 0;
let okChecks = 0;
const reported: string[] = [];

const verdict = (label: string, ok: boolean, detail: string) => {
  checks++;
  if (ok) okChecks++;
  else process.exitCode = 1;
  const pad = " ".repeat(Math.max(1, 34 - width(label)));
  const detailPad = " ".repeat(Math.max(1, 58 - width(detail)));
  console.log(`  ${label}${pad}${detail}${detailPad}: ${ok ? "OK" : "FAIL"}`);
};

/**
 * Something worth knowing that is not a failure of the safety rule above.
 *
 * Kept separate on purpose. Folding "the engine survived this differently than
 * expected" into FAIL would make the exit code stop meaning "it guessed", which
 * is the one thing this file is for.
 */
const note = (text: string) => reported.push(text);

/** Everything one hostile answer set produces, in one shape. */
function run(fixture: PublicFixture, environmentId: EnvironmentId, answers: Record<string, unknown>) {
  const ctx = createContextFor(environmentId, answers, PROVENANCE, fixture);
  const missing = findMissingAnswers(fixture, ctx);
  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const result = score(survivors, ctx);
  const recommendedId = result.recommendedCandidateId;
  return {
    ctx, missing, survivors, excluded, result, recommendedId,
    // Asked as a value, never by catching a throw.
    blocked: recommendedId === null ? [] : unsettleableGroups(fixture, recommendedId, ctx),
  };
}

/** The answers each environment's screens send when everything is filled in. */
const SOUND: Record<EnvironmentId, Record<string, unknown>> = {
  "chicken-store": {
    serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS",
    cupOption: "PAPER", quantity: "1", allergenIds: [], maxPriceKrw: 7000,
  },
  hospital: {
    visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT",
    departmentId: "INTERNAL_MEDICINE", supportModes: ["HEARING_SUPPORT"], guardianPresent: false,
  },
  "public-office": {
    serviceCategory: "RESIDENT", availableAuthMethods: ["MOBILE_AUTH", "ID_CARD"],
    stepByStep: true, simpleLanguage: true,
  },
};

const fixtures = new Map<EnvironmentId, PublicFixture>();
for (const environmentId of registeredEnvironments()) {
  fixtures.set(environmentId, await loadFixture(environmentId));
}
const chicken = fixtures.get("chicken-store")!;
const hospital = fixtures.get("hospital")!;

/* ═══════════ 1. a value that is not in the vocabulary at all ══════════════ */

console.log("═══ 모르는 값 ═══");

// Deliberately not a near-miss of a real option: a typo would test the fixture's
// spelling, and what is being tested is what happens to a word nobody defined.
{
  const r = run(chicken, "chicken-store", { ...SOUND["chicken-store"], spicyLevel: "NUCLEAR" });
  const prefs = (r.ctx as ChickenStoreSessionContext).preferences;
  const gated = r.missing.some((m) => m.groupId === "SPICY_LEVEL");
  // The bar for this criterion has to be empty. A candidate credited with
  // matching a spice level nobody defined is the guess this file looks for.
  const rows = r.recommendedId ? r.result.contributions[r.recommendedId] ?? [] : [];
  const claimed = rows.some((row) => row.key === "spicyLevelMatch" && row.earned > 0);
  verdict(
    "모르는 맵기",
    gated && !claimed,
    `게이트 ${gated ? "잡음" : "놓침"} · 맵기 일치 주장 ${claimed ? "있음" : "없음"}`,
  );
  // Worth saying out loud: the value is carried through rather than folded to
  // UNKNOWN the way hospital's facts are. It is caught one step later instead.
  // Compared as a string on purpose: the union types say this value cannot be
  // here, and testing that it is anyway is the whole point of the file.
  if (String(prefs.spicyLevel) === "NUCLEAR") {
    note("닭강정집 취향은 어휘 검사를 안 한다 — 컨텍스트에 그대로 실리고, 게이트가 뒤에서 잡는다 (병원 사실값은 입력에서 UNKNOWN 으로 접힌다)");
  }
}

{
  const r = run(hospital, "hospital", { ...SOUND.hospital, visitType: "TELEPORT" });
  const facts = (r.ctx as HospitalSessionContext).facts;
  const asked = r.result.reconfirmRequests.some((q) => q.path === "/facts/visitType");
  verdict(
    "모르는 방문 유형",
    String(facts.visitType) !== "TELEPORT" && r.recommendedId === null && asked,
    `컨텍스트 ${String(facts.visitType)} · 추천 ${r.recommendedId ?? "없음"} · 되묻기 ${asked ? "있음" : "없음"}`,
  );
}

{
  // A department that is real in the platform vocabulary but not offered here.
  // The dangerous answer would be to route them to some other desk.
  const r = run(hospital, "hospital", { ...SOUND.hospital, departmentId: "ENT" });
  const gated = r.missing.some((m) => m.groupId === "DEPARTMENT");
  // Both halves have to be real. Asking only whether the gate caught it would
  // pass on a gate that is the single thing standing between this customer and
  // a desk for some other department — so the plan is asked separately whether
  // it would settle DEPARTMENT, and it has to refuse on its own.
  verdict(
    "이 병원에 없는 진료과",
    gated && r.blocked.includes("DEPARTMENT"),
    `게이트 ${gated ? "잡음" : "놓침"} · 계획 막힘 ${r.blocked.join(",") || "없음"} · 1등 ${r.recommendedId ?? "없음"}`,
  );
}

{
  const r = run(chicken, "chicken-store", { ...SOUND["chicken-store"], allergenIds: ["PURPLE"] });
  const declared = (r.ctx as ChickenStoreSessionContext).hardConstraints.allergenIds ?? [];
  const asked = r.result.reconfirmRequests.some((q) => q.path === "/hardConstraints/allergenIds");
  // Neither "they are allergic to it" nor "they are not". The unknown code must
  // not exclude a dish, and must not be quietly dropped either.
  const excludedForAllergy = r.excluded.some((e) => e.reasonCode === "ALLERGEN_CONFLICT");
  verdict(
    "모르는 알레르기 코드",
    declared.includes("UNKNOWN") && !declared.includes("PURPLE" as never) &&
      r.recommendedId === null && asked && !excludedForAllergy,
    `보관값 ${JSON.stringify(declared)} · 추천 ${r.recommendedId ?? "없음"} · 알레르기 제외 ${r.excluded.filter((e) => e.reasonCode === "ALLERGEN_CONFLICT").length}건`,
  );
}

{
  // A credential this counter has never heard of. The dangerous answer is to
  // send them to a desk they cannot authenticate at, on the strength of a word
  // nobody defined.
  const publicOffice = fixtures.get("public-office")!;
  const r = run(publicOffice, "public-office", {
    ...SOUND["public-office"], availableAuthMethods: ["FINGERPRINT"],
  });
  const gated = r.missing.some((m) => m.groupId === "AUTH_METHOD");
  const asked = r.result.reconfirmRequests.some((q) => q.path === "/capabilities/availableAuthMethods");
  verdict(
    "모르는 인증 수단",
    (gated || asked) && (r.recommendedId === null || r.blocked.includes("AUTH_METHOD")),
    `게이트 ${gated ? "잡음" : "놓침"} · 되묻기 ${asked ? "있음" : "없음"} · 1등 ${r.recommendedId ?? "없음"} · 계획 막힘 ${r.blocked.join(",") || "없음"}`,
  );
}

/* ═════════════════════ 2. a budget that is not a budget ═══════════════════ */

console.log("\n═══ 망가진 예산 ═══");

for (const [label, maxPriceKrw] of [
  ["없음 (null)", null],
  ["음수", -5000],
  ["문자열", "싸게"],
  ["숫자가 아님 (NaN)", Number.NaN],
] as const) {
  let r: ReturnType<typeof run>;
  try {
    r = run(chicken, "chicken-store", { ...SOUND["chicken-store"], maxPriceKrw });
  } catch (error) {
    verdict(`예산 ${label}`, false, `던졌다: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const overBudget = r.excluded.filter((e) => e.reasonCode === "PRICE_LIMIT_EXCEEDED").length;
  // The bar is the safety rule, not the arithmetic — but it has to be asked of
  // what the engine did with the value, not of the score alone.
  //
  // `survivors.length === 0 && recommended !== null` was the earlier wording and
  // it can never be true: score() takes its winner out of the survivor list, so
  // an empty list already means no recommendation. The line passed whatever the
  // budget did — a seeded engine that ignored -5000 outright and recommended
  // CHICKEN-001 still printed OK. What follows is asked of the stored value,
  // which is where a guess would actually show up.
  const stored = (r.ctx as ChickenStoreSessionContext).hardConstraints.maxPriceKrw;
  const usable = typeof stored === "number" && Number.isFinite(stored) && stored >= 0;
  // Absent is a refusal and is fine; the arriving value kept as it came is fine.
  // Any other number in that slot is the engine deciding what the customer meant.
  const invented = stored !== undefined && !Object.is(stored, maxPriceKrw);
  // A limit it did not keep is a limit it may not exclude anybody on.
  const actedWithout = stored === undefined && overBudget > 0;
  // And a limit it kept but cannot read may not simply be stepped over. -5000
  // and NaN are not budgets, so a dish offered while one of them is on the
  // record was offered against a constraint nobody could have satisfied.
  const ignoredBroken = stored !== undefined && !usable && r.recommendedId !== null;
  verdict(
    `예산 ${label}`,
    !invented && !actedWithout && !ignoredBroken,
    `보관값 ${stored === undefined ? "없음" : String(stored)} · 제외 ${overBudget}건` +
      ` · 생존 ${r.survivors.length} · 추천 ${r.recommendedId ?? "없음"}`,
  );
  if (overBudget > 0 && r.survivors.length === 0) {
    note(`예산이 ${label} 이면 전 메뉴가 "예산 초과" 로 빠진다 — 멈추므로 안전하지만 "예산을 안 준 것과 같게" 는 아니다 (collectProfile 이 숫자만 통과시키므로 문자열은 걸러지고, 숫자인 이 값들은 그대로 비교에 쓰인다)`);
  }
}

/* ═══════════════ 3. a fixture with nothing left to recommend ══════════════ */

console.log("\n═══ 고를 것이 없는 픽스처 ═══");

{
  // A menu with nothing on it. Built here rather than on disk: the kit's
  // fixtures are platform files.
  //
  // This used to ask whether survivors, recommendation and alternatives were all
  // empty. `candidates: []` makes those three true before the engine runs — a
  // row that could never go red, which is the fault session 20 spent its time
  // removing from the rest of this file.
  //
  // What is not automatic is the shape of the stop. Three things have to hold
  // and each of them can break on its own:
  //
  //  1. The gate reports every required group as answered-but-unreachable
  //     rather than unanswered. `required.ts` consults the candidates, so with
  //     none it says 진행할 수 있는 곳이 없습니다 about answers the customer did
  //     give. A version that only asked "did they answer" reports nothing here
  //     and the customer is walked to an empty recommendation screen.
  //  2. The kiosk flags the state. `requiresReconfirmation` is carried by its
  //     confidence clause here, not by `mayRecommend` — nothing was left to ask,
  //     so dropping that clause reads false on a session with no answer.
  //  3. The planner refuses a dish that is no longer on the menu, by name. A
  //     screen holding an id from before the fixture changed is the realistic
  //     way to reach this.
  const empty = { ...chicken, candidates: [] } as PublicFixture;
  const r = run(empty, "chicken-store", SOUND["chicken-store"]);

  const domain = getDomain("chicken-store");
  const required = empty.optionGroups.filter((g) => g.required);
  const gated = new Set(r.missing.map((m) => m.groupId));
  const reportedButAnswered = required.filter(
    (g) => gated.has(g.groupId) && isAnswered(domain.answerFor(g, r.ctx)),
  );

  let refused = "";
  try {
    buildExecutionPlan({
      environmentId: "chicken-store",
      fixture: empty,
      candidateId: chicken.candidates[0]!.candidateId,
      sessionContext: r.ctx,
      approved: true,
    });
  } catch (e) {
    refused = (e as Error).message;
  }

  verdict(
    "후보 목록이 빈 배열",
    r.survivors.length === 0 &&
      r.recommendedId === null &&
      r.result.alternativeCandidateIds.length === 0 &&
      reportedButAnswered.length === required.length &&
      r.result.confidence === 0 &&
      r.result.requiresReconfirmation &&
      refused !== "",
    `생존 ${r.survivors.length} · 추천 ${r.recommendedId ?? "없음"} · 대안 ` +
      `${r.result.alternativeCandidateIds.length} · 답했지만 갈 곳 없음 ` +
      `${reportedButAnswered.length}/${required.length} · confidence ${r.result.confidence}` +
      ` · 되묻기 필요 ${r.result.requiresReconfirmation} · 계획 ${refused === "" ? "세워짐" : "거부"}`,
  );
  // The one thing the customer is not given, printed because no verdict above
  // asks for it: an empty menu excludes nobody, so the screen that says there is
  // nothing has no per-dish reason to show underneath. pm/17-RESULT.md 5절 is
  // the same gap seen from the sound fixture's side.
  note(`빈 메뉴: 제외 ${r.excluded.length}건 — 아무것도 없다는 화면에 붙일 이유 문장이 없다`);
}

{
  // Every dish sold out. The kiosk must not offer one anyway.
  const soldOut = {
    ...chicken,
    candidates: chicken.candidates.map((c) => ({ ...c, available: false })),
  } as PublicFixture;
  const r = run(soldOut, "chicken-store", SOUND["chicken-store"]);
  verdict(
    "전부 품절",
    r.survivors.length === 0 && r.recommendedId === null &&
      r.excluded.every((e) => e.reasonCode && e.explanation),
    `생존 ${r.survivors.length} · 추천 ${r.recommendedId ?? "없음"} · 제외 ${r.excluded.length}건 전부 이유 있음`,
  );
}

{
  // A required group the context-path table has never heard of. required.ts
  // reports it with an empty JSON Pointer rather than dropping it, which is what
  // keeps a fixture that grows a question from silently going unasked.
  const extraGroup = {
    ...chicken,
    optionGroups: [
      ...chicken.optionGroups,
      { groupId: "SAUCE_ON_SIDE", kind: "option", label: "소스 따로", required: true, options: [{ id: "YES", label: "예" }, { id: "NO", label: "아니오" }] },
    ],
  } as unknown as PublicFixture;
  const r = run(extraGroup, "chicken-store", SOUND["chicken-store"]);
  const named = r.missing.find((m) => m.groupId === "SAUCE_ON_SIDE");
  // Not "no recommendation". required.ts draws that line itself — an unanswered
  // question greys out a button, only `domain.reconfirm` blocks a recommendation
  // outright — so scoring still ranks. What must not happen is the plan picking
  // one of the two sauces on the customer's behalf.
  verdict(
    "픽스처에만 있는 필수 그룹",
    named !== undefined && r.blocked.includes("SAUCE_ON_SIDE"),
    `보고 ${named ? `"${named.message}"` : "없음"} · 계획 막힘 ${r.blocked.join(",") || "없음"}`,
  );
}

/* ═════════════════════ 4. nothing answered at all ═════════════════════════ */

console.log("\n═══ 아무것도 안 답함 ═══");

const BLANK: Record<EnvironmentId, Record<string, unknown>> = {
  "chicken-store": {
    serviceType: "", spicyLevel: "", boneType: "", cupOption: "", quantity: "",
    allergenIds: ["UNKNOWN"], maxPriceKrw: null,
  },
  hospital: {
    visitType: "", appointmentStatus: "", departmentId: "", supportModes: [], guardianPresent: false,
  },
  "public-office": {
    serviceCategory: "", availableAuthMethods: [], stepByStep: null, simpleLanguage: null,
  },
};

for (const environmentId of registeredEnvironments()) {
  const fixture = fixtures.get(environmentId)!;
  const r = run(fixture, environmentId, BLANK[environmentId]);
  // Read off the fixture, not counted by hand: a fixture that adds a required
  // question is followed here without anyone editing this file.
  const required = fixture.optionGroups.filter((g) => g.required).map((g) => g.groupId);
  const caught = required.filter((groupId) => r.missing.some((m) => m.groupId === groupId));
  verdict(
    `${environmentId} 빈 입력`,
    caught.length === required.length && r.recommendedId === null,
    `필수 ${required.length}개 중 ${caught.length}개 잡음 · 추천 ${r.recommendedId ?? "없음"} · 되묻기 ${r.result.reconfirmRequests.length}건`,
  );
}

/* ═════════════ 5. an answer key the engine was never told about ═══════════ */

console.log("\n═══ 엔진이 모르는 항목 ═══");

{
  const before = run(chicken, "chicken-store", SOUND["chicken-store"]);
  const after = run(chicken, "chicken-store", { ...SOUND["chicken-store"], sauceOnSide: "YES" });
  // The safety rule still holds — an ignored key cannot make the engine claim
  // anything — so this is a note rather than a failure. It is worth printing
  // because a screen that sends an answer the engine drops shows the user a
  // choice that did nothing, which is the shape pm/20 was about.
  const same = JSON.stringify(before.ctx) === JSON.stringify(after.ctx);
  // Asserted, not merely printed: an unknown key that changed the context would
  // mean the engine acted on a word nobody defined, which is the failure this
  // file is named after. That the change is *identical* is the safe half; that
  // it is invisible is the half worth reporting below.
  verdict(
    "모르는 답 항목",
    same && after.recommendedId === before.recommendedId,
    `컨텍스트 ${same ? "동일 (조용히 버림)" : "달라짐"} · 추천 ${after.recommendedId ?? "없음"}`,
  );
  if (same) {
    note("엔진이 모르는 답 항목은 흔적 없이 사라진다 — 화면이 실수로 보내면 아무도 모른다. 지금은 화면이 보내는 항목이 고정이라 도달 불가");
  }
}

/* ═══════════════════════════════ summary ═════════════════════════════════ */

console.log("\n═══ 합계 ═══");
console.log(`  ${checks}건 · OK ${okChecks} · FAIL ${checks - okChecks}`);
console.log(`  판정 기준: 엔진이 모르는 값을 그럴듯한 값으로 메우면 FAIL`);
for (const environmentId of registeredEnvironments()) {
  const domain = getDomain(environmentId);
  console.log(`  ${environmentId}: 기준 ${domain.criteria.length}개 · 제외 규칙 ${domain.rules.length}개`);
}
if (reported.length > 0) {
  console.log(`\n  보고 (실패는 아님):`);
  for (const text of reported) console.log(`    · ${text}`);
}
