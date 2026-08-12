"use client";

import type { CandidateView, RecommendationView } from "../lib/types";

interface RecommendScreenProps {
  recView: RecommendationView;
  isHighContrast: boolean;
  /** Which candidate the user is taking forward — the top pick or an alternative. */
  onChoose: (candidate: CandidateView) => void;
  onBackToContext: () => void;
}

export function RecommendScreen({
  recView,
  isHighContrast,
  onChoose,
  onBackToContext,
}: RecommendScreenProps) {
  /**
   * An unanswered hard constraint outranks anything we could show. The engine
   * returns no recommendation at all in this state (select.ts: mayRecommend),
   * so the screen asks the question again instead of offering a way forward.
   * There is deliberately no "continue" button here.
   */
  if (recView.reconfirmRequests.length > 0) {
    return (
      <main className="flex flex-col gap-8 w-full">
        <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
          한 가지만 더 여쭐게요
        </h1>

        {recView.reconfirmRequests.map((request, idx) => (
          <section
            key={idx}
            className={`border-4 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${
              isHighContrast ? "border-yellow-300 bg-transparent" : "border-orange-500 bg-orange-50"
            }`}
          >
            <p className="font-extrabold" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>
              {request.question}
            </p>
            <p className="opacity-90" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              {request.because}
            </p>
          </section>
        ))}

        <button
          type="button"
          onClick={onBackToContext}
          className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: "calc(1.3rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          다시 답하러 가기
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 className="font-extrabold text-center" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        맞춤형 추천 결과
      </h1>

      {/* Nothing is blocking, but the top score is weak enough that the server
          would refuse it unconfirmed (LOW_CONFIDENCE_THRESHOLD). Say so. */}
      {recView.requiresReconfirmation && (
        <p
          className={`rounded-xl p-4 font-bold ${
            isHighContrast ? "border-2 border-yellow-300" : "bg-orange-50 border-2 border-orange-500"
          }`}
          style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}
        >
          ⚠️ 조건에 딱 맞는 메뉴가 없어 확신이 높지 않습니다. 아래 내용을 한 번 더 확인해 주세요.
        </p>
      )}

      {recView.recommended ? (
        <section className="border-2 rounded-2xl p-6 md:p-8" style={{ borderColor: "var(--color-accent)" }}>
          <div className="flex justify-between items-end mb-6 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
            <h2 className="font-bold" style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>
              {recView.recommended.name}
            </h2>
            <span className="font-bold" style={{ fontSize: "calc(1.8rem * var(--font-scale))", color: "var(--color-accent)" }}>
              {Math.round(recView.recommended.total * 100)}점
            </span>
          </div>

          <div className="flex flex-col gap-5 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {(() => {
              const contributions = recView.recommended!.contributions;
              const maxWeight = Math.max(...contributions.map((c) => c.weight));

              return contributions.map((c, idx) => {
                const containerWidth = maxWeight === 0 ? "0%" : `${(c.weight / maxWeight) * 100}%`;
                const fillWidth = c.weight === 0 ? "0%" : `${(c.earned / c.weight) * 100}%`;

                return (
                  <div key={idx} className="flex items-center gap-4">
                    <span className="w-28 shrink-0">{c.label || "항목"}</span>
                    <div className="flex-1 flex items-center h-8">
                      <div
                        className="h-full bg-gray-200 rounded-full overflow-hidden border border-gray-300"
                        style={{ width: containerWidth }}
                      >
                        <div
                          className="h-full transition-all duration-700 ease-out"
                          style={{ width: fillWidth, backgroundColor: "var(--color-accent)" }}
                        />
                      </div>
                    </div>
                    <span className="w-32 text-right shrink-0">
                      {c.earned.toFixed(2)} / {c.weight.toFixed(2)}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {recView.reasons && recView.reasons.length > 0 && (
            <div className={`mt-8 p-5 rounded-xl ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              <h3 className="font-bold mb-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                💡 AI 추천 이유
              </h3>
              <ul className="flex flex-col gap-2 list-disc pl-5" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                {recView.reasons.map((reason, idx) => (
                  <li key={idx} className="opacity-90">{reason.text}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <div className="p-8 text-center border-2 border-dashed border-gray-400 rounded-2xl">
          <p className="font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
            조건에 맞는 메뉴가 없습니다. 직원의 도움을 받아주세요.
          </p>
        </div>
      )}

      {/* The way back. The top pick is a suggestion, not a decision — a kiosk
          that offers one path is the problem we are fixing, so the runners-up
          are shown with their scores and can be taken instead. */}
      {recView.alternatives.length > 0 && (
        <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "border-gray-400" : "border-gray-300"}`}>
          <h3 className="font-bold mb-5" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>
            🔁 다른 것도 보시겠어요?
          </h3>
          <ul className="flex flex-col gap-4">
            {recView.alternatives.map((alt) => (
              <li
                key={alt.candidateId}
                className={`flex flex-col sm:flex-row sm:items-center gap-4 justify-between border rounded-xl p-4 ${
                  isHighContrast ? "border-gray-600" : "border-gray-200"
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-bold" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                    {alt.name}
                  </span>
                  <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                    {alt.priceKrw.toLocaleString()}원 · {Math.round(alt.total * 100)}점
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onChoose(alt)}
                  className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95 px-6"
                  style={{
                    minHeight: "var(--tap-min)",
                    borderRadius: "var(--radius)",
                    backgroundColor: "transparent",
                    color: "var(--color-fg)",
                    border: "2px solid var(--color-fg)",
                    fontSize: "calc(1.1rem * var(--font-scale))",
                    fontWeight: "bold",
                  }}
                >
                  이걸로 할게요
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "border-red-400 bg-transparent" : "bg-red-50 border-red-500"}`}>
        <h3
          className={`font-bold mb-5 ${isHighContrast ? "text-red-400" : "text-red-700"}`}
          style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}
        >
          🚫 제외된 후보 {recView.excluded.length}개
        </h3>
        <ul className="flex flex-col gap-4" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          {recView.excluded.map((item, idx) => (
            <li key={idx} className={`flex gap-4 items-center border-b pb-3 last:border-0 last:pb-0 ${isHighContrast ? "border-gray-700" : "border-red-200"}`}>
              <span className="font-bold min-w-[160px] opacity-70 line-through">{item.name}</span>
              <span className="flex-1 text-right">{item.explanation}</span>
            </li>
          ))}
        </ul>
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
          조건 다시 입력하기
        </button>

        <button
          type="button"
          onClick={() => recView.recommended && onChoose(recView.recommended)}
          disabled={!recView.recommended}
          className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
          style={{
            minHeight: "calc(var(--tap-min) + 8px)",
            borderRadius: "var(--radius)",
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg)",
            fontSize: "calc(1.3rem * var(--font-scale))",
            fontWeight: "bold",
          }}
        >
          선택하고 최종 확인하기
        </button>
      </div>
    </main>
  );
}