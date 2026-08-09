# apps/bff — 우리 웹앱이 말을 거는 유일한 서버

담당: 팀장 · 브랜치 `feat/api-*`

## 왜 있나

공식 시뮬레이션 API는 한 번 돌리는 데 **호출을 다섯 번** 순서대로 해야 한다
(세션 만들기 → 제출 → 검증 → 실행 → 증거 받기). 이걸 브라우저가 직접 하면
순서가 꼬이고, 무엇보다 **안전 검사를 브라우저에 맡기게 된다.**

그래서 중간 서버를 하나 둔다. 웹앱은 `POST /api/run` **한 번만** 부르면 된다.

이 서버는 **실제 기기에 아무것도 보내지 않는다.** 계획을 디지털 트윈 시뮬레이터로
넘기고, 시뮬레이터가 돌려준 결과를 그대로 전달할 뿐이다.

## 띄우기

키트의 시뮬레이션 API가 먼저 떠 있어야 한다.

```bash
cd kit && npm run start:api
```

그다음 이 서버를 띄운다.

```bash
cd apps/bff && npm install && npm run dev
```

확인:

```bash
curl http://localhost:5174/health
```

`simReachable: true` 가 나오면 위아래가 다 붙은 것이다.

## 엔드포인트

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/health` | 이 서버 + 시뮬레이션 API 상태 |
| GET | `/api/environments` | 환경 목록 |
| GET | `/api/environments/:id/fixture` | 후보·옵션·화면 데이터 (화면 그릴 때 필요) |
| GET | `/api/environments/:id/compatibility-rules` | 호환성 규칙 |
| POST | `/api/submissions/preflight` | **안전 검사만.** 시뮬레이터로 안 보낸다 |
| POST | `/api/run` | 안전 검사 → 세션 → 제출 → 검증 → 실행 |

### `POST /api/run`

```jsonc
{
  "environmentId": "chicken-store",
  "submission": { /* ParticipantSubmission 통째 */ },
  "injectError": "SAFETY_ERROR_CODE"   // 선택. 라이브 안전 데모용
}
```

돌아오는 것: `{ sessionId, safety, validation, run, evidence }`.
`run.events` 가 시뮬레이션 재생 화면의 재료고, `evidence` 가 안전 리포트의 재료다.

## 안전 게이트 (`src/safety.ts`)

플랫폼도 불안전한 계획을 거절하지만, **여기서 한 번 더 막는다.** 이유는 두 가지다.
불안전한 계획이 애초에 밖으로 나가지 않게 하려는 것과,
웹앱이 사용자에게 보여줄 **한국어 사유**를 받아야 하기 때문이다.

막는 것:

| 코드 | 무엇 |
| --- | --- |
| `FORBIDDEN_ACTION_PLANNED` | 금지 Action 이 계획에 들어옴 (자동 FAIL 사유) |
| `SAFETY_FLAG_TAMPERED` | `SIMULATION_ONLY` · `DIGITAL_TWIN` · `actualDeviceCommandSent=false` 변조 |
| `ACTIONS_WITHOUT_APPROVAL` | 사용자 승인 없이 계획이 들어옴 |
| `COORDINATE_IN_PLAN` | 좌표·`automationId` 가 계획에 들어옴 |

**게이트는 제출물을 고치지 않는다.** 위반이면 그 자리에서 막고 사유를 돌려준다.

## 알아둘 것

`@commitandrun/engine` 은 아직 npm 패키지가 아니라서 `tsconfig.json` 의 `paths` 로
`packages/engine/src/types.ts` 를 직접 가리키고 있다. @lde451님이 그 폴더에
`package.json` 과 `index.ts` 를 넣으면 **`paths` 항목만 지우면 된다** —
소스의 import 문은 이미 `@commitandrun/engine` 이다.

## 배포 (미정 — 결정 필요)

이 서버는 Railway 에 올린다. 다만 **공식 시뮬레이션 API 를 어디에 띄울지가 아직 안 정해졌다.**
키트는 리포에 없어서(`.gitignore` 의 `kit/*`) 배포본에 딸려 가지 않는다.
`SIM_API_URL` 로 주소만 바꾸면 되게 만들어 뒀으니, 그 주소를 뭘로 할지가 남은 결정이다.
