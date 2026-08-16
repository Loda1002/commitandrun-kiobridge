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

export const MOCK_QUESTIONS: QuestionDef[] = [
  {
    id: "serviceType",
    short: "받는 방법",
    label: "어떻게 받으시겠어요?",
    kind: "single",
    /**
     * 컵은 묻지 않고 여기서 알려만 준다.
     *
     * 환경 데이터가 CUP 을 `required: false` 로 둔다 — 창업팀이 필수로 제시한
     * 항목이 아니다(팀장 확인, 2026-08-16). 그런데 이용 방식을 고르면 어차피
     * 매장 규칙으로 정해지는 것이라, 물어 봐야 답이 뒤집히지 않는 질문이었다.
     * 질문을 걷어내면 닭강정집이 네 장에서 세 장이 된다.
     *
     * 「모르겠어요」에는 **한쪽을 골라 주지 않는다.** 두 갈래를 나란히 적어
     * 고르는 데 도움이 되게만 한다 — 안 정한 사람 대신 정하는 순간 그것이
     * 추측이 된다.
     */
    answerNotes: {
      DINE_IN: "여기서 드시는 분께는 매장용 컵으로 드립니다.",
      TAKE_OUT: "가져가시는 분께는 일회용 컵으로 드립니다.",
      UNKNOWN: "여기서 드시면 매장용 컵, 가져가시면 일회용 컵으로 드립니다. 컵은 따로 고르지 않으셔도 됩니다.",
    },
    options: [
      { value: "TAKE_OUT", label: "포장해서 가져갈게요" },
      { value: "DINE_IN", label: "여기서 먹을게요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "spicyLevel",
    short: "맵기",
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
    short: "뼈 / 순살",
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
    short: "못 드시는 것",
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
  /* 컵 질문은 여기 있었다. 걷어낸 이유는 `serviceType` 의 `answerNotes` 주석에
     적었다. 답 자체(`cupOption`)는 빈 값으로 남는다 — 엔진이 선택 항목을 안 고른
     것으로 보고 계획에서 통째로 뺀다(`plan.ts` 의 `settle`), 그래서 최종 확인
     화면에도 컵 줄이 뜨지 않는다. */
  /*
   * 「몇 개 드릴까요?」였다. 무엇의 개수인지가 없어서 **컵 개수로 읽혔다**
   * (팀장 지시, 2026-08-16). 바로 앞에 컵 질문이 있던 흔적이고, 그 질문을
   * 걷어낸 뒤에도 문장 자체가 애매한 것은 그대로였다.
   *
   * 수량은 환경 데이터가 `required: true` 로 둔 필수 항목이고, 공식 규칙
   * `CHICKEN_SELECTED_QUANTITY` 가 「실행계획이 고른 수량 = 사용자가 고른 수량」을
   * BLOCK 등급으로 요구한다. 그러니 무엇의 개수인지는 화면이 분명히 말해야 한다.
   */
  {
    id: "quantity",
    short: "닭강정 개수",
    label: "닭강정을 몇 개 드릴까요?",
    help: "고르실 메뉴를 몇 개 담을지입니다.",
    kind: "single",
    options: [
      { value: "Q1", label: "1개" },
      { value: "Q2", label: "2개" },
      { value: "Q3", label: "3개" },
    ],
  },
  {
    id: "maxPriceKrw",
    short: "예산",
    unit: "원까지",
    label: "예산은 얼마까지 생각하고 계세요?",
    help: "비워 두시면 예산은 따지지 않습니다.",
    kind: "number",
    options: [],
  },
];

export const MOCK_ANSWERS: Answers = {
  serviceType: "TAKE_OUT",
  spicyLevel: "HOT",
  boneType: "BONELESS",
  cupOption: "PAPER",
  quantity: "Q1",
  allergenIds: ["PEANUT"],
  maxPriceKrw: 7000,
};

/* ── hospital ────────────────────────────────────────────────────────────── */

export const HOSPITAL_QUESTIONS: QuestionDef[] = [
  {
    id: "visitType",
    short: "방문 유형",
    label: "오늘 어떤 일로 오셨어요?",
    kind: "single",
    options: [
      { value: "FIRST_VISIT", label: "처음 왔어요 (초진)" },
      { value: "REVISIT", label: "전에 왔었어요 (재진)" },
      { value: "HEALTH_SCREENING", label: "건강검진 받으러 왔어요" },
      { value: "EXAM", label: "검사 받으러 왔어요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "appointmentStatus",
    short: "예약 여부",
    label: "예약하고 오셨어요?",
    kind: "single",
    options: [
      { value: "HAS_APPOINTMENT", label: "예약했어요" },
      { value: "NO_APPOINTMENT", label: "예약 안 했어요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "departmentId",
    short: "진료과",
    label: "어느 진료과로 가세요?",
    help: "증상을 보고 진료과를 정해 드리지는 않습니다. 못 정하셨으면 아래 마지막 항목을 골라 주세요.",
    kind: "single",
    options: [
      { value: "INTERNAL_MEDICINE", label: "내과" },
      { value: "ORTHOPEDICS", label: "정형외과" },
      { value: "RADIOLOGY", label: "영상의학과" },
      { value: "HEALTH_SCREENING", label: "건강검진센터" },
      { value: "UNSPECIFIED", label: "아직 못 정했어요 (안내 받을게요)" },
    ],
  },
  {
    id: "supportModes",
    short: "필요한 도움",
    label: "도움이 필요한 것이 있으세요?",
    help: "해당하는 것을 모두 골라 주세요.",
    kind: "multi",
    options: [
      { value: "LARGE_TEXT", label: "글씨를 크게 보고 싶어요" },
      { value: "HEARING_SUPPORT", label: "잘 안 들려요 (청각 지원)" },
      { value: "STAFF_HELP", label: "직원이 도와줬으면 해요" },
    ],
  },
  {
    id: "guardianPresent",
    short: "보호자",
    label: "보호자와 함께 오셨어요?",
    kind: "single",
    options: [
      { value: "true", label: "네, 같이 왔어요" },
      { value: "false", label: "아니요, 혼자 왔어요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
];

export const HOSPITAL_DEFAULT_ANSWERS: Record<string, unknown> = {
  visitType: "",
  appointmentStatus: "",
  departmentId: "",
  supportModes: [],
  guardianPresent: "",
};

/* ── public-office ───────────────────────────────────────────────────────── */

export const PUBLIC_OFFICE_QUESTIONS: QuestionDef[] = [
  {
    id: "serviceCategory",
    short: "민원 분야",
    label: "어떤 일로 오셨어요?",
    kind: "single",
    options: [
      { value: "RESIDENT", label: "주민등록 (등본·초본)" },
      { value: "FAMILY", label: "가족관계증명서" },
      { value: "INSURANCE", label: "건강보험" },
      { value: "TAX", label: "지방세" },
      { value: "STAFF", label: "직원과 상담하고 싶어요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "availableAuthMethods",
    short: "확인 방법",
    label: "오늘 신분을 확인할 수 있는 방법이 있으세요?",
    help: "가지고 계신 것을 모두 골라 주세요. 번호를 적으실 필요는 없습니다 — 방법만 확인합니다.",
    kind: "multi",
    options: [
      { value: "MOBILE_AUTH", label: "휴대폰 본인확인" },
      { value: "ID_CARD", label: "신분증을 가지고 있어요" },
      { value: "STAFF_ASSIST", label: "직원 확인이 필요해요" },
    ],
  },
  {
    id: "stepByStep",
    short: "단계별 안내",
    label: "절차를 한 단계씩 나눠서 안내해 드릴까요?",
    kind: "single",
    options: [
      { value: "true", label: "네, 천천히 하나씩 알려주세요" },
      { value: "false", label: "아니요, 한 번에 보여주세요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
  {
    id: "simpleLanguage",
    short: "쉬운 말",
    label: "쉬운 말로 안내해 드릴까요?",
    kind: "single",
    options: [
      { value: "true", label: "네, 쉬운 말이 좋아요" },
      { value: "false", label: "아니요, 그대로 보여주세요" },
      { value: "UNKNOWN", label: "모르겠어요" },
    ],
  },
];

export const PUBLIC_OFFICE_DEFAULT_ANSWERS: Record<string, unknown> = {
  serviceCategory: "",
  availableAuthMethods: [],
  stepByStep: "",
  simpleLanguage: "",
};