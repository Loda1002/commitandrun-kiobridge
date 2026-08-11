"use client";

import type { Answers, CandidateView } from "../lib/types";

interface ConfirmScreenProps {
  candidate: CandidateView;
  answers: Answers;
  isHighContrast: boolean;
  onApprove: () => void;
  onBackToContext: () => void;
}

export function ConfirmScreen({
  candidate,
  answers,
  isHighContrast,
  onApprove,
  onBackToContext,
}: ConfirmScreenProps) {
  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        주문 최종 확인
      </h1>

      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-6 ${
        isHighContrast ? "border-gray-400" : "border-gray-300"
      }`}>
        <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>메뉴</span>
          <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>{candidate.name}</span>
        </div>

        <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>가격</span>
          <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))", color: "var(--color-accent)" }}>
            {candidate.priceKrw.toLocaleString()}원
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>선택 옵션</span>
          <div className="flex flex-wrap gap-2">
            <span className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              {answers.serviceType === "TAKE_OUT" ? "포장" : answers.serviceType === "DINE_IN" ? "매장" : "수령방법 미지정"}
            </span>
            <span className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              {answers.spicyLevel === "HOT" ? "매운맛" : answers.spicyLevel === "MEDIUM" ? "보통맛" : answers.spicyLevel === "MILD" ? "순한맛" : "맵기 미지정"}
            </span>
            <span className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              {answers.boneType === "BONELESS" ? "순살" : answers.boneType === "BONE" ? "뼈" : "뼈/순살 미지정"}
            </span>
            <span className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              {answers.quantity === "Q1" ? "1개" : answers.quantity === "Q2" ? "2개" : "3개"}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl text-center font-extrabold bg-red-500/10 border-2 border-red-500" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          ⚠️ 장바구니 담기까지만 진행되며, 결제는 하지 않습니다.
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
        <button
          type="button"
          onClick={onBackToContext}
          className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "transparent",
            color: "var(--color-fg)",
            border: "2px solid var(--color-fg)",
            fontSize: "calc(1.2rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          다시 고를게요 (상황 입력으로)
        </button>

        <button
          type="button"
          onClick={onApprove}
          className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: "calc(1.2rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          이대로 진행할게요
        </button>
      </div>
    </main>
  );
}