/**
 * @commitandrun/engine — what the user still has to answer.
 *
 * Today someone can say "알레르기 없어요" and skip everything else, and the
 * screen still lets them through to a recommendation scored on nothing. The
 * rule that stops that belongs here rather than in the screen: if the screen
 * decided on its own what counts as answered, the screen and the submission
 * would eventually disagree about the same session, and only one of them is
 * what the judges read.
 *
 * This is NOT `domain.reconfirm`. That one says "we cannot do this safely"
 * (an allergy nobody established); this one says "you have not picked yet".
 * The first blocks a recommendation outright, the second greys out a button.
 *
 * Same rule as the rest of src/ — nothing outside this package is imported.
 */

import {
  domainFor,
  isAnswered,
  objectParticle,
  subjectParticle,
  type DomainSpec,
} from "./domain.ts";
// Registers the three official domains, same as select.ts and plan.ts.
import "./domains/index.ts";
import { unsettleableGroups } from "./plan.ts";
import type { OptionGroup, PublicFixture, SessionContext } from "./types.ts";

export interface MissingAnswer {
  /** JSON Pointer into the session context, e.g. "/preferences/serviceType". */
  path: string;
  /** Which input on the screen. The fixture's groupId. */
  groupId: string;
  /** Shown to the user as written. */
  message: string;
}

/**
 * Where each environment keeps the answer to each option group.
 *
 * The fixture names the groups and says which are required; it does not say
 * where the answer lands in the session context, and neither does `DomainSpec`
 * — so this bridge is ours. It sits here rather than in `domains/*.ts` only
 * because `domain.ts` is frozen for this card and `DomainSpec` has no slot for
 * it; it belongs next to each domain's `answerFor`, and should move there the
 * next time that interface is opened.
 *
 * Note that this table decides nothing about what is REQUIRED. That comes from
 * `fixture.optionGroups[].required` every time, so a fixture that adds a
 * required group is followed without touching this file.
 */
const CONTEXT_PATHS: Record<string, Record<string, string>> = {
  "chicken-store": {
    SERVICE_TYPE: "/preferences/serviceType",
    SPICY_LEVEL: "/preferences/spicyLevel",
    BONE_TYPE: "/preferences/boneType",
    CUP: "/preferences/cupOption",
    QUANTITY: "/preferences/quantity",
  },
  hospital: {
    VISIT_TYPE: "/facts/visitType",
    APPOINTMENT: "/facts/appointmentStatus",
    DEPARTMENT: "/facts/departmentId",
    SUPPORT: "/preferences/supportModes",
  },
  "public-office": {
    CATEGORY: "/facts/serviceCategory",
    AUTH_METHOD: "/capabilities/availableAuthMethods",
  },
};

/**
 * Everything this environment insists on that the user has not answered yet, in
 * the order the fixture lists the groups.
 *
 * Empty means the flow may continue. It does not mean the recommendation is
 * safe — ask `domain.reconfirm` for that.
 */
export function findMissingAnswers(
  fixture: PublicFixture,
  ctx: SessionContext,
): MissingAnswer[] {
  const environmentId = fixture.manifest.environmentId;
  // domainFor rather than getDomain: it also catches a fixture and a context
  // that describe different environments, which is the mistake that otherwise
  // surfaces as an unrelated error further in.
  const domain = domainFor(environmentId, ctx);
  const paths = CONTEXT_PATHS[environmentId] ?? {};

  const missing: MissingAnswer[] = [];
  const answered: OptionGroup[] = [];
  for (const group of fixture.optionGroups) {
    if (!group.required) continue;
    // "" is a real JSON Pointer meaning the whole document, used here for a
    // group we can name but cannot locate — a fixture grew a required group
    // that is not in the table above. Reported anyway: the screen keys off
    // groupId, and a missing answer nobody mentions is the failure this file
    // exists to prevent.
    const path = paths[group.groupId] ?? "";
    if (hasAnswer(domain, group, ctx, path)) {
      answered.push(group);
      continue;
    }
    missing.push({
      path,
      groupId: group.groupId,
      message: `${group.label}${objectParticle(group.label)} 골라 주세요.`,
    });
  }

  // Runs whether or not something above is still unanswered. Gating it on an
  // empty list left the dead end open for the commonest hospital user there is:
  // someone who needs no accessibility support cannot fill SUPPORT from the
  // screen, so `apps/web` drops that one entry, and with the conflict check
  // skipped the button unlocked on an answer set no desk can serve.
  missing.push(...findUnservableAnswers(fixture, ctx, answered, paths));
  return missing;
}

/**
 * Answers that are each fine on their own and impossible together.
 *
 * A user can tell the hospital 재진 · 예약 있음 · 정형외과 and be asked nothing:
 * every value is on offer, and every one of them is true of them. There is just
 * no desk that is all three at once — this fixture books 재진 예약 only for 내과.
 * Until the department stopped being silently overwritten that combination did
 * not look like a problem, because `plan.ts` filled in 내과 and the person found
 * out at the desk. Now it refuses, and a refusal that reaches only the console
 * is the dead end pm/20 is about, so the question is asked here instead, before
 * any recommendation is drawn.
 *
 * Only the answers the user actually gave are weighed. A group they have not
 * answered yet is already reported above, and counting it here as well would
 * name every group in the fixture — an unanswered fact blocks every candidate,
 * so it drowns out the one answer that is really in the way.
 *
 * A group is named when it is the *only* thing standing between the user and
 * some desk, because that is the answer changing which would open something up.
 * When no single answer does that, every answered group is named: the
 * combination itself is what has to give. Naming all four when 접근성 지원 was
 * never the obstacle is the failure this rule replaced.
 *
 * Availability and the settling rule both come from `plan.ts`, so the screen
 * and the plan cannot disagree about the same session.
 */
function findUnservableAnswers(
  fixture: PublicFixture,
  ctx: SessionContext,
  answered: OptionGroup[],
  paths: Record<string, string>,
): MissingAnswer[] {
  if (answered.length === 0) return [];

  const answeredIds = new Set(answered.map((g) => g.groupId));
  const obstacles = fixture.candidates
    .filter((c) => c.available)
    .map((c) =>
      unsettleableGroups(fixture, c.candidateId, ctx).filter((id) => answeredIds.has(id)),
    );

  if (obstacles.some((groupIds) => groupIds.length === 0)) return [];

  const alone = new Set(obstacles.filter((g) => g.length === 1).map((g) => g[0]));
  const named = alone.size > 0 ? answered.filter((g) => alone.has(g.groupId)) : answered;

  return named.map((group) => ({
    path: paths[group.groupId] ?? "",
    groupId: group.groupId,
    message:
      `지금 답하신 다른 내용과 함께면 ${group.label}${objectParticle(group.label)} ` +
      `그대로 진행할 수 있는 곳이 없습니다. ${group.label}${subjectParticle(group.label)} ` +
      `맞는지 다시 확인해 주세요.`,
  }));
}

/**
 * Whether the user answered this group — which is not quite "does the domain
 * have a value for it".
 *
 * `answerFor` exists to build a plan, so a domain may answer with a baseline it
 * supplied itself: hospital reports `"NONE"` (지원 없음) for the SUPPORT group
 * whenever no support mode was picked, because the plan has to select
 * something. That is the right value for planning and the wrong one here, so
 * the context is the tiebreaker — `input.ts` writes a field only once the user
 * has actually answered it.
 *
 * Both signals are needed, not just the context: someone who asked for
 * GUARDIAN_MODE, which this kiosk has no button for, has answered even though
 * the domain maps it back to "NONE".
 *
 * The third signal is the fixture. A value can be in the official vocabulary
 * and still not be on offer here — `ENT` is a real Department, but the hospital
 * fixture's DEPARTMENT group lists five other ids and not that one. Counting it
 * as answered lights the progress button on a choice the screen cannot show as
 * selected and `plan.ts` then refuses to plan ("ENT is not an option of
 * DEPARTMENT"), which is the same disagreement one screen later. Answers can
 * reach a context without passing through a button — recalled from the profile
 * store, or written by hand into a submission input — so the group's own option
 * list is what settles it.
 */
function hasAnswer(
  domain: DomainSpec,
  group: OptionGroup,
  ctx: SessionContext,
  path: string,
): boolean {
  const answer = domain.answerFor(group, ctx);
  if (!isAnswered(answer)) return false;
  if (!isOffered(group, answer)) return false;
  if (path === "") return true;
  return isAnswered(readPointer(ctx, path));
}

/**
 * Whether the group actually offers this value. Compared exactly the way
 * `plan.ts` compares it, so the two cannot disagree about the same answer: a
 * quantity travels as a number and the option carries it as `value`, everything
 * else matches on the option id.
 */
function isOffered(group: OptionGroup, answer: unknown): boolean {
  return typeof answer === "number"
    ? group.options.some((o) => o.value === answer)
    : group.options.some((o) => o.id === String(answer));
}

/** Walk a JSON Pointer into the context. Undefined for anything not there. */
function readPointer(ctx: SessionContext, pointer: string): unknown {
  let current: unknown = ctx;
  for (const segment of pointer.split("/").slice(1)) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
