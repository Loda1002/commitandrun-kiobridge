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
  /** Key in `Answers`. */
  id: keyof Answers;
  label: string;
  /** Shown under the label. Optional. */
  help?: string;
  kind: "single" | "multi" | "number";
  options: AnswerOption[];
}

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
 * Only the actions our chicken-store plan uses are listed. `actionLabel()`
 * falls back to the raw name so a new action shows up visibly instead of
 * silently rendering as blank.
 */
export const ACTION_LABELS: Record<string, string> = {
  select_service: "받는 방법 고르기",
  select_menu: "메뉴 고르기",
  select_option: "옵션 고르기",
  confirm_option: "고른 것 확인하기",
  open_cart_review: "장바구니 열기",
  verify_cart: "장바구니 내용 검사하기",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
