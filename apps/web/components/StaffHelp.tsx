"use client";

import { useState } from "react";
import type { Answers, CandidateView } from "../lib/types";

/**
 * The way out, available from every screen.
 *
 * A kiosk that can only be finished one way is the problem we are fixing, so
 * there has to be a door that is always in the same place. This one does not
 * page anyone — we have no staff-call system to page — and it says so, because
 * a button that promises help it cannot deliver is worse than no button. What
 * it does do is put everything the user has chosen on one screen, in Korean,
 * for them to show a person.
 */
interface StaffHelpProps {
  answers: Answers;
  /**
   * Whether the form has been submitted at least once.
   *
   * `allergenIds: []` carries two meanings and only this tells them apart:
   * before submitting it is the starting value ("not asked yet"), after
   * submitting it is the user saying they have none. Telling staff "없다고
   * 답하셨습니다" about a question nobody answered is exactly the kind of
   * invented safety claim this service exists to avoid.
   */
  answersSubmitted: boolean;
  /** What the user is looking at right now, if anything. */
  candidate: CandidateView | null;
  isHighContrast: boolean;
}

const SERVICE_TYPE: Record<string, string> = { TAKE_OUT: "포장", DINE_IN: "매장에서 먹기" };
const SPICY: Record<string, string> = { MILD: "순한맛", MEDIUM: "보통맛", HOT: "매운맛" };
const BONE: Record<string, string> = { BONELESS: "순살", BONE: "뼈 있는 것" };
const CUP: Record<string, string> = { PAPER: "종이컵", REGULAR: "일반 컵" };
const QUANTITY: Record<string, string> = { Q1: "1개", Q2: "2개", Q3: "3개" };
const ALLERGEN: Record<string, string> = {
  PEANUT: "땅콩·견과류",
  SOY: "콩",
  MILK: "우유",
  EGG: "달걀",
  WHEAT: "밀",
  SHRIMP: "새우",
};

/** Unanswered says so rather than going blank — the staff need to know which. */
const ANSWERED = "아직 안 고르셨습니다";

function allergenLine(ids: string[], submitted: boolean): string {
  if (ids.includes("UNKNOWN")) return "모르겠다고 답하셨습니다 — 꼭 확인해 주세요";
  if (ids.length === 0) return submitted ? "없다고 답하셨습니다" : ANSWERED;
  return ids.map((id) => ALLERGEN[id] ?? id).join(", ");
}

export function StaffHelp({ answers, answersSubmitted, candidate, isHighContrast }: StaffHelpProps) {
  const [isOpen, setIsOpen] = useState(false);

  const rows: Array<[string, string]> = [
    ["받는 방법", SERVICE_TYPE[answers.serviceType] ?? ANSWERED],
    ["맵기", SPICY[answers.spicyLevel] ?? ANSWERED],
    ["뼈 / 순살", BONE[answers.boneType] ?? ANSWERED],
    ["못 드시는 것", allergenLine(answers.allergenIds, answersSubmitted)],
    ["컵", CUP[answers.cupOption] ?? ANSWERED],
    ["개수", QUANTITY[answers.quantity] ?? ANSWERED],
    ["예산", answers.maxPriceKrw === null ? "정하지 않으셨습니다" : `${answers.maxPriceKrw.toLocaleString()}원까지`],
  ];

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="staff-help-panel"
        className="w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
        style={{
          minHeight: "var(--tap-min)",
          borderRadius: "var(--radius)",
          backgroundColor: "transparent",
          color: "var(--color-fg)",
          border: "2px dashed var(--color-fg)",
          fontSize: "calc(1.1rem * var(--font-scale))",
          fontWeight: "bold",
        }}
      >
        🙋 {isOpen ? "직원 도움 화면 닫기" : "직원 도움이 필요해요"}
      </button>

      {isOpen && (
        <section
          id="staff-help-panel"
          className={`mt-4 border-4 rounded-2xl p-6 md:p-8 flex flex-col gap-5 ${
            isHighContrast ? "border-yellow-300 bg-transparent" : "border-orange-500 bg-orange-50"
          }`}
        >
          <h2 className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>
            직원에게 이 화면을 보여주세요
          </h2>
          <p style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            이 서비스는 직원을 자동으로 부르지 않습니다. 가까운 직원에게 이 화면을 보여주시면
            지금까지 고르신 내용을 바로 확인하실 수 있습니다.
          </p>

          {candidate && (
            <p
              className="font-bold border-b pb-4"
              style={{ borderColor: "var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))" }}
            >
              보고 계신 메뉴: {candidate.name} · {candidate.priceKrw.toLocaleString()}원
            </p>
          )}

          <dl className="flex flex-col gap-3" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="opacity-80 font-bold shrink-0">{label}</dt>
                <dd className="font-bold text-right">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
            결제는 이 화면에서 진행되지 않습니다.
          </p>
        </section>
      )}
    </div>
  );
}
