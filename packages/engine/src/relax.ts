/**
 * @commitandrun/engine — what would have to change for there to be an offer.
 *
 * With a 3,000원 budget every dish in the chicken shop is excluded and the
 * screen says "직원의 도움을 받아 주세요" — true, and useless. The cheapest dish
 * is 5,500원, so there is something to say, and nothing in the engine was
 * saying it.
 *
 * Facts, not sentences. This returns "raise `/hardConstraints/maxPriceKrw` to
 * 5500 and one candidate survives"; turning that into Korean is the domain's
 * job, the same split `filterCandidates` and `explainRecommendation` already
 * keep. A sentence built here would be a second place the kiosk speaks from.
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

import { filterCandidates } from "./select.ts";
import type { Candidate, PublicFixture, SessionContext } from "./types.ts";

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
}

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
