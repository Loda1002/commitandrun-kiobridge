// Five situations × three environments, from answers rather than from a
// submission. Run from the project root:
//   node packages/engine/scripts/check-scenarios.ts
//
// check-domains.ts replays the one context each submission happens to carry, so
// four of the five situations the organisers named in the 08-14 notice have
// never been run at all. This builds each context from a fresh answer set, the
// same way the kiosk does — createContextFor is the entry point the web app and
// the submission builder both go through.
//
// The per-situation expectations are the interesting half, but the block of
// invariants below them is the point: those must hold in every one of the
// fifteen cells, and one FAIL there is worth more than fifteen OKs.
//
// The gate matters. score() will happily rank a candidate for an answer set
// that buildExecutionPlan then refuses — 재진 · 예약 있음 · 정형외과 has no desk
// in this fixture and only the staff route survives, which cannot honour the
// appointment. findMissingAnswers is what stops that reaching a screen, so a
// matrix that skips it would report OK on exactly the shape of defect the last
// card spent its time removing.
import { readFile } from "node:fs/promises";
import { registeredEnvironments, getDomain, isAnswered } from "../src/domain.ts";
// Registers the three official domains, same as select.ts and plan.ts.
import "../src/domains/index.ts";
import { buildExecutionPlan, resolveOptionSelections, unsettleableGroups } from "../src/plan.ts";
import { findMissingAnswers } from "../src/required.ts";
import { createContextFor } from "../src/input.ts";
import { askedForPhrase, explainAlternative } from "../src/alternative.ts";
import { explainRelaxation, relaxationOptions, type RelaxationOption } from "../src/relax.ts";
import { explainRecommendation, filterCandidates, score } from "../src/select.ts";
import { ENVIRONMENT_BOUNDARY, FORBIDDEN_ACTIONS } from "../src/types.ts";
import type {
  Candidate, EnvironmentId, ExclusionReason, PlannedAction, PublicFixture,
  RecommendationReason, SessionContext, Transition,
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

/** Fixed so a cell that changes verdict changed because the engine did. */
const CAPTURED_AT = "2026-08-05T07:00:00.000Z";
const PROVENANCE = { capturedAt: CAPTURED_AT, source: "WEB_FORM" } as const;

/**
 * The context for one answer set, built once per answer set.
 *
 * Keyed on the answer object itself, not on its contents: the sweeps enumerate
 * each environment's answer sets once and then hand the same objects to a filter
 * and to the run, which used to build the same context twice. Nothing here
 * mutates a context — the engine only reads them — so sharing is safe.
 */
const contexts = new Map<EnvironmentId, WeakMap<object, SessionContext>>();
function contextFor(
  fixture: PublicFixture,
  environmentId: EnvironmentId,
  answers: Record<string, unknown>,
): SessionContext {
  // Per environment, not one map for all three. No answer set is shared between
  // environments today, but a cache that cannot tell them apart would hand back
  // a context built for the wrong one the moment that stopped being true.
  let perEnvironment = contexts.get(environmentId);
  if (!perEnvironment) contexts.set(environmentId, (perEnvironment = new WeakMap()));

  const cached = perEnvironment.get(answers);
  if (cached) return cached;
  const ctx = createContextFor(environmentId, answers, PROVENANCE, fixture);
  perEnvironment.set(answers, ctx);
  return ctx;
}

/**
 * The one required group the screen drops before it gates on the answer.
 *
 * Mirrors `isUnanswerableHere` in apps/web/lib/api.ts — hospital's SUPPORT is
 * `required: true`, but the question offers 큰 글씨 / 청각 지원 / 직원 도움 and
 * nothing else, so someone who needs no support has no way to answer it. The
 * screen drops it rather than locking those users out, and a matrix that gates
 * where the screen does not would grade a path nobody walks: hospital D is
 * exactly that user, and without this it never reaches a plan at all.
 *
 * Duplicated rather than imported because that file is a Next.js module and
 * `packages/engine` may not depend on the web app.
 *
 * ⚠️ **The engine half of this has landed** (pm/24 ⑫): `required.ts` now counts
 * hospital's SUPPORT as answered, because the fixture offers 지원 없음 and that
 * is a choice rather than a gap. So this function no longer fires — the summary
 * line below says 없음 every run, which is what it was printed for.
 *
 * Kept for one reason: `apps/web/lib/api.ts` still filters the same group out
 * of the question list, and that file is G5. While the screen declines to ask
 * the question, a matrix that gated where the screen does not would grade a
 * path nobody walks. Delete this together with `isUnanswerableHere` — the pair
 * still goes away together, and now only the web half is left.
 */
const droppedByScreen = (environmentId: EnvironmentId, groupId: string): boolean =>
  environmentId === "hospital" && groupId === "SUPPORT";

// Hangul and CJK take two terminal columns, so pad on display width.
const width = (s: string) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣＀-｠]/.test(ch) ? 2 : 1), 0);

let cells = 0;
let okCells = 0;
let sweptClaims = 0;
let okClaims = 0;
let deniedTotal = 0;
/** How many plans the deny-list and the boundary were actually compared against. */
let plansChecked = 0;

const line = (label: string, ok: boolean, detail: string, labelWidth: number) => {
  if (!ok) process.exitCode = 1;
  const pad = " ".repeat(Math.max(1, labelWidth - width(label)));
  const detailPad = " ".repeat(Math.max(1, 62 - width(detail)));
  console.log(`  ${label}${pad}${detail}${detailPad}: ${ok ? "OK" : "FAIL"}`);
};

const cell = (label: string, ok: boolean, detail: string) => {
  cells++;
  if (ok) okCells++;
  line(label, ok, detail, 20);
};

/** Counted apart from the fifteen cells: a sweep is a claim about a whole space. */
const claim = (label: string, ok: boolean, detail: string) => {
  sweptClaims++;
  if (ok) okClaims++;
  line(label, ok, detail, 22);
};

/* ═══════════════════════ the five answer sets per environment ═══════════════
 *
 * Answers, not contexts: a hand-built context could describe a state the
 * collection channel can never produce, and then the cell would prove nothing.
 * Every value here is one the fixture's own option-groups offer, except the
 * deliberately-unanswered ones, which are "" — the same empty the screen sends
 * when nobody touched the control.
 */
type Situation = "A" | "B" | "C" | "D" | "E" | "F";
type AnswerSet = { note: string; answers: Record<string, unknown> };

/**
 * The `supports` flag situation F asks about, per environment.
 *
 * F grades the sentence pm/24 ① rewrote: when the winner cannot give a support
 * the user asked for, the reason has to name a route that can, by the name the
 * fixture gives it. Which flag carries that support is the one piece of domain
 * vocabulary this file cannot derive, so it is declared — and declared here
 * rather than read from the domain, for the reason `MAY_REPLACE_AN_ANSWER`
 * gives: a check that reads the engine's own table follows the engine wherever
 * it goes, including somewhere wrong.
 *
 * chicken-store has no entry because it has no supports at all. That absence is
 * not assumed, it is checked — see `unreachableCell`.
 */
const F_SUPPORT_FLAG: Partial<Record<EnvironmentId, string>> = {
  hospital: "hearingSupport",
  "public-office": "stepByStep",
};

const SCENARIOS: Record<EnvironmentId, Record<Situation, AnswerSet | null>> = {
  "chicken-store": {
    A: {
      note: "포장 · 매운맛 · 순살 · 1개 · 견과류 알레르기 · 7,000원",
      answers: {
        serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS",
        cupOption: "PAPER", quantity: "1", allergenIds: ["PEANUT"], maxPriceKrw: 7000,
      },
    },
    B: {
      note: "알레르기만 미확인 (나머지는 다 답함)",
      answers: {
        serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS",
        cupOption: "PAPER", quantity: "1", allergenIds: ["UNKNOWN"], maxPriceKrw: 7000,
      },
    },
    C: {
      note: "보통맛 + 뼈 — 그런 메뉴가 없다",
      answers: {
        serviceType: "TAKE_OUT", spicyLevel: "MEDIUM", boneType: "BONE",
        cupOption: "PAPER", quantity: "1", allergenIds: [], maxPriceKrw: 7000,
      },
    },
    D: {
      note: "견과류 · 대두 알레르기 + 예산 6,000원",
      answers: {
        serviceType: "TAKE_OUT", spicyLevel: "HOT", boneType: "BONELESS",
        cupOption: "PAPER", quantity: "1", allergenIds: ["PEANUT", "SOY"], maxPriceKrw: 6000,
      },
    },
    E: {
      note: "예산 3,000원 — 제일 싼 메뉴가 5,500원",
      answers: {
        serviceType: "TAKE_OUT", spicyLevel: "MILD", boneType: "BONELESS",
        cupOption: "PAPER", quantity: "1", allergenIds: [], maxPriceKrw: 3000,
      },
    },
    // A menu is not a desk: nothing here advertises a support, so there is no
    // unmet one to name. Checked rather than assumed — see `unreachableCell`.
    F: null,
  },
  hospital: {
    A: {
      note: "재진 · 예약 있음 · 내과 · 청각 지원",
      answers: {
        visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT",
        departmentId: "INTERNAL_MEDICINE", supportModes: ["HEARING_SUPPORT"], guardianPresent: false,
      },
    },
    B: {
      note: "진료과만 미답 (나머지는 다 답함)",
      answers: {
        visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT",
        departmentId: "", supportModes: [], guardianPresent: false,
      },
    },
    C: {
      note: "시각 안내 요청 — 어느 접수 경로도 제공하지 않는다",
      answers: {
        visitType: "REVISIT", appointmentStatus: "HAS_APPOINTMENT",
        departmentId: "INTERNAL_MEDICINE", supportModes: ["VISUAL_GUIDANCE"], guardianPresent: false,
      },
    },
    D: {
      note: "재진 · 예약 없음 · 진료과 미정",
      answers: {
        visitType: "REVISIT", appointmentStatus: "NO_APPOINTMENT",
        departmentId: "UNSPECIFIED", supportModes: [], guardianPresent: false,
      },
    },
    // The staff route declares no visit type, so every mismatch rule steps
    // around it and it is never unavailable. E is checked by sweep instead.
    E: null,
    F: {
      // Not the same shape as C. There the mode has no flag anywhere in the
      // fixture and the honest answer is the staff desk; here the flag exists,
      // 비예약 초진 안내 wins without it, and 직원 도움 요청 has it — so there is
      // a name to say, which is the whole of the sentence ① rewrote.
      note: "청각 지원 요청 · 비예약 초진 — 1등이 그 지원을 못 준다",
      answers: {
        visitType: "FIRST_VISIT", appointmentStatus: "NO_APPOINTMENT",
        departmentId: "UNSPECIFIED", supportModes: ["HEARING_SUPPORT"], guardianPresent: false,
      },
    },
  },
  "public-office": {
    A: {
      note: "주민등록 · 모바일인증+신분증 · 단계별 안내",
      // Byte-for-byte the answers in input/public-office-input.json, as the
      // other two A cells are: that makes this row a cross-check of the
      // submission the official validator passed, not a second opinion.
      answers: {
        serviceCategory: "RESIDENT", availableAuthMethods: ["MOBILE_AUTH", "ID_CARD"],
        stepByStep: true, simpleLanguage: true,
      },
    },
    B: {
      note: "인증수단만 미답 (분야는 답함)",
      answers: {
        serviceCategory: "RESIDENT", availableAuthMethods: [],
        stepByStep: true, simpleLanguage: null,
      },
    },
    C: {
      note: "건강보험 + 단계별 안내 — 그 창구만 안내를 못 준다",
      answers: {
        serviceCategory: "INSURANCE", availableAuthMethods: ["MOBILE_AUTH"],
        stepByStep: true, simpleLanguage: null,
      },
    },
    D: {
      note: "지방세 · 신분증만 소지",
      answers: {
        serviceCategory: "TAX", availableAuthMethods: ["ID_CARD"],
        stepByStep: true, simpleLanguage: null,
      },
    },
    // PUBLIC-006 is exempt from both mismatch rules, same shape as HOS-006.
    E: null,
    F: {
      // The same answers as C, graded on a different claim: C says the unmet
      // criterion shows up as an empty bar, F says the sentence next to it names
      // where the guidance can be had. Sharing the answer set is deliberate —
      // two spellings of "the one service that cannot guide step by step" would
      // drift, and the fixture only has one.
      note: "건강보험 + 단계별 안내 — 그 업무가 안내를 못 준다",
      answers: {
        serviceCategory: "INSURANCE", availableAuthMethods: ["MOBILE_AUTH"],
        stepByStep: true, simpleLanguage: null,
      },
    },
  },
};

/* ═══════════════════════════ one cell, end to end ═════════════════════════ */

interface Run {
  ctx: SessionContext;
  /** What the engine reports unanswered, before the screen drops any of it. */
  rawMissing: string[];
  /** What the screen would actually gate on. */
  missing: string[];
  excluded: ExclusionReason[];
  /** Candidates that survived filtering, by id. */
  survivorIds: string[];
  /** The same survivors as objects, for claims that read the fixture's own fields. */
  survivors: Candidate[];
  recommendedId: string | null;
  /**
   * The sentences the user would be shown. Empty when there is no
   * recommendation, because `explain` is only ever asked about one.
   *
   * Built with the survivor list, the way `participant.ts` builds it, so a cell
   * grades the wording the submission carries rather than a second spelling of
   * it — the divergence pm/24 ① left open at `apps/web` is one too many already.
   */
  reasons: RecommendationReason[];
  reconfirmCount: number;
  confidence: number;
  earnedSum: number;
  zeroLabels: string[];
  /**
   * Groups that stop the winner being planned, whether or not the gate ran.
   *
   * Asked even for an answer set the gate already stopped, because the sweeps
   * compare the two: a gate that blocks something plannable turns away a user it
   * could have served, and one that passes something unplannable hands them a
   * button that does nothing. Empty when there is no recommendation to plan.
   */
  blocked: string[];
  plan: PlannedAction[] | null;
  /** Which option groups stopped the plan, already worded for the report line. */
  planError: string | null;
  /** Set only when the planner threw after `blocked` said it would not. */
  threw: string | null;
}

/**
 * One answer set through the engine, exactly as the kiosk would take it.
 *
 * The single pass behind both halves of this file. The sweeps used to run their
 * own copy of it, and two implementations of "what would the screen do with this
 * answer set" that can drift apart is the fault `required.ts` names when it
 * explains why it calls `unsettleableGroups` instead of reimplementing it — the
 * matrix and the sweeps would have ended up disagreeing about the same session.
 */
function runCell(fixture: PublicFixture, environmentId: EnvironmentId, answers: Record<string, unknown>): Run {
  const ctx = contextFor(fixture, environmentId, answers);

  // The gate the screen runs before it will draw anything — including the one
  // group it drops, or this would gate where the real flow does not.
  const rawMissing = findMissingAnswers(fixture, ctx).map((m) => m.groupId);
  const missing = rawMissing.filter((groupId) => !droppedByScreen(environmentId, groupId));

  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const result = score(survivors, ctx);
  const recommendedId = result.recommendedCandidateId;

  const rows = recommendedId ? result.contributions[recommendedId] ?? [] : [];
  const earnedSum = Math.round(rows.reduce((sum, r) => sum + r.earned, 0) * 100) / 100;

  const recommended = survivors.find((c) => c.candidateId === recommendedId);
  const reasons = recommended
    ? explainRecommendation(recommended, ctx, excluded, survivors)
    : [];

  // Ask which groups block the plan rather than catching the throw: the answer
  // is a value, and try/catch would turn every unrelated bug into a passing
  // "expected failure".
  const blocked = recommendedId === null ? [] : unsettleableGroups(fixture, recommendedId, ctx);

  let plan: PlannedAction[] | null = null;
  let planError: string | null = null;
  let threw: string | null = null;

  // No recommendation means no plan — not an empty one, none at all. And a
  // recommendation the gate has not cleared is not one the screen would offer,
  // so planning it here would measure a path no user can reach.
  if (recommendedId !== null && missing.length === 0) {
    if (blocked.length === 0) {
      try {
        plan = buildExecutionPlan({
          environmentId, fixture, candidateId: recommendedId, sessionContext: ctx, approved: true,
        }).actions;
      } catch (error) {
        // Not an expected outcome being swallowed: `blocked` has just said every
        // group settles, so a throw here is the two disagreeing and it fails
        // whatever asked for it. Recorded rather than left to kill the process
        // so the answer set that did it is named and the rest of the report
        // still prints — a stack trace with 672 candidates and no matrix is a
        // worse way to find out.
        threw = error instanceof Error ? error.message : String(error);
      }
    } else {
      planError = `계획 불가: ${blocked.join(",")}`;
    }
  }

  return {
    ctx, rawMissing, missing, excluded,
    survivorIds: survivors.map((c) => c.candidateId), survivors, recommendedId, reasons,
    reconfirmCount: result.reconfirmRequests.length,
    confidence: result.confidence, earnedSum,
    zeroLabels: rows.filter((r) => r.earned === 0).map((r) => r.label),
    blocked, plan, planError, threw,
  };
}

/* ═════════ what has to be true in every cell, whatever the situation ═══════ */

/** Only the five keys the official SemanticAction schema names, and no others. */
const ACTION_KEYS = new Set(["actionIndex", "action", "target", "expectedBeforeState", "expectedAfterState"]);
const TARGET_KEYS = new Set(["kind", "id", "groupId"]);

/**
 * What has to be true of a plan, wherever the plan came from.
 *
 * Split out of `invariants` so the sweeps can hold their plans to the same bar
 * as the cells. They were building hundreds of plans and dropping them
 * unexamined, which measured only that `buildExecutionPlan` did not throw — and
 * "it did not throw" is a long way from "nothing forbidden reached the plan",
 * which is the sentence the platform actually fails us on.
 */
function planInvariants(
  fixture: PublicFixture,
  environmentId: EnvironmentId,
  plan: PlannedAction[],
): string[] {
  const bad: string[] = [];
  const { manifest } = fixture;
  const boundary = ENVIRONMENT_BOUNDARY[environmentId];

  // The deny-list is read, never retyped: writing one of those strings into
  // this file would itself be the failure it is meant to detect.
  const denied = new Set([...FORBIDDEN_ACTIONS, ...manifest.forbiddenActions]);

  plansChecked++;

  const last = plan.at(-1);
  if (last?.action !== manifest.requiredVerifierAction) bad.push("마지막이 확인 동작이 아니다");
  if (last?.expectedAfterState !== manifest.reviewBoundaryState) bad.push("마지막 상태가 검토 경계가 아니다");
  if (boundary.boundaryState !== manifest.reviewBoundaryState) bad.push("types.ts 경계표가 매니페스트와 다르다");
  if (boundary.verifierAction !== manifest.requiredVerifierAction) bad.push("types.ts 확인동작이 매니페스트와 다르다");

  const hits = plan.filter((a) => denied.has(a.action));
  deniedTotal += hits.length;
  if (hits.length > 0) bad.push(`금지 동작 ${hits.length}건`);

  const outside = plan.filter((a) => !manifest.allowedActions.includes(a.action));
  if (outside.length > 0) bad.push(`허용 목록 밖 ${outside.length}건`);

  // Coordinates, automationId and control ids are rejected by the platform.
  // Checked as an allow-list of keys so anything at all beyond the semantic
  // target is caught, including field names nobody thought to look for.
  for (const action of plan) {
    if (Object.keys(action).some((k) => !ACTION_KEYS.has(k))) bad.push("액션에 스키마 밖 필드가 있다");
    if (Object.keys(action.target).some((k) => !TARGET_KEYS.has(k))) bad.push("target 에 스키마 밖 필드가 있다");
    if (action.target.kind === "option" && action.target.groupId === undefined) bad.push("option 인데 groupId 가 없다");
  }

  return bad;
}

/**
 * pm/24 G8 — a recommendation the planner cannot settle, offered anyway.
 *
 * Not "the winner's `unsettleableGroups` is always empty": measured, that is
 * false. 64 of the hospital's 160 answer sets rank a winner no plan can be
 * built for — 재진 · 예약 있음 · 정형외과 has no desk, so only the staff route
 * survives and it cannot honour an appointment. Writing the claim the way the
 * card words it would be a line that can never be green, which is the same
 * fault as one that can never be red.
 *
 * What must hold is that none of those reach a user: the gate stops every one.
 * So the violation is the pair — a non-empty `blocked` on an answer set the
 * screen would have let through.
 */
const g8Violated = (run: Run) =>
  run.recommendedId !== null && run.missing.length === 0 && run.blocked.length > 0;

function invariants(fixture: PublicFixture, environmentId: EnvironmentId, run: Run): string[] {
  const bad: string[] = [];

  if (run.recommendedId === null && run.plan !== null) bad.push("추천이 없는데 계획이 있다");
  if (g8Violated(run)) bad.push(`G8 위반: 1등 ${run.recommendedId} 를 계획할 수 없다 (${run.blocked.join(",")})`);
  if (run.plan) bad.push(...planInvariants(fixture, environmentId, run.plan));

  // A confidence the bars cannot account for is a number arguing with its own
  // evidence, which is the one thing the chart exists to prevent.
  if (run.recommendedId !== null && Math.abs(run.earnedSum - run.confidence) > 1e-9) {
    bad.push(`막대 합 ${run.earnedSum} ≠ confidence ${run.confidence}`);
  }

  return bad;
}

/* ═══════════════════ per-situation expectations (card 1번) ════════════════ */

/**
 * F — the winner could not give a support that was asked for, so the reason has
 * to name a route that can.
 *
 * Written so that every way of not testing anything is a FAIL rather than a
 * pass. The premise is checked before the claim: if the fixture stops producing
 * a winner that lacks the flag, or stops having anywhere else to send them, the
 * cell says so and goes red instead of quietly grading an empty set — the shape
 * of fault session 20 found in `check-hostile-input` and the one the card warns
 * about again here.
 *
 * The expected names are read out of the fixture and looked for in the
 * sentence. Writing 직원 도움 요청 into this file would pass just as happily
 * against a sentence that had it hard-coded, which is what ① removed.
 */
function judgeUnmetSupportNamed(
  environmentId: EnvironmentId,
  run: Run,
): { ok: boolean; why: string } {
  const flag = F_SUPPORT_FLAG[environmentId];
  if (flag === undefined) return { ok: false, why: "F 대상 지원 플래그가 선언되지 않았다" };

  const winner = run.survivors.find((c) => c.candidateId === run.recommendedId);
  if (!winner) return { ok: false, why: `추천이 없다 (1등 ${run.recommendedId})` };

  const provides = (c: Candidate) => ((c.supports ?? {}) as Record<string, unknown>)[flag] === true;
  if (provides(winner)) {
    return { ok: false, why: `1등 ${winner.candidateId} 가 ${flag} 를 제공한다 — 이 칸이 재는 상황이 아니다` };
  }

  const providers = run.survivors.filter((c) => c.candidateId !== winner.candidateId && provides(c));
  if (providers.length === 0) {
    return { ok: false, why: `${flag} 를 주는 생존 후보가 없다 — 이름 붙일 대상이 없다` };
  }

  const accessibility = run.reasons.filter((r) => r.tag === "ACCESSIBILITY").map((r) => r.text);
  const text = accessibility.join(" ");
  const unnamed = providers.filter((c) => !text.includes(c.name));
  // The wording ① replaced. Named explicitly so a revert cannot pass by
  // accident on some other sentence happening to carry the route name.
  const vague = accessibility.some((t) => t.includes("아래 대안에서"));

  return {
    ok: unnamed.length === 0 && !vague && accessibility.length > 0,
    why:
      `1등 ${winner.candidateId} (${flag} 없음) · 이름 불린 경로 ` +
      `${providers.map((c) => c.name).join(" · ")}` +
      (unnamed.length > 0 ? ` — 문장에 없음: ${unnamed.map((c) => c.name).join(",")}` : "") +
      (vague ? ` — "아래 대안에서" 가 남아 있다` : ""),
  };
}

function judge(situation: Situation, environmentId: EnvironmentId, run: Run): { ok: boolean; why: string } {
  switch (situation) {
    case "A":
      return {
        ok: run.recommendedId !== null && run.reconfirmCount === 0 && run.missing.length === 0 && run.plan !== null,
        why: `1등 ${run.recommendedId} · ${run.plan?.length ?? 0}단계`,
      };
    case "B":
      // The domain declares what it must ask about; this reads that answer
      // rather than repeating the list, so a domain that adds a question is
      // followed here without anyone editing this file.
      return {
        ok: run.recommendedId === null && run.reconfirmCount > 0,
        why: `추천 없음 · reconfirm ${run.reconfirmCount}건`,
      };
    case "C":
      return {
        ok: run.recommendedId !== null && run.zeroLabels.length > 0 && run.plan !== null,
        why: `1등 ${run.recommendedId} · 미충족 [${run.zeroLabels.join(" , ")}]`,
      };
    case "D":
      // The plan is part of the claim. "남은 후보로 추천이 된다" is not honoured
      // by a winner the user cannot actually be taken to, and a cell that stops
      // before planning is the exact blind spot this matrix exists to close.
      return {
        ok:
          run.excluded.length > 0 &&
          run.excluded.every((e) => e.reasonCode && e.explanation) &&
          run.recommendedId !== null &&
          run.plan !== null,
        why: `제외 ${run.excluded.length}건 · 1등 ${run.recommendedId} · ${run.plan?.length ?? 0}단계`,
      };
    case "E":
      return {
        ok: run.survivorIds.length === 0 && run.recommendedId === null && run.plan === null,
        why: `후보 0 · 추천 없음 · 계획 없음`,
      };
    case "F":
      return judgeUnmetSupportNamed(environmentId, run);
  }
}

/**
 * A cell whose situation this environment cannot reach, and what stands in for
 * it.
 *
 * "도달 불가" is a claim and not an excuse, so each branch names a measurement
 * that can fail. A row that printed 해당 없음 would be one the matrix can never
 * go red on, which is the whole reason this file exists.
 */
function unreachableCell(
  situation: Situation,
  environmentId: EnvironmentId,
  fixture: PublicFixture,
): { ok: boolean; why: string } {
  if (situation === "F") {
    // The barrier pm/24 G7 rests on. Nothing in this fixture advertises a
    // support, so no accessibility sentence can fire here and the chicken shop
    // stays out of that path entirely — which is what keeps the frozen
    // submission out of reach of every accessibility change we make. The day a
    // candidate gains a `supports` block, that stops being true and this goes
    // red rather than the fact being discovered from a changed hash.
    const declaring = fixture.candidates.filter(
      (c) => c.supports !== undefined && Object.keys(c.supports).length > 0,
    );
    return {
      ok: declaring.length === 0,
      why:
        `지원 개념 없음 · supports 를 선언한 후보 ${declaring.length}/${fixture.candidates.length}` +
        (declaring.length > 0 ? ` (${declaring.map((c) => c.candidateId).join(",")})` : " — G7 방벽"),
    };
  }

  // E. Not "a candidate always survives" — that was the weaker claim, and the
  // 64 hospital combinations where the staff route survives and the gate still
  // stops the user are its counter-example. The way out is only a way out if
  // every answer set that reaches it can be planned, so the cell rests on the
  // gate/plan agreement rather than on the survivor count. 과잉차단 0 and 샌 것
  // 0 together are what say the gated set and the unplannable set are the same
  // set, which is the whole claim.
  const t = wholeEnvironment(environmentId);
  return {
    ok: t.zeroCandidates === 0 && t.escape.length > 0 && soundSweep(t),
    why:
      `설계상 도달 불가 · ${t.total}조합 후보0 = ${t.zeroCandidates} · ${agreement(t)}` +
      ` · 탈출구 ${t.escape.join(",") || "(없음)"}`,
  };
}

/** Reason codes and how many candidates each one took, for the D line. */
const byReason = (excluded: ExclusionReason[]) => {
  const counts: Record<string, number> = {};
  for (const e of excluded) counts[e.reasonCode] = (counts[e.reasonCode] ?? 0) + 1;
  return Object.entries(counts).map(([code, n]) => `${code} ${n}`).join(" · ");
};

const SITUATION_LABEL: Record<Situation, string> = {
  A: "A 정상 추천", B: "B 추가 확인", C: "C 선호 불일치",
  D: "D 제약조건 충돌", E: "E 적합 후보 없음", F: "F 미충족 지원 안내",
};

/* ═══════════════════════════════ sweeps ═══════════════════════════════════
 *
 * Fifteen cells are fifteen answer sets, and that is the shape of defect the
 * last card spent itself on: six checks all passing while a fault sat in the
 * open, because every one of them saw one input per environment and "this path
 * is sound" looked exactly like "nobody walked this path". These enumerate what
 * the screens can actually produce and count the outcome of all of it.
 *
 * Three questions, and they are deliberately not one question:
 *
 *   · Does any input reach zero candidates? — the claim the E cells rest on for
 *     the two environments whose fallback route is exempt from every mismatch
 *     rule. Asserting E there would be asserting the fixture is broken.
 *   · Does the gate block exactly the inputs no plan can be built for? — a
 *     surviving candidate and a reachable one are not the same thing, so
 *     counting survivors alone would leave the E cells claiming more than they
 *     had measured. Over-gating strands a user who could have been served;
 *     under-gating hands them a button that does nothing, which is the dead end
 *     pm/20 closed. Both are counted, and either one fails the sweep.
 *   · Does a plan ever select something the user did not say? — see
 *     MAY_REPLACE_AN_ANSWER below.
 */

/** Every answer set for this environment that its screens could send. */
function sweepAnswerSets(environmentId: EnvironmentId, fixture: PublicFixture): Record<string, unknown>[] {
  const group = (groupId: string) => fixture.optionGroups.find((g) => g.groupId === groupId);
  const ids = (groupId: string) => (group(groupId)?.options ?? []).map((o) => o.id);
  /** "" is what an untouched control posts, so it belongs in the space. */
  const orBlank = (groupId: string) => ["", ...ids(groupId)];
  const sets: Record<string, unknown>[] = [];

  if (environmentId === "chicken-store") {
    // QUANTITY travels as the option's own `value`, stringified the way the form
    // posts it; every other group travels as the option id.
    const quantity = (id: string) => {
      if (id === "") return "";
      const value = group("QUANTITY")?.options.find((o) => o.id === id)?.value;
      // Not defaulted to "". That is this file's spelling of "the user did not
      // touch the control", so a fixture that dropped `value` would turn the
      // whole quantity axis into unanswered and be absorbed as a shifted count
      // rather than reported.
      if (value === undefined) throw new Error(`check-scenarios: QUANTITY 옵션 ${id} 에 value 가 없다`);
      return String(value);
    };
    for (const serviceType of orBlank("SERVICE_TYPE"))
      for (const spicyLevel of orBlank("SPICY_LEVEL"))
        for (const boneType of orBlank("BONE_TYPE"))
          for (const cupOption of orBlank("CUP"))
            for (const q of orBlank("QUANTITY"))
              sets.push({
                serviceType, spicyLevel, boneType, cupOption, quantity: quantity(q),
                // Held fixed, and not because they do not matter: an
                // unestablished allergy is cell B and a budget nothing fits is
                // cell E. Varying them here would fold three different reasons
                // for stopping into one count and none of them would be legible.
                allergenIds: [], maxPriceKrw: 7000,
              });
  }

  if (environmentId === "hospital") {
    // The screen's SUPPORT choices, mapped to the vocabulary the context uses.
    // 지원 없음 is the empty list — the answer the kiosk has no button for, and
    // the user this sweep is mostly about.
    const SUPPORT_MODE: Record<string, string[]> = {
      NONE: [], LARGE_TEXT: ["LARGE_TEXT"], HEARING: ["HEARING_SUPPORT"], STAFF_HELP: ["STAFF_HELP"],
    };
    for (const visitType of ids("VISIT_TYPE"))
      for (const appointmentStatus of ids("APPOINTMENT"))
        for (const departmentId of ids("DEPARTMENT"))
          for (const support of ids("SUPPORT"))
            sets.push({ visitType, appointmentStatus, departmentId, supportModes: SUPPORT_MODE[support] ?? [], guardianPresent: false });
  }

  if (environmentId === "public-office") {
    // AUTH_METHOD is a multi-select: the user says what they are carrying, so
    // the space is every subset and not every option.
    const methods = ids("AUTH_METHOD");
    for (const serviceCategory of ids("CATEGORY"))
      for (let mask = 0; mask < 1 << methods.length; mask++)
        for (const stepByStep of [true, false])
          sets.push({
            serviceCategory,
            availableAuthMethods: methods.filter((_, i) => mask & (1 << i)),
            stepByStep, simpleLanguage: null,
          });
  }

  return sets;
}

/**
 * The values a plan may select in place of the answer the user actually gave.
 *
 * Written out here rather than read from `plan.ts`'s own NEUTRAL_OPTION_IDS on
 * purpose, and against the rule the rest of this file follows. A check that
 * reads the engine's list of permitted overrides asserts nothing — it would
 * follow the engine to whatever it started overriding with, which is precisely
 * the regression worth catching. 미정 and 직원 상담 / 직원 확인 are refusals to
 * decide; a plan that puts anything else into a fact group is deciding on the
 * user's behalf, and for a hospital department that is the line this project
 * exists not to cross.
 */
const MAY_REPLACE_AN_ANSWER: Partial<Record<EnvironmentId, string[]>> = {
  hospital: ["UNSPECIFIED"],
  "public-office": ["STAFF", "STAFF_ASSIST"],
};

/**
 * Selections where the plan will order something other than what the user
 * chose, split into the ones it may make and the ones it may not.
 *
 * A taste is allowed to be settled by the dish — a menu that only comes boneless
 * leaves no form to choose — and the score chart already says so, because the
 * criterion it feeds comes out `earned = 0` and lands in `unmetConditions`. A
 * multi-answer group is allowed to be settled by the counter as long as it picks
 * something the user said they had. Everything else is invented.
 */
function classifyReplacements(
  fixture: PublicFixture,
  environmentId: EnvironmentId,
  answers: Record<string, unknown>,
  selections: ReturnType<typeof resolveOptionSelections>,
): { settled: string[]; invented: string[] } {
  const neutral = MAY_REPLACE_AN_ANSWER[environmentId] ?? [];

  /**
   * Whether the user themselves put this value on the table, for this group.
   *
   * The answer set is searched rather than a named field, so a second
   * multi-select needs no edit here — but only lists drawn entirely from this
   * group's own options count. Accepting any array let a value the user listed
   * under an unrelated question excuse a replacement in this one, which would
   * quietly file an invented answer as a permitted one.
   */
  const carried = (groupId: string, id: string) => {
    const group = fixture.optionGroups.find((g) => g.groupId === groupId);
    if (!group) return false;
    const offered = new Set(group.options.map((o) => o.id));
    return Object.values(answers).some(
      (v) =>
        Array.isArray(v) && v.length > 0 &&
        v.every((entry) => offered.has(String(entry))) && v.includes(id),
    );
  };

  const settled: string[] = [];
  const invented: string[] = [];
  for (const s of selections) {
    if (s.userAnswer === s.optionId) continue;

    // A group the user never answered that the plan selected anyway. Counted
    // rather than skipped: `mayFill` in plan.ts does exactly this for a required
    // group left open, so skipping it left the hole where the plan is likeliest
    // to overstep. userAnswer is null only here — optionId is never null,
    // because a group the plan skips is not in `selections` at all.
    const filledIn = s.userAnswer === null;
    const note = filledIn
      ? `${s.groupId} (미응답) ⇒ ${s.optionLabel}`
      : `${s.groupId} ${s.userAnswerLabel ?? s.userAnswer} ⇒ ${s.optionLabel}`;

    const allowed =
      s.kind === "option" ||
      neutral.includes(s.optionId) ||
      // Only where the user answered. A group they left blank puts nothing on
      // the table, so there is nothing of theirs for the counter to choose from
      // and selecting a credential they never claimed is inventing one.
      (!filledIn && carried(s.groupId, s.optionId));

    (allowed ? settled : invented).push(note);
  }
  return { settled, invented };
}

interface Tally {
  total: number;
  /** Answer sets where every candidate was excluded. */
  zeroCandidates: number;
  /** Answer sets the screen would stop at. */
  gated: number;
  /** Plans actually built, out of the answer sets the gate let through. */
  planned: number;
  /** Let through and then unplannable — a button that does nothing. */
  leaked: string[];
  /**
   * Answer sets that ranked a winner the planner cannot settle, gate or no gate.
   * Not a failure on its own: the whole hospital fixture produces 64 of them.
   */
  unplannableWinner: number;
  /** The ones the gate did not stop. Those are G8 violations, and one fails. */
  g8: string[];
  /** Stopped although a plan could have been built — a user turned away for nothing. */
  overGated: string[];
  /** Candidates alive in every single answer set: the fixture's way out. */
  escape: string[];
  /** Plans that ordered exactly what the user chose, group for group. */
  verbatim: number;
  /** Groups replaced, counted across all plans — not the same as plans replaced. */
  replacements: number;
  /** Replacements the plan is allowed to make, and how often, for the report. */
  settled: Record<string, number>;
  /** Replacements it is not. One is a failure. */
  invented: string[];
  /** Everything `planInvariants` rejected across the swept plans. */
  broken: string[];
  /** Answer sets where the planner threw after `blocked` said it would not. */
  threw: string[];
}

function sweep(
  fixture: PublicFixture,
  environmentId: EnvironmentId,
  answerSets: Record<string, unknown>[],
): Tally {
  const t: Tally = {
    total: answerSets.length, zeroCandidates: 0, gated: 0, planned: 0,
    leaked: [], unplannableWinner: 0, g8: [], overGated: [], escape: [],
    verbatim: 0, replacements: 0, settled: {}, invented: [], broken: [], threw: [],
  };
  let alwaysAlive: Set<string> | null = null;

  for (const answers of answerSets) {
    const run = runCell(fixture, environmentId, answers);
    // Only paid for by the answer sets that actually go wrong.
    const key = () => JSON.stringify(answers);

    if (run.survivorIds.length === 0) t.zeroCandidates++;
    const alive = new Set(run.survivorIds);
    if (alwaysAlive === null) alwaysAlive = alive;
    else for (const id of [...alwaysAlive]) if (!alive.has(id)) alwaysAlive.delete(id);

    // A plan is possible when there is a winner and nothing blocks settling it.
    // Known for every answer set, gated or not, because comparing the two is the
    // point — asking only about the ones that got through would measure the gate
    // against itself.
    const plannable = run.recommendedId !== null && run.blocked.length === 0;

    // G8, counted apart from `leaked`, which merges this with "the gate let a
    // set through and the domain still refused to recommend". Those are
    // different faults and only the first is about ranking something
    // unreachable, so a single number cannot say which one moved.
    if (run.recommendedId !== null && run.blocked.length > 0) {
      t.unplannableWinner++;
      if (g8Violated(run)) t.g8.push(`${key()} — ${run.blocked.join(",")}`);
    }

    if (run.missing.length > 0) {
      t.gated++;
      if (plannable) t.overGated.push(key());
      continue;
    }
    if (!plannable) {
      t.leaked.push(key());
      continue;
    }
    if (run.plan === null) {
      // `blocked` said every group settles and the planner disagreed. Named with
      // the answer set that did it, and it fails the sweep.
      t.threw.push(`${key()} — ${run.threw ?? "계획이 없다"}`);
      continue;
    }

    t.planned++;
    // The same bar the cells are held to. Held here as well because a plan built
    // and never looked at proves only that it was buildable.
    t.broken.push(...planInvariants(fixture, environmentId, run.plan));

    const { settled, invented } = classifyReplacements(
      fixture, environmentId, answers, resolveOptionSelections(fixture, run.recommendedId!, run.ctx),
    );
    if (settled.length === 0 && invented.length === 0) t.verbatim++;
    t.replacements += settled.length + invented.length;
    for (const note of settled) t.settled[note] = (t.settled[note] ?? 0) + 1;
    t.invented.push(...invented);
  }

  t.escape = [...(alwaysAlive ?? [])];
  return t;
}

/**
 * A sweep is sound when it measured something, the gate and the plan agree,
 * nothing was invented, and every plan it built held.
 *
 * `t.total > 0` is not padding. Every claim below is a count, and a count over
 * nothing satisfies anything: the first `everyGroupAnswered` here read an empty
 * allergen list as unanswered, emptied the chicken-store slice, and the line
 * printed `0조합 · 되묻기 차단 0 · 계획 0 : OK`. A slice that selects no answer
 * sets is a claim that was never tested, so it fails rather than passes quietly.
 */
const soundSweep = (t: Tally) =>
  t.total > 0 &&
  t.overGated.length === 0 &&
  t.leaked.length === 0 &&
  t.g8.length === 0 &&
  t.invented.length === 0 &&
  t.broken.length === 0 &&
  t.threw.length === 0;

/**
 * How the gate and the plan lined up, in one phrase.
 *
 * `1등 계획불가` is printed even where it is large, because it is: 64 of the
 * hospital's 160. The number that has to be zero is the one after it.
 */
const agreement = (t: Tally) =>
  `게이트 ${t.gated} · 통과 ${t.total - t.gated} → 계획 ${t.planned}` +
  ` · 과잉차단 ${t.overGated.length} · 샌 것 ${t.leaked.length}` +
  ` · 1등 계획불가 ${t.unplannableWinner} (G8 위반 ${t.g8.length})`;

/**
 * What each sweep claims, and which slice of its environment's answer sets it
 * claims it about. Every slice is a filter over the one enumeration above, so
 * adding a claim never adds a second description of the same space.
 */
interface SweepSpec {
  label: string;
  environmentId: EnvironmentId;
  only?: (answers: Record<string, unknown>, fixture: PublicFixture, environmentId: EnvironmentId) => boolean;
  /**
   * Set on the one sweep per environment that takes the whole answer space.
   *
   * The E cells read their verdict from it, so it is named rather than found by
   * position: picking the first sweep registered for an environment meant that
   * reordering this list would silently hand cell E a subset to grade, which
   * still prints OK while claiming less than the cell says it does.
   */
  wholeSpace?: boolean;
  /** Whether the replacement list at the foot of the run itemises this sweep. */
  showsReplacements?: boolean;
  claim: (t: Tally) => { ok: boolean; why: string };
}

/**
 * The customer who answered every question the screen asked.
 *
 * Asked of the domain rather than of the answer set, because the two disagree
 * about an empty list: an empty allergen list is the user actively saying they
 * have none, while an empty list of auth methods is a multi-select nobody
 * ticked. `isAnswered` on `answerFor` is the same pair `required.ts` consults,
 * so this slice cannot drift from the gate it is being compared against.
 */
const everyGroupAnswered = (
  answers: Record<string, unknown>,
  fixture: PublicFixture,
  environmentId: EnvironmentId,
): boolean => {
  const ctx = contextFor(fixture, environmentId, answers);
  const domain = getDomain(environmentId);
  return fixture.optionGroups.every((group) => isAnswered(domain.answerFor(group, ctx)));
};

const SWEEPS: SweepSpec[] = [
  // The two E cells read their verdict from these, so the claim has to be the
  // one the cell makes: not "a candidate survives" but "the survivor can be
  // reached". 96/96 and 70/70 are that difference measured.
  {
    label: "병원 전체",
    environmentId: "hospital",
    wholeSpace: true,
    showsReplacements: true,
    claim: (t) => ({
      ok: t.zeroCandidates === 0 && t.escape.length > 0 && soundSweep(t),
      why: `${t.total}조합 · 후보0 = ${t.zeroCandidates} · ${agreement(t)} · 탈출구 ${t.escape.join(",") || "(없음)"}`,
    }),
  },
  {
    label: "관공서 전체",
    environmentId: "public-office",
    wholeSpace: true,
    showsReplacements: true,
    claim: (t) => ({
      ok: t.zeroCandidates === 0 && t.escape.length > 0 && soundSweep(t),
      why: `${t.total}조합 · 후보0 = ${t.zeroCandidates} · ${agreement(t)} · 탈출구 ${t.escape.join(",") || "(없음)"}`,
    }),
  },
  // The user the hospital fixture cannot take an answer from. SUPPORT is
  // required and its four buttons are all a support, so someone who needs none
  // has nothing to press; apps/web drops the group and droppedByScreen mirrors
  // that. Without it every one of these forty is gated and this whole column of
  // the fixture goes unmeasured — which is how hospital/D passed while never
  // reaching a plan at all.
  {
    label: "병원 접근성 미선택",
    environmentId: "hospital",
    only: (a) => Array.isArray(a.supportModes) && a.supportModes.length === 0,
    showsReplacements: true,
    claim: (t) => ({
      ok: soundSweep(t) && t.planned === t.total - t.gated,
      why: `${t.total}조합 · ${agreement(t)} (답 그대로 ${t.verbatim}건 · 대체된 계획 ${t.planned - t.verbatim}건 · 대체 ${t.replacements}곳) · 지어낸 답 ${t.invented.length}`,
    }),
  },
  // pm/20's second item, from the other side: 1,024 of the chicken shop's answer
  // sets used to reach buildExecutionPlan and throw into the browser console.
  // Every set that still gets through has to produce a plan.
  {
    label: "닭강정집 전체",
    environmentId: "chicken-store",
    wholeSpace: true,
    showsReplacements: true,
    claim: (t) => ({
      ok: soundSweep(t) && t.planned === t.total - t.gated,
      why: `${t.total}조합 · ${agreement(t)} · 예외 ${t.threw.length} · 지어낸 답 ${t.invented.length}`,
    }),
  },
  // And the other side of that: a gate wide enough to stop 324 of 432 has to be
  // shown not to be stopping people who answered everything. The hospital has no
  // line here on purpose — sixteen of its forty are gated on the answers
  // conflicting rather than on being unanswered, and 과잉차단 0 above is what
  // says those sixteen are the right sixteen.
  {
    label: "닭강정집 다 답함",
    environmentId: "chicken-store",
    only: everyGroupAnswered,
    claim: (t) => ({
      ok: t.gated === 0 && soundSweep(t),
      why: `${t.total}조합 · 되묻기 차단 ${t.gated} · 계획 ${t.planned} · 지어낸 답 ${t.invented.length}`,
    }),
  },
  {
    label: "관공서 다 답함",
    environmentId: "public-office",
    only: everyGroupAnswered,
    claim: (t) => ({
      ok: t.gated === 0 && soundSweep(t),
      why: `${t.total}조합 · 되묻기 차단 ${t.gated} · 계획 ${t.planned} · 지어낸 답 ${t.invented.length}`,
    }),
  },
];

/* ═══════════════════════════════ run it ═══════════════════════════════════ */

const gateBlocked: string[] = [];
const screenDropped: string[] = [];

const fixtures = new Map<EnvironmentId, PublicFixture>();
for (const environmentId of registeredEnvironments()) {
  fixtures.set(environmentId, await loadFixture(environmentId));
}

// Enumerated once per environment, not once per sweep. Every slice is a filter
// over the same objects, which also lets `contextFor` build each context once.
const answerSpace = new Map<EnvironmentId, Record<string, unknown>[]>();
for (const [environmentId, fixture] of fixtures) {
  answerSpace.set(environmentId, sweepAnswerSets(environmentId, fixture));
}

// Run first, print later: the two E cells state their verdict in terms of the
// whole-environment sweep, and a cell that quotes a number it did not measure is
// the habit this file was written to break.
const tallies = SWEEPS.map((spec) => {
  const fixture = fixtures.get(spec.environmentId)!;
  const sets = answerSpace
    .get(spec.environmentId)!
    .filter((answers) => spec.only?.(answers, fixture, spec.environmentId) ?? true);
  return { spec, tally: sweep(fixture, spec.environmentId, sets) };
});

/** The sweep that took an environment's whole answer space. Named, not positional. */
function wholeEnvironment(environmentId: EnvironmentId): Tally {
  const whole = tallies.filter((t) => t.spec.environmentId === environmentId && t.spec.wholeSpace);
  if (whole.length !== 1) {
    throw new Error(
      `check-scenarios: ${environmentId} 는 wholeSpace 스윕이 정확히 하나 있어야 하는데 ${whole.length}개다`,
    );
  }
  return whole[0].tally;
}

for (const environmentId of registeredEnvironments()) {
  const fixture = fixtures.get(environmentId)!;
  console.log(`═══ ${environmentId} ═══`);

  for (const situation of ["A", "B", "C", "D", "E", "F"] as Situation[]) {
    const scenario = SCENARIOS[environmentId][situation];

    if (scenario === null) {
      const stand = unreachableCell(situation, environmentId, fixture);
      cell(SITUATION_LABEL[situation], stand.ok, stand.why);
      continue;
    }

    let run: Run;
    try {
      run = runCell(fixture, environmentId, scenario.answers);
    } catch (error) {
      // One cell must not take the other fourteen down with it.
      cell(SITUATION_LABEL[situation], false, `예외: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const verdict = judge(situation, environmentId, run);
    const broken = invariants(fixture, environmentId, run);
    if (run.missing.length > 0) gateBlocked.push(`${environmentId}/${situation}`);

    const detail =
      situation === "D" ? `${verdict.why} (${byReason(run.excluded)})` : verdict.why;
    const dropped = run.rawMissing.filter((g) => !run.missing.includes(g));
    if (dropped.length > 0) screenDropped.push(`${environmentId}/${situation}: ${dropped.join(",")}`);

    const notes = [
      run.missing.length > 0 ? `게이트 ${run.missing.join(",")}` : "",
      dropped.length > 0 ? `화면이 버림 ${dropped.join(",")}` : "",
      run.planError ?? "",
      // Reported here because `runCell` now records the planner's refusal
      // instead of letting it reach the loop's catch. Without this line the cell
      // still fails — no plan means no pass — but says nothing about why.
      run.threw ? `계획 예외: ${run.threw}` : "",
      ...broken,
    ].filter(Boolean);

    cell(
      SITUATION_LABEL[situation],
      verdict.ok && broken.length === 0,
      notes.length > 0 ? `${detail} — ${notes.join(" · ")}` : detail,
    );
  }
  console.log("");
}

/* ══════════════════════════════ the sweeps ════════════════════════════════ */

console.log("═══ 스윕 ═══");
const replacements: string[] = [];
for (const { spec, tally } of tallies) {
  const verdict = spec.claim(tally);
  // Deduplicated: one broken invariant repeated across four hundred plans is one
  // sentence worth reading, not four hundred. Planner refusals are counted and
  // one is quoted — the answer set is what makes it reproducible, and every
  // claim except the chicken shop's is silent about them otherwise.
  const notes = [...new Set(tally.broken)];
  if (tally.threw.length > 0) notes.push(`계획 예외 ${tally.threw.length}건 · 예: ${tally.threw[0]}`);
  // Quoted, not just counted: a G8 violation is one answer set that has to be
  // reproducible from the report alone.
  if (tally.g8.length > 0) notes.push(`G8 위반 ${tally.g8.length}건 · 예: ${tally.g8[0]}`);
  claim(spec.label, verdict.ok, notes.length > 0 ? `${verdict.why} — ${notes.join(" · ")}` : verdict.why);
  // Only from the sweeps that are not a slice of another one, or the same
  // replacement is reported twice under two names.
  if (spec.showsReplacements) {
    for (const [note, n] of Object.entries(tally.settled)) {
      replacements.push(`${spec.label}: ${note} ×${n}`);
    }
  }
  // Never suppressed: an invented answer is a failure wherever it turns up.
  for (const note of tally.invented) replacements.push(`${spec.label}: 지어냄 ${note}`);
}

/* ═══════════ ④ 완화 제안 — the sweep ② deferred, with its own space ═══════
 *
 * `sweepAnswerSets` pins `allergenIds: []` and `maxPriceKrw: 7000` on purpose,
 * and says why where it does it. That pinning is exactly what makes it the
 * wrong space for this claim: "no relaxation ever revives a dish the user is
 * allergic to", measured over 432 answer sets that declare no allergy, is a
 * verdict that cannot go red. That is the fault session 20 found in
 * `check-hostile-input` and the card warns about again here, so the claim
 * brings its own space rather than borrowing one that would flatter it.
 *
 * Everything in that space comes off the fixture — the allergies its own dishes
 * carry, the prices they charge, the service types it offers. A fixture that
 * drops the peanut dish shrinks the space and prints a smaller number, rather
 * than leaving a claim that reads the same either way.
 */
function relaxAnswerSets(fixture: PublicFixture): Record<string, unknown>[] {
  const allergens = [...new Set(
    fixture.candidates.flatMap((c) => (c.attributes?.allergenIds as string[] | undefined) ?? []),
  )].sort();
  const prices = [...new Set(
    fixture.candidates.map((c) => c.price).filter((p): p is number => p !== undefined),
  )].sort((a, b) => a - b);
  const serviceTypes = (fixture.optionGroups.find((g) => g.groupId === "SERVICE_TYPE")?.options ?? [])
    .map((o) => o.id);
  if (allergens.length === 0 || prices.length === 0 || serviceTypes.length === 0) return [];

  // One won under the cheapest dish is the budget that fits nothing, said
  // without a number of our own standing in for the fixture's.
  const budgets = [prices[0] - 1, ...prices];
  // Each declared allergy alone, and all of them together. The subsets between
  // add answer sets without adding a shape.
  const declarations: string[][] = [[], ...allergens.map((a) => [a]), allergens];

  const sets: Record<string, unknown>[] = [];
  for (const serviceType of serviceTypes)
    for (const allergenIds of declarations)
      for (const maxPriceKrw of budgets)
        sets.push({
          serviceType, allergenIds, maxPriceKrw,
          spicyLevel: "MILD", boneType: "BONELESS", cupOption: "PAPER", quantity: "1",
        });
  return sets;
}

/** The two fields a relaxation is allowed to point at. Anything else is G4. */
const RELAXABLE_PATHS = ["/hardConstraints/maxPriceKrw", "/preferences/serviceType"];

{
  const fixture = fixtures.get("chicken-store")!;
  const sets = relaxAnswerSets(fixture);
  const allergensOf = (c: Candidate) => (c.attributes?.allergenIds as string[] | undefined) ?? [];

  let withOptions = 0;
  let rows = 0;
  const byReason: Record<string, number> = {};
  /** A suggestion that would put back a dish carrying an allergy the user named. */
  const revived: string[] = [];
  /** A suggestion pointing somewhere we never agreed to negotiate. */
  const offPath: string[] = [];

  for (const answers of sets) {
    const declared = answers.allergenIds as string[];
    const options = relaxationOptions(fixture, contextFor(fixture, "chicken-store", answers));
    if (options.length > 0) withOptions++;
    rows += options.length;

    for (const option of options) {
      byReason[option.reasonCode] = (byReason[option.reasonCode] ?? 0) + 1;
      if (!RELAXABLE_PATHS.includes(option.path)) offPath.push(`${JSON.stringify(answers)} — ${option.path}`);
      // The claim itself: not "the allow-list has no allergen entry", which is
      // read off the source, but "no dish the user cannot eat comes back",
      // which is read off the survivors the suggestion actually produces.
      for (const id of option.survivorIds) {
        const dish = fixture.candidates.find((c) => c.candidateId === id);
        const hits = dish ? allergensOf(dish).filter((a) => declared.includes(a)) : [];
        if (hits.length > 0) revived.push(`${JSON.stringify(answers)} — ${id}/${hits.join(",")}`);
      }
    }
  }

  // The card's acceptance value, kept as the customer who produced it:
  // `input/chicken-store-tight-budget.json` answers 3,000원 on a menu whose
  // cheapest dish is 5,500원. Pinned separately from the space above because
  // 3,000 is that customer's number, not one derived from the fixture.
  const tightBudget = {
    serviceType: "TAKE_OUT", spicyLevel: "MILD", boneType: "BONELESS",
    cupOption: "PAPER", quantity: "1", allergenIds: [], maxPriceKrw: 3000,
  };
  const first = relaxationOptions(fixture, contextFor(fixture, "chicken-store", tightBudget))[0];
  const cheapest = Math.min(
    ...fixture.candidates.map((c) => c.price ?? Infinity),
  );
  const pinnedOk = first !== undefined
    && first.path === "/hardConstraints/maxPriceKrw"
    && first.value === cheapest
    && first.survivorCount === 1;
  const pinned = first
    ? `3,000원 → ${first.value}원 ${first.survivorCount}개`
    : "3,000원 → 제안 없음";

  const counted = Object.entries(byReason).map(([code, n]) => `${code} ${n}`).join(" · ") || "(없음)";
  claim(
    "닭강정집 완화 제안",
    revived.length === 0 && offPath.length === 0 && withOptions > 0 && pinnedOk,
    `${sets.length}조합 · 제안 있는 조합 ${withOptions} · 제안 ${rows}건 (${counted})` +
      ` · 알레르기 되살림 ${revived.length} · 허용 밖 경로 ${offPath.length} · ${pinned}` +
      (revived.length > 0 ? ` — 예: ${revived[0]}` : "") +
      (offPath.length > 0 ? ` — 예: ${offPath[0]}` : ""),
  );

  // The other two environments, so an empty list is told apart from a function
  // that never ran. public-office is the one that matters: its exclusions are
  // all `REQUESTED_SERVICE_MISMATCH`, tagged `USER_PREFERENCE` like every other
  // rule in the three domains, so a `tag` filter would have offered to treat a
  // 건강보험 visit as a 주민등록 one. The count of exclusions seen is printed
  // beside the zero to show the allow-list did the refusing.
  for (const environmentId of ["hospital", "public-office"] as EnvironmentId[]) {
    const other = fixtures.get(environmentId)!;
    let seen = 0;
    let produced = 0;
    const codes = new Set<string>();
    for (const answers of answerSpace.get(environmentId)!) {
      const ctx = contextFor(other, environmentId, answers);
      seen++;
      for (const e of filterCandidates(other, ctx).excluded) codes.add(e.reasonCode);
      produced += relaxationOptions(other, ctx).length;
    }
    claim(
      `${environmentId} 완화 제안 없음`,
      seen > 0 && produced === 0 && codes.size > 0,
      `${seen}조합 호출 · 제안 ${produced}건 · 본 제외 이유 ${[...codes].sort().join(",") || "(없음)"}`,
    );
  }
}

/* ═══════ 완화 제안의 문장 — pm/27 2절 (⑨ 아님, 위 번호는 pm/24 것이다) ════
 *
 * The facts have been in the engine since pm/24 ④ and the screen still ends at
 * "조건에 맞는 메뉴가 없습니다". `explainRelaxation` is the half that says them,
 * so the thing to measure is that the sentence and the row agree: every number
 * the customer reads is `survivorCount` and `value` as they were measured, and
 * none of them counted a second time. 6,000원 is where that matters — the
 * exclusion list names five dishes there and four actually come back.
 *
 * Read as digits rather than compared against a sentence written here. Holding
 * the expected string would be `explainRelaxation` typed twice: green on any
 * rewording, and green on the two numbers being swapped, which is the defect
 * this was tried against.
 */
{
  const fixture = fixtures.get("chicken-store")!;
  const sets = relaxAnswerSets(fixture);

  /**
   * 5500 → "5,500", grouped here rather than imported. A check that formats with
   * the engine's own helper cannot tell a broken formatter from a matching one.
   */
  const grouped = (n: number): string => {
    const digits = String(n);
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ",";
      out += digits[i];
    }
    return out;
  };

  /** Every run of digits the customer would read, in the order they read them. */
  const numbersIn = (sentence: string): string[] => sentence.match(/[0-9][0-9,]*/g) ?? [];

  /**
   * What is wrong with this sentence, or null.
   *
   * The numbers are compared as a sequence, not as a set: swapping the amount
   * and the count leaves the same two numbers in the sentence, and a customer
   * told "예산을 1원까지 올리시면 5,500개" has been told something false in
   * exactly the way a set comparison would call correct.
   *
   * A value that is an option id has to be named as well as counted, or the
   * sentence says "바꾸시면 6개" without saying what to change. The label comes
   * off the fixture, so this cannot pass by matching wording typed here.
   */
  const faultIn = (
    from: Pick<PublicFixture, "optionGroups">,
    option: RelaxationOption,
    sentence: string,
  ): string | null => {
    if (sentence.trim() === "") return "빈 문장";
    const expected = [
      ...(typeof option.value === "number" ? [grouped(option.value)] : []),
      String(option.survivorCount),
    ];
    const found = numbersIn(sentence);
    if (found.join("·") !== expected.join("·")) {
      return `숫자 기대 ${expected.join("·")} · 실제 ${found.join("·") || "(없음)"}`;
    }
    if (typeof option.value === "string") {
      const label = from.optionGroups
        .flatMap((g) => g.options)
        .find((o) => o.id === option.value)?.label;
      if (label === undefined) return `픽스처에 ${option.value} 의 이름이 없다`;
      if (!sentence.includes(label)) return `바꿀 값 「${label}」 을 말하지 않는다`;
    }
    return null;
  };

  let said = 0;
  const sentences = new Set<string>();
  const faults: string[] = [];
  const threw: string[] = [];

  for (const answers of sets) {
    const ctx = contextFor(fixture, "chicken-store", answers);
    for (const option of relaxationOptions(fixture, ctx)) {
      said++;
      let sentence: string;
      try {
        sentence = explainRelaxation(fixture, ctx, option);
      } catch (e) {
        threw.push(`${JSON.stringify(answers)} — ${(e as Error).message}`);
        continue;
      }
      sentences.add(sentence);
      const fault = faultIn(fixture, option, sentence);
      if (fault !== null) faults.push(`${JSON.stringify(answers)} — ${fault} :: ${sentence}`);
    }
  }

  claim(
    "닭강정집 완화 문장",
    said > 0 && faults.length === 0 && threw.length === 0 && sentences.size > 1,
    `제안 ${said}건 → 문장 ${said - threw.length}건 · 서로 다른 문장 ${sentences.size}` +
      ` · 어긋남 ${faults.length} · 예외 ${threw.length}` +
      (faults.length > 0 ? ` — 예: ${faults[0]}` : "") +
      (threw.length > 0 ? ` — 예: ${threw[0]}` : ""),
  );

  /*
   * The dormant row, made to speak.
   *
   * `SERVICE_TYPE_MISMATCH` suggests nothing in this fixture — the takeout-only
   * dish and the dine-in-only dish both cost 6,000원, so the swap is always a
   * wash and the sweep above never words it. A sentence nobody can reach is a
   * sentence nobody has read, and the day a fixture tilts is the day the screen
   * finds out. So the fixture is tilted here: the service type the customer
   * asked for is dropped from the first dish that offers both, which is the
   * smallest change that makes switching worth something.
   *
   * The tilt is ours; nothing else is. Both service types are tried because the
   * fixture names two, the budget is the priciest dish so no budget row joins in,
   * and the label the sentence has to carry is read back out of the fixture.
   */
  const serviceTypes = (fixture.optionGroups.find((g) => g.groupId === "SERVICE_TYPE")?.options ?? [])
    .map((o) => o.id);
  const roomy = Math.max(...fixture.candidates.map((c) => c.price ?? 0));
  const tiltedSentences: string[] = [];
  const tiltedFaults: string[] = [];
  const tiltedThrew: string[] = [];
  /** The dish the tilt is applied to. The same one for both service types. */
  const target = fixture.candidates
    .find((c) => (c.supportedOptions?.SERVICE_TYPE ?? []).length > 1);

  for (const wanted of serviceTypes) {
    // A fixture with no dish that offers both, or no answer set to start from,
    // cannot be tilted — and the claim below goes red rather than reporting a
    // sentence nobody produced.
    if (target === undefined || sets.length === 0) break;
    const tilted: PublicFixture = {
      ...fixture,
      candidates: fixture.candidates.map((c) =>
        c.candidateId !== target.candidateId ? c : {
          ...c,
          supportedOptions: {
            ...c.supportedOptions,
            SERVICE_TYPE: (c.supportedOptions?.SERVICE_TYPE ?? []).filter((v) => v !== wanted),
          },
        }),
    };
    const answers = { ...sets[0], serviceType: wanted, maxPriceKrw: roomy, allergenIds: [] };
    const ctx = contextFor(tilted, "chicken-store", answers);
    for (const option of relaxationOptions(tilted, ctx)) {
      if (option.reasonCode !== "SERVICE_TYPE_MISMATCH") continue;
      let sentence: string;
      try {
        sentence = explainRelaxation(tilted, ctx, option);
      } catch (e) {
        tiltedThrew.push(`${wanted} — ${(e as Error).message}`);
        continue;
      }
      tiltedSentences.push(sentence);
      const fault = faultIn(tilted, option, sentence);
      if (fault !== null) tiltedFaults.push(`${wanted} — ${fault} :: ${sentence}`);
    }
  }

  claim(
    "휴면 이용 방식 문장",
    tiltedSentences.length > 0 && tiltedFaults.length === 0 && tiltedThrew.length === 0,
    `기울인 픽스처 ${serviceTypes.length}종 · 제안 ${tiltedSentences.length}건 · 어긋남 ${tiltedFaults.length}` +
      ` · 예: ${tiltedSentences[0] ?? "문장 없음"}` +
      (tiltedFaults.length > 0 ? ` — ${tiltedFaults[0]}` : "") +
      (tiltedThrew.length > 0 ? ` — 예외 ${tiltedThrew[0]}` : ""),
  );
}

/* ═════════ ⑦ 예산을 안 정한 손님이 덜 듣지 않는다 ═══════════════════════
 *
 * Skipping the budget question left `priceWithinLimit` empty with nothing said
 * beside it, which reads as a dish that failed on price rather than one nobody
 * checked. pm/19 2.11(a).
 *
 * Measured by comparing the two customers rather than by looking for the
 * sentence. Writing it into this file would pass against a screen that
 * hard-coded the same words, and would go on passing if `explain` quietly lost
 * a different reason — the fault is that one customer is told less than the
 * other, so that is the thing counted.
 *
 * The premise is checked before the claim, the way situation F does it: the bar
 * has to be empty for the one and full for the other, or the two contexts are
 * not the pair this is about and the row says so instead of grading nothing.
 */
{
  const fixture = fixtures.get("chicken-store")!;
  // The bar's own name, read off the domain: `zeroLabels` is what `runCell`
  // keeps, and matching it to a string typed here would drift the day the label
  // is reworded — which is a thing that has already happened twice to this
  // criterion.
  const priceLabel = getDomain("chicken-store").criteria
    .find((c) => c.key === "priceWithinLimit")?.label;

  let compared = 0;
  const toldLess: string[] = [];
  const badPremise: string[] = [];

  for (const answers of answerSpace.get("chicken-store")!) {
    const withBudget = runCell(fixture, "chicken-store", answers);
    const without = runCell(fixture, "chicken-store", { ...answers, maxPriceKrw: null });
    if (withBudget.recommendedId === null || without.recommendedId === null) continue;
    compared++;

    // Premise: the bar is full for the customer who set a budget and empty for
    // the one who did not. Without this the row could be comparing two
    // customers who are in the same situation, and pass while measuring nothing.
    const emptyWith = priceLabel !== undefined && withBudget.zeroLabels.includes(priceLabel);
    const emptyWithout = priceLabel !== undefined && without.zeroLabels.includes(priceLabel);
    if (emptyWith || !emptyWithout) {
      badPremise.push(
        `${JSON.stringify(answers)} — 막대 빔: 예산 있음 ${emptyWith} · 없음 ${emptyWithout}`,
      );
      continue;
    }

    if (without.reasons.length < withBudget.reasons.length) {
      toldLess.push(
        `${JSON.stringify(answers)} — 예산 있음 ${withBudget.reasons.length}문장 · 없음 ${without.reasons.length}문장`,
      );
    }
  }

  claim(
    "닭강정집 예산 미지정",
    compared > 0 && badPremise.length === 0 && toldLess.length === 0,
    `${compared}쌍 대조 · 덜 들은 손님 ${toldLess.length} · 전제 어긋남 ${badPremise.length}` +
      (toldLess.length > 0 ? ` — 예: ${toldLess[0]}` : "") +
      (badPremise.length > 0 ? ` — 예: ${badPremise[0]}` : ""),
  );
}

/* ═══════════════ ⑤ 대안 이유 — the sentence, over the whole space ═════════
 *
 * Three things at once, because they are one property: the sentence is built
 * from the bar values and from nothing else.
 *
 *  1. Every criterion the domain registers has wording here. Walked off the
 *     registry, so a domain that adds a criterion fails this rather than
 *     shipping a sentence with a hole in it.
 *  2. No `ScoreContribution.label` appears in any sentence. That is the card's
 *     warning made into a measurement: seven of the eleven labels are "~ 일치",
 *     and one pasted into the slot for what a candidate failed to give reads as
 *     the opposite — `pm/17-RESULT.md` 4절 on `unmetConditions`.
 *  3. No criterion the two candidates earn the same on is named. "Derived from
 *     the difference only" is otherwise a claim about the source rather than
 *     about the output.
 *
 * Liveness is part of the verdict. A space that produced no pair, or one
 * sentence for every pair, would pass 1–3 while measuring nothing.
 */
for (const environmentId of registeredEnvironments()) {
  const fixture = fixtures.get(environmentId)!;
  const labels = getDomain(environmentId).criteria.map((c) => c.label);
  const unworded = getDomain(environmentId).criteria
    .filter((c) => askedForPhrase(c.key) === undefined)
    .map((c) => c.key);

  let pairs = 0;
  const sentences = new Set<string>();
  const pastedLabel: string[] = [];
  const namedAnEqual: string[] = [];
  const threw: string[] = [];
  /** Kept for the winner-is-not-its-own-alternative probe below. */
  let sample: ReturnType<typeof score> | null = null;

  for (const answers of answerSpace.get(environmentId)!) {
    const ctx = contextFor(fixture, environmentId, answers);
    const { survivors } = filterCandidates(fixture, ctx);
    if (survivors.length === 0) continue;
    const result = score(survivors, ctx);
    if (result.recommendedCandidateId === null) continue;
    sample ??= result;
    const winner = result.contributions[result.recommendedCandidateId] ?? [];

    for (const altId of result.alternativeCandidateIds) {
      pairs++;
      let sentence: string;
      try {
        sentence = explainAlternative(result, altId);
      } catch (e) {
        threw.push(`${JSON.stringify(answers)}/${altId} — ${(e as Error).message}`);
        continue;
      }
      sentences.add(sentence);

      for (const label of labels) {
        if (sentence.includes(label)) pastedLabel.push(`${altId} — ${label}`);
      }
      const mine = new Map((result.contributions[altId] ?? []).map((r) => [r.key, r]));
      for (const row of winner) {
        const theirs = mine.get(row.key);
        const phrase = askedForPhrase(row.key);
        if (theirs?.earned !== row.earned || phrase === undefined) continue;
        if (sentence.includes(phrase)) namedAnEqual.push(`${altId} — ${row.key}: ${sentence}`);
      }
    }
  }

  // The winner is not one of its own alternatives. Unguarded it compares equal
  // to itself on every bar and comes back with the sentence for a tie, which is
  // the one wrong answer that looks like a right one — so the refusal is
  // measured rather than trusted to the reading of the source.
  let refusesWinner = false;
  const winnerId = sample?.recommendedCandidateId;
  if (sample && winnerId) {
    try {
      explainAlternative(sample, winnerId);
    } catch {
      refusesWinner = true;
    }
  }

  const notes = [
    unworded.length > 0 ? `문구 없는 기준 ${unworded.join(",")}` : "",
    threw.length > 0 ? `예외 ${threw.length}건 · 예: ${threw[0]}` : "",
    pastedLabel.length > 0 ? `막대 이름이 문장에 ${pastedLabel.length}건 · 예: ${pastedLabel[0]}` : "",
    namedAnEqual.length > 0 ? `같은 기준을 말함 ${namedAnEqual.length}건 · 예: ${namedAnEqual[0]}` : "",
    refusesWinner ? "" : "1등 id 를 넘겨도 문장을 낸다",
  ].filter(Boolean);

  claim(
    `${environmentId} 대안 이유`,
    unworded.length === 0 && threw.length === 0 && pastedLabel.length === 0
      && namedAnEqual.length === 0 && pairs > 0 && sentences.size > 1 && refusesWinner,
    `쌍 ${pairs} · 서로 다른 문장 ${sentences.size} · 기준 ${labels.length}개 문구 있음 · 1등 id 거부` +
      (notes.length > 0 ? ` — ${notes.join(" · ")}` : ""),
  );
}
console.log("");

/* ═══════════ ⑧ 계획 길이 — 상수가 아니라 전이표에서 ═══════════════════════
 *
 * 닭강정 10 · 병원 7 · 관공서 6. Writing those three down and comparing a plan
 * against them is `10 === 10`: it grades nothing, and it goes on being green the
 * day the fixture loses a screen. So the length is worked out from the fixture,
 * and the three numbers are what the calculation prints rather than what it is
 * told. "관공서는 6단계뿐인데 덜 만든 것 아니냐" is then answerable — 관공서 has
 * two option groups and no screen it picks them standing on, and that is the
 * whole of the difference.
 *
 * 길이 = 최단 경로 + 서서 고르는 그룹 수 + 확인 1.
 *
 *  - The route is the breadth-first walk from the first screen to the review
 *    boundary. A self-loop is never on it — its destination is visited by
 *    definition — so every step on the route moves to a screen not yet seen.
 *  - A group whose action is a self-loop is selected standing still: the chicken
 *    shop picks 맵기 · 형태 · 컵 · 수량 in OPTION_SELECTION, the hospital picks
 *    진료과 in DEPARTMENT_SELECTION. Those are the steps a route cannot show. A
 *    group whose action is on the route rides along with that step and adds
 *    nothing, which is why 이용 방식 and 인증 방식 are not counted twice.
 *  - The verifier is one step, always. It is why a plan ends at a review screen
 *    and not at a payment.
 *
 * `routeTo` is private to `plan.ts` and is deliberately not imported: a check
 * that called the function it is checking would agree with it by construction.
 * The walk is written out here, and the two agreeing over every plan in the
 * space is the claim. Breaking `plan.ts` — routing depth-first, draining a
 * self-loop twice, dropping the verifier — moves one side and not the other.
 */

/** The breadth-first walk `plan.ts` also does, written out rather than shared. */
function shortestRoute(fixture: PublicFixture, forbidden: Set<string>): Transition[] {
  const { manifest, transitions } = fixture;
  const queue: Array<{ state: string; path: Transition[] }> = [
    { state: manifest.initialState, path: [] },
  ];
  const seen = new Set([manifest.initialState]);

  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    if (state === manifest.reviewBoundaryState) return path;
    for (const move of transitions) {
      if (move.from !== state || seen.has(move.to) || forbidden.has(move.action)) continue;
      seen.add(move.to);
      queue.push({ state: move.to, path: [...path, move] });
    }
  }
  throw new Error(`check-scenarios: ${manifest.environmentId} 에 검토 화면까지 가는 길이 없다`);
}

/** The three parts kept apart, so a mismatch says which one moved. */
function expectedPlanLength(
  fixture: PublicFixture,
  environmentId: EnvironmentId,
  candidateId: string,
  ctx: SessionContext,
): { total: number; parts: string } {
  const forbidden = new Set([...FORBIDDEN_ACTIONS, ...fixture.manifest.forbiddenActions]);
  const route = shortestRoute(fixture, forbidden);
  // Read off the table, not listed here: a fixture that turns a self-loop into a
  // screen of its own should change the calculation, not break it.
  const standingActions = new Set(
    fixture.transitions
      .filter((t) => t.from === t.to && !forbidden.has(t.action))
      .map((t) => t.action),
  );
  const byKind = getDomain(environmentId).actionByGroupKind;
  // The groups this candidate is actually ordered with. An optional group the
  // user skipped is not in the list and does not cost a step — which is why the
  // longest plan, not every plan, is the number worth quoting.
  const standing = resolveOptionSelections(fixture, candidateId, ctx)
    .filter((s) => standingActions.has(byKind[s.kind] ?? "")).length;

  return { total: route.length + standing + 1, parts: `${route.length} + ${standing} + 1` };
}

for (const environmentId of registeredEnvironments()) {
  const fixture = fixtures.get(environmentId)!;
  let planned = 0;
  let longest = 0;
  let longestParts = "";
  let shortest = Infinity;
  const wrong: string[] = [];
  const threw: string[] = [];

  for (const answers of answerSpace.get(environmentId)!) {
    const ctx = contextFor(fixture, environmentId, answers);
    const { survivors } = filterCandidates(fixture, ctx);
    if (survivors.length === 0) continue;
    const winner = score(survivors, ctx).recommendedCandidateId;
    if (winner === null) continue;
    // The same two gates a screen passes before it may plan at all. Without them
    // this would be measuring the length of plans that are refused for other
    // reasons, and counting a throw as a mismatch.
    if (findMissingAnswers(fixture, ctx).some((m) => !droppedByScreen(environmentId, m.groupId))) continue;
    if (unsettleableGroups(fixture, winner, ctx).length > 0) continue;

    let actual: number;
    try {
      actual = buildExecutionPlan({
        environmentId, fixture, candidateId: winner, sessionContext: ctx, approved: true,
      }).actions.length;
    } catch (e) {
      threw.push(`${JSON.stringify(answers)} — ${(e as Error).message}`);
      continue;
    }

    const expected = expectedPlanLength(fixture, environmentId, winner, ctx);
    planned++;
    shortest = Math.min(shortest, actual);
    if (actual > longest) {
      longest = actual;
      longestParts = expected.parts;
    }
    if (actual !== expected.total) {
      wrong.push(`${JSON.stringify(answers)} — 계획 ${actual}단계 · 계산 ${expected.parts} = ${expected.total}`);
    }
  }

  claim(
    `${environmentId} 계획 길이`,
    planned > 0 && wrong.length === 0 && threw.length === 0,
    `계획 ${planned}건 · 길이 ${shortest === Infinity ? "-" : shortest}~${longest}` +
      ` · 최장 ${longest} = ${longestParts || "-"} · 어긋남 ${wrong.length}` +
      (wrong.length > 0 ? ` — 예: ${wrong[0]}` : "") +
      (threw.length > 0 ? ` · 예외 ${threw.length}건 — 예: ${threw[0]}` : ""),
  );
}
console.log("");

/* ═══════════════════════════════ summary ══════════════════════════════════ */

console.log("═══ 합계 ═══");
console.log(`  ${cells}칸 · OK ${okCells} · FAIL ${cells - okCells}`);
console.log(`  스윕 ${sweptClaims}건 · OK ${okClaims} · FAIL ${sweptClaims - okClaims}`);
// The count is the point. "금지 동작 0건" over thirteen plans and over every plan
// the screens can produce are different sentences, and only the second is worth
// putting in front of a judge.
console.log(`  금지 동작 누적 ${deniedTotal}건 · 계획 ${plansChecked}건 대조 (셀 + 스윕)`);
// G8 in one line, summed over the whole-space sweeps only.
//
// Summing every sweep counted the slices a second time: 병원 접근성 미선택 is a
// filter over the same 160 answer sets 병원 전체 already swept, so its 16 landed
// on top of the 64 and the line printed 누적 80 for a space that holds 64.
// Nothing is lost by leaving the slices out — a filter cannot hold a violation
// the space it filters does not. Cells are not in the sum either; a violation
// there fails the cell itself, which is louder than a number at the foot.
//
// The left number is not a fault and is printed so nobody reads the right one
// as "the planner always settles the winner" — it does not, and the gate is the
// reason that never reaches anyone.
const g8Whole = tallies.filter(({ spec }) => spec.wholeSpace).map(({ tally }) => tally);
const g8Unplannable = g8Whole.reduce((n, t) => n + t.unplannableWinner, 0);
const g8Leaked = g8Whole.reduce((n, t) => n + t.g8.length, 0);
console.log(`  G8 · 1등이 계획 불가한 조합 ${g8Unplannable}건 (전체 답 공간) · 그중 게이트를 통과한 것 ${g8Leaked}건`);
// What the plan ordered that the user did not ask for, in full. Every line here
// is allowed — a taste the dish settles, or a refusal to decide — but they are
// the sentences a judge would read as us overruling someone, so they are
// printed rather than merely counted.
if (replacements.length > 0) {
  console.log(`  계획이 답을 대체한 곳:`);
  for (const note of replacements) console.log(`    ${note}`);
}
if (gateBlocked.length > 0) console.log(`  게이트가 막은 칸: ${gateBlocked.join(", ")}`);
// Printed every run so the temporary drop above cannot outlive its cause
// unnoticed. pm/24 ⑫ settled the engine half, so this now reads 없음 — printed
// rather than skipped, because a line that vanishes says nothing and a line
// that says 없음 says the workaround is done waiting on us.
console.log(`  화면이 버리는 필수 항목: ${screenDropped.join(", ") || "없음 (pm/24 ⑫ 이후)"}`);
for (const environmentId of registeredEnvironments()) {
  const domain = getDomain(environmentId);
  console.log(`  ${environmentId}: 기준 ${domain.criteria.length}개 · 제외 규칙 ${domain.rules.length}개`);
}
