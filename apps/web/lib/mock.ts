/**
 * The context screen's questions, and a set of answers to prefill them with.
 *
 * This file used to hold canned recommendations and a canned plan as well, from
 * back when the screens were built before the engine existed. Those are gone:
 * `lib/api.ts` now runs the engine in the browser, so a recommendation is
 * computed from what the user actually answered.
 *
 * They were removed rather than left unused. The canned recommendation carried
 * the sentence "등록하신 견과류 알레르기와 겹치는 메뉴는 아예 빼고 골랐습니다"
 * with the allergen baked in, and it stayed in the built bundle even once
 * nothing rendered it — a false safety claim sitting in the deployed artifact,
 * waiting for someone to wire it back up.
 *
 * What is left is UI copy, not data the engine could produce: question wording,
 * help text, and the order the options are offered in. The option ids match
 * kit/environments/chicken-store/option-groups.json, which is also what
 * apps/web/lib/fixtures/ carries.
 *
 * Nothing here is real personal data.
 */
import type { Answers, QuestionDef } from "./types";

/* ── the context screen's questions ──────────────────────────────────────── */

/**
 * Derived from kit/environments/chicken-store/option-groups.json plus the two
 * hard constraints (allergens, budget) the engine filters on.
 *
 * UNKNOWN is last in every list so it reads as "none of the above", and it is
 * never the pre-selected value — a pre-selected UNKNOWN would be us answering
 * for the user.
 */
export const MOCK_QUESTIONS: QuestionDef[] = [
  {
    id: "serviceType",
    label: "어떻게 받으시겠어요?",
    kind: "single",
    options: [
      { value: "TAKE_OUT", label: "포장해서 가져갈게요" },
      { value: "DINE_IN", label: "여기서 먹을게요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "spicyLevel",
    label: "맵기는 어떻게 해드릴까요?",
    kind: "single",
    options: [
      { value: "MILD", label: "순한맛" },
      { value: "MEDIUM", label: "보통맛" },
      { value: "HOT", label: "매운맛" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "boneType",
    label: "뼈 있는 것과 순살 중에 어느 쪽이 좋으세요?",
    kind: "single",
    options: [
      { value: "BONELESS", label: "순살" },
      { value: "BONE", label: "뼈 있는 것" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "allergenIds",
    label: "못 드시는 것이 있으세요?",
    help: "해당하는 것을 모두 골라 주세요. 고르신 재료가 든 메뉴는 아예 빼고 추천합니다.",
    kind: "multi",
    options: [
      { value: "PEANUT", label: "땅콩·견과류" },
      { value: "SOY", label: "콩" },
      { value: "MILK", label: "우유" },
      { value: "EGG", label: "달걀" },
      { value: "WHEAT", label: "밀" },
      { value: "SHRIMP", label: "새우" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "cupOption",
    label: "컵은 어떻게 하시겠어요?",
    kind: "single",
    options: [
      { value: "PAPER", label: "종이컵" },
      { value: "REGULAR", label: "일반 컵" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "quantity",
    label: "몇 개 드릴까요?",
    kind: "single",
    options: [
      { value: "Q1", label: "1개" },
      { value: "Q2", label: "2개" },
      { value: "Q3", label: "3개" },
    ],
  },
  {
    id: "maxPriceKrw",
    label: "예산은 얼마까지 생각하고 계세요?",
    help: "비워 두시면 예산은 따지지 않습니다.",
    kind: "number",
    options: [],
  },
];

/** A filled-in answer set, handy as a form default. */
export const MOCK_ANSWERS: Answers = {
  serviceType: "TAKE_OUT",
  spicyLevel: "HOT",
  boneType: "BONELESS",
  cupOption: "PAPER",
  quantity: "Q1",
  allergenIds: ["PEANUT"],
  maxPriceKrw: 7000,
};
