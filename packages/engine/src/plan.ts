/**
 * @commitandrun/engine — step 5: the semantic execution plan.
 *
 * Turns "the user approved this candidate" into the ordered note the simulator
 * replays. Purely semantic: what to pick and in which order, never how a screen
 * is laid out. Coordinates, automationIds and control ids are rejected by the
 * platform, and a payment-shaped action fails the run even if it is blocked.
 *
 * Same rule as types.ts — this file runs in the browser too, so `./types.ts` is
 * the only import allowed. Never import from the kit.
 */

import {
  FORBIDDEN_ACTIONS,
  type Candidate,
  type ExecutionPlan,
  type OptionGroup,
  type PlanInput,
  type PlannedAction,
  type Transition,
} from "./types.ts";

/** Prefix of every planId we emit. The submission is filed under this team. */
const TEAM_ID = "COMMITANDRUN";

/**
 * Which `sessionContext.preferences` key answers which fixture option group.
 * The fixture names the groups; only this bridge is ours, so it lives here
 * rather than being guessed from the group label.
 */
const PREFERENCE_KEY_BY_GROUP: Record<string, string> = {
  SERVICE_TYPE: "serviceType",
  SPICY_LEVEL: "spicyLevel",
  BONE_TYPE: "boneType",
  CUP: "cupOption",
  QUANTITY: "quantity",
};

/** Values that mean "the user did not tell us". Never filled in by guessing. */
const NOT_ANSWERED = new Set(["UNKNOWN", "NO_PREFERENCE"]);

/** The semantic action that selects a group, keyed by the group's target kind. */
const ACTION_BY_TARGET_KIND: Record<string, string> = {
  service_type: "select_service",
  option: "select_option",
};

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

  const candidate = fixture.candidates.find((c) => c.candidateId === candidateId);
  if (!candidate) {
    throw new Error(`buildExecutionPlan: unknown candidate ${candidateId}`);
  }
  // UNAVAILABLE_CANDIDATE_BLOCK — a sold-out item can never be executed.
  if (!candidate.available) {
    throw new Error(`buildExecutionPlan: candidate ${candidateId} is unavailable`);
  }

  const preferences = input.sessionContext.preferences as Record<string, unknown>;
  const forbidden = new Set([...FORBIDDEN_ACTIONS, ...manifest.forbiddenActions]);

  const actions: PlannedAction[] = [];
  let state = manifest.initialState;

  /**
   * Append one action and advance. The before/after states come from
   * `fixture.transitions`, never from a literal — if the environment's state
   * machine moves, the plan moves with it instead of silently going stale.
   */
  const step = (action: string, target?: PlannedAction["target"]): void => {
    const move = transitionFor(transitions, state, action);
    actions.push({
      actionIndex: actions.length,
      action,
      // Review and confirmation steps have nothing to name but the state they
      // land on, which is exactly what the simulator matches them against.
      target: target ?? { kind: "review", id: move.to },
      expectedBeforeState: move.from,
      expectedAfterState: move.to,
    });
    state = move.to;
  };

  // 1. Service type, then the menu item itself.
  const serviceGroup = groupByKind(fixture.optionGroups, "service_type");
  if (serviceGroup) {
    const id = chooseOptionId(serviceGroup, preferences, candidate);
    if (id === null) {
      throw new Error("buildExecutionPlan: service type is required but unanswered");
    }
    step(ACTION_BY_TARGET_KIND.service_type, { kind: serviceGroup.kind!, id });
  }

  step("select_menu", { kind: "candidate", id: candidateId });

  // 2. Every remaining group, once each, in fixture order. Iterating the groups
  //    rather than the user's answers is what makes a double-pick impossible.
  for (const group of fixture.optionGroups) {
    if (group.kind !== "option") continue;
    const id = chooseOptionId(group, preferences, candidate);
    if (id === null) continue;
    step(ACTION_BY_TARGET_KIND.option, { kind: "option", groupId: group.groupId, id });
  }

  // 3. Walk the state machine to the review boundary. Shortest legal route, so
  //    no page-turning or re-entry steps sneak in — the simulator handles those.
  for (const move of routeTo(transitions, state, manifest.reviewBoundaryState, forbidden)) {
    step(move.action);
  }

  // 4. Stop here and check. A missing verifier is MISSING_VERIFIER.
  step(manifest.requiredVerifierAction);

  assertSafe(actions, manifest.allowedActions, forbidden);
  if (state !== manifest.reviewBoundaryState) {
    throw new Error(`buildExecutionPlan: plan ended at ${state}, not the review boundary`);
  }

  return {
    planId: `PLAN-${TEAM_ID}-${candidateId}`,
    validationMode: "SIMULATION_ONLY",
    executionEnvironment: "DIGITAL_TWIN",
    actualDeviceCommandSent: false,
    actions,
  };
}

function groupByKind(groups: OptionGroup[], kind: string): OptionGroup | undefined {
  return groups.find((g) => g.kind === kind);
}

/**
 * The option id to select for one group, or null when the group may be skipped.
 * Throws rather than guessing: an unanswered required group is a question for
 * the user, not a default for us to invent.
 */
function chooseOptionId(
  group: OptionGroup,
  preferences: Record<string, unknown>,
  candidate: Candidate,
): string | null {
  const supported = candidate.supportedOptions?.[group.groupId] ?? group.options.map((o) => o.id);
  const answer = preferences[PREFERENCE_KEY_BY_GROUP[group.groupId] ?? group.groupId];

  if (answer === undefined || answer === null || NOT_ANSWERED.has(String(answer))) {
    if (!group.required) return null;
    // Not a guess: the candidate leaves exactly one legal value, so there is
    // nothing to choose between. Anything wider has to go back to the user.
    if (supported.length === 1) return supported[0];
    throw new Error(
      `buildExecutionPlan: ${group.groupId} is required but the user did not answer it`,
    );
  }

  // QUANTITY arrives as a number (1), the option carries it as `value`.
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

/** Shortest sequence of transitions from `from` to `goal`. Breadth-first. */
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
function assertSafe(
  actions: PlannedAction[],
  allowed: string[],
  forbidden: Set<string>,
): void {
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
