/**
 * @commitandrun/engine — choosing a candidate and saying why.
 *
 * The machinery that is the same everywhere: run the exclusion rules in order,
 * score what survives, rank it, and refuse to recommend anything while a
 * question the user must answer is still open. What counts as a reason to
 * exclude, what is worth points, and how any of it is worded in Korean all come
 * from the environment's `DomainSpec` — see `domain.ts`.
 *
 * Showing what we dropped and what each criterion earned is the part of our
 * submission the other teams do not have, so the explanations matter as much as
 * the numbers.
 *
 * The exported signatures are unchanged from when this file was chicken-store
 * only: the web app, the submission builder and the check scripts all call
 * these, and the environment is derivable from what they already pass.
 *
 * Same rule as the rest of src/ — nothing outside this package is imported, so
 * this file also runs in the deployed web app where the kit does not exist.
 */

import { domainForContext, type DomainSpec } from "./domain.ts";
// Registers the three official domains. Importing for the side effect is the
// point: without it the registry is empty and every call below throws.
import "./domains/index.ts";
import {
  LOW_CONFIDENCE_THRESHOLD,
  type Candidate,
  type EngineResult,
  type ExclusionReason,
  type PublicFixture,
  type RecommendationReason,
  type ScoreContribution,
  type SessionContext,
} from "./types.ts";

/**
 * Drop the candidates the user must not be offered, and say why.
 *
 * A candidate is only ever excluded once, by the first rule that objects, so
 * the domain's rule order is a priority order — a sold-out peanut dish is
 * reported as the allergy, not the stock level.
 *
 * Only `fixture.candidates` is read, which is why the submission builder can
 * call this from a step that has the candidate list and nothing else. The
 * environment is taken from the context rather than the manifest for the same
 * reason; a fixture whose environment disagrees with the context is caught in
 * `plan.ts`, which is the point where both are genuinely known.
 */
export function filterCandidates(
  fixture: Pick<PublicFixture, "candidates">,
  ctx: SessionContext,
): { survivors: Candidate[]; excluded: ExclusionReason[] } {
  const domain = domainForContext(ctx);

  const excluded: ExclusionReason[] = [];
  const removed = new Set<string>();

  for (const rule of domain.rules) {
    for (const candidate of fixture.candidates) {
      if (removed.has(candidate.candidateId)) continue;
      const reason = rule(candidate, ctx);
      if (!reason) continue;
      removed.add(candidate.candidateId);
      excluded.push(reason);
    }
  }

  const survivors = fixture.candidates.filter((c) => !removed.has(c.candidateId));
  return { survivors, excluded };
}

/**
 * Score what survived and rank it.
 *
 * Every survivor is scored, not just the ones that make the podium — the UI
 * shows the full comparison, and the caller trims it for the submission.
 */
export function score(survivors: Candidate[], ctx: SessionContext): EngineResult {
  const domain = domainForContext(ctx);

  const contributions: Record<string, ScoreContribution[]> = {};
  const totals = new Map<string, number>();

  for (const candidate of survivors) {
    const rows: ScoreContribution[] = domain.criteria.map((c) => ({
      key: c.key,
      label: c.label,
      weight: c.weight,
      earned: c.met(candidate, ctx) ? c.weight : 0,
    }));
    contributions[candidate.candidateId] = rows;
    totals.set(candidate.candidateId, round2(rows.reduce((sum, r) => sum + r.earned, 0)));
  }

  const ranked = [...survivors].sort((a, b) => compare(a, b, totals, ctx, domain));
  const top = ranked[0];
  const reconfirmRequests = domain.reconfirm(ctx);
  // An unanswered hard constraint outranks any score we could compute.
  const mayRecommend = reconfirmRequests.length === 0;

  /**
   * How sure we are of the recommendation we are making — so when we make none,
   * it is 0.
   *
   * This used to be the top survivor's score whether or not that survivor was
   * being recommended, which read as `confidence: 1` next to
   * `recommendedCandidateId: null`. The submission that says it most loudly is
   * the one where the user never told us their allergies: the top dish scores a
   * perfect 1.00 on taste, and we are refusing to offer it precisely because we
   * cannot say it is safe. A reader with only the fields in front of them
   * cannot tell that apart from a confident recommendation.
   *
   * The three official submissions all recommend something, so `mayRecommend`
   * is true for them and this is the same number it always was — measured, the
   * files come out byte-identical.
   */
  const confidence = mayRecommend && top ? (totals.get(top.candidateId) ?? 0) : 0;

  return {
    recommendedCandidateId: mayRecommend && top ? top.candidateId : null,
    alternativeCandidateIds: mayRecommend ? ranked.slice(1, 3).map((c) => c.candidateId) : [],
    // filterCandidates owns the exclusion list; the caller merges the two.
    excluded: [],
    contributions,
    // explainRecommendation fills this in.
    reasons: [],
    confidence,
    requiresReconfirmation: !mayRecommend || confidence < LOW_CONFIDENCE_THRESHOLD,
    reconfirmRequests,
  };
}

/**
 * Highest score wins. Everything after that only settles ties, so the order is
 * never left to however the fixture happened to list its candidates: the
 * domain's own tiebreak first, then candidateId so runs are repeatable.
 */
function compare(
  a: Candidate,
  b: Candidate,
  totals: Map<string, number>,
  ctx: SessionContext,
  domain: DomainSpec,
): number {
  const byTotal = (totals.get(b.candidateId) ?? 0) - (totals.get(a.candidateId) ?? 0);
  if (byTotal !== 0) return byTotal;

  const byDomain = domain.tiebreak?.(a, b, ctx) ?? 0;
  if (byDomain !== 0) return byDomain;

  return a.candidateId.localeCompare(b.candidateId);
}

/** 0.4 + 0.25 + 0.2 + 0.15 is 1.0000000000000002 in binary floating point. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Why this candidate, in the user's own language.
 *
 * Delegated to the domain, which owns the wording. Every sentence is
 * "[근거] + [무엇을 했는지]" and is only emitted when it is actually true of this
 * recommendation. "AI가 추천했습니다" is not an explanation and is never produced.
 */
export function explainRecommendation(
  recommended: Candidate,
  ctx: SessionContext,
  excluded: ExclusionReason[],
): RecommendationReason[] {
  return domainForContext(ctx).explain(recommended, ctx, excluded);
}

/**
 * The runners-up. `score` already ranked everything and broke the ties, so this
 * reads its answer instead of ranking a second time — two rankings that can
 * disagree with each other is worse than one.
 *
 * `count` can only narrow: score keeps two alternatives, so asking for more
 * still returns two.
 */
export function buildAlternatives(result: EngineResult, count = 2): string[] {
  return result.alternativeCandidateIds.slice(0, count);
}
