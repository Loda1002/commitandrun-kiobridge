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
  /**
   * 사용자가 「모르겠어요」를 눌러서 여기까지 온 필수 질문의 이름들.
   *
   * 아래 되묻기 문장은 **엔진이** 질문마다 만든다(각 도메인의 `reconfirm`) —
   * 세 환경 전부 빠짐없이 만들고 있어서 화면이 목록을 다시 그릴 필요가 없다.
   * 이 값은 그 위에 얹을 한 줄, 「왜 또 묻는가」에만 쓴다. 「모르겠어요」를 누른
   * 사람에게 필요한 것은 항목의 재나열이 아니라 그 이유다(팀장 지시,
   * 2026-08-16). 비어 있으면 그 줄이 뜨지 않는다.
   */
  unknownNotices?: string[];
  /** 되묻기 화면에서 바로 직원을 부를 수 있게 한다. 사람에게 가는 길은 늘 남긴다. */
  onCallStaff?: () => void;
  /** 이미 불렀는가. 불러 놓고도 「부르기」라고 적혀 있으면 두 번 누르게 된다. */
  staffCalled?: boolean;
}

// [디자인] 환경별 강조색 (주황, 파랑, 초록). 시작 화면 카드의 밝은 색과 색상은
// 같고 명도만 낮춘 값이라 흰 바탕에서 4.5:1 을 넘긴다.
// 2026-08-16 에 점수·막대를 주석 처리한 뒤로는 추천 카드 테두리와
// 「💡 이렇게 골랐습니다」 상자의 제목·세로선이 이 값을 쓴다.
// 고대비 모드에서는 --color-accent 를 쓴다.
const PROGRESS_COLORS: Record<string, string> = {
  "chicken-store": "#C35306",
  "hospital": "#0773E7",
  "public-office": "#5A8214",
};

export function RecommendScreen({ recView, environmentId, isHighContrast, onChoose, onBackToContext, unknownNotices = [], onCallStaff, staffCalled = false }: RecommendScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  const copy = environmentCopy(environmentId);
  const barColor = isHighContrast ? "var(--color-accent)" : PROGRESS_COLORS[environmentId] || "var(--color-accent)";

  // [결함 방어] 세션 10/12 재확인 게이트 완벽 보존
  // 「모르겠어요」로 답한 필수 질문도 같은 문으로 들어온다. 엔진이 만든 되묻기와
  // 성격이 같기 때문이다 — 답을 지어내지 않고 사람에게 되돌린다.
  if (recView.reconfirmRequests.length > 0 || unknownNotices.length > 0) {
    return (
      <main className="flex flex-col gap-8 w-full">
        <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
          한 가지만 더 여쭐게요
        </h1>
        {unknownNotices.length > 0 && (
          <p className="text-center font-bold break-keep leading-snug opacity-90" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
            {unknownNotices.join(" · ")} — 모르겠다고 하셔서 여기서 한 번 멈췄습니다.
            <br />
            저희가 짐작해서 정하면 원하지 않으신 쪽으로 진행됩니다. 직접 고르셔도 되고, 직원을 부르셔도 됩니다.
          </p>
        )}
        {recView.reconfirmRequests.map((request, idx) => (
          <section key={idx} className={`border-4 rounded-2xl p-6 md:p-8 flex flex-col gap-4 ${isHighContrast ? "border-yellow-300 bg-transparent" : "border-orange-500 bg-orange-50 shadow-sm"}`}>
            <p className="font-extrabold" style={{ fontSize: "calc(1.5rem * var(--font-scale))" }}>{request.question}</p>
            <p className="opacity-90 font-medium" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>{request.because}</p>
          </section>
        ))}
        <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
          <button type="button" onClick={onBackToContext} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "var(--color-accent)", color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}>
            다시 답하러 가기
          </button>
          {onCallStaff && (
            <button type="button" onClick={onCallStaff} className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none" style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}>
              {staffCalled ? "🔔 직원 오는 중 (내용 보기)" : "🔔 직원 부르기"}
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-8 w-full">
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        맞춤형 추천 결과
      </h1>

      {recView.recommended ? (
        <section className={`border-2 rounded-2xl p-6 md:p-8 ${isHighContrast ? "" : "shadow-md"}`} style={{ borderColor: isHighContrast ? "var(--color-accent)" : barColor }}>
          <div className="flex justify-between items-end mb-6 border-b pb-4" style={{ borderColor: "var(--color-fg)" }}>
            <h2 className="font-extrabold" style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>{recView.recommended.name}</h2>
            {/* [보류 2026-08-16] 「NN점」 숫자. 창업팀이 요청한 것은 「왜 추천됐는지」이고
                점수는 요청한 적이 없어 뺐다. 지우지 않는 이유는 파이널데이(08.20)에
                되살릴 수 있게 하기 위해서다 — 주석만 풀면 된다.
            <span className="font-extrabold" style={{ fontSize: "calc(1.8rem * var(--font-scale))", color: barColor }}>{Math.round(recView.recommended.total * 100)}점</span>
            */}
          </div>

          {recView.recommended.blockedReason && (
            <p role="alert" className={`mb-6 rounded-xl p-4 font-bold border-2 ${isHighContrast ? "border-yellow-300 text-yellow-300" : "border-red-400 bg-red-50 text-red-700"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              ⚠️ {recView.recommended.blockedReason}
            </p>
          )}

          {/* [보류 2026-08-16] 기준별 기여도 막대그래프 전체.
              요구사항 정리서의 P0 어디에도 없고 창업팀 Q&A 에 「점수」「막대」라는
              말이 한 번도 나오지 않는다. 「왜 추천됐는지」는 아래 이유 문장이 한다.
              지우지 않는 이유는 파이널데이(08.20)에 되살릴 수 있게 하기 위해서다.
              ⚠️ 되살릴 때: 안쪽의 `[디자인] motion-reduce 존중` 은 원래 JSX 주석이었다.
              주석 안에 주석을 넣을 수 없어 평문으로 풀어 두었으니 다시 감쌀 것.

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
                      [디자인] motion-reduce 존중
                      <div className="h-full transition-all duration-700 ease-out motion-reduce:transition-none" style={{ width: fillWidth, backgroundColor: barColor }} />
                    </div>
                  </div>
                  <span className="w-32 text-right shrink-0">{c.earned.toFixed(2)} / {c.weight.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          */}

          {/* 「왜 이걸 골랐는지」를 담당하는 유일한 자리다. 막대를 뺀 뒤로는 더욱 그렇다.
              강조색 제목과 왼쪽 굵은 세로선으로 이 상자를 눈에 띄게 한다(팀장 지시
              2026-08-16). 이유 줄 사이에는 구분선을 둬서 문장이 몇 개인지 세어진다.
              제목은 1.3rem 굵은 글씨(=20.8px)라 큰 글씨 기준이 적용돼 강조색으로도
              3:1 을 넘긴다. 본문 문장은 강조색을 쓰지 않는다 — 회색 바탕에서
              떨어진다. */}
          {recView.reasons && recView.reasons.length > 0 && (
            <div
              className={`mt-8 p-5 rounded-xl border-l-8 ${isHighContrast ? "border border-gray-400" : "bg-gray-100"}`}
              style={{ borderLeftColor: isHighContrast ? "var(--color-accent)" : barColor }}
            >
              <h3 className="font-bold mb-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))", color: isHighContrast ? "var(--color-accent)" : barColor }}>💡 이렇게 골랐습니다</h3>
              <ul className="flex flex-col list-disc pl-5" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                {recView.reasons.map((reason, idx) => (
                  <li
                    key={idx}
                    className={`opacity-90 py-2 border-b last:border-0 last:pb-0 ${isHighContrast ? "border-gray-600" : "border-gray-300"}`}
                  >
                    {reason.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <div className={`p-8 text-center border-2 border-dashed rounded-2xl flex flex-col gap-3 ${isHighContrast ? "border-gray-400 bg-transparent text-[var(--color-fg)]" : "border-gray-400 bg-gray-50"}`}>
          <p className="font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>조건에 맞는 {copy.noun}{subjectParticle(copy.noun)} 없습니다. 직원의 도움을 받아주세요.</p>
          {/* 조건을 얼마나 풀면 몇 개가 열리는지. 위 문장을 **대신하지 않는다** — 직원에게
              가는 길은 언제나 남아 있어야 하고, 이 줄들은 그 옆에 붙는 제안이다.
              문장은 엔진(relax.ts)이 쓴다. 숫자를 화면에서 다시 세면 6,000원에 5개라고
              약속하고 4개를 내주게 된다.

              색으로 구분하지 않는 이유: 강조색을 쓰면 이 상자 바탕에서 2.93:1 로
              떨어진다(실측). 저시력 사용자가 주 사용자라 본문색을 그대로 쓰고, 구분은
              구분선과 💡 가 한다 — 색을 못 보아도 읽히는 쪽이다. */}
          {recView.relaxationSuggestions.length > 0 && (
            <div className="mt-1 pt-3 border-t border-gray-400 flex flex-col gap-2">
              {recView.relaxationSuggestions.map((suggestion, idx) => (
                <p key={idx} className="font-bold" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
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
                    {/* [결함 방어] 가격은 있을 때만 표시 (0원은 공짜 오해 방지).
                        점수를 뺀 뒤로는 줄 전체가 가격뿐이라, 가격이 없는 병원·관공서에서는
                        빈 줄이 남지 않게 줄째로 그리지 않는다.
                        [보류 2026-08-16] 「NN점」 은 추천 카드와 같은 이유로 뺐다. 되살릴 때는
                        가격 뒤의 ` · ` 구분자와 이 조건부 렌더링도 함께 되돌릴 것 —
                        원래는 `{alt.priceKrw > 0 && '…원 · '}{Math.round(alt.total * 100)}점` 이었다. */}
                    {alt.priceKrw > 0 && (
                      <span className="opacity-80 font-bold" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                        {alt.priceKrw.toLocaleString()}원
                      </span>
                    )}
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