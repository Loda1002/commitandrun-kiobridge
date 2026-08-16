/**
 * What the screens are allowed to know about.
 *
 * These are VIEW types: the exact shape `lib/api.ts` hands to a screen. They are
 * deliberately flatter than the engine's own result — a screen should never have
 * to join two objects together to render one row.
 *
 * The scoring/reason vocabulary is imported from the engine so there is one
 * definition of it in the repo. Type-only imports: nothing from the engine is
 * bundled into the browser.
 */
import type {
  PlannedAction,
  ReasonTag,
  ReconfirmRequest,
  RecommendationReason,
  ScoreContribution,
} from "@commitandrun/engine";
import type { OptionSelection } from "@commitandrun/engine/plan";

export type {
  OptionSelection,
  PlannedAction,
  ReasonTag,
  ReconfirmRequest,
  RecommendationReason,
  ScoreContribution,
};

/* ── what the user tells us ──────────────────────────────────────────────── */

/** One option in a question. `value` goes to the engine, `label` is shown. */
export interface AnswerOption {
  value: string;
  label: string;
}

/**
 * One question on the context screen.
 *
 * Every question carries an UNKNOWN option ("모르겠어요"). That is a requirement,
 * not a convenience: the engine is forbidden from guessing a value the user did
 * not give, so the user must always be able to say they do not know.
 */
export interface QuestionDef {
  /**
   * Key in the environment's answer set. A plain string rather than
   * `keyof Answers` because the three environments ask different questions —
   * the engine's vocabulary filtering is what actually checks a key is real.
   */
  id: string;
  label: string;
  /**
   * A short noun for the same thing ("맵기" for "맵기는 어떻게 해드릴까요?").
   * The staff-help screen lists answers two-up and a full question does not fit
   * in a table cell. Falls back to `label`.
   */
  short?: string;
  /** Trails a numeric answer, e.g. "원까지". */
  unit?: string;
  /** Shown under the label. Optional. */
  help?: string;
  /**
   * 답 id -> 그 답을 고르면 선택지 아래에 뜨는 한 줄.
   *
   * **묻지 않기로 한 것**을 알려 주는 자리다. 닭강정집의 컵이 그렇다 — 환경
   * 데이터가 `required: false` 로 둔 선택 항목이라(`option-groups.json` 의 CUP)
   * 굳이 한 장을 더 넘기게 하지 않고, 이용 방식에 따라 무엇이 나가는지만 알려
   * 준다. 질문 하나가 줄면 넘겨야 할 장도 하나 준다.
   *
   * ⚠️ 여기에 쓰는 문장은 **화면이 지어내는 말이 아니라 매장 규칙**이어야 한다.
   * 엔진이 정하는 것(추천 이유·대안·되묻기)을 이 자리에 옮겨 적으면 화면과
   * 제출본이 같은 답을 두고 다른 말을 하게 된다.
   */
  answerNotes?: Record<string, string>;
  kind: "single" | "multi" | "number";
  options: AnswerOption[];
}

/**
 * What a form holds, whichever environment it is for.
 *
 * `lib/api.ts` hands this straight to the engine, which narrows it to the
 * environment's own shape and drops anything it does not recognise. Screens
 * that only ever run one environment can use the typed shapes below.
 */
export type AnyAnswers = Record<string, unknown>;

/** chicken-store. */
export interface Answers {
  serviceType: string;
  spicyLevel: string;
  boneType: string;
  cupOption: string;
  quantity: string;
  /** Multi-select. `["UNKNOWN"]` means the user does not know. */
  allergenIds: string[];
  /** null means "no limit given" — not 0. */
  maxPriceKrw: number | null;
}

/**
 * hospital. Mirrors `HospitalAnswers` in packages/engine/src/input.ts — kept in
 * step by hand, for the same reason `Answers` is (see that file's comment).
 */
export interface HospitalAnswers {
  visitType: string;
  appointmentStatus: string;
  /** "UNSPECIFIED" (미정) is a real answer. Only "" or UNKNOWN is not. */
  departmentId: string;
  supportModes: string[];
  guardianPresent: boolean | null;
}

/**
 * public-office. `availableAuthMethods` is which KINDS of proof the user has,
 * never the proof itself — collecting an identifier is a forbidden action.
 */
export interface PublicOfficeAnswers {
  serviceCategory: string;
  availableAuthMethods: string[];
  stepByStep: boolean | null;
  simpleLanguage: boolean | null;
}

/* ── what we show back ───────────────────────────────────────────────────── */

/** A candidate the user can actually pick, with its score rows attached. */
export interface CandidateView {
  candidateId: string;
  name: string;
  priceKrw: number;
  /** 0..1. Multiply by 100 for the "94점" headline. */
  total: number;
  /** Rows of the reasoning bar chart, already ordered heaviest first. */
  contributions: ScoreContribution[];
  /**
   * Why this one cannot be taken with the answers as they stand, or null when
   * it can. A card with a sentence here must not offer a button.
   *
   * A candidate can score well and still be unplannable: the staff-help route
   * is deliberately never filtered out, and it is booked as 예약 없음, so it
   * survives to the podium for someone who told us they do have an appointment.
   * Planning it would have to overwrite that answer, which `plan.ts` refuses.
   * Before it refused, the screen offered the card, the click threw, and the
   * user got a red banner with nothing to do about it.
   */
  blockedReason: string | null;
  /**
   * What this alternative gives up compared with the recommended one, or null.
   *
   * Always null on the recommended card itself — the sentence only means
   * something next to something else. The engine (`alternative.ts`) writes it;
   * the screen never composes one, so the wording cannot drift away from what
   * the submission JSON would say about the same two candidates.
   */
  alternativeExplanation: string | null;
  /**
   * 고르신 것 중 **이 후보가 맞추지 못하는** 항목. 없으면 빈 배열.
   *
   * 왜 추천 화면까지 올려 보내는가. 닭강정집에 뼈 있는 메뉴는 「매운 뼈 닭강정」
   * 하나뿐이고 그것은 매운맛 전용이다. 그래서 뼈 + 보통맛을 고르면 맵기 쪽이
   * 무거워 순살 메뉴가 1등이 되는데, 추천 화면의 이유 목록에는 형태 이야기가
   * 한 줄도 나오지 않았다. 「뼈를 골랐는데 왜 순살이지?」를 **최종 확인 화면에
   * 가서야** 알게 되고, 거기서는 되돌아가는 것 말고 할 수 있는 게 없다
   * (팀장 지시, 2026-08-16).
   *
   * 계획을 세울 수 없는 후보(`blockedReason`)에서는 빈 배열이다 — 무엇으로
   * 대체될지 자체가 정해지지 않는다.
   */
  unmet: OptionSelection[];
}

/** A candidate we removed, and the sentence explaining why. */
export interface ExcludedView {
  candidateId: string;
  name: string;
  /** Official vocabulary, e.g. "ALLERGEN_CONFLICT". Shown as a tag, not prose. */
  reasonCode: string;
  explanation: string;
  tag: ReasonTag;
}

export interface RecommendationView {
  /** null when nothing survived filtering — the screen must offer staff help. */
  recommended: CandidateView | null;
  alternatives: CandidateView[];
  excluded: ExcludedView[];
  reasons: RecommendationReason[];
  /** 0..1 */
  confidence: number;
  /** true when the screen must ask again before letting the user continue. */
  requiresReconfirmation: boolean;
  reconfirmRequests: ReconfirmRequest[];
  /**
   * "예산을 5,500원까지 올리시면 메뉴 1개를 고르실 수 있습니다." — one line per
   * kind of condition that could be loosened, smallest change first.
   *
   * Empty whenever something was recommended, and empty in 병원·관공서 even at a
   * dead end: the engine only suggests loosening conditions a person can freely
   * change, and neither of those environments has one. Allergies, proof of
   * identity and eligibility are never in here by construction (`relax.ts`).
   *
   * These sit *beside* the staff-help sentence, never instead of it.
   */
  relaxationSuggestions: string[];
}

/** The user's approval. This is the gate — no plan runs without it. */
export interface Decision {
  candidateId: string;
  approved: boolean;
}

/** Mirrors the BFF's `safety` block (apps/bff/src/safety.ts → safetySummary). */
export interface SafetyView {
  safe: boolean;
  plannedActionCount: number;
  /** Must be 0. Any other number is an automatic competition FAIL. */
  plannedForbiddenActionCount: number;
  validationMode: string | null;
  executionEnvironment: string | null;
  actualDeviceCommandSent: boolean | null;
  /** Where the run stops, e.g. "CART_REVIEW". */
  boundaryState: string;
}

export interface RunView {
  plan: PlannedAction[];
  safety: SafetyView;
  validation: { valid: boolean; errors: unknown[] };
}

/* ── action names → Korean ───────────────────────────────────────────────── */

/**
 * The plan is written in the platform's action vocabulary. Screens show Korean.
 * This map is NOT mock data — it stays after the real engine is wired in.
 *
 * `actionLabel()` falls back to the raw name so an action we have not named yet
 * shows up visibly instead of silently rendering as blank.
 *
 * ⚠️ `select_service` means different things in different environments: at a
 * chicken shop it picks dine-in or takeaway, at a public office it picks the
 * civil service itself. The shared table cannot tell them apart, so
 * `actionLabel` takes the environment.
 */
export const ACTION_LABELS: Record<string, string> = {
  // chicken-store
  select_menu: "메뉴 고르기",
  select_option: "옵션 고르기",
  confirm_option: "고른 것 확인하기",
  open_cart_review: "장바구니 열기",
  verify_cart: "장바구니 내용 검사하기",
  // hospital
  start: "시작하기",
  select_visit_type: "방문 유형 고르기",
  check_appointment: "예약 여부 확인하기",
  select_department: "진료과 고르기",
  select_flow: "접수 경로 고르기",
  select_support: "필요한 도움 고르기",
  verify_checkin: "접수 내용 검사하기",
  request_staff_help: "직원 도움 요청하기",
  // public-office
  select_category: "민원 분야 고르기",
  view_requirements: "필요한 것 확인하기",
  select_auth_method: "확인 방법 고르기",
  verify_application: "신청 내용 검사하기",
};

/** The one action name that means two different things. */
const SELECT_SERVICE_LABEL: Record<string, string> = {
  "chicken-store": "받는 방법 고르기",
  "public-office": "민원 업무 고르기",
};

export function actionLabel(action: string, environmentId?: string): string {
  if (action === "select_service") {
    return SELECT_SERVICE_LABEL[environmentId ?? "chicken-store"] ?? "고르기";
  }
  return ACTION_LABELS[action] ?? action;
}

/**
 * State names → Korean. The result screen shows where the run stopped, and
 * `CART_REVIEW` on a screen aimed at people who find kiosks hard is not an
 * answer. Unknown states fall back to the raw name for the same reason as
 * `actionLabel`.
 */
export const STATE_LABELS: Record<string, string> = {
  CART_REVIEW: "장바구니 확인",
  CHECKIN_REVIEW: "접수 내용 확인",
  APPLICATION_REVIEW: "신청 내용 확인",
};

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}
