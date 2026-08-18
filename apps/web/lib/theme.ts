import type { EnvironmentId } from "@commitandrun/engine";

/**
 * 환경마다 색 하나. 화면 어디서든 이 값만 쓴다.
 *
 * 전에는 같은 환경의 색이 **네 곳에 서로 다른 값으로** 흩어져 있었다 —
 * 시작 화면 카드(밝은 쪽 #F98C42 · #51A3FA), `page.tsx` 의 THEME_COLORS
 * (진한 쪽 #C35306 · #0773E7), `RecommendScreen` 의 PROGRESS_COLORS(같은 값
 * 복사본), `ContextScreen` 의 THEMES(Tailwind 의 orange-300/500). 첫 화면과
 * 두 번째 화면의 주황이 눈에 띄게 다른 주황이었다.
 *
 * 밝은 쪽과 진한 쪽의 **중간값 하나로** 합쳤다(팀장 지시, 2026-08-16).
 *
 *   닭강정  #F98C42 + #C35306 → #DE7024
 *   병원    #51A3FA + #0773E7 → #2C8BF1
 *   관공서  원래 한 값이었다   → #5A8214 그대로
 *
 * ⚠️ 흰 글씨 대비는 3.26 / 3.46 / 4.53:1 이다(계산값).
 * 18.66px 이상 굵은 글씨의 기준 3:1 은 넘고 본문 기준 4.5:1 은 넘지 못한다.
 * 밝은 쪽이 쓰이던 자리(2.37 / 2.64:1)는 올라갔고, 진한 쪽이 쓰이던 자리
 * (4.60 / 4.55:1)는 내려갔다. 내려간 자리 중 **작은 글씨는 진행 단계 칩
 * 하나뿐**이다(0.9rem 굵게, 3.26:1). 나머지 강조색 글자는 전부 1.3rem 이상
 * 굵은 글씨라 3:1 기준을 지킨다.
 * 이 숫자는 제출 README 와 `participant-ux.json` 의 신고값과 같아야 한다.
 */
export const ENV_COLORS: Record<EnvironmentId, string> = {
  "chicken-store": "#DE7024",
  hospital: "#2C8BF1",
  "public-office": "#5A8214",
};

/** 모르는 환경 id 에서도 화면이 색 없이 그려지지 않게 닭강정 색으로 떨어뜨린다. */
export function envColor(environmentId: EnvironmentId | string): string {
  return ENV_COLORS[environmentId as EnvironmentId] ?? ENV_COLORS["chicken-store"];
}

/**
 * 고른 칸·안내 상자의 옅은 바탕. 환경색을 흰색에 10% 만 섞어 만든다 —
 * Tailwind 의 orange-50 / blue-50 / emerald-50 을 환경마다 따로 적어 두면
 * 색을 바꿀 때 여기만 옛날 색으로 남는다.
 *
 * ⚠️ 반투명(`#DE70241A`)이 아니라 **불투명한 값**을 돌려준다. 직원 호출 패널은
 * 검은 반투명 막 위에 뜨는데, 알파를 쓰면 그 막이 비쳐 패널이 어두워지고
 * 그 위의 검은 글씨가 읽히지 않는다.
 */
export function envTint(environmentId: EnvironmentId | string): string {
  const hex = envColor(environmentId).slice(1);
  const mixed = [0, 2, 4].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(channel * 0.1 + 255 * 0.9)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${mixed.join("")}`;
}

/**
 * 옅은 회색 상자 위에 놓이는 **글자**용 진한 값. 지금은 추천 화면의
 * 「💡 이렇게 골랐습니다」 제목 하나가 쓴다.
 *
 * 환경색을 그대로 글자에 쓰면 그 상자(#F3F4F6) 위에서 닭강정이 **2.96:1** 로
 * 떨어진다 — 배포본 전체에서 대비 기준(큰 굵은 글씨 3:1)에 걸린 유일한
 * 글자였다(2026-08-18 실측). 하필 「왜 이걸 골랐는지」를 여는 제목이다.
 *
 * ⚠️ `ENV_COLORS` 는 **건드리지 않는다.** 시작 화면 카드의 흰 글씨 대비
 * 3.26 / 3.46 / 4.53 은 제출한 `participant-ux.json` 과 README 에 신고된 값이고
 * 08-16 이후로 고칠 수 없다. 이 함수는 환경색에서 **파생한 글자 전용 색**이라
 * 신고값과 어긋나지 않는다. 테두리·세로선은 그대로 환경색을 쓴다.
 *
 * 만드는 법은 환경색에 0.75 를 곱하는 것 하나다. 같은 색을 어둡게 한 것이라
 * 화면이 다른 색으로 보이지 않는다. 회색 상자 위 대비는 4.86 / 5.14 / 6.36 이다.
 */
export function envHeadingColor(environmentId: EnvironmentId | string): string {
  const hex = envColor(environmentId).slice(1);
  const darker = [0, 2, 4].map((i) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.75)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${darker.join("")}`;
}
