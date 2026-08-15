/**
 * @commitandrun/engine — what would have to change for there to be an offer.
 *
 * With a 3,000원 budget every dish in the chicken shop is excluded and the
 * screen says "직원의 도움을 받아 주세요" — true, and useless. The cheapest dish
 * is 5,500원, so there is something to say, and nothing in the engine was
 * saying it.
 *
 * Facts and the sentence, kept in two functions. `relaxationOptions` returns
 * "raise `/hardConstraints/maxPriceKrw` to 5500 and one candidate survives" and
 * knows no Korean; `explainRelaxation` says that out loud and counts nothing.
 * The same split `filterCandidates` and `explainRecommendation` already keep.
 *
 * ⚠️ The sentence used to be left to the caller, and this comment used to say
 * so. There was nobody to take it: `apps/web` is the only caller a user sees, and
 * a sentence built there would be a second place the kiosk speaks from — the
 * thing `pm/99_HANDOFF.md` 6절 warns about, in the same words, about a different
 * judgement. Everything the sentence needs is already in this package: the
 * particles in `domain.ts`, the candidate noun on the domain, the amount
 * formatting, and the wording per `reasonCode`. It is not in a domain file
 * either, because the allow-list it has to agree with is here — a domain could
 * otherwise word an exclusion this file refuses to suggest a way around.
 *
 * ⚠️ The counts are measured, never derived from `excluded`. `filterCandidates`
 * removes a candidate on the first rule that objects, so the exclusion list
 * undercounts what a relaxation would revive: at 6,000원 it names five
 * candidates where only four come back, because one of them also fails on
 * service type and was never going to be the budget's to give. Every row below
 * is a second `filterCandidates` over a context rebuilt with the relaxed value.
 * Eight candidates make that free, and it buys the guarantee that matters —
 * the allergen rule runs first on the way back in, so nothing this function
 * suggests can resurrect a dish the user is allergic to.
 *
 * Same rule as the rest of src/ — nothing outside this package is imported.
 */

import { directionParticle, domainForContext, objectParticle } from "./domain.ts";
import { filterCandidates } from "./select.ts";
import type { Candidate, OptionGroup, PublicFixture, SessionContext } from "./types.ts";

/** One thing the user could change, and what it would get them. */
export interface RelaxationOption {
  /** JSON Pointer into the session context — the field that would move. */
  path: string;
  /** The exclusion this answers. Always a key of `SUGGESTABLE`. */
  reasonCode: string;
  /** What the field would have to become. */
  value: number | string;
  /** How many candidates survive at that value. Measured, not derived. */
  survivorCount: number;
  /** Which ones, so a caller can name them without filtering a third time. */
  survivorIds: string[];
}

/** Where a suggestable exclusion's constraint lives, and what could replace it. */
interface Suggestable {
  section: "preferences" | "hardConstraints";
  key: string;
  path: string;
  /**
   * The values worth trying, best-first. "Best" means least change: the price
   * axis is ascending, so the first row that reaches a given count is the
   * smallest budget that reaches it.
   */
  values: (blocked: Candidate[], ctx: SessionContext) => (number | string)[];
  /**
   * The row said in Korean — what to change, and what it buys.
   *
   * Required rather than optional, so the compiler is the check for "every
   * suggestable reason has wording". `SERVICE_TYPE_MISMATCH` is the entry that
   * needs it: it is dormant in this fixture — `check-scenarios` sweeps 40 answer
   * sets and all 52 rows they produce are `PRICE_LIMIT_EXCEEDED` — so nothing at
   * runtime would notice a missing sentence until the day a fixture tilts and
   * the screen shows a blank.
   *
   * `noun` is the domain's own `candidateNoun`, `groups` the fixture's option
   * groups: no name a user reads is written into this file.
   */
  say: (option: RelaxationOption, noun: string, groups: OptionGroup[]) => string;
}

/** 5500 → "5,500". By hand, so the amount cannot vary with locale data. */
function won(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * The option group whose answer `SERVICE_TYPE_MISMATCH` would have the user
 * change. The same id the candidates key `supportedOptions` on.
 */
const SERVICE_TYPE_GROUP = "SERVICE_TYPE";

/**
 * The exclusions we are allowed to propose a way around.
 *
 * An allow-list, not a deny-list: a fixture that invents a new reason code
 * should produce no suggestion until someone has looked at it, rather than one
 * we never intended. Both entries are the user's own stated preference, which
 * is the whole test for belonging here.
 *
 * ⚠️ Keyed on `reasonCode`, never filtered on `tag`. Every rule in all three
 * domains tags its exclusion `USER_PREFERENCE`, including public-office's
 * `REQUESTED_SERVICE_MISMATCH` — a tag filter would have the kiosk say "건강보험
 * 대신 주민등록으로 오셨다고 하시면", which is us guessing at an entitlement.
 * Allergies, proof of identity and eligibility are absent for the same reason
 * and there is no shape of fixture change that adds them here by accident.
 */
const SUGGESTABLE: Record<string, Suggestable> = {
  PRICE_LIMIT_EXCEEDED: {
    section: "hardConstraints",
    key: "maxPriceKrw",
    path: "/hardConstraints/maxPriceKrw",
    // Ascending, so the cheapest way out is the first row offered.
    values: (blocked) =>
      [...new Set(blocked.map((c) => c.price).filter((p): p is number => p !== undefined))]
        .sort((a, b) => a - b),
    // "올리시면" is safe to write: every value offered is the price of a dish
    // this budget shut out, so it is above the limit the user set by
    // construction. 예산 is this entry's own word — the field is a number the
    // user typed and no option group names it.
    say: (option, noun) => {
      if (typeof option.value !== "number") {
        throw new Error(`explainRelaxation: 예산 제안의 값이 금액이 아니다 — ${String(option.value)}`);
      }
      return `예산을 ${won(option.value)}원까지 올리시면 ${noun} ${option.survivorCount}개를 고르실 수 있습니다.`;
    },
  },
  SERVICE_TYPE_MISMATCH: {
    section: "preferences",
    key: "serviceType",
    path: "/preferences/serviceType",
    // What the shut-out candidates actually accept, minus what was asked for.
    values: (blocked, ctx) => {
      const wanted = (ctx.preferences as { serviceType?: string }).serviceType;
      return [
        ...new Set(blocked.flatMap((c) => c.supportedOptions?.SERVICE_TYPE ?? [])),
      ].filter((v) => v !== wanted);
    },
    // Both names come off the fixture — the group's own label for the question,
    // and the option's label for the answer, which is the wording on the button
    // the user would have to press. `chicken-store.ts` has a second table saying
    // "포장" and "매장 이용"; that one words an exclusion and this one words an
    // instruction, and neither is the other's to reuse.
    say: (option, noun, groups) => {
      const group = groups.find((g) => g.groupId === SERVICE_TYPE_GROUP);
      const label = group?.options.find((o) => o.id === option.value)?.label;
      if (group === undefined || label === undefined) {
        throw new Error(
          `explainRelaxation: 픽스처의 ${SERVICE_TYPE_GROUP} 에 ${String(option.value)} 의 이름이 없다`,
        );
      }
      return `${group.label}${objectParticle(group.label)} ${label}${directionParticle(label)}`
        + ` 바꾸시면 ${noun} ${option.survivorCount}개를 고르실 수 있습니다.`;
    },
  },
};

/**
 * The context again with one field moved.
 *
 * A shallow copy per level touched — the engine only ever reads a context, and
 * a function that edited the caller's would make the count it reports depend on
 * how many times it had been called.
 */
function withField(
  ctx: SessionContext,
  section: "preferences" | "hardConstraints",
  key: string,
  value: number | string,
): SessionContext {
  return { ...ctx, [section]: { ...ctx[section], [key]: value } } as SessionContext;
}

/**
 * Every change that would leave the user with more to choose from than they
 * have now, cheapest change first.
 *
 * Empty is a real answer and the common one: hospital and public-office have no
 * suggestable exclusion at all, so nothing about a visit type or an
 * authentication method is ever proposed as negotiable. A caller that needs to
 * tell "nothing to suggest" from "never asked" has to say so itself — this
 * returns the same `[]` for both.
 *
 * Rows never merely restate where the user already is. A value is kept only if
 * it strictly beats both doing nothing and every smaller change already kept,
 * so "포장 대신 매장으로 하시면 6개" cannot appear next to six candidates the
 * user can already see.
 */
export function relaxationOptions(
  fixture: Pick<PublicFixture, "candidates">,
  ctx: SessionContext,
): RelaxationOption[] {
  const { survivors, excluded } = filterCandidates(fixture, ctx);
  const byId = new Map(fixture.candidates.map((c) => [c.candidateId, c]));
  const options: RelaxationOption[] = [];

  for (const [reasonCode, spec] of Object.entries(SUGGESTABLE)) {
    const blocked = excluded
      .filter((e) => e.reasonCode === reasonCode)
      .map((e) => byId.get(e.candidateId))
      .filter((c): c is Candidate => c !== undefined);
    if (blocked.length === 0) continue;

    // Per constraint, not across them: two constraints that each get you to
    // four candidates are two different offers, and the user picks.
    let best = survivors.length;
    for (const value of spec.values(blocked, ctx)) {
      const relaxed = filterCandidates(fixture, withField(ctx, spec.section, spec.key, value));
      if (relaxed.survivors.length <= best) continue;
      best = relaxed.survivors.length;
      options.push({
        path: spec.path,
        reasonCode,
        value,
        survivorCount: relaxed.survivors.length,
        survivorIds: relaxed.survivors.map((c) => c.candidateId),
      });
    }
  }

  return options;
}

/**
 * One row of `relaxationOptions`, said to the user.
 *
 * "예산을 5,500원까지 올리시면 메뉴 1개를 고르실 수 있습니다." — the customer who
 * typed 3,000원 currently gets "조건에 맞는 메뉴가 없습니다. 직원의 도움을 받아
 * 주세요." and nothing else, while this row has been sitting in the engine since
 * pm/24 ④. That sentence is not replaced: an offer to raise a budget is beside
 * the way out, never instead of it.
 *
 * ⚠️ Counts nothing. Every number in the sentence is `option.survivorCount` and
 * `option.value` as they were measured, because deriving either here would be
 * the mistake `relaxationOptions` documents at the top of this file — the
 * exclusion list says five dishes come back at 6,000원 where four do, and a
 * sentence is the one place that number is a promise to a person.
 *
 * Three arguments where `explainAlternative` takes two, and the first two are
 * `relaxationOptions`' own, so a caller writes:
 *
 *     relaxationOptions(fixture, ctx).map((o) => explainRelaxation(fixture, ctx, o))
 *
 * The fixture carries the labels the user would have to press and the context
 * carries the domain, so neither the button's wording nor the word for what is
 * being chosen is written into this file.
 *
 * Throws for a `reasonCode` that is not in the allow-list, rather than returning
 * "" — an empty string reaches a screen as a blank line and looks like a row
 * that had nothing to say, which is the one failure this function exists to
 * prevent.
 */
export function explainRelaxation(
  fixture: Pick<PublicFixture, "optionGroups">,
  ctx: SessionContext,
  option: RelaxationOption,
): string {
  // `hasOwn`, not `!== undefined`: `SUGGESTABLE` is a plain object, so a
  // reasonCode of "constructor" or "toString" would otherwise find something on
  // Object.prototype and fail later with a TypeError about `say` instead of the
  // sentence this line is here to say.
  if (!Object.hasOwn(SUGGESTABLE, option.reasonCode)) {
    throw new Error(`explainRelaxation: ${option.reasonCode} 는 제안할 수 있는 이유가 아니다`);
  }
  const spec = SUGGESTABLE[option.reasonCode];
  return spec.say(option, domainForContext(ctx).candidateNoun, fixture.optionGroups);
}
