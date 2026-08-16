"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { environmentCopy, fixtureFor } from "../lib/fixture";
import type { CandidateView, OptionSelection } from "../lib/types";

interface ConfirmScreenProps {
  candidate: CandidateView;
  selections: OptionSelection[];
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onApprove: () => void;
  onBackToContext: () => void;
}

export function ConfirmScreen({ candidate, selections, environmentId, isHighContrast, onApprove, onBackToContext }: ConfirmScreenProps) {
  // [접근성 2-1] h1 포커스 이동
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const changed = selections.filter((s) => s.userAnswer !== null && s.userAnswer !== s.optionId);
  const copy = environmentCopy(environmentId);

  /*
   * 두 개 이상 담는 분에게 「가격 5,500원」은 개당인지 합계인지 알 수 없다.
   *
   * 합계를 지어내지는 않는다 — 환경 데이터의 가격 규칙(`CHICKEN_PRICE_LIMIT`)은
   * 후보의 **개당** `price` 하나만 예산과 견주고, 수량을 곱한 값을 말하는 규칙은
   * 어디에도 없다. 없는 계산을 화면이 만들어 붙이면 그 숫자는 저희가 지어낸
   * 것이 되고, 실제 매장 합계와 다를 때 책임질 근거가 없다.
   *
   * 그래서 곱하지 않고 **무슨 값인지만 밝힌다.** 한 개면 문구도 그대로다.
   */
  const orderedCount = (() => {
    const picked = selections.find((s) => s.groupId === "QUANTITY");
    if (!picked) return 1;
    const group = fixtureFor(environmentId).optionGroups.find((g) => g.groupId === "QUANTITY");
    const value = group?.options.find((o) => o.id === picked.optionId)?.value;
    return typeof value === "number" ? value : 1;
  })();

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {copy.confirmTitle}
      </h1>

      <section className={`border-2 rounded-2xl p-6 md:p-8 flex flex-col gap-6 ${isHighContrast ? "border-gray-400" : "border-gray-300 shadow-lg bg-white"}`}>
        <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>{copy.noun}</span>
          <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>{candidate.name}</span>
        </div>

        {/* [결함 방어] 병원/관공서는 가격(0원) 숨김. 치킨집 가격 표시 */}
        {candidate.priceKrw > 0 && (
          <div className="flex justify-between items-center border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
            <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
              {orderedCount > 1 ? "개당 가격" : "가격"}
            </span>
            <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))", color: "var(--color-accent)" }}>
              {candidate.priceKrw.toLocaleString()}원
            </span>
          </div>
        )}

        {/* [결함 방어] 엔진이 확정한 selections 기반으로 옵션 표시 */}
        <div className="flex flex-col gap-3 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>선택 옵션</span>
          <div className="flex flex-wrap gap-2">
            {selections.map((selection) => (
              <span key={selection.groupId} className={`px-3 py-1 rounded-lg font-bold ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
                {selection.label} {selection.optionLabel}
              </span>
            ))}
          </div>
        </div>

        {changed.length > 0 && (
          <div className={`p-4 rounded-xl border-2 flex flex-col gap-2 ${isHighContrast ? "border-yellow-300" : "border-orange-500 bg-orange-50"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {/* 「형태: 뼈 → 순살 — 이 메뉴에는 고르신 선택지가 없습니다」였다.
                화살표와 대시로 쓴 말이라 읽는 데 한 번 걸리고, 왜 그런지가 없어
                「그럼 왜 이걸 추천했지」로 읽힌다(팀장 지시, 2026-08-16).
                추천 화면에도 같은 안내를 미리 띄우므로 문장을 그쪽과 맞춘다. */}
            <p className="font-extrabold">고르신 것과 달라지는 부분이 있습니다</p>
            <ul className="flex flex-col gap-1 list-disc pl-5">
              {changed.map((selection) => (
                <li key={selection.groupId}>
                  {selection.label}: 「{selection.userAnswerLabel}」 대신 <strong>「{selection.optionLabel}」</strong>로 나갑니다. 이 {copy.noun}에는 「{selection.userAnswerLabel}」이 없습니다.
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* [결함 방어] 환경별 경계 안내 문구 동적 매핑 */}
        <div className="p-4 rounded-xl text-center font-extrabold bg-red-500/10 border-2 border-red-500" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          ⚠️ {copy.boundaryNotice}
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
        <button type="button" onClick={onBackToContext} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))", fontWeight: "bold" }}>
          다시 고를게요
        </button>
        {/* [결함 방어] "결제하기" 등 위험문구 배제. "이대로 진행할게요" 통일 */}
        <button type="button" onClick={onApprove} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-accent)", color: "var(--color-bg)", fontSize: "calc(1.2rem * var(--font-scale))", fontWeight: "bold" }}>
          이대로 진행할게요
        </button>
      </div>
    </main>
  );
}