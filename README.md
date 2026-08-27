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

## 문서 구조 — 4층

갱신 주기가 다른 정보를 층으로 나눠 관리한다. 위층이 아래층을 이긴다.

| 층 | 파일 | 무엇 | 얼마나 자주 바뀌나 |
| --- | --- | --- | --- |
| 1 규칙 | `CLAUDE.md` | 금지사항·승인·작업규칙 | 거의 안 바뀜 |
| 2 사실 | `pm/00_BRIEF` · `pm/01_SPEC` | 배점·계약·데이터 | 새 정보 오면 개정 |
| 3 계획 | `pm/02_PLAN` · `pm/05_FRONTEND_BRIEF` | 언제 누가 무엇을 | 상황 따라 |
| 4 상태 | `pm/03_QUESTIONS` · `04_BACKLOG` · `99_HANDOFF` | 지금 어디까지 | 계속 |

왜 이렇게 나눴는지는 [`pm/06_GUIDELINE_REVIEW.md`](pm/06_GUIDELINE_REVIEW.md) 6절에 있다.
그 문서는 전역 작업 지침을 이 프로젝트 성격과 대조해 무엇을 유지·보강·완화했는지 정리한 진단서다.

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

**Node 22 필요.** `node -v` 가 `v22.` 로 시작해야 한다.

### 처음 받았을 때 — 키트 압축 해제부터

**시뮬레이션 키트는 리포에 없다.** `.gitignore` 의 `kit/*` 로 제외되어 있고,
클론하면 `kit/workspace/COMMITANDRUN/` 만 들어온다.
**이 단계를 건너뛰고 `npm ci` 를 하면 `package.json` 이 없어서 실패한다.**

배포 ZIP은 리포에 들어 있으므로 각자 자기 컴퓨터에서 풀면 된다 (PowerShell):

```powershell
Expand-Archive -Path .\KioBridge_RC4\kiobridge-simulation-kit-v5.1.6-participant-RC4.zip -DestinationPath .\_kit_tmp -Force
Copy-Item -Path .\_kit_tmp\kiobridge-simulation-kit-v5.1.6\* -Destination .\kit\ -Recurse -Force
Remove-Item .\_kit_tmp -Recurse -Force
```

ZIP 안의 `workspace/` 에는 `.gitkeep` 과 `README.md` 뿐이라
우리 `kit/workspace/COMMITANDRUN/` 을 덮어쓰지 않는다.

확인: `kit/package.json` 과 `kit/workspace/COMMITANDRUN/src/participant.ts` 가 둘 다 있어야 한다.

### 그다음

```bash
cd kit
npm ci               # 235 packages, 약 10초
npm run dev          # web :3000 · api :4000
```

제출물 검증:

```bash
npm run participant:validate -- --file ./workspace/COMMITANDRUN/output/participant-submission.json --execute
```

구현 진척 확인 (x/9):

```bash
npm run participant:progress -- --team COMMITANDRUN
```

> 5.1.4 에서 Windows 버그로 실패하던 `participant:doctor` 와 `participant:progress` 는
> **v5.1.6 RC4 에서 고쳐졌다** (08-08 실측 — `doctor` 오탐 0건, 무결성 222개 PASS).
> 근거는 [`pm/99_HANDOFF.md`](pm/99_HANDOFF.md) 6절.

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

---

## 저작권

**이 결과물의 저작권은 아이디어를 기획한 창업팀(키오브릿지)에 귀속됩니다.**

해커톤 신청 시 제출한 동의서에 따른 것입니다. 커밋앤런 세 명은 결과물 제작에
기여한 것으로 인정되지만, 결과물에 대한 별도의 저작권이나 지분은 주장하지 않습니다.

그래서 이 리포에는 **오픈소스 라이선스를 붙이지 않는다.** 라이선스는 저작권자가 주는
이용허락인데, 우리는 저작권자가 아니라 줄 권리 자체가 없다. 같은 이유로 **공개 여부도
우리가 정하는 것이 아니다** — 온라인 공개는 저작권에 속하는 행위라 창업팀 확인을 받고
정한다.

이 리포에 함께 들어 있는 KioBridge 시뮬레이션 키트·해커톤 브리핑·요구사항 문서·
창업팀 Q&A 회신은 **참가팀 배포 자료**이며 우리 저작물이 아니다. 키트가 필요하면
창업팀에서 직접 받아야 한다.
