"use client";

import { useEffect, useRef, useState } from "react";

interface StickyActionsProps {
  isHighContrast: boolean;
  /** 버튼 줄. 보통 `flex-1` 버튼 두 개다. */
  children: React.ReactNode;
}

/**
 * 화면 아래에 붙어 있는 버튼 줄.
 *
 * 왜 필요한가. 추천 화면은 1280x720 에서 전체 1,607px 이고 진행 버튼이 1,547px
 * 에 있었다. 최종 확인 화면도 「달라지는 부분」 상자까지 뜨면 839px 이 되어
 * 승인 버튼이 화면 밖으로 나갔다. **다음으로 가는 버튼이 안 보이는 것은 어떤
 * 설명보다 나쁘다.** 픽셀 예산을 다시 맞추는 대신 버튼 줄을 고정해 문제 자체를
 * 없앤다 — 내용이 길어져도 진행은 항상 손 닿는 곳에 있다.
 *
 * 두 화면이 이 하나를 같이 쓴다. 전에는 최종 확인 화면에만 손으로 붙여 두었는데,
 * 추천 화면에도 같은 것이 필요해지면서 **모양이 갈릴 자리**가 됐다. 한 곳에서
 * 만들면 갈릴 수가 없다.
 *
 * 생김새는 화면의 나머지와 맞춘다 — 카드가 전부 둥근 모서리(`rounded-2xl`)와
 * 옅은 회색 테두리를 쓰는데, 이 줄만 검은 2px 직선이라 얹어 놓은 판자처럼
 * 보였다(팀장 지시, 2026-08-18). 위쪽 모서리를 둥글리고, 테두리를 옅게 낮추고,
 * 위로 퍼지는 그림자를 줘서 **내용 위에 떠 있는 것**으로 읽히게 한다.
 * 고대비에서는 그림자가 보이지 않으므로 흰 2px 테두리로 경계를 만든다.
 *
 * ⚠️ 배경은 **불투명**해야 한다. 반투명이면 글자가 겹쳐 읽히지 않는다.
 */
export function StickyActions({ isHighContrast, children }: StickyActionsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  /*
   * 직원 호출 버튼이 이 줄과 겹치지 않게 비켜 준다.
   *
   * 그 버튼은 `bottom: 3rem` 에 떠 있어서(`StaffHelp.tsx`) 고정한 버튼 줄과
   * 세로로 겹친다. 덱 8쪽에 「직원 호출은 항상 아래에」라고 적어 둔 이상 가릴 수
   * 없으므로, 이 줄이 있는 동안만 `--staff-bottom` 을 줄 위로 올리고 나갈 때
   * 되돌린다.
   *
   * 높이를 상수로 적지 않고 **재는** 이유는 큰 글씨 3단계 때문이다. 배율을
   * 올리면 버튼 줄이 같이 커져서, 고정값으로 잡아 두면 1.5배에서 다시 겹친다.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--staff-bottom", `${el.offsetHeight + 12}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--staff-bottom");
    };
  }, []);

  /*
   * 아래에 더 있는지. 버튼이 항상 보이게 되면서 생긴 새 문제를 막는다 —
   * 화면이 꽉 차 보이니 **더 내려갈 것이 있다는 사실 자체가 안 보인다.**
   * 추천 화면은 대안 목록과 뺀 목록이 그 아래에 있어서, 모르고 지나가면
   * 「다른 것도 보시겠어요?」를 아예 못 본다.
   *
   * 내용 길이는 큰 글씨 배율에 따라 바뀌므로 스크롤뿐 아니라 문서 크기도 본다.
   */
  useEffect(() => {
    const check = () => {
      const doc = document.documentElement;
      setMoreBelow(doc.scrollHeight - (window.scrollY + window.innerHeight) > 24);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const observer = new ResizeObserver(check);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="sticky bottom-0 z-30 w-full">
      {/* 내용이 버튼 줄 밑으로 **잘려** 보이지 않게 옅게 흐려 준다. 잘린 것처럼
          보이면 「여기가 끝인가」로 읽히고, 흐려지면 「밑에 이어진다」로 읽힌다.
          안내 알약이 앉는 자리이기도 하다. 장식이라 스크린리더에서 감춘다 —
          아래 내용은 어차피 순서대로 읽히고 키보드로도 닿는다. */}
      <div
        aria-hidden="true"
        className="relative h-10 flex items-end justify-center pointer-events-none"
        style={{ background: "linear-gradient(to bottom, transparent, var(--color-bg) 88%)" }}
      >
        {moreBelow && (
          /* 움직이지 않는다. 흔들리는 화살표가 흔하지만, 이 서비스는 어지럼증이
             있는 분도 쓰고 화면 전체가 조용한 쪽으로 맞춰져 있다. 말과 화살표로
             충분하다. */
          <span
            className={`mb-1.5 inline-flex items-center gap-2 rounded-full px-4 py-1 font-bold shadow-md ${
              isHighContrast ? "bg-[var(--color-accent)] text-black" : "bg-gray-800 text-white"
            }`}
            style={{ fontSize: "calc(0.95rem * var(--font-scale))" }}
          >
            아래에 더 있어요 <span aria-hidden="true">↓</span>
          </span>
        )}
      </div>

      <div
        className={`flex flex-col sm:flex-row gap-4 w-full pt-3 pb-3 px-3 rounded-t-2xl ${
          isHighContrast ? "border-t-2 border-x-2" : "border-t"
        }`}
        style={{
          backgroundColor: "var(--color-bg)",
          borderColor: isHighContrast ? "var(--color-fg)" : "#D1D5DB",
          boxShadow: isHighContrast ? undefined : "0 -10px 24px -14px rgba(0, 0, 0, 0.45)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
