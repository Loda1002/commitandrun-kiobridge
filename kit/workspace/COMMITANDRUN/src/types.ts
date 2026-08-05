/**
 * 팀 내부 타입. 자유롭게 바꾸세요.
 *
 * 공식 계약 타입은 `@kiobridge/participant-sdk` 에서 가져옵니다:
 *   UserProfile · AnySessionContext · Recommendation · UserDecision · ExecutionPlan
 */

/** 여러분의 UI 가 모은 답변. 형식은 자유입니다. */
export interface TeamCollectedAnswers {
  [key: string]: unknown;
}

/**
 * 외부 맥락(날씨·혼잡도 등)은 Core 계약을 바꾸지 말고
 * sessionContext.extensions 의 팀 namespace 에 넣으세요.
 */
export interface ContextSignal {
  type: "WEATHER" | "TIME_OF_DAY" | "HOLIDAY" | "CROWDING" | "STOCK" | string;
  key: string;
  value: string | number | boolean;
  source: string;
  /** UTC ISO 8601 (예: 2026-08-03T00:00:00Z) */
  observedAt: string;
  expiresAt?: string;
  confidence?: number;
}
