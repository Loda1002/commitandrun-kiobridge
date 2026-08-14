/**
 * @commitandrun/engine — why the runner-up is the runner-up.
 *
 * The winner gets six sentences from `explain()`. An alternative gets its id and
 * a shorter bar, and nothing that says what the trade is. That hurts most where
 * it matters: when the staff desk is the alternative, the screen shows only that
 * it scored lower, so "we always leave a way out" is a claim the judges cannot
 * see us keeping.
 *
 * ⚠️ A new export, deliberately. `recommendation.schema.json` is
 * `additionalProperties: false` and `alternativeCandidateIds.items.type` is
 * `"string"`, so widening either would have the whole submission rejected (G6).
 * Nothing here goes into the submission; the value is collected when the screen
 * is wired, which is not this card's to do.
 *
 * The reason comes out of `contributions` and nothing else. Criteria the two
 * candidates earn the same on are left out — they are not why one of them lost.
 *
 * ⚠️ `ScoreContribution.label` is never pasted in. Seven of the eleven labels
 * are "~ 일치" and name the test the bar runs, which is right on a bar and
 * backwards in the slot for what a candidate failed to give: `"형태 일치"`
 * dropped into that slot reads as "the form matched". `pm/17-RESULT.md` 4절
 * records the same fault in `unmetConditions`. So the wording for that slot is
 * written here, once per criterion, as the thing the user asked for.
 *
 * Same rule as the rest of src/ — nothing outside this package is imported.
 */

import { objectParticle, subjectParticle } from "./domain.ts";
import type { EngineResult, ScoreContribution } from "./types.ts";

/**
 * What each criterion is about, said as the thing the user asked for.
 *
 * Keyed on `ScoreContribution.key`, which the type calls a stable machine key,
 * rather than on the label — the label is the bar's name and has to keep
 * reading correctly there, and one string cannot do both jobs. Every registered
 * criterion needs an entry; `check-scenarios` walks the registry and fails if
 * one is missing, so a domain that adds a criterion cannot land a silent gap.
 *
 * `serviceTypeMatch` and `priceWithinLimit` are here and unreachable, measured:
 * both are decided by an exclusion rule that already removed everyone who would
 * differ, so every survivor earns the same on them and they never reach a diff.
 * They stay because "no survivor can differ here" is a fact about today's rule
 * order, not a promise.
 */
const ASKED_FOR: Record<string, string> = {
  // chicken-store
  serviceTypeMatch: "고르신 이용 방식",
  spicyLevelMatch: "고르신 맵기",
  boneTypeMatch: "고르신 형태",
  priceWithinLimit: "정하신 예산",
  // hospital
  visitTypeMatch: "이번 방문 유형",
  appointmentMatch: "예약 여부",
  departmentMatch: "고르신 진료과",
  supportModeMatch: "필요하다고 하신 지원",
  // public-office
  categoryMatch: "고르신 민원 분야",
  authMethodMatch: "가지고 계신 인증 방식",
  guidanceModeMatch: "요청하신 단계별 안내",
};

/** Exported for the check that walks the registry. Not part of the sentence. */
export const askedForPhrase = (key: string): string | undefined => ASKED_FOR[key];

/**
 * "고르신 진료과 · 예약 여부" — joined the way the domains join lists, with the
 * particle taken from the last item because that is the word it attaches to.
 */
function joinAsked(keys: string[], particle: (word: string) => string): string {
  const phrases = keys.map((key) => {
    const phrase = ASKED_FOR[key];
    if (phrase === undefined) {
      throw new Error(`explainAlternative: 기준 ${key} 의 문구가 ASKED_FOR 에 없다`);
    }
    return phrase;
  });
  return `${phrases.join(" · ")}${particle(phrases[phrases.length - 1])}`;
}

/**
 * One sentence saying what this alternative trades away, and what it gains.
 *
 * Reads `result` rather than re-scoring: `score` already ranked these two and
 * broke the tie, and a second opinion computed here could disagree with the one
 * the screen and the submission are both showing.
 *
 * Throws rather than returning something for a candidate that is not in the
 * result, or when there is no recommendation to compare against — both are the
 * caller asking about a comparison that was never made.
 */
export function explainAlternative(result: EngineResult, candidateId: string): string {
  const winnerId = result.recommendedCandidateId;
  if (winnerId === null) {
    throw new Error("explainAlternative: 추천이 없어 견줄 1등이 없다");
  }
  const winner = result.contributions[winnerId];
  const alternative = result.contributions[candidateId];
  if (!winner || !alternative) {
    throw new Error(`explainAlternative: ${!winner ? winnerId : candidateId} 의 막대가 없다`);
  }

  // The domain's own criteria order, kept: it runs heaviest first, so the
  // difference that moved the ranking most is the one said first.
  const byKey = new Map(alternative.map((row: ScoreContribution) => [row.key, row]));
  const worse: string[] = [];
  const better: string[] = [];
  for (const row of winner) {
    const mine = byKey.get(row.key);
    if (mine === undefined || mine.earned === row.earned) continue;
    (mine.earned < row.earned ? worse : better).push(row.key);
  }

  if (worse.length === 0 && better.length === 0) {
    // Measured: 8 of the chicken shop's 24 winner/alternative pairs and 12 of
    // public-office's 52 land here. The bars really are identical and `tiebreak`
    // separated them, so saying anything about "why" would be inventing a
    // reason the chart does not carry.
    return "1등과 맞춘 조건이 같습니다. 막대만으로는 순위가 갈리지 않습니다.";
  }

  if (worse.length === 0) {
    // Cannot happen: equal everywhere else and strictly better somewhere means a
    // higher total, and `score` ranks on that total, so this candidate would be
    // the winner. If it ever does happen the ranking and its own bars disagree,
    // and a sentence shown to a user would be the worst way to find that out.
    throw new Error(
      `explainAlternative: ${candidateId} 가 1등보다 못한 기준이 없다 — 순위와 막대가 어긋난다`,
    );
  }

  const missing = `${joinAsked(worse, objectParticle)} 맞추지 못합니다`;
  return better.length === 0
    ? `${missing}.`
    : `${joinAsked(better, subjectParticle)} 이쪽에 맞지만, ${missing}.`;
}
