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

import { domainFor, isAnswered, type DomainSpec } from "./domain.ts";
// Registers the three official domains, same as select.ts and plan.ts.
import "./domains/index.ts";
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
  for (const group of fixture.optionGroups) {
    if (!group.required) continue;
    // "" is a real JSON Pointer meaning the whole document, used here for a
    // group we can name but cannot locate — a fixture grew a required group
    // that is not in the table above. Reported anyway: the screen keys off
    // groupId, and a missing answer nobody mentions is the failure this file
    // exists to prevent.
    const path = paths[group.groupId] ?? "";
    if (hasAnswer(domain, group, ctx, path)) continue;
    missing.push({
      path,
      groupId: group.groupId,
      message: `${group.label}${objectParticle(group.label)} 골라 주세요.`,
    });
  }
  return missing;
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

/**
 * 을 or 를 for the group label, so the sentence reads correctly for every group
 * rather than only the ones that happen to end in a vowel — "맵기를 골라
 * 주세요", but "수량을 골라 주세요". A Hangul syllable carries its final
 * consonant in the low 28 of its code point.
 *
 * A label that does not end in Hangul falls back to 를, which is what a Korean
 * speaker writes after a foreign word ending in a vowel sound; there is no such
 * label in the three fixtures today.
 */
function objectParticle(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length === 0) return "를";
  const last = trimmed.charCodeAt(trimmed.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "를";
  return (last - 0xac00) % 28 === 0 ? "를" : "을";
}
