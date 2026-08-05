# COMMITANDRUN 작업 폴더

| 항목 | 값 |
| --- | --- |
| 팀 ID | `COMMITANDRUN` |
| 환경 | `chicken-store` |
| 제품 버전 | `5.1.4` |
| 입력계약 버전 | `1.0.0` |

## 수정할 파일

```
workspace/COMMITANDRUN/src/participant.ts   ← 여기부터 시작
```

## 순서

1. `src/participant.ts` 의 9개 함수를 위에서부터 구현
2. `npm run participant:progress` 로 상태 확인
3. 결과를 `output/participant-submission.json` 으로 저장
4. `npm run participant:validate -- --file workspace/COMMITANDRUN/output/participant-submission.json --execute`
5. `npm run participant:package -- --team COMMITANDRUN --file workspace/COMMITANDRUN/output/participant-submission.json`

## 참고

- 환경 가이드: `docs/environments/CHICKEN_STORE_PARTICIPANT_GUIDE.md`
- 오류코드: `docs/ERROR_CATALOG.md`
- 주석 예제: `examples/annotated/`
- 이 환경의 완성 예제는 제공되지 않습니다. recommendation 과 executionPlan 은 직접 만드세요.
