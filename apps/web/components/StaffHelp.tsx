"use client";

import { useState, useEffect, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import { ENVIRONMENTS } from "../lib/fixture";
import type { AnyAnswers, CandidateView, QuestionDef } from "../lib/types";

/**
 * The way out, available from every screen — and it calls the staff rather than
 * asking the user to go find one.
 *
 * It used to be a "show this screen to a nearby employee" panel, which quietly
 * assumed two things that are false for the people this service exists for: that
 * a staff member is findable, and that the user can walk over and interrupt one.
 * Someone who uses a wheelchair, cannot see where the counter is, or will not
 * approach a busy stranger was left with a screen full of text and no way to use
 * it (팀장 지시, 2026-08-16). So the direction is reversed: the user presses one
 * button, the call is queued with a ticket number, and the staff side is the one
 * that has to come.
 *
 * What is genuinely on the far end is a simulator, and the panel says so in one
 * line rather than pretending a real counter buzzed — the same posture as
 * `validationMode: SIMULATION_ONLY` everywhere else in this submission. The
 * ticket, the wait clock and the summary handed over are all real screen state.
 *
 * The rows are built from the question list, not from a table of field names,
 * so this works at all three kiosks and cannot drift from what was actually
 * asked. Every label shown here is the same string the user read on the form.
 */
interface StaffHelpProps {
  /** The questions this environment asked. Also the source of every label. */
  questions: QuestionDef[];
  answers: AnyAnswers;
  /**
   * Bumped by another screen that wants the staff called — today the
   * "모르겠어요" reconfirm gate. A counter rather than a boolean so pressing it
   * twice re-opens the panel; the value itself means nothing.
   */
  callRequest?: number;
  /**
   * 호출이 걸렸는지 부모에게 알린다. 다른 화면의 「직원 부르기」 버튼이 이미
   * 부른 뒤에도 「부르기」라고 적혀 있으면 안 되기 때문이다 — 호출 자체는 여기서
   * 관리하고, 밖으로는 걸렸는지 여부만 나간다.
   */
  onCallStateChange?: (active: boolean) => void;
  /**
   * Whether the form has been submitted at least once.
   *
   * An empty multi-select carries two meanings and only this tells them apart:
   * before submitting it is the starting value ("not asked yet"), after
   * submitting it is the user saying they have none. Telling staff "없다고
   * 답하셨습니다" about a question nobody answered is exactly the kind of
   * invented safety claim this service exists to avoid.
   */
  answersSubmitted: boolean;
  /** What the user is looking at right now, if anything. */
  candidate: CandidateView | null;
  environmentId: EnvironmentId;
  isHighContrast: boolean;
}

/** Unanswered says so rather than going blank — the staff need to know which. */
const NOT_ANSWERED = "아직 안 고르셨습니다";

/** 호출이 걸려 있는 동안의 상태. `null` 이면 아직 아무도 부르지 않았다. */
interface StaffCall {
  /** 화면과 직원이 같은 건을 가리키기 위한 번호. 개인정보가 아니다. */
  ticket: string;
  /** 경과 시간을 세기 위한 기준 시각. */
  startedAt: number;
}

export function StaffHelp({
  questions,
  answers,
  answersSubmitted,
  candidate,
  environmentId,
  isHighContrast,
  callRequest = 0,
  onCallStateChange,
}: StaffHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [call, setCall] = useState<StaffCall | null>(null);
  const [waited, setWaited] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const noun = ENVIRONMENTS.find((e) => e.id === environmentId)?.noun ?? "고르신 것";

  const rows: Array<[string, string]> = questions.map((q) => [
    q.short ?? q.label,
    describe(q, answers[q.id], answersSubmitted),
  ]);

  const closeDialog = () => {
    setIsOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  };

  /**
   * 호출을 건다.
   *
   * 번호는 시계에서 뽑는다 — 난수를 쓰면 서버가 그린 것과 브라우저가 그린 것이
   * 달라 화면이 한 번 튄다. 이미 걸어 둔 호출이 있으면 다시 걸지 않는다:
   * 같은 사람이 두 번 눌렀다고 대기열에 두 건이 서면 안 된다.
   */
  const placeCall = () => {
    setIsOpen(true);
    if (call) return;
    const now = Date.now();
    setCall({ ticket: `A-${String(Math.floor(now / 1000) % 90 + 10)}`, startedAt: now });
    setWaited(0);
  };

  const cancelCall = () => {
    setCall(null);
    setWaited(0);
  };

  // 다른 화면(「모르겠어요」 되묻기)에서 부른 경우. 첫 렌더의 0 은 무시한다.
  useEffect(() => {
    if (callRequest > 0) placeCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callRequest]);

  // 참조로 들고 있는 이유는 부모가 매 렌더 새 함수를 넘겨도 여기가 다시 돌지
  // 않게 하기 위해서다. 알릴 것은 호출이 걸렸다·풀렸다 두 순간뿐이다.
  const notifyRef = useRef(onCallStateChange);
  useEffect(() => { notifyRef.current = onCallStateChange; }, [onCallStateChange]);
  useEffect(() => { notifyRef.current?.(call !== null); }, [call]);

  // 기다린 시간. 패널을 닫아도 계속 센다 — 떠 있는 버튼이 그 값을 보여 준다.
  useEffect(() => {
    if (!call) return;
    const tick = () => setWaited(Math.floor((Date.now() - call.startedAt) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [call]);

  useEffect(() => {
    if (isOpen) {
      headingRef.current?.focus();
      
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") closeDialog();
        
        if (e.key === "Tab") {
          const focusableElements = document.getElementById("staff-help-panel")?.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusableElements && focusableElements.length > 0) {
            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            if (e.shiftKey && document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };
      
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  return (
    <>
      {/* 1. 어느 화면에서나 오른쪽 아래 같은 자리에 떠 있는 버튼.
          ⚠️ 튀는 애니메이션(`animate-bounce`)과 두 배 크기는 팀장 지시로 뺐다
          (2026-08-16). 계속 움직이는 것은 저시력·인지 지원이 필요한 분에게
          방해가 되고, 화면의 5분의 1을 덮고 있었다. 높이는 --tap-min + 8px 로
          잡아 44px 기준은 그대로 넘긴다. */}
      {/* 호출이 걸려 있으면 버튼이 그 사실과 기다린 시간을 들고 있는다. 패널을
          닫고 다음 화면으로 가도 「내가 불렀나?」를 다시 확인할 곳이 필요하다. */}
      {!isOpen && (
        <div className="fixed bottom-12 right-6 sm:right-8 md:right-12 z-40 w-max pointer-events-auto">
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
            aria-controls="staff-help-panel"
            className="shadow-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95 flex items-center justify-center px-6 py-3"
            style={{
              minHeight: "calc(var(--tap-min) + 8px)",
              borderRadius: "9999px",
              backgroundColor: isHighContrast ? "var(--color-bg)" : "var(--color-fg)",
              color: isHighContrast ? "var(--color-fg)" : "var(--color-bg)",
              border: isHighContrast ? "4px solid var(--color-accent)" : "none",
            }}
          >
            <span
              className="font-extrabold text-center leading-tight whitespace-nowrap"
              style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}
            >
              {call ? `🔔 직원 오는 중 · ${clock(waited)}` : "🔔 직원 부르기"}
            </span>
          </button>
        </div>
      )}

      {/* 🚀 2. 모달창 오버레이 및 중앙 팝업 */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 sm:p-8">
          <section
            id="staff-help-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-help-title"
            /* 스크롤은 안쪽 상자만 한다. 버튼 줄은 아래에 고정이다 — 닭강정집은
               질문이 일곱이라 목록만으로 패널이 넘쳐, 정작 눌러야 하는 「직원
               부르기」가 스크롤 아래에 숨어 있었다(실측). 도움을 청하러 연 화면에서
               도움 버튼이 안 보이면 안 된다. */
            className={`relative w-full max-w-2xl max-h-[90vh] overflow-hidden border-4 rounded-3xl flex flex-col shadow-2xl ${
              isHighContrast ? "border-[var(--color-accent)] bg-black text-white" : "border-orange-500 bg-orange-50 text-gray-900"
            }`}
          >
            <div className="overflow-y-auto p-6 md:p-8 flex flex-col gap-6">
            <h2 id="staff-help-title" ref={headingRef} tabIndex={-1} className="font-extrabold focus-visible:outline-none text-center break-keep" style={{ fontSize: "calc(1.8rem * var(--font-scale))" }}>
              {call ? "직원을 불렀습니다" : "직원을 부를까요?"}
            </h2>

            {call ? (
              /* 호출이 걸린 뒤. 번호와 기다린 시간을 크게 둔다 — 「눌리긴 한 건가」를
                 다시 누르게 만드는 것이 대기 화면의 가장 흔한 실패다. */
              <div
                role="status"
                aria-live="polite"
                className={`flex flex-col gap-2 items-center text-center border-2 rounded-2xl py-5 px-4 break-keep ${isHighContrast ? "border-[var(--color-accent)] bg-transparent" : "border-black/10 bg-white/70"}`}
              >
                <span className="font-black" style={{ fontSize: "calc(2.4rem * var(--font-scale))", color: "var(--color-accent)" }}>
                  {call.ticket}
                </span>
                <span className="font-bold" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
                  호출 번호입니다 · 기다리신 시간 {clock(waited)}
                </span>
                <span className="font-bold opacity-90 leading-snug" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
                  직원이 아래 내용을 받았습니다. 자리에서 기다리셔도 됩니다.
                </span>
              </div>
            ) : (
              <p className="text-center font-bold opacity-90 break-keep leading-snug" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
                직원을 찾아가지 않으셔도 됩니다.<br />버튼을 누르시면 직원이 호출을 받고, 지금까지 고르신 내용을 함께 봅니다.
              </p>
            )}

            {candidate && (
              <div className={`font-bold border-y-2 py-4 text-center rounded-xl break-keep ${isHighContrast ? "border-white bg-transparent" : "border-black/10 bg-white/60"}`} style={{ fontSize: "calc(1.3rem * var(--font-scale))", color: "var(--color-accent)" }}>
                보고 계신 {noun}: <span className="text-[1.1em]">{candidate.name}</span>
                {/* Only the chicken shop prices anything; 0 means "no price", not free. */}
                {candidate.priceKrw > 0 && ` · ${candidate.priceKrw.toLocaleString()}원`}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="font-extrabold px-1" style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
                직원에게 전달{call ? "된" : "되는"} 내용
              </h3>
              <dl className={`flex flex-col gap-4 p-5 rounded-xl border-2 ${isHighContrast ? "border-white bg-transparent" : "border-black/10 bg-white/60"}`} style={{ fontSize: "calc(1.15rem * var(--font-scale))" }}>
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-6 border-b border-gray-300/50 pb-3 last:border-0 last:pb-0">
                    <dt className="opacity-80 font-bold shrink-0">{label}</dt>
                    <dd className="font-extrabold text-right break-keep">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* 결제 경계는 그대로 두고, 호출이 어디까지 가는지도 같은 자리에서
                밝힌다. 시뮬레이터 위에서 도는 서비스라고 제출본에도 그렇게 적어
                두었으니 화면에서만 다르게 말하지 않는다. */}
            <p className="opacity-80 font-bold text-center break-keep leading-snug" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
              결제는 이 화면에서 진행되지 않습니다.<br />
              지금은 시연 환경이라 호출이 실제 직원 단말까지 가지는 않습니다.
            </p>
            </div>

            <div className={`shrink-0 px-6 md:px-8 py-4 flex flex-col sm:flex-row gap-3 border-t-2 ${
              isHighContrast ? "border-[var(--color-accent)]" : "border-black/10"
            }`}>
              {call ? (
                <button
                  type="button"
                  onClick={cancelCall}
                  className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
                  style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
                >
                  호출 취소
                </button>
              ) : (
                <button
                  type="button"
                  onClick={placeCall}
                  className="flex-1 shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
                  style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: isHighContrast ? "var(--color-bg)" : "var(--color-fg)", color: isHighContrast ? "var(--color-fg)" : "var(--color-bg)", border: isHighContrast ? "4px solid var(--color-accent)" : "none", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "900" }}
                >
                  🔔 직원 부르기
                </button>
              )}

              <button
                type="button"
                onClick={closeDialog}
                className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 transition-transform active:scale-95"
                style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: call ? (isHighContrast ? "var(--color-bg)" : "var(--color-fg)") : "transparent", color: call ? (isHighContrast ? "var(--color-fg)" : "var(--color-bg)") : "var(--color-fg)", border: call ? (isHighContrast ? "4px solid var(--color-accent)" : "none") : "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: call ? "900" : "bold" }}
              >
                화면 닫기
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/** 기다린 시간을 분:초로. 초만 세면 「183」 이 얼마인지 읽는 사람이 계산해야 한다. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** One answer, in the same words the user saw when they gave it. */
function describe(q: QuestionDef, value: unknown, submitted: boolean): string {
  const labelOf = (id: string) => q.options.find((o) => o.value === id)?.label ?? id;
  if (q.kind === "number") {
    return typeof value === "number" ? `${value.toLocaleString()}${q.unit ?? ""}` : "정하지 않으셨습니다";
  }
  if (q.kind === "multi") {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    // A question that offered "모르겠어요" is one where not knowing is itself
    // dangerous, so it gets said out loud rather than shown as a blank row.
    if (ids.includes("UNKNOWN")) return "모르겠다고 답하셨습니다 — 꼭 확인해 주세요";
    if (ids.length === 0) return submitted ? "없다고 답하셨습니다" : NOT_ANSWERED;
    return ids.map(labelOf).join(", ");
  }
  const id = typeof value === "string" ? value : "";
  // 「모르겠어요」와 「손도 안 댐」을 한 줄로 합치지 않는다. 호출을 받고 오는
  // 직원에게 필요한 정보가 바로 이 차이다 — 앞은 도와드릴 항목이고 뒤는 그냥
  // 아직 안 지나온 항목이다. 여러 개 고르는 질문은 이미 이렇게 하고 있었다.
  if (id === "UNKNOWN") return "모르겠다고 답하셨습니다 — 꼭 확인해 주세요";
  if (id === "") return NOT_ANSWERED;
  return labelOf(id);
}
