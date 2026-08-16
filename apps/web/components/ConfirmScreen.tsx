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
   * 두 개 이상 담을 때 개당 가격 · 수량 · 합계를 영수증처럼 보여 주기 위한 개수.
   *
   * ⚠️ **합계는 환경 데이터가 정한 값이 아니다.** 가격 규칙
   * (`CHICKEN_PRICE_LIMIT`)은 후보의 **개당** `price` 하나만 예산과 견주고,
   * 수량을 곱하라고 말하는 규칙은 열한 개 중 어디에도 없다. 그래서 이 곱셈은
   * **화면이 보여 주는 안내이지 엔진의 판정이 아니다.** 예산 초과 판단도 여전히
   * 개당 가격으로만 이뤄진다 — 합계가 예산을 넘어도 후보가 빠지지 않는다.
   * 팀장 판단으로 넣었다(2026-08-16). 엔진·제출본과는 무관하다.
   *
   * 곱해도 되는 근거는 데이터 쪽에 있다. 후보가 가진 금액 필드는 `price` 하나
   * 뿐이고 할인·포장비·세금 같은 항목이 없다. 그러니 「개당 × 수량」이 이 데이터로
   * 낼 수 있는 전부이고, 화면에도 무엇을 곱한 값인지 그대로 적는다.
   *
   * 한 개면 곱할 것이 없으므로 예전처럼 「가격」 한 줄이다.
   */
  const orderedCount = (() => {
    const picked = selections.find((s) => s.groupId === "QUANTITY");
    if (!picked) return 1;
    const group = fixtureFor(environmentId).optionGroups.find((g) => g.groupId === "QUANTITY");
    const value = group?.options.find((o) => o.id === picked.optionId)?.value;
    return typeof value === "number" ? value : 1;
  })();

  /*
   * ⚠️ 아래 여백(`gap-6` · `p-5 md:p-6` · `gap-3` · `pb-3`)은 1280x**720** 에
   * 「이대로 진행할게요」를 넣기 위해 줄여 둔 것이다. 늘리기 전에 그 창 높이에서
   * 버튼이 보이는지 재십시오 — 최종 승인 버튼이 화면 밖에 있으면 사용자는 승인할
   * 방법이 없다고 읽는다. 글자 크기와 44px 터치 영역은 건드리지 않았다.
   *
   * ⚠️ **로컬에서 잰 값보다 배포본이 12px 크다.** 넘치기 시작하면 세로 스크롤바가
   * 생기고, 폭이 1280 에서 1265 로 줄면서 다시 조금 더 높아지는 되먹임이 있다.
   * 로컬에서 딱 맞는 정도로는 배포본에서 모자란다 — 여유를 두고 재십시오.
   */
  return (
    <main className="flex flex-col gap-6 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {copy.confirmTitle}
      </h1>

      <section className={`border-2 rounded-2xl p-5 md:p-6 flex flex-col gap-3 ${isHighContrast ? "border-gray-400" : "border-gray-300 shadow-lg bg-white"}`}>
        <div className="flex justify-between items-center border-b pb-3" style={{ borderColor: "var(--color-fg)" }}>
          <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>{copy.noun}</span>
          <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))" }}>{candidate.name}</span>
        </div>

        {/* [결함 방어] 병원/관공서는 가격(0원) 숨김. 치킨집 가격 표시 */}
        {candidate.priceKrw > 0 && (
          <div className="flex flex-col gap-2 border-b pb-3" style={{ borderColor: "var(--color-fg)" }}>
            <div className="flex justify-between items-center gap-3">
              <span className="opacity-80 font-bold break-keep" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
                {orderedCount > 1 ? "개당 가격 × 수량" : "가격"}
              </span>
              <span
                className="font-extrabold whitespace-nowrap"
                style={{
                  fontSize: `calc(${orderedCount > 1 ? "1.3rem" : "1.6rem"} * var(--font-scale))`,
                  color: orderedCount > 1 ? "var(--color-fg)" : "var(--color-accent)",
                }}
              >
                {candidate.priceKrw.toLocaleString()}원{orderedCount > 1 ? ` × ${orderedCount}개` : ""}
              </span>
            </div>

            {orderedCount > 1 && (
              /* 영수증처럼 합계 앞에 줄을 하나 긋는다. 점선인 것은 위를 더해
                 아래가 나온다는 뜻이지 다른 이야기가 시작된다는 뜻이 아니라서다.
                 ⚠️ 곱셈은 **윗줄 오른쪽에 그대로 적는다.** 「수량」을 따로 한 줄
                 더 놓아 봤더니 이 화면이 1280x720 에서 878px 이 되어 「이대로
                 진행할게요」가 150px 아래로 밀려났다(실측). 최종 승인 버튼이
                 화면 밖에 있는 것은 어떤 설명보다 나쁘다. */
              <div
                className={`flex justify-between items-center border-t-2 border-dashed pt-3 ${isHighContrast ? "border-gray-500" : "border-gray-300"}`}
              >
                <span className="font-extrabold" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>합계</span>
                <span className="font-extrabold" style={{ fontSize: "calc(1.6rem * var(--font-scale))", color: "var(--color-accent)" }}>
                  {(candidate.priceKrw * orderedCount).toLocaleString()}원
                </span>
              </div>
            )}
          </div>
        )}

        {/* [결함 방어] 엔진이 확정한 selections 기반으로 옵션 표시 */}
        <div className="flex flex-col gap-3 border-b pb-3" style={{ borderColor: "var(--color-fg)" }}>
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
        <div className="p-3 rounded-xl text-center font-extrabold bg-red-500/10 border-2 border-red-500" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
          ⚠️ {copy.boundaryNotice}
        </div>
      </section>

      <div className="flex flex-col sm:flex-row gap-4 w-full mt-2">
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