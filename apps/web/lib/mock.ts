/**
 * Canned chicken-store data for building screens before the engine exists.
 *
 * Every value here was lifted from the submission that already passes the
 * official validator:
 *   kit/workspace/COMMITANDRUN/output/participant-submission.json
 * Names and prices come from kit/environments/chicken-store/candidates.json.
 *
 * Nothing in this file is real personal data, and nothing here is a payment,
 * identity-verification or administrative-commit action.
 *
 * DELETE THIS FILE once `lib/api.ts` talks to the BFF. Nothing else should
 * import it — screens import from `lib/api.ts` only.
 */
import type {
  Answers,
  CandidateView,
  ExcludedView,
  PlannedAction,
  QuestionDef,
  RecommendationView,
  RunView,
} from "./types";

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

/** The answers behind the canned recommendation below. Handy as a form default. */
export const MOCK_ANSWERS: Answers = {
  serviceType: "TAKE_OUT",
  spicyLevel: "HOT",
  boneType: "BONELESS",
  cupOption: "PAPER",
  quantity: "Q1",
  allergenIds: ["PEANUT"],
  maxPriceKrw: 7000,
};

/* ── the recommendation ──────────────────────────────────────────────────── */

const RECOMMENDED: CandidateView = {
  candidateId: "CHICKEN-001",
  name: "매운 순살 닭강정",
  priceKrw: 6000,
  total: 0.94,
  contributions: [
    { key: "serviceTypeMatch", label: "포장 가능", weight: 0.4, earned: 0.4 },
    { key: "spicyLevelMatch", label: "맵기 일치", weight: 0.25, earned: 0.25 },
    { key: "boneTypeMatch", label: "순살 일치", weight: 0.2, earned: 0.2 },
    { key: "priceWithinLimit", label: "예산 여유", weight: 0.15, earned: 0.09 },
  ],
};

const ALTERNATIVES: CandidateView[] = [
  {
    candidateId: "CHICKEN-003",
    name: "매운 뼈 닭강정",
    priceKrw: 5500,
    total: 0.74,
    contributions: [
      { key: "serviceTypeMatch", label: "포장 가능", weight: 0.4, earned: 0.4 },
      { key: "spicyLevelMatch", label: "맵기 일치", weight: 0.25, earned: 0.25 },
      { key: "boneTypeMatch", label: "순살 일치", weight: 0.2, earned: 0 },
      { key: "priceWithinLimit", label: "예산 여유", weight: 0.15, earned: 0.09 },
    ],
  },
  {
    candidateId: "CHICKEN-006",
    name: "포장 전용 닭강정",
    priceKrw: 6000,
    total: 0.69,
    contributions: [
      { key: "serviceTypeMatch", label: "포장 가능", weight: 0.4, earned: 0.4 },
      { key: "spicyLevelMatch", label: "맵기 일치", weight: 0.25, earned: 0 },
      { key: "boneTypeMatch", label: "순살 일치", weight: 0.2, earned: 0.2 },
      { key: "priceWithinLimit", label: "예산 여유", weight: 0.15, earned: 0.09 },
    ],
  },
];

/**
 * The three candidates we removed. This list is our differentiator — a kiosk
 * that silently drops options is the problem we are fixing, so the screen must
 * show every removal with its reason.
 */
const EXCLUDED: ExcludedView[] = [
  {
    candidateId: "CHICKEN-005",
    name: "땅콩 토핑 닭강정",
    reasonCode: "ALLERGEN_CONFLICT",
    explanation: "등록하신 견과류 알레르기와 겹쳐 제외했습니다.",
    tag: "SAFETY",
  },
  {
    candidateId: "CHICKEN-008",
    name: "품절 닭강정",
    reasonCode: "UNAVAILABLE",
    explanation: "지금 품절이라 고를 수 없습니다.",
    tag: "AVAILABILITY",
  },
  {
    candidateId: "CHICKEN-007",
    name: "매장 전용 닭강정",
    reasonCode: "SERVICE_TYPE_MISMATCH",
    explanation: "매장 이용 전용이라 포장으로는 받을 수 없습니다.",
    tag: "CONTEXT",
  },
];

export const MOCK_RECOMMENDATION: RecommendationView = {
  recommended: RECOMMENDED,
  alternatives: ALTERNATIVES,
  excluded: EXCLUDED,
  reasons: [
    { tag: "USER_PREFERENCE", text: "포장으로 받으신다고 하셔서 포장이 되는 메뉴만 남겼습니다." },
    { tag: "USER_PREFERENCE", text: "매운맛을 고르셔서 매운맛으로 나오는 메뉴를 먼저 보여드렸습니다." },
    { tag: "USER_PREFERENCE", text: "순살을 고르셔서 뼈 없는 메뉴를 위에 두었습니다." },
    { tag: "SAFETY", text: "등록하신 견과류 알레르기와 겹치는 메뉴는 아예 빼고 골랐습니다." },
    { tag: "AVAILABILITY", text: "매장 재고를 확인해 지금 품절인 메뉴는 빼고 골랐습니다." },
    { tag: "CONTEXT", text: "예산 7,000원 안에서 6,000원인 메뉴를 골랐습니다." },
  ],
  confidence: 0.94,
  requiresReconfirmation: false,
  reconfirmRequests: [],
};

/**
 * The user answered "모르겠어요" to the allergy question. The flow must not
 * continue until they answer, because guessing an allergy is a safety failure.
 *
 * There is no recommendation here, and that is not a shortcut for the mock:
 * `recommend()` in packages/engine/src/select.ts returns
 * `recommendedCandidateId: null` and no alternatives whenever a reconfirm
 * request exists. The exclusion list keeps only the two removals that hold
 * without a declared allergen — the peanut one cannot be claimed when we do
 * not know what the user reacts to.
 */
export const MOCK_RECOMMENDATION_NEEDS_RECONFIRM: RecommendationView = {
  ...MOCK_RECOMMENDATION,
  recommended: null,
  alternatives: [],
  excluded: EXCLUDED.filter((item) => item.reasonCode !== "ALLERGEN_CONFLICT"),
  reasons: [],
  confidence: 0.41,
  requiresReconfirmation: true,
  reconfirmRequests: [
    {
      path: "/hardConstraints/allergenIds",
      question: "드시면 안 되는 재료가 있으신가요? 없으시면 '없어요 (해당 없음)'을 골라 주세요.",
      because: "알레르기를 확인하지 못한 상태로는 안전하게 추천해 드릴 수 없습니다.",
    },
  ],
};

/* ── the plan and the evidence ───────────────────────────────────────────── */

/**
 * The ten semantic actions from the passing submission.
 *
 * Two things to notice, because they are what the safety screen proves:
 *   1. every target is a meaning ({kind, id}) — never a coordinate or control id
 *   2. it stops at CART_REVIEW and runs verify_cart. There is no payment action,
 *      and there must never be one.
 */
const MOCK_PLAN: PlannedAction[] = [
  { actionIndex: 0, action: "select_service", target: { kind: "service_type", id: "TAKE_OUT" }, expectedBeforeState: "SERVICE_TYPE", expectedAfterState: "MENU_SELECTION" },
  { actionIndex: 1, action: "select_menu", target: { kind: "candidate", id: "CHICKEN-001" }, expectedBeforeState: "MENU_SELECTION", expectedAfterState: "OPTION_SELECTION" },
  { actionIndex: 2, action: "select_option", target: { kind: "option", groupId: "SPICY_LEVEL", id: "HOT" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_SELECTION" },
  { actionIndex: 3, action: "select_option", target: { kind: "option", groupId: "BONE_TYPE", id: "BONELESS" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_SELECTION" },
  { actionIndex: 4, action: "select_option", target: { kind: "option", groupId: "CUP", id: "PAPER" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_SELECTION" },
  { actionIndex: 5, action: "select_option", target: { kind: "option", groupId: "QUANTITY", id: "Q1" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_SELECTION" },
  { actionIndex: 6, action: "confirm_option", target: { kind: "review", id: "OPTION_CONFIRM" }, expectedBeforeState: "OPTION_SELECTION", expectedAfterState: "OPTION_CONFIRM" },
  { actionIndex: 7, action: "confirm_option", target: { kind: "review", id: "MENU_SELECTION_WITH_CART" }, expectedBeforeState: "OPTION_CONFIRM", expectedAfterState: "MENU_SELECTION_WITH_CART" },
  { actionIndex: 8, action: "open_cart_review", target: { kind: "review", id: "CART_REVIEW" }, expectedBeforeState: "MENU_SELECTION_WITH_CART", expectedAfterState: "CART_REVIEW" },
  { actionIndex: 9, action: "verify_cart", target: { kind: "review", id: "CART_REVIEW" }, expectedBeforeState: "CART_REVIEW", expectedAfterState: "CART_REVIEW" },
];

export const MOCK_RUN: RunView = {
  plan: MOCK_PLAN,
  safety: {
    safe: true,
    plannedActionCount: 10,
    plannedForbiddenActionCount: 0,
    validationMode: "SIMULATION_ONLY",
    executionEnvironment: "DIGITAL_TWIN",
    actualDeviceCommandSent: false,
    boundaryState: "CART_REVIEW",
  },
  validation: { valid: true, errors: [] },
};
