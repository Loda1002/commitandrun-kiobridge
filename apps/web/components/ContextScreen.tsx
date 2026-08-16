"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { EnvironmentId } from "@commitandrun/engine";
import type { AnyAnswers, QuestionDef } from "../lib/types";
import { findMissing, findUnknownRequired } from "../lib/api";
import { envColor, envTint } from "../lib/theme";

interface ContextScreenProps {
  questions: QuestionDef[];
  currentAnswers: AnyAnswers;
  onChange?: (answers: AnyAnswers) => void;
  onSubmit: (answers: AnyAnswers) => void;
  isHighContrast: boolean;
  title?: string;
  environmentId: EnvironmentId;
  onReset?: () => void;
  isRestored?: boolean;
  restoredSavedAt?: string | null;
  /**
   * 이 화면을 한 번이라도 제출하고 돌아온 것인가.
   *
   * 여러 개 고르는 질문에서 빈 배열은 뜻이 둘이다 — 제출 전에는 「아직 안 고름」,
   * 제출한 뒤에는 사용자가 고른 「없어요」다. 이것 없이는 둘을 가를 수 없어서,
   * 알레르기에 「없어요」를 고르고 되묻기까지 갔다가 돌아오면 그 선택이 풀려
   * 있었다. 더 나쁜 것은 그다음이다: 풀린 채로 다시 제출하면 아래 `handleSubmit`
   * 이 손대지 않은 질문으로 보고 `["UNKNOWN"]` 을 채워, **없다고 답한 사람이
   * 모르겠다고 답한 것으로 바뀌었다**(2026-08-16 배포본에서 재현).
   */
  answersSubmitted?: boolean;
}

/**
 * 질문 상자와 고른 선택지의 테두리는 `lib/theme.ts` 의 환경색 하나를 쓴다.
 *
 * 전에는 Tailwind 의 orange-300(#FFB86A) · blue-300 · emerald-300 이었다.
 * 카드와 강조색을 한 색으로 합친 뒤에도 이 테두리만 밝은 채로 남아, 두 번째
 * 화면에서 혼자 다른 색으로 보였다(팀장 지시, 2026-08-16).
 */

/**
 * 질문을 여러 장으로 나눈다 — 한 화면에 두 개씩, 예외 없이.
 *
 * 스크롤을 없애는 것이 목적이다(팀장 지시 2026-08-16). 질문 7개를 한 화면에 세우면
 * 1280x800 에서 세로로 두 배 넘게 넘쳐, 아래쪽 질문이 있는 줄도 모르고 지나가게
 * 된다. 손 떨림이 있는 분에게 긴 스크롤은 그 자체가 장벽이다.
 *
 * 닭강정집 7개는 2·2·2·1, 병원 5개는 2·2·1, 관공서 4개는 2·2 다.
 *
 * ⚠️ 세션 32 는 「마지막에 혼자 남은 질문이 숫자 칸이면 앞 장에 붙인다」는 예외를
 * 두어 닭강정집을 2·2·3 으로 만들었다. **되돌렸다** — 예산이 붙은 3장이 넘쳐서
 * 정작 그 예산 칸이 안 보였다. 2026-08-16 실측, 1280x**720**:
 *
 *   3장(컵·개수·예산)  전체 넘침 65px · 「추천 결과 보기」가 713~765px = 화면 밖
 *
 * 세션 32 가 「넘침 0px」로 잰 것은 1280x800 이었다. 팀장님 브라우저를 포함해
 * 흔한 노트북 창 높이는 720 이고, 거기서는 예산 칸이 화면 맨 아래 45px 에 걸려
 * 눈에 띄지 않았다(팀장 지시 2026-08-16: 「금액 입력이 아직도 안 보인다」).
 *
 * 혼자 남은 마지막 장을 지나치는 문제는 붙이는 대신 **말로** 푼다 — 그 앞 장의
 * 버튼이 「마지막 질문 →」이라고 예고하고, 제목이 「질문 4장째 (모두 4장)」이라고
 * 센다. 병원의 마지막 장(보호자 동반)도 같은 이유로 같은 방식이다.
 */
function paginate(questions: QuestionDef[]): QuestionDef[][] {
  const pages: QuestionDef[][] = [];
  for (let i = 0; i < questions.length; i += 2) pages.push(questions.slice(i, i + 2));
  return pages;
}

export function ContextScreen({
  questions,
  currentAnswers,
  onChange,
  onSubmit,
  isHighContrast,
  title = "상황 입력",
  environmentId,
  onReset,
  isRestored,
  restoredSavedAt,
  answersSubmitted = false,
}: ContextScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRefs = useRef<Record<string, HTMLElement | null>>({});

  const [answers, setAnswers] = useState<AnyAnswers>(currentAnswers);
  const [touched, setTouched] = useState<Set<string>>(() => initialTouched(currentAnswers, answersSubmitted));
  const [showErrors, setShowErrors] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const themeColor = envColor(environmentId);
  const themeTint = envTint(environmentId);

  /**
   * 「다음 질문」·「추천 결과 보기」의 채운 바탕.
   *
   * 고대비에서는 노란색이다(팀장 지시, 2026-08-16). 전에는 보통 화면과 같은
   * `--color-fg` 를 써서 고대비일 때 **순백으로 21,133px² 가 켜졌다**(1280px
   * 실측). 같은 성격의 「이걸로 할게요」·「이대로 진행할게요」는 이미 강조색을
   * 쓰고 있어서, 앞으로 가는 버튼이 화면마다 흰색과 노란색으로 갈리기도 했다.
   * 글자색은 양쪽 다 `--color-bg` 로 맞는다 — 고대비면 검정(15.9:1),
   * 보통 화면이면 흰색이다. 보통 화면의 생김새는 바뀌지 않는다.
   */
  const primaryFill = isHighContrast ? "var(--color-accent)" : "var(--color-fg)";

  const pages = useMemo(() => paginate(questions), [questions]);
  const pageQuestions = pages[pageIndex] ?? [];
  const isLastPage = pageIndex >= pages.length - 1;

  /**
   * question id -> the engine's sentence, asked again on every change.
   *
   * ⚠️ Do not go back to holding a list and deleting entries as fields are
   * edited. Two of the engine's answers are about the answer set rather than
   * one field: 초진 · 예약 있음 · 내과 flags all three, and changing any one of
   * them clears all three at once. A held list only forgot the field that was
   * touched, so the button stayed disabled after the user had already fixed the
   * problem, with no field left to edit that would unlock it — a dead end with
   * no error on screen, which is worse than the one the gate removes.
   */
  const missing = useMemo(
    () =>
      showErrors
        ? Object.fromEntries(findMissing(answers, environmentId).map((m) => [m.id, m.message]))
        : {},
    [showErrors, answers, environmentId],
  );

  /**
   * 「모르겠어요」라고 답한 필수 질문.
   *
   * 빨간 오류가 아니다 — 막지 않는다. 다만 조용히 넘기지도 않는다. 모른 채로
   * 지나갔다는 사실을 그 질문 옆에 적어 두고, 마지막에 한 번 더 여쭙는다.
   * `showErrors` 와 무관하게 늘 계산한다: 이건 잘못이 아니라 상태다.
   */
  const unknowns = useMemo(
    () => new Set(findUnknownRequired(answers, environmentId).map((m) => m.id)),
    [answers, environmentId],
  );

  useEffect(() => {
    headingRef.current?.focus();
    setAnswers(currentAnswers);
    setTouched(initialTouched(currentAnswers, answersSubmitted));
    setShowErrors(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 환경이 바뀌어 질문 목록이 갈리면 첫 장부터 다시 시작한다.
  useEffect(() => {
    setPageIndex(0);
    setShowErrors(false);
  }, [questions]);

  // 장을 넘길 때마다 제목으로 초점을 옮긴다. 화면이 통째로 바뀌었다는 것을
  // 스크린리더가 읽어야 하고, 방금 누른 「다음」 버튼이 사라진 자리에 키보드 초점이
  // 남아 있으면 안 된다.
  useEffect(() => {
    headingRef.current?.focus();
  }, [pageIndex]);

  /**
   * 이 장이 화면에 뜬 시각. 뜨자마자 들어오는 제출을 막는 데만 쓴다.
   *
   * 원인 쪽은 버튼 줄에서 이미 막았다(DOM 노드 재사용 + `type` 바뀜). 이건 그와
   * **별개의 두 번째 그물**이다. 마지막 장이 뜬 지 0.4초도 안 돼서 들어오는 제출은
   * 사람이 그 장을 보고 누른 것일 수 없다 — 무엇이 그것을 일으켰든, 사람이 읽지
   * 못한 장을 지나쳐 버리는 결과는 같다. 팀장님이 세 번 겪으신 증상이라 원인 하나만
   * 믿지 않는다(2026-08-16).
   *
   * 첫 장은 0 이라 이 검사에 걸리지 않는다. 사람이 직접 누른 제출은 아무리 빨라도
   * 0.4초는 넘고, 걸리더라도 한 번 더 누르면 된다 — 그때는 이미 그 장을 본 뒤다.
   */
  const pageShownAtRef = useRef(0);
  useEffect(() => {
    pageShownAtRef.current = pageIndex === 0 ? 0 : Date.now();
  }, [pageIndex]);

  // 상태 유실을 방지하기 위해 onChange를 항상 최신 상태의 참조로 유지합니다.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 답변 상태가 바뀔 때마다 안전하게 부모(page.tsx)에게 전달합니다. (연타 버그 완벽 방지)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onChangeRef.current?.(answers);
  }, [answers]);

  const setValue = (id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiChange = (q: QuestionDef, value: string) => {
    setTouched((prev) => new Set(prev).add(q.id));
    setAnswers((prev) => {
      const current = asList(prev[q.id]);
      if (value === "NONE") return { ...prev, [q.id]: [] };
      if (value === "UNKNOWN") return { ...prev, [q.id]: ["UNKNOWN"] };
      const without = current.filter((v) => v !== "UNKNOWN");
      const next = without.includes(value) ? without.filter((v) => v !== value) : [...without, value];
      return { ...prev, [q.id]: next };
    });
  };

  const handleNumberChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value.trim() === "" ? null : Number(value) }));
  };

  /**
   * 다음 장으로. 지금 장에 있는 질문만 검사한다 — 아직 보여 주지도 않은 뒷장
   * 질문을 두고 「비어 있다」고 막으면, 사용자는 화면에 없는 것을 고치라는 말을
   * 듣게 된다.
   */
  const goNext = () => {
    const onThisPage = new Set(pageQuestions.map((q) => q.id));
    const found = findMissing(answers, environmentId).filter((m) => onThisPage.has(m.id));

    if (found.length > 0) {
      setShowErrors(true);
      inputRefs.current[found[0].id]?.focus();
      return;
    }

    setShowErrors(false);
    setPageIndex((i) => Math.min(i + 1, pages.length - 1));
  };

  const goPrev = () => {
    setShowErrors(false);
    setPageIndex((i) => Math.max(i - 1, 0));
  };

  /**
   * `e` 가 없을 수도 있다 — 마지막 장의 버튼이 `onClick` 으로 직접 부른다.
   * 왜 그렇게 하는지는 아래 버튼 줄의 주석에 적었다.
   */
  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    // 숫자 칸에서 엔터를 치면 마지막 장이 아니어도 여기로 들어온다. 그때 제출까지
    // 가 버리면 뒷장 질문을 건너뛴 채로 추천을 받는다.
    if (!isLastPage) {
      goNext();
      return;
    }

    // 이 장이 뜬 직후의 제출은 사람이 누른 것이 아니다. 위 `pageShownAtRef` 참고.
    if (pageShownAtRef.current > 0 && Date.now() - pageShownAtRef.current < 400) return;

    // 필수 응답 검사. 어느 질문이 필수인지도, 답이 찼는지도 엔진이 정한다
    // — 화면이 직접 판정하면 화면과 제출본이 같은 답을 두고 다른 말을 하게 된다.
    // 무엇이 필수인지는 fixture 의 optionGroups[].required 가 정하므로, 환경이
    // 늘거나 fixture 가 바뀌어도 이 파일은 따라간다. (경위는 pm/22)
    // 마지막 장에서는 **전체**를 다시 본다. 장마다 걸러 왔더라도, 뒷장에서 답을
    // 바꾸면 앞장 답이 함께 풀리는 질문이 있기 때문이다(병원의 초진·예약·진료과).
    const found = findMissing(answers, environmentId);

    if (found.length > 0) {
      setShowErrors(true);
      // 비어 있는 항목이 앞장에 있으면 그 장으로 되돌려 보낸다. 안 그러면 잠긴
      // 이유가 화면에 없는 채로 버튼만 안 먹는다.
      const target = pages.findIndex((page) => page.some((q) => q.id === found[0].id));
      if (target >= 0 && target !== pageIndex) {
        setPageIndex(target);
        setTimeout(() => inputRefs.current[found[0].id]?.focus(), 0);
      } else {
        inputRefs.current[found[0].id]?.focus();
      }
      return;
    }

    setShowErrors(false);
    const submitted = { ...answers };
    
    for (const q of questions) {
      if (q.kind !== "multi" || !offersUnknown(q) || touched.has(q.id)) continue;
      submitted[q.id] = ["UNKNOWN"];
    }
    
    onSubmit(submitted);
  };

  return (
    <main className="flex flex-col w-full gap-4">
      {/* 몇 장 중 몇 번째인지를 제목 안에 넣는다. 끝이 안 보이는 질문지는 그만두게
          만든다. 장을 넘길 때마다 초점이 이 제목으로 오므로, 스크린리더는 새 장
          번호를 제목과 함께 읽는다 — 따로 `aria-live` 를 둘 필요가 없다.

          ⚠️ 「3장 중 1장」이라고만 적지 않는다. 바로 위에 「1.상황 입력 2.추천 결과
          3.최종 확인 4.실행 결과」 진행 칩이 있어서, 세는 대상이 없으면 그 넷 중
          셋을 가리키는 말로 읽힌다 — 「3장 중 하나가 추천 결과라는 뜻이냐」고
          실제로 물으셨다(팀장 지시, 2026-08-16). 그래서 **무엇을 세는지**를
          말에 넣는다: 「질문 1장째 (모두 3장)」. */}
      <h1 ref={headingRef} tabIndex={-1} className="font-extrabold text-center focus-visible:outline-none" style={{ fontSize: "calc(2rem * var(--font-scale))" }}>
        {title}
        {pages.length > 1 && (
          <span className="font-bold opacity-80 ml-3 whitespace-nowrap" style={{ fontSize: "calc(1.2rem * var(--font-scale))" }}>
            {isLastPage
              ? `마지막 질문입니다 (${pages.length}장 중 ${pages.length}장째)`
              : `질문 ${pageIndex + 1}장째 (모두 ${pages.length}장)`}
          </span>
        )}
      </h1>

      {isRestored && (
        <div role="status" className={`border-2 rounded-xl px-4 py-3 font-bold ${isHighContrast ? "border-[var(--color-accent)]" : "border-blue-400 bg-blue-50 text-blue-900"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
          지난번에 답하신 내용을 채워 두었습니다. 지금도 맞는지 확인해 주세요.
          {restoredSavedAt && <span className="opacity-70 ml-2" style={{ fontSize: "calc(0.9rem * var(--font-scale))" }}>(저장: {restoredSavedAt.slice(0, 10)})</span>}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col w-full gap-4">
        {pageQuestions.map((q) => {
          const errorMessage = missing[q.id];
          const isError = errorMessage !== undefined;
          
          const baseBorder = isError
            ? (isHighContrast ? "border-red-400 bg-red-500/10" : "border-red-500 bg-red-50")
            : (isHighContrast ? "border-gray-600 bg-transparent" : "");
          // 환경색은 평상시에만 준다. 오류(빨강)와 고대비(회색)는 그 자체가
          // 의미라서 환경색이 덮으면 안 된다.
          const boxStyle = isError || isHighContrast ? undefined : { borderColor: themeColor };

          if (q.kind === "number") {
            const inputId = `question-${q.id}`;
            return (
              <section key={q.id} style={boxStyle} className={`border-2 rounded-2xl flex flex-col gap-2 transition-colors p-4 ${baseBorder}`}>
                <div className="flex justify-between items-center">
                  <label htmlFor={inputId} className="font-bold cursor-pointer" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                    {q.label}
                  </label>
                </div>
                {isError && (
                  <p id={`${q.id}-error`} aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                    ⚠️ {errorMessage}
                  </p>
                )}
                {q.help && <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
                <input
                  ref={(el) => { inputRefs.current[q.id] = el; }}
                  id={inputId}
                  type="number"
                  inputMode="numeric"
                  aria-invalid={isError}
                  aria-describedby={isError ? `${q.id}-error` : undefined}
                  value={asNumberValue(answers[q.id])}
                  onChange={(e) => handleNumberChange(q.id, e.target.value)}
                  placeholder="예: 7000"
                  className={`w-full p-4 rounded-xl border-2 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] ${
                    isHighContrast ? "bg-black text-white border-gray-500" : "bg-white text-black border-gray-300"
                  }`}
                  style={{ minHeight: "var(--tap-min)", fontSize: "calc(1.2rem * var(--font-scale))" }}
                />
              </section>
            );
          }

          const isMulti = q.kind === "multi";
          const selected = isMulti ? asList(answers[q.id]) : [];
          const options = isMulti && offersUnknown(q) ? [{ value: "NONE", label: "없어요 (해당 없음)" }, ...q.options] : q.options;

          return (
            <fieldset
              key={q.id}
              aria-describedby={isError ? `${q.id}-error` : undefined}
              style={boxStyle}
              className={`border-2 rounded-2xl flex flex-col gap-2 transition-colors p-4 ${baseBorder}`}
            >
              {/* legend 는 fieldset 의 첫 자식이어야 그룹 이름 노릇을 한다. div 로
                  감싸면 스크린리더가 "맵기는 어떻게 해드릴까요?" 를 잃고 선택지만
                  읽는다 — 그래서 에러 표시를 legend 안에 넣는다. 한 번 감쌌다가
                  6개 그룹이 전부 이름을 잃은 적이 있다 (pm/22 2번). */}
              <legend className="font-bold px-2 w-full flex justify-between items-center gap-3" style={{ fontSize: "calc(1.3rem * var(--font-scale))" }}>
                <span>{q.label}</span>
              </legend>
              {isError && (
                <p id={`${q.id}-error`} aria-live="polite" className={`font-bold ${isHighContrast ? "text-red-400" : "text-red-600"}`} style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>
                  ⚠️ {errorMessage}
                </p>
              )}
              {isRestored && environmentId === "chicken-store" && q.id === "allergenIds" && (
                <p role="status" className={`font-bold p-3 rounded-lg mt-2 mb-2 ${isHighContrast ? "bg-gray-800 text-yellow-300" : "bg-orange-100 text-orange-800"}`} style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
                  드시면 안 되는 재료는 안전을 위해 매번 다시 여쭙니다.
                </p>
              )}
              {q.help && <p className="opacity-80" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>{q.help}</p>}
              {/* 선택지가 많은 질문일수록 열을 늘려 줄 수를 줄인다. 알레르기 8칸을
                  두 줄로 세우면 그것 하나로 375px 을 먹어 한 화면에 안 들어갔다.
                  선택지가 서넛뿐인 질문은 글이 길어(「포장해서 가져갈게요」) 좁은
                  칸에 넣으면 두 줄로 접히므로 열을 덜 늘린다. 좁은 화면에서는 어느
                  경우든 한 줄에 하나씩이다 — 44px 터치 영역은 그대로다. */}
              <div className={`grid gap-3 ${
                options.length <= 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : options.length <= 6
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
              }`}>
                {options.map((opt, idx) => {
                  const inputId = `${q.id}-${opt.value}`;
                  const isChecked = isMulti ? (opt.value === "NONE" ? touched.has(q.id) && selected.length === 0 : selected.includes(opt.value)) : answers[q.id] === opt.value;
                  const selectedClass = isHighContrast ? "border-[var(--color-accent)] bg-gray-800" : "";
                  const unselectedClass = isHighContrast ? "border-gray-700 hover:border-gray-500 bg-transparent" : "border-gray-200 hover:border-gray-400 bg-transparent";
                  // 고른 칸은 테두리가 환경색, 바탕이 그 색의 옅은 판이다.
                  const selectedStyle = isChecked && !isHighContrast
                    ? { borderColor: themeColor, backgroundColor: themeTint }
                    : undefined;

                  return (
                    <label key={opt.value} htmlFor={inputId} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${isChecked ? selectedClass : unselectedClass}`} style={{ minHeight: "var(--tap-min)", ...selectedStyle }}>
                      <input
                        ref={(el) => { if (idx === 0) inputRefs.current[q.id] = el; }}
                        id={inputId}
                        type={isMulti ? "checkbox" : "radio"}
                        name={q.id}
                        value={opt.value}
                        checked={isChecked}
                        onChange={() => isMulti ? handleMultiChange(q, opt.value) : setValue(q.id, opt.value)}
                        className={`w-6 h-6 accent-[var(--color-accent)] focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none ${isMulti ? "rounded" : ""}`}
                      />
                      <span className="font-bold break-keep" style={{ fontSize: "calc(1.1rem * var(--font-scale))" }}>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {/* 왼쪽은 되돌아가는 길, 오른쪽은 나아가는 길. 자리를 장마다 바꾸지 않는다.
            ⚠️ 진행 버튼의 잠김은 **지금 장에 보이는 질문**만 보고 정한다. 뒷장 질문
            때문에 잠기면 화면에는 이유가 없는데 버튼만 안 먹는다. 전체 검사는
            마지막 장의 제출에서 한다. */}
        {/* 「모르겠어요」를 고른 장에 한 줄. 잠그지 않고, 넘어가도 된다고 먼저
            말해 준다 — 모른다고 답한 사람에게 빨간 글씨로 다시 고르라고 하던
            화면을 대신하는 자리다(팀장 지시, 2026-08-16).
            ⚠️ 질문마다 붙이지 않는다. 한 장에 두 개가 걸리면 상자 두 개가
            1280x800 에서 60px 을 넘치게 만들었다(실측). 스크롤을 없애려고 장을
            나눈 것이므로 장당 한 줄로 합쳤다. 버튼 줄 위에 붙여 세로 여백도
            새로 만들지 않는다. */}
        <div className="flex flex-col gap-3 w-full mt-2">
          {pageQuestions.some((q) => unknowns.has(q.id)) && (
            <p role="status" className="font-bold opacity-90 break-keep leading-snug" style={{ fontSize: "calc(1rem * var(--font-scale))" }}>
              모르겠다고 답하신 것이 있습니다. 그대로 넘어가셔도 됩니다. 마지막에 한 번 더 여쭙고, 직원도 부르실 수 있습니다.
            </p>
          )}
        <div className="flex flex-col sm:flex-row gap-4 w-full">
          {/* 왼쪽 줄도 같은 이유로 `key` 를 나눈다. 이쪽은 둘 다 `type="button"`
              이라 폼 제출까지 가지는 않지만, 누르는 순간 눌린 버튼이 다른 버튼으로
              바뀌는 구조는 그대로다. */}
          {pageIndex === 0
            ? onReset && (
                <button
                  key="reset"
                  type="button"
                  onClick={onReset}
                  className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none"
                  style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
                >
                  처음으로 가기
                </button>
              )
            : (
                <button
                  key="prev"
                  type="button"
                  onClick={goPrev}
                  className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none"
                  style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: "transparent", color: "var(--color-fg)", border: "2px solid var(--color-fg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
                >
                  ← 이전 질문
                </button>
              )}

          {/* ⚠️ 이 두 버튼은 **서로 다른 `key`** 를 갖고, 마지막 장의 것도
              `type="button"` 이다. 둘 다 같은 결함 하나를 막는다.

              전에는 조건부의 두 가지가 같은 자리·같은 태그라 React 가 **DOM 노드를
              그대로 재사용**했다. 그래서 「마지막 질문 →」(type=button)을 누르면
              클릭 처리 도중에 그 노드가 「추천 결과 보기」(type=submit)로 바뀌고,
              브라우저는 클릭이 끝난 뒤 **바뀐 상태**로 기본 동작을 실행한다 —
              즉 마지막 장이 떴다가 **같은 클릭 한 번으로 폼이 제출됐다.**
              사람 눈에는 마지막 장이 아예 없는 것처럼 보인다(팀장 지시,
              2026-08-16: 「마지막 질문을 누르면 바로 추천 결과가 나온다」).

              ⚠️ 스크립트의 `element.click()` 으로는 재현되지 않는다. 실제 마우스
              클릭과 기본 동작을 처리하는 시점이 달라서다. **이 자리를 고칠 때는
              반드시 손으로 눌러 확인하십시오.**

              `key` 가 다르면 React 가 옛 노드를 지우고 새로 만들어 애초에 상태가
              바뀌지 않고, `type="button"` 이면 폼 제출이라는 기본 동작 자체가 없다.
              엔터는 그대로 `form` 의 `onSubmit` 이 받는다 — 마지막 장은 입력칸이
              하나라 브라우저가 암묵적 제출을 해 준다. */}
          {isLastPage ? (
            <button
              key="submit"
              type="button"
              onClick={() => handleSubmit()}
              disabled={pageQuestions.some((q) => missing[q.id] !== undefined)}
              className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:hover:scale-100"
              style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: primaryFill, color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
            >
              추천 결과 보기
            </button>
          ) : (
            <button
              key="next"
              type="button"
              onClick={goNext}
              disabled={pageQuestions.some((q) => missing[q.id] !== undefined)}
              className="flex-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 transition-transform hover:scale-[1.02] active:scale-95 duration-200 motion-reduce:transition-none motion-reduce:transform-none disabled:opacity-50 disabled:hover:scale-100"
              style={{ minHeight: "calc(var(--tap-min) + 8px)", borderRadius: "var(--radius)", backgroundColor: primaryFill, color: "var(--color-bg)", fontSize: "calc(1.3rem * var(--font-scale))", fontWeight: "bold" }}
            >
              {/* 다음이 마지막 장이면 그렇다고 미리 말한다. 이 버튼과 「추천 결과
                  보기」는 같은 자리에 있어서, 같은 곳을 두 번 누르면 마지막 장이
                  떴다가 그대로 넘어간다 — 닭강정집의 예산 칸과 병원의 보호자 동반이
                  그렇게 지나쳐졌다(팀장 지시, 2026-08-16). 한 장 더 있다는 것을
                  알고 누르면 눌린 다음 화면을 읽는다. */}
              {pageIndex === pages.length - 2 ? "마지막 질문 →" : "다음 질문 →"}
            </button>
          )}
        </div>
        </div>
      </form>
    </main>
  );
}

function offersUnknown(q: QuestionDef): boolean { return q.options.some((o) => o.value === "UNKNOWN"); }
function asList(value: unknown): string[] { return Array.isArray(value) ? (value as string[]) : []; }
function asNumberValue(value: unknown): number | string { return typeof value === "number" ? value : ""; }
/**
 * 여러 개 고르는 질문 중 사용자가 이미 손댄 것.
 *
 * 한 번 제출하고 돌아왔다면 **빈 배열도 손댄 것으로 본다.** 그때의 빈 배열은
 * 시작값이 아니라 「없어요」라는 대답이기 때문이다(`answersSubmitted` 주석 참고).
 */
function initialTouched(answers: AnyAnswers, submitted: boolean): Set<string> {
  const touched = new Set<string>();
  for (const [key, value] of Object.entries(answers)) {
    if (Array.isArray(value) && (submitted || value.length > 0)) touched.add(key);
  }
  return touched;
}