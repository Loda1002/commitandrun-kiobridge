/**
 * 원본 입력 예시. STEP 1 이 무엇을 돌려주면 되는지 보여줍니다.
 * 형식은 자유이며, STEP 2·3 이 공식 형식으로 옮깁니다.
 */
import type { TeamCollectedAnswers } from "./types";

export const EXAMPLE_RAW_INPUT: TeamCollectedAnswers = {
  // 접근성 — 사용자가 직접 켠 값
  largeText: true,
  simpleSteps: false,
  preferredInput: "TOUCH",

  // 이번 이용 맥락 — profile 이 아니라 sessionContext 로 갑니다
  todayTask: "PRACTICE",

  // 사용자가 확인해 준 값인지 기록해 두면 fieldMetadata 를 채우기 쉽습니다
  _confirmedByUser: true,
  _collectedVia: "WEB_FORM",
};
