/**
 * @commitandrun/engine — what makes one environment different from another.
 *
 * The engine used to be three files that all assumed a chicken shop. Filtering,
 * scoring and the explanation sentences were written against `preferences
 * .spicyLevel` and friends, so calling any of them with a hospital context threw
 * on the first line. This file is the seam that fixed that: `select.ts` and
 * `plan.ts` keep the machinery every environment shares, and a `DomainSpec`
 * supplies the parts only one environment can know.
 *
 * The division is deliberate. A domain declares *rules and vocabulary*; it never
 * walks the state machine, never decides the order of actions, and never emits a
 * plan. That way a new environment cannot introduce a new way to violate the
 * safety boundary — the boundary is enforced once, in `plan.ts`, for all three.
 *
 * Same rule as the rest of src/ — `./types.ts` is the only import allowed, so
 * this file also runs in the deployed web app where the kit does not exist.
 */

import type {
  Candidate,
  EnvironmentId,
  ExclusionReason,
  IntentTask,
  OptionGroup,
  ReconfirmRequest,
  RecommendationReason,
  SessionContext,
} from "./types.ts";

/** Values that mean "the user did not tell us". Never treated as an answer. */
export const NOT_ANSWERED: ReadonlySet<string> = new Set(["UNKNOWN", "NO_PREFERENCE"]);

/** True when a raw answer counts as something the user actually said. */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0 && !value.every((v) => NOT_ANSWERED.has(String(v)));
  const s = String(value);
  return s.length > 0 && !NOT_ANSWERED.has(s);
}

/* ===========================================================================
 * Korean particles
 *
 * A particle that disagrees with the word before it — "검사이라고", "미정라고",
 * "수량를" — reads as broken to the person we are trying to help, and the words
 * these sentences drop in come from the fixture, so a fixed particle is wrong
 * for half of them. 미정 is the safe route for someone who does not know which
 * department they need: the reader who most needs the sentence saw the most
 * broken one.
 *
 * A Hangul syllable carries its final consonant in the low 28 of its code
 * point, so `(code - 0xac00) % 28 === 0` means the syllable ends in a vowel.
 * Anything that does not end in Hangul takes the vowel form, which is what a
 * Korean speaker writes after a foreign word ending in a vowel sound; there is
 * no such label in the three fixtures today.
 *
 * These live here rather than in one domain because all three need them, and
 * `apps/web` needs them too — see pm/21.
 * =========================================================================== */

/** True when the word ends in a Hangul syllable with no final consonant. */
function endsInVowel(word: string): boolean {
  const trimmed = word.trim();
  if (trimmed.length === 0) return true;
  const last = trimmed.charCodeAt(trimmed.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return true;
  return (last - 0xac00) % 28 === 0;
}

/** 을 / 를 — "맵기를 골라 주세요", "수량을 골라 주세요". */
export function objectParticle(word: string): string {
  return endsInVowel(word) ? "를" : "을";
}

/** 이 / 가 — "메뉴가 없습니다", "진료과가 없습니다". */
export function subjectParticle(word: string): string {
  return endsInVowel(word) ? "가" : "이";
}

/** 라고 / 이라고 — "검사라고 알려주셔서", "미정이라고 알려주셔서". */
export function quoteParticle(word: string): string {
  return endsInVowel(word) ? "라고" : "이라고";
}

/**
 * One filtering rule. Returns the exclusion when the candidate must go, or null
 * when this rule has nothing to say about it.
 *
 * Rules run in the order the domain lists them and a candidate is only ever
 * excluded once, so the list order is a priority order: put safety first, then
 * availability, then the constraints the user set, then their preferences. A
 * sold-out peanut dish should be reported as the allergy, not the stock level.
 */
export type DomainRule = (candidate: Candidate, ctx: SessionContext) => ExclusionReason | null;

/**
 * One scoring criterion.
 *
 * `met` is all-or-nothing on purpose: the UI draws `earned / weight` as a bar,
 * and a half-filled bar nobody can explain is worse than an empty one the user
 * immediately understands. Weights across a domain must add up to 1.0 —
 * `assertDomain` checks it rather than trusting the author's arithmetic.
 */
export interface DomainCriterion {
  /** Stable machine key, e.g. "visitTypeMatch". */
  key: string;
  /** Korean label shown to the user. Must describe THIS answer, not a fixed one. */
  label: string;
  weight: number;
  met: (candidate: Candidate, ctx: SessionContext) => boolean;
}

/**
 * Everything one environment has to say for itself.
 *
 * Written as data rather than a class so a domain file stays readable top to
 * bottom: here are the rules, here are the criteria, here is how we say it in
 * Korean. Nothing in a domain has side effects, reads a clock, or throws for
 * anything but programmer error.
 */
export interface DomainSpec {
  environmentId: EnvironmentId;
  /** The task the session context must carry. Guards every entry point. */
  task: IntentTask;
  /** What the user is choosing between, for sentences like "메뉴를 골랐습니다". */
  candidateNoun: string;

  /** Exclusion rules, highest priority first. */
  rules: DomainRule[];
  /** Scoring criteria. Weights must sum to 1.0. */
  criteria: DomainCriterion[];

  /**
   * Settles candidates that scored the same. Negative puts `a` first.
   * Returning 0 hands over to the shared fallback (candidateId), so a run is
   * repeatable no matter how the fixture happened to order its candidates.
   */
  tiebreak?: (a: Candidate, b: Candidate, ctx: SessionContext) => number;

  /** Why this candidate, in the user's own language. */
  explain: (
    recommended: Candidate,
    ctx: SessionContext,
    excluded: ExclusionReason[],
  ) => RecommendationReason[];

  /**
   * What the engine refuses to guess. A non-empty list stops the recommendation
   * outright — this is the safety path, not an error path.
   */
  reconfirm: (ctx: SessionContext) => ReconfirmRequest[];

  /**
   * The user's answer for one option group, read out of the session context.
   *
   * Each environment keeps its answers somewhere different — chicken-store in
   * `preferences`, hospital mostly in `facts`, public-office across `facts` and
   * `capabilities` — and the group vocabulary does not always match the context
   * vocabulary either (a hospital SUPPORT option is "HEARING" while the context
   * says "HEARING_SUPPORT"). Both translations belong to the domain.
   *
   * Return `undefined` for "the user did not answer this".
   */
  answerFor: (group: OptionGroup, ctx: SessionContext) => unknown;

  /**
   * The action that selects the candidate itself: `select_menu` in a shop,
   * `select_flow` at a hospital desk, `select_service` at a public office.
   */
  candidateAction: string;

  /**
   * Option-group `kind` → the semantic action that selects it. Groups sharing an
   * action (chicken-store puts four of them on `select_option`) are selected in
   * fixture order when that action comes up.
   */
  actionByGroupKind: Record<string, string>;
}

/* ===========================================================================
 * Registry
 * =========================================================================== */

const REGISTRY = new Map<EnvironmentId, DomainSpec>();

/**
 * Make a domain available to the engine.
 *
 * Called once per domain file at module load. Re-registering the same id
 * replaces the entry rather than throwing, so a test can swap a domain out.
 */
export function registerDomain(spec: DomainSpec): DomainSpec {
  assertDomain(spec);
  REGISTRY.set(spec.environmentId, spec);
  return spec;
}

/**
 * The domain for an environment.
 *
 * Throws rather than returning undefined: every caller needs one, and a missing
 * domain means a file was not imported, which is a wiring bug that should be
 * loud and immediate rather than a null check twelve frames away.
 */
export function getDomain(environmentId: EnvironmentId): DomainSpec {
  const spec = REGISTRY.get(environmentId);
  if (!spec) {
    throw new Error(
      `getDomain: no domain registered for ${environmentId}. ` +
        `Import it from ./domains/index.ts before calling the engine.`,
    );
  }
  return spec;
}

/**
 * The domain matching a session context, checked against the environment.
 *
 * The two can disagree — a hospital fixture handed a chicken-store context, say
 * — and that mismatch used to surface as an unrelated error deep inside
 * scoring. Checking it once here names the actual problem.
 */
export function domainFor(environmentId: EnvironmentId, ctx: SessionContext): DomainSpec {
  const spec = getDomain(environmentId);
  if (ctx.intent.task !== spec.task) {
    throw new Error(
      `domainFor: ${environmentId} expects a ${spec.task} context, got ${ctx.intent.task}`,
    );
  }
  return spec;
}

/**
 * The domain for a session context, found by its task.
 *
 * `score` and `explainRecommendation` are handed a context but no fixture — the
 * signatures the web app and the submission builder already call. Task to
 * environment is one-to-one (ORDER_FOOD, CHECK_IN, PUBLIC_SERVICE_GUIDANCE), so
 * the context alone is enough to find the rules. This is also why rules and
 * criteria take no fixture: everything they weigh lives on the candidate.
 */
export function domainForContext(ctx: SessionContext): DomainSpec {
  for (const spec of REGISTRY.values()) {
    if (spec.task === ctx.intent.task) return spec;
  }
  throw new Error(
    `domainForContext: no domain handles the task ${ctx.intent.task}. ` +
      `Import it from ./domains/index.ts before calling the engine.`,
  );
}

/** Every registered environment id. Lets the web app list what it can run. */
export function registeredEnvironments(): EnvironmentId[] {
  return [...REGISTRY.keys()];
}

/**
 * Programmer-error checks that run when a domain registers.
 *
 * Weights that do not add to 1.0 are the one mistake that produces a plausible
 * wrong answer instead of a crash: the bars still render, the totals just stop
 * meaning "how much of what you asked for did we match". Catching it at load
 * costs nothing and has already paid for itself once.
 */
function assertDomain(spec: DomainSpec): void {
  if (spec.criteria.length === 0) {
    throw new Error(`${spec.environmentId}: a domain needs at least one scoring criterion`);
  }

  const total = spec.criteria.reduce((sum, c) => sum + c.weight, 0);
  // Binary floating point: 0.4 + 0.25 + 0.2 + 0.15 is 1.0000000000000002.
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(
      `${spec.environmentId}: criterion weights add up to ${total}, they must add up to 1.0`,
    );
  }

  const keys = new Set<string>();
  for (const c of spec.criteria) {
    if (keys.has(c.key)) {
      throw new Error(`${spec.environmentId}: duplicate criterion key "${c.key}"`);
    }
    keys.add(c.key);
    if (c.weight <= 0) {
      throw new Error(`${spec.environmentId}: criterion "${c.key}" has a non-positive weight`);
    }
  }
}
