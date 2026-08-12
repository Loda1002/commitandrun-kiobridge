/**
 * @commitandrun/engine — the semantic execution plan.
 *
 * Turns "the user approved this candidate" into the ordered note the simulator
 * replays. Purely semantic: what to pick and in which order, never how a screen
 * is laid out. Coordinates, automationIds and control ids are rejected by the
 * platform, and a payment-shaped action fails the run even if it is blocked.
 *
 * The order is not written down anywhere — it is read off the environment's own
 * state machine. Walk the shortest legal route from the initial state to the
 * review boundary; whenever an action on that route is the one that selects an
 * option group, attach that group's choice; whenever a state offers a self-loop
 * that selects a group, drain the groups waiting on it before moving on. That
 * single rule reproduces all three official environments — a chicken shop's ten
 * steps, a hospital desk's seven, a public office's six — with no per-environment
 * branching here. What differs between them lives in `domain.ts`.
 *
 * Because the route comes from `fixture.transitions`, an environment whose state
 * machine changes moves the plan with it instead of silently going stale.
 *
 * Same rule as the rest of src/ — nothing outside this package is imported, so
 * this file also runs in the deployed web app where the kit does not exist.
 */

import { domainFor } from "./domain.ts";
// Registers the three official domains — see the same import in select.ts.
import "./domains/index.ts";
import {
  FORBIDDEN_ACTIONS,
  type Candidate,
  type ExecutionPlan,
  type OptionGroup,
  type PlanInput,
  type PlannedAction,
  type PublicFixture,
  type SessionContext,
  type Transition,
} from "./types.ts";

/** Prefix of every planId we emit. The submission is filed under this team. */
const TEAM_ID = "COMMITANDRUN";

/** Values that mean "the user did not tell us". Never filled in by guessing. */
const NOT_ANSWERED = new Set(["UNKNOWN", "NO_PREFERENCE"]);

/**
 * One option the plan will select, in a form a screen can render.
 *
 * Exists so the approval screen can show what will actually happen rather than
 * what the user typed. The two differ: pick a menu that only comes in one spice
 * level and the plan selects that level, whatever was asked for. An approval
 * screen that shows the request instead of the outcome is asking the user to
 * approve something else.
 */
export interface OptionSelection {
  groupId: string;
  /** The group's semantic kind — "service_type", "option", "department", ... */
  kind: string;
  /** Group label from the fixture, e.g. "맵기". */
  label: string;
  optionId: string;
  /** Option label from the fixture, e.g. "매운맛". */
  optionLabel: string;
  /** What the user asked for in this group, or null if they did not answer. */
  userAnswer: string | null;
  /** That answer's label, for a screen that has to say what changed. */
  userAnswerLabel: string | null;
}

/**
 * Work out which option this candidate will be ordered with, group by group,
 * in the fixture's own group order.
 *
 * Split out of `buildExecutionPlan` so a screen can ask the same question
 * before the user approves. Deliberately NOT a plan: no approval is required to
 * look, and nothing here can be executed.
 */
export function resolveOptionSelections(
  fixture: PublicFixture,
  candidateId: string,
  sessionContext: SessionContext,
): OptionSelection[] {
  const domain = domainFor(fixture.manifest.environmentId, sessionContext);
  const candidate = fixture.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`resolveOptionSelections: unknown candidate ${candidateId}`);
  }
  if (!candidate.available) {
    throw new Error(`resolveOptionSelections: candidate ${candidateId} is unavailable`);
  }

  const selections: OptionSelection[] = [];

  for (const group of fixture.optionGroups) {
    const answer = domain.answerFor(group, sessionContext);
    const id = chooseOptionId(group, answer, candidate);
    if (id === null) continue;

    const answered = answer !== undefined && answer !== null && !NOT_ANSWERED.has(String(answer));
    // A quantity is carried as a number; report the option id either way so a
    // screen compares like with like.
    const asOptionId =
      typeof answer === "number"
        ? group.options.find((o) => o.value === answer)?.id ?? null
        : String(answer ?? "");

    selections.push({
      groupId: group.groupId,
      kind: group.kind ?? "option",
      label: group.label,
      optionId: id,
      optionLabel: group.options.find((o) => o.id === id)?.label ?? id,
      userAnswer: answered ? asOptionId : null,
      userAnswerLabel: answered
        ? group.options.find((o) => o.id === asOptionId)?.label ?? asOptionId
        : null,
    });
  }

  return selections;
}

export function buildExecutionPlan(input: PlanInput): ExecutionPlan {
  // An unapproved plan is a safety violation by its mere existence.
  if (!input.approved) {
    throw new Error("buildExecutionPlan: refusing to plan without user approval");
  }

  const { fixture, candidateId } = input;
  const { manifest, transitions } = fixture;

  if (manifest.environmentId !== input.environmentId) {
    throw new Error(
      `buildExecutionPlan: fixture is ${manifest.environmentId}, input says ${input.environmentId}`,
    );
  }

  const domain = domainFor(input.environmentId, input.sessionContext);

  const candidate = fixture.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`buildExecutionPlan: unknown candidate ${candidateId}`);
  }
  // UNAVAILABLE_CANDIDATE_BLOCK — a sold-out item can never be executed.
  if (!candidate.available) {
    throw new Error(`buildExecutionPlan: candidate ${candidateId} is unavailable`);
  }

  const forbidden = new Set([...FORBIDDEN_ACTIONS, ...manifest.forbiddenActions]);

  // The selections come from the same function the approval screen calls, so
  // what the user approved and what the plan does cannot drift apart.
  const selections = resolveOptionSelections(fixture, candidateId, input.sessionContext);
  const selectionByGroup = new Map(selections.map((s) => [s.groupId, s]));
  const emitted = new Set<string>();

  const actions: PlannedAction[] = [];
  let state = manifest.initialState;

  const step = (action: string, target?: PlannedAction["target"]): void => {
    const move = transitionFor(transitions, state, action);
    actions.push({
      actionIndex: actions.length,
      action,
      // Steps that name nothing but the state they land on — a welcome screen,
      // a confirmation, a requirements page — carry that state, which is
      // exactly what the simulator matches them against.
      target: target ?? { kind: "review", id: move.to },
      expectedBeforeState: move.from,
      expectedAfterState: move.to,
    });
    state = move.to;
  };

  /** Groups this action selects that are still waiting, in fixture order. */
  const pendingFor = (action: string): OptionGroup[] =>
    fixture.optionGroups.filter(
      (g) =>
        !emitted.has(g.groupId) &&
        selectionByGroup.has(g.groupId) &&
        domain.actionByGroupKind[g.kind ?? "option"] === action,
    );

  const selectGroup = (action: string, group: OptionGroup): void => {
    step(action, targetFor(selectionByGroup.get(group.groupId)!));
    emitted.add(group.groupId);
  };

  /**
   * Some states select their groups without moving: a chicken shop picks four
   * options while sitting in OPTION_SELECTION, a hospital desk picks the
   * department while sitting in DEPARTMENT_SELECTION. Those show up as
   * self-loops in the transition table, which route-finding skips, so they are
   * drained here before the route moves on.
   */
  const drainSelfLoops = (): void => {
    for (const loop of transitions) {
      if (loop.from !== state || loop.to !== state || forbidden.has(loop.action)) continue;
      for (const group of pendingFor(loop.action)) selectGroup(loop.action, group);
    }
  };

  for (const move of routeTo(transitions, state, manifest.reviewBoundaryState, forbidden)) {
    drainSelfLoops();

    if (move.action === domain.candidateAction) {
      step(move.action, { kind: "candidate", id: candidateId });
      continue;
    }
    const [group] = pendingFor(move.action);
    if (group) {
      selectGroup(move.action, group);
      continue;
    }
    step(move.action);
  }
  drainSelfLoops();

  // Stop here and check. A missing verifier is MISSING_VERIFIER.
  step(manifest.requiredVerifierAction);

  assertSafe(actions, manifest.allowedActions, forbidden);
  if (state !== manifest.reviewBoundaryState) {
    throw new Error(`buildExecutionPlan: plan ended at ${state}, not the review boundary`);
  }
  // A selection the route never had an action for would be silently dropped —
  // the user would approve one thing and the simulator replay another.
  const dropped = selections.filter((s) => !emitted.has(s.groupId));
  if (dropped.length > 0) {
    throw new Error(
      `buildExecutionPlan: ${dropped.map((s) => s.groupId).join(", ")} never reached the plan; ` +
        `check ${input.environmentId}'s actionByGroupKind against its transitions`,
    );
  }

  return {
    planId: `PLAN-${TEAM_ID}-${candidateId}`,
    validationMode: "SIMULATION_ONLY",
    executionEnvironment: "DIGITAL_TWIN",
    actualDeviceCommandSent: false,
    actions,
  };
}

/**
 * `groupId` rides along only for the generic "option" kind, where it is the only
 * thing telling one selection from another. Named kinds carry it in the kind
 * itself and the schema rejects the extra field.
 */
function targetFor(selection: OptionSelection): PlannedAction["target"] {
  return selection.kind === "option"
    ? { kind: "option", groupId: selection.groupId, id: selection.optionId }
    : { kind: selection.kind, id: selection.optionId };
}

/**
 * The option id to select for one group, or null when the group may be skipped.
 * Throws rather than guessing: an unanswered required group is a question for
 * the user, not a default for us to invent.
 */
function chooseOptionId(
  group: OptionGroup,
  answer: unknown,
  candidate: Candidate,
): string | null {
  const supported = candidate.supportedOptions?.[group.groupId] ?? group.options.map((o) => o.id);

  if (answer === undefined || answer === null || NOT_ANSWERED.has(String(answer))) {
    if (!group.required) return null;
    // Not a guess: the candidate leaves exactly one legal value, so there is
    // nothing to choose between. Anything wider has to go back to the user.
    if (supported.length === 1) return supported[0];
    throw new Error(
      `buildExecutionPlan: ${group.groupId} is required but the user did not answer it`,
    );
  }

  // A quantity arrives as a number (1), the option carries it as `value`.
  const match =
    typeof answer === "number"
      ? group.options.find((o) => o.value === answer)
      : group.options.find((o) => o.id === answer);
  if (!match) {
    throw new Error(`buildExecutionPlan: ${String(answer)} is not an option of ${group.groupId}`);
  }
  if (!supported.includes(match.id)) {
    // The user picked a value this candidate does not come with — a real case,
    // because scoring does not weigh every option group. Refusing to plan would
    // strand an order the user already approved, so: an optional group is
    // dropped rather than overridden, and a required one falls back only when
    // the candidate leaves a single legal value, which is not a choice at all.
    if (!group.required) return null;
    if (supported.length === 1) return supported[0];
    throw new Error(
      `buildExecutionPlan: ${candidate.candidateId} does not support ${group.groupId}=${match.id}`,
    );
  }
  return match.id;
}

function transitionFor(transitions: Transition[], from: string, action: string): Transition {
  const move = transitions.find((t) => t.from === from && t.action === action);
  if (!move) {
    throw new Error(`buildExecutionPlan: no transition ${from} --${action}--> in this environment`);
  }
  return move;
}

/**
 * Shortest sequence of transitions from `from` to `goal`. Breadth-first, so no
 * page-turning or re-entry steps sneak in — the simulator handles those.
 *
 * Self-loops never appear: their destination is already visited by definition.
 * `drainSelfLoops` is what puts them back where they belong.
 */
function routeTo(
  transitions: Transition[],
  from: string,
  goal: string,
  forbidden: Set<string>,
): Transition[] {
  const queue: Array<{ state: string; path: Transition[] }> = [{ state: from, path: [] }];
  const seen = new Set([from]);

  while (queue.length > 0) {
    const { state, path } = queue.shift()!;
    if (state === goal) return path;
    for (const move of transitions) {
      if (move.from !== state || seen.has(move.to) || forbidden.has(move.action)) continue;
      seen.add(move.to);
      queue.push({ state: move.to, path: [...path, move] });
    }
  }
  throw new Error(`buildExecutionPlan: no route from ${from} to ${goal}`);
}

/** Last gate before the plan leaves this function. */
function assertSafe(actions: PlannedAction[], allowed: string[], forbidden: Set<string>): void {
  for (const { action, target } of actions) {
    if (forbidden.has(action)) {
      throw new Error(`buildExecutionPlan: forbidden action ${action} reached the plan`);
    }
    if (!allowed.includes(action)) {
      throw new Error(`buildExecutionPlan: ${action} is not in the environment's allowedActions`);
    }
    if (!target.kind || !target.id) {
      throw new Error(`buildExecutionPlan: ${action} has an incomplete target`);
    }
  }
}
