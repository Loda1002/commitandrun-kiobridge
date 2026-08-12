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
    short: "받는 방법",
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
  {
    id: "cupOption",
    short: "컵",
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
    short: "개수",
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
    short: "예산",
    unit: "원까지",
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

/* ── hospital ────────────────────────────────────────────────────────────── */

/**
 * Derived from kit/environments/hospital/option-groups.json.
 *
 * ⚠️ There is no question here about symptoms, and there must never be one.
 * Working out which department someone needs is inference the platform forbids
 * (`diagnose`, `triage`, `assign_department_final`), and the ban is about the
 * reasoning, not just the action name. The user picks the department; if they
 * have not decided, "아직 못 정했어요" is a real answer the fixture ships a route
 * for (`UNSPECIFIED` → HOS-003/006, the guidance paths).
 *
 * That is also why the department question carries no "모르겠어요": it would sit
 * next to "아직 못 정했어요" saying the same thing in different words, to an
 * audience we are specifically trying not to confuse. Skipping the question
 * entirely still leaves it unanswered, and the engine still stops and asks —
 * the safety property does not depend on the option being there.
 */
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
    help: "해당하는 것을 모두 골라 주세요. 없으시면 비워 두셔도 됩니다.",
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

/**
 * Derived from kit/environments/public-office/option-groups.json.
 *
 * ⚠️ The authentication question asks which KINDS of proof the user has on
 * them, never for the proof itself. `collect_ssn` is a forbidden action, so
 * there is no field here for an identification number and there must not be
 * one. Nothing here decides whether the user qualifies for anything either —
 * that is `auto_eligibility_decision`, also forbidden.
 */
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
