/**
 * The one place the screens get data from.
 *
 * Screens must not import `lib/mock.ts`, and must not call `fetch` themselves.
 * Everything goes through the three functions below. When the BFF is wired in,
 * only this file changes — no screen does.
 *
 * The BFF is apps/bff (see its README). Its POST /api/run returns
 * { sessionId, safety, validation, run, evidence }; `runPlan()` is what will
 * reshape that into RunView.
 */
import {
  MOCK_ANSWERS,
  MOCK_QUESTIONS,
  MOCK_RECOMMENDATION,
  MOCK_RECOMMENDATION_NEEDS_RECONFIRM,
  MOCK_RUN,
} from "./mock";
import type { Answers, Decision, QuestionDef, RecommendationView, RunView } from "./types";

/** Flip to false once the BFF is reachable. Owner: 팀장. */
const USE_MOCK = true;

/**
 * The real calls take about a second. Keeping a delay here means the screens get
 * built with a loading state from the start instead of having one bolted on
 * later, when the wait suddenly becomes visible.
 */
const MOCK_DELAY_MS = 400;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Questions for the context screen. Real source: GET /api/environments/:id/fixture. */
export async function fetchQuestions(): Promise<QuestionDef[]> {
  if (USE_MOCK) {
    await wait(MOCK_DELAY_MS);
    return MOCK_QUESTIONS;
  }
  throw new Error("BFF 연결이 아직 없습니다.");
}

/** A form default so the context screen can be opened without typing every time. */
export function defaultAnswers(): Answers {
  return { ...MOCK_ANSWERS, allergenIds: [...MOCK_ANSWERS.allergenIds] };
}

/**
 * Filter, score, and explain. No side effects — nothing is executed here, so it
 * is safe to call again when the user changes an answer.
 *
 * While mocked, answering "모르겠어요" to the allergy question returns the
 * re-ask result. That path is not a special case to be tidied away later: the
 * engine is not allowed to guess an allergy, so the screen has to handle it.
 */
export async function fetchRecommendation(answers: Answers): Promise<RecommendationView> {
  if (USE_MOCK) {
    await wait(MOCK_DELAY_MS);
    return answers.allergenIds.includes("UNKNOWN")
      ? MOCK_RECOMMENDATION_NEEDS_RECONFIRM
      : MOCK_RECOMMENDATION;
  }
  throw new Error("BFF 연결이 아직 없습니다.");
}

/**
 * Build the plan and run it against the digital-twin simulator.
 *
 * Call this only after the user has approved. `decision.approved === false`
 * throws rather than running anything: an unapproved plan reaching the
 * simulator is a safety violation, and the BFF's gate rejects it too.
 */
export async function runPlan(decision: Decision): Promise<RunView> {
  if (!decision.approved) {
    throw new Error("사용자 승인 없이는 실행할 수 없습니다.");
  }
  if (USE_MOCK) {
    await wait(MOCK_DELAY_MS);
    return MOCK_RUN;
  }
  throw new Error("BFF 연결이 아직 없습니다.");
}
