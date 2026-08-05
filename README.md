# 커밋앤런 — KioBridge MVP

2026 스타트업 영그라운드 MVP 개발 해커톤 (강동구 청년해냄센터 × blaybus) B트랙
ITEM 01 **키오브릿지** — 기존 키오스크에 얹어 쓰는 배리어프리 보조 소프트웨어

| | |
| --- | --- |
| 팀 | 커밋앤런 (3인) |
| 1차 산출물 마감 | **2026-08-16 (일)** — 이후 업로드 불가 |
| 파이널데이 | 2026-08-20 (목), 둔촌1동 주민센터 대강당 |

---

## 처음 온 사람이 읽는 순서

1. [`pm/00_BRIEF.md`](pm/00_BRIEF.md) — 대회 구조, 배점, 범위 경계
2. [`pm/01_SPEC.md`](pm/01_SPEC.md) — 3환경 계약·데이터·금지사항 **(가장 중요)**
3. [`CLAUDE.md`](CLAUDE.md) — 절대 금지 항목과 작업 규칙
4. [`pm/05_FRONTEND_BRIEF.md`](pm/05_FRONTEND_BRIEF.md) — 프런트 2인 작업지시서
5. [`pm/02_PLAN.md`](pm/02_PLAN.md) — 일정·역할·아키텍처

---

## 우리가 만드는 것

키오스크를 다시 만드는 것이 **아니다.** 키오스크 앞에서 겪는 정보 입력·탐색·이해·선택의
어려움을 줄이는 **사용자 접점 서비스**를 만든다.

```
사용자 정보 수집 (방식 자유)
  → Canonical Profile + SessionContext 변환
  → 후보 필터링 (하드제약 위반은 제거)
  → 추천 + 이유 + 대안 + 제외 사유
  → 사용자 최종 승인
  → 의미 기반 ExecutionPlan
  → KioBridge 공식 시뮬레이터에서 검증·재생 → Evidence
```

모든 개발·시연·평가는 `SIMULATION_ONLY` / `DIGITAL_TWIN` 에서 이뤄진다.
실제 키오스크·결제·병원 접수·민원 신청은 **하지 않는다.**

---

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| chicken-store 골든 시나리오 | ✅ SIMULATION PASS (10 actions) |
| hospital 골든 시나리오 | ✅ SIMULATION PASS (7 actions) |
| public-office 골든 시나리오 | ✅ SIMULATION PASS (6 actions) |
| 웹 앱 | ⬜ 개발 예정 |
| BFF API | ⬜ 개발 예정 |
| 추천 엔진 패키지 | ⬜ 개발 예정 |
| 배포 | ⬜ **최대 리스크** |

검증된 제출물 3종:
`kit/workspace/COMMITANDRUN/output/`

---

## 로컬 실행

KioBridge 시뮬레이션 키트는 배포된 ZIP을 각자 압축 해제해서 쓴다 (리포에 포함하지 않음).

```bash
cd kit
npm ci
npm run dev          # web :3000 · api :4000
```

제출물 검증:

```bash
npm run participant:validate -- --file ./workspace/COMMITANDRUN/output/participant-submission.json --execute
```

> Windows에서는 `participant:doctor` 의 npm 감지와 `participant:progress` 가 키트 자체 버그로
> 실패한다. 진행 판정은 `participant:validate --execute` 로 한다. 자세한 내용은
> [`pm/02_PLAN.md`](pm/02_PLAN.md) 0절.

---

## 역할

| | 담당 |
| --- | --- |
| 팀장 | BFF, simulation-api 연동, 제출 패키징, 배포 인프라 |
| @lde451 | `packages/engine` — 필터·랭킹·설명·대안, 3도메인 어댑터, 시나리오 테스트 |
| @NyoungF | 웹 앱 전체 — 접근성, 안전 리포트, 시뮬레이션 재생, 발표자료 |

---

## 브랜치

```
main          보호. 직접 커밋 금지
feat/engine-* @lde451
feat/web-*    @NyoungF
feat/api-*    팀장
```

커밋 메시지: Conventional Commits (`feat:` `fix:` `docs:` `test:` `chore:`)
