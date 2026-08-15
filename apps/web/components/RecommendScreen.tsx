"use client";

import { useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { environmentCopy } from "../lib/fixture";
import type { CandidateView, RecommendationView } from "../lib/types";
import { subjectParticle } from "@commitandrun/engine/domain";

interface RecommendScreenProps {
  recView: RecommendationView;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
  onChoose: (candidate: CandidateView) => void;
  onBackToContext: () => void;
}

// [디자인] 환경별 점수 막대그래프 색상 (주황, 파랑, 초록). 600 계열이라
// 흰 바탕에서 대비를 넘긴다. 고대비 모드에서는 --color-accent 를 쓴다.
const PROGRESS_COLORS: Record<string, string> = {
  "chicken-store": "#F98C42",
  "hospital": "#51A3FA",
  "public-office": "#A2E037",
};

export function RecommendScreen({ recView, environmentId, isHighContrast, onChoose, onBackToContext }: RecommendScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const copy = environmentCopy(environmentId);
  const barColor = isHighContrast ? "var(--color-accent)" : PROGRESS_COLORS[environmentId] || "var(--color-accent)";

  // [결함 방어] 세션 10/12 재확인 게이트 완벽 보존
  if (recView.reconfirmRequests.length > 0) {
    return (
      <main className="flex flex-col gap-8 w-full">
        <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
          한 가지만 더 여쭐게요
        </h1>
        {recView.reconfirmRequests.map((request, idx) => (
          <section key={idx} className={`border-4 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isHighContrast ? "border-yellow-300 bg-transparent" : "border-orange-500 bg-orange-50 shadow-sm"}`}>
            <p className="font-extrabold" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>{request.question}</p>
            <p className="opacity-90 font-medium" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>{request.because}</p>
          </section>
        ))}
        <button type="button" onClick={onBackToContext} className="w-full mt-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-accent)", color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}>
          다시 답하러 가기
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        맞춤형 추천 결과
      </h1>

      {recView.requiresReconfirmation && (
        <p className={`rounded-xl p-4 font-bold ${isHighContrast ? "border-2 border-yellow-300" : "bg-orange-50 border-2 border-orange-500"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          ⚠️ 조건에 딱 맞는 {copy.noun}{subjectParticle(copy.noun)} 없어 확신이 높지 않습니다. 아래 내용을 한 번 더 확인해 주세요.
        </p>
      )}

      {recView.recommended ? (
        <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "" : "shadow-md"}`} style={{ borderColor: isHighContrast ? "var(--color-accent)" : barColor }}>
          <div className="flex justify-between items-end mb-6 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
            <h2 className="font-extrabold" style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>{recView.recommended.name}</h2>
            <span className="font-extrabold" style={{ fontSize: "calc(1.8rem * var(--font-scale))", color: barColor }}>{Math.round(recView.recommended.total * 100)}점</span>
          </div>

          {recView.recommended.blockedReason && (
            <p role="alert" className={`mb-6 rounded-xl p-4 font-bold border-2 ${isHighContrast ? "border-yellow-300 text-yellow-300" : "border-red-400 bg-red-50 text-red-700"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              ⚠️ {recView.recommended.blockedReason}
            </p>
          )}

          <div className="flex flex-col gap-5 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
            {recView.recommended.contributions.map((c, idx) => {
              const maxWeight = Math.max(...recView.recommended!.contributions.map((x) => x.weight));
              const containerWidth = maxWeight === 0 ? "0%" : `${(c.weight / maxWeight) * 100}%`;
              const fillWidth = c.weight === 0 ? "0%" : `${(c.earned / c.weight) * 100}%`;

              return (
                <div key={idx} className="flex items-center gap-4">
                  <span className="w-32 sm:w-48 shrink-0 break-keep leading-snug">{c.label || "항목"}</span>
                  <div className="flex-1 flex items-center h-8">
                    <div className="h-full bg-gray-200 rounded-full overflow-hidden border border-gray-300" style={{ width: containerWidth }}>
                      {/* [디자인] motion-reduce 존중 */}
                      <div className="h-full transition-all duration-700 ease-out motion-reduce:transition-none" style={{ width: fillWidth, backgroundColor: barColor }} />
                    </div>
                  </div>
                  <span className="w-32 text-right shrink-0">{c.earned.toFixed(2)} / {c.weight.toFixed(2)}</span>
                </div>
              );
            })}
          </div>

          {recView.reasons && recView.reasons.length > 0 && (
            <div className={`mt-8 p-5 rounded-xl ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}>
              <h3 className="font-bold mb-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>💡 이렇게 골랐습니다</h3>
              <ul className="flex flex-col gap-2 list-disc pl-5" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                {recView.reasons.map((reason, idx) => <li key={idx} className="opacity-90">{reason.text}</li>)}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <div className={`p-8 text-center border-2 border-dashed rounded-2xl flex flex-col gap-3 ${isHighContrast ? "border-gray-400 bg-transparent text-[var(--color-fg)]" : "border-gray-400 bg-gray-50"}`}>
          <p className="font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>조건에 맞는 {copy.noun}{subjectParticle(copy.noun)} 없습니다. 직원의 도움을 받아주세요.</p>
          
          {(recView.relaxationSuggestions || []).length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {(recView.relaxationSuggestions || []).map((suggestion, idx) => (
                <p key={idx} className="font-bold text-[var(--color-accent)]" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
                  💡 {suggestion}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {recView.alternatives.length > 0 && (
        <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "border-gray-400" : "border-gray-300 bg-gray-50"}`}>
          <h3 className="font-bold mb-5" style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>🔁 다른 것도 보시겠어요?</h3>
          <ul className="flex flex-col gap-4">
            {recView.alternatives.map((alt) => (
              <li key={alt.candidateId} className={`flex flex-col border rounded-xl p-4 transition-colors ${isHighContrast ? "border-gray-600 bg-transparent" : "border-gray-200 bg-white hover:border-gray-400"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between w-full">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>{alt.name}</span>
                    <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                      {/* [결함 방어] 가격은 있을 때만 표시 (0원은 공짜 오해 방지) */}
                      {alt.priceKrw > 0 && `${alt.priceKrw.toLocaleString()}원 · `}{Math.round(alt.total * 100)}점
                    </span>
                  </div>
                  {/* [결함 방어] 진행할 수 없는 경로에는 버튼을 내지 않는다. 직원 도움
                      경로는 일부러 안 걸러지므로 답변과 맞지 않아도 여기 올라온다 —
                      누르면 계획이 거절해 빨간 배너만 뜨고 할 일이 없어진다. */}
                  {alt.blockedReason ? (
                    <p className={`sm:max-w-sm font-bold ${isHighContrast ? "text-yellow-300" : "text-red-700"}`} style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                      {alt.blockedReason}
                    </p>
                  ) : (
                    <button type="button" onClick={() => onChoose(alt)} className="focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform duration-200 motion-reduce:transition-none motion-reduce:transform-none active:scale-95 px-6" style={{ minHeight: "var(--tap-min)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.1rem * var(--font-scale))", fontWeight: "bold" }}>
                      이걸로 할게요
                    </button>
                  )}
                </div>
                {/* 1등 대신 이것을 고르면 무엇을 포기하는지. 점수만 보이면 관공서에서
                    100점짜리가 둘 뜰 때 왜 저것을 놔두고 이것을 골랐는지 알 수가 없다.
                    위 칸(blockedReason 또는 버튼)은 건드리지 않는다 — 진행할 수 없는
                    경로에 버튼을 내지 않는 판단이 거기 있다. */}
                {alt.alternativeExplanation && (
                  <p className="mt-4 pt-3 border-t font-medium" style={{ borderColor: "var(--color-fg)", fontSize: "calc(1.1rem * var(--font-scale))" }}>
                    {alt.alternativeExplanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "border-red-400 bg-transparent" : "bg-red-50 border-red-300"}`}>
        <h3 className={`font-bold mb-5 ${isHighContrast ? "text-red-400" : "text-red-700"}`} style={{ fontSize: "calc(1.4rem * var(--font-scale))" }}>🚫 제외된 후보 {recView.excluded.length}개</h3>
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
        <button type="button" onClick={onBackToContext} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.2rem * var(--font-scale))", fontWeight: "bold" }}>
          조건 다시 입력하기
        </button>
        <button type="button" onClick={() => recView.recommended && onChoose(recView.recommended)} disabled={!recView.recommended || recView.recommended.blockedReason !== null} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:hover:scale-100" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-accent)", color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}>
          선택하고 최종 확인하기
        </button>
      </div>
    </main>
  );
}