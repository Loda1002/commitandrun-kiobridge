/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  참가팀이 구현하는 9개 단계                                                ║
 * ║                                                                          ║
 * ║  이 파일이 여러분의 시작점입니다. 아홉 개 함수가 모두 NOT_IMPLEMENTED      ║
 * ║  이며, KioBridge 는 이 중 어느 것도 대신 만들어 주지 않습니다.             ║
 * ║                                                                          ║
 * ║  진행 확인:  npm run participant:progress                                 ║
 * ║  제출 검증:  npm run participant:validate -- --file <내 제출.json>         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 용어 (처음 보는 경우)
 *   Canonical Profile   수집 방식과 무관하게 KioBridge 가 공통으로 이해하는
 *                       사용자 정보 형식
 *   SessionContext      이번 이용에만 해당하는 맥락 (오늘 무엇을 하러 왔는가)
 *   Fixture             환경의 후보·옵션·화면·상태전환이 든 공개 데이터
 *   Semantic Plan       좌표가 아니라 "무엇을 어떤 순서로 고를지" 를 적은 계획
 *   Evidence            서버가 만든 시뮬레이션 실행 증거
 *
 * 참고 문서
 *   docs/environments/<환경>_PARTICIPANT_GUIDE.md   환경별 수집 항목
 *   docs/ERROR_CATALOG.md                           오류코드 → 고칠 파일
 *   docs/PROFILE_DATA_DICTIONARY.md                 Profile 필드 사전
 *   docs/SESSION_CONTEXT_DICTIONARY.md              SessionContext 필드 사전
 *   docs/UNKNOWN_POLICY.md                          모르는 값을 추론하지 않는 규칙
 *   examples/annotated/                             주석 달린 예제 (제출 불가)
 */
import type {
  AnySessionContext, Candidate, ExecutionPlan, ParticipantSubmission, PublicFixture,
  Recommendation, UserDecision, UserProfile,
} from "@kiobridge/participant-sdk";

/** 환경마다 스키마가 다르므로 도메인별 SessionContext 를 합집합으로 다룹니다. */
type SessionContext = AnySessionContext;

/** 참가팀 서비스가 수집한 원본 입력 (형식 자유 — 웹폼/음성/QR/챗봇 무엇이든). */
export type RawUserInput = Record<string, unknown>;

const todo = (fn: string, what: string): never => {
  throw new Error(
    `NOT_IMPLEMENTED: ${fn}() 는 참가팀이 구현해야 합니다 — ${what}. ` +
      "진행 상황은 npm run participant:progress 로 확인하세요.",
  );
};

/* ═══════════════════════════ 1. 수집 ═══════════════════════════ */

/**
 * STEP 1 — collectProfile
 *
 * 목적:
 *   사용자에게서 정보를 받습니다. 이 단계가 여러분 서비스의 얼굴입니다.
 *
 * 입력:
 *   없음 (여러분의 UI·음성·QR·챗봇이 알아서 수집)
 *
 * 반환:
 *   RawUserInput — 형식 자유. 다음 단계에서 공식 형식으로 옮깁니다.
 *
 * 반드시:
 *   - 로그인 없이도 기본 기능이 동작할 것
 *   - 사용자가 "이번 한 번만" 을 고를 수 있을 것
 *   - 자동으로 불러온 값은 화면에 보여주고 확인받을 것
 *
 * 금지:
 *   - 회원가입 강제
 *   - 실제 주민등록번호·전화번호·카드번호 수집
 *   - 사용자가 말하지 않은 값을 채워 넣기
 *
 * 관련 오류:
 *   PERSONAL_DATA_NOT_ALLOWED
 *
 * 의사코드:
 *   const answers = await myUi.ask();      // 웹폼 / 음성 / QR 무엇이든
 *   return { ...answers, collectedVia: "VOICE" };
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export async function collectProfile(): Promise<RawUserInput> {
  return todo("collectProfile", "사용자 정보 수집 채널 구현");
}

/**
 * STEP 2 — mapToCanonicalInput
 *
 * 목적:
 *   수집한 임의 형식 데이터를 오래 유지되는 CanonicalProfile 로 변환합니다.
 *
 * 입력:
 *   RawUserInput
 *
 * 반환:
 *   UserProfile
 *
 * 반드시:
 *   - language 는 "ko-KR" 처럼 지역까지 포함 ("ko" 는 거부됩니다)
 *   - 접근성 요구는 공식 enum 사용 (docs/ENUM_REFERENCE.md)
 *   - source.collectedAt 은 UTC Z 타임스탬프 (예: 2026-08-03T00:11:00Z)
 *     SDK 의 nowIso8601Utc() 를 쓰면 안전합니다
 *
 * 금지:
 *   - 오늘 주문할 메뉴처럼 이번 세션에만 해당하는 값을 profile 에 저장
 *   - 모르는 정보를 추측해서 채우기 (UNKNOWN 을 쓰거나 필드를 생략)
 *   - 실제 개인식별정보 저장
 *
 * 관련 오류:
 *   DOMAIN_CONTEXT_MISMATCH · INVALID_UTC_TIMESTAMP · SCHEMA_INVALID
 *   ENUM_VALUE_INVALID · PERSONAL_DATA_NOT_ALLOWED
 *
 * 의사코드:
 *   return {
 *     profileId, dataClassification: "SYNTHETIC_PROFILE",
 *     source: { collectionChannel, providerId, collectedAt: nowIso8601Utc() },
 *     accessibility: { largeText, simpleSteps, ... },
 *     interaction: { preferredInput, language: "ko-KR", confirmationRequired },
 *     consent: { personalization, retentionPolicy },
 *   };
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function mapToCanonicalInput(_raw: RawUserInput): UserProfile {
  return todo("mapToCanonicalInput", "원본 입력 → Canonical Profile 변환");
}

/**
 * STEP 3 — createSessionContext
 *
 * 목적:
 *   이번 이용에만 해당하는 맥락을 만듭니다.
 *
 * 입력:
 *   RawUserInput, PublicFixture
 *
 * 반환:
 *   SessionContext
 *
 * 반드시:
 *   - 섹션을 구분할 것. 의미가 다릅니다:
 *       intent          무엇을 하러 왔는가
 *       facts           확인된 사실 (재진이다, 예약이 있다)
 *       preferences     선호 — 양보 가능
 *       hardConstraints 절대 조건 — 양보 불가 (알레르기, 예산)
 *       capabilities    가능한 수단 (쓸 수 있는 인증수단)
 *       fieldMetadata   각 값의 출처·신뢰도·확인 여부
 *   - 외부 맥락(날씨·혼잡도)은 extensions 에 팀 namespace 로 넣을 것
 *
 * 금지:
 *   - 선호를 hardConstraints 에 넣기 (반대도 마찬가지)
 *   - 외부 맥락으로 hardConstraints 를 덮어쓰기
 *   - capturedAt 에 로컬 시각이나 +09:00 넣기
 *
 * 관련 오류:
 *   DOMAIN_CONTEXT_MISMATCH · INVALID_UTC_TIMESTAMP · UNKNOWN_FIELD
 *
 * 의사코드:
 *   return {
 *     intent: { task },
 *     facts: {}, preferences: {}, hardConstraints: {}, capabilities: {},
 *     fieldMetadata: { "/preferences/x": { source, confidence, confirmedByUser } },
 *     extensions: { "TEAM_001.contextSignals": [...] },
 *   };
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function createSessionContext(_raw: RawUserInput, _fixture: PublicFixture): SessionContext {
  return todo("createSessionContext", "세션 맥락(intent/facts/preferences/hardConstraints) 구성");
}

/* ═══════════════════════════ 2. 추천 ═══════════════════════════ */

/**
 * STEP 4 — filterCandidates
 *
 * 목적:
 *   hardConstraints 를 위반하는 후보를 후보군에서 제거합니다.
 *
 * 입력:
 *   Candidate[] (fixture.candidates), SessionContext
 *
 * 반환:
 *   Candidate[] — 남은 후보
 *
 * 반드시:
 *   - 알레르기·예산·인증수단 위반은 "점수를 깎는" 것이 아니라 "빼는" 것
 *   - available === false 인 후보 제외
 *   - 제외 사유를 기록해 둘 것 (STEP 6 에서 설명에 씁니다)
 *
 * 금지:
 *   - hardConstraint 위반 후보를 낮은 점수로만 처리하고 남겨두기
 *   - UNKNOWN 인 제약을 "없는 것" 으로 간주
 *
 * 관련 오류:
 *   ALLERGEN_CONFLICT · PRICE_LIMIT_EXCEEDED · CANDIDATE_UNAVAILABLE
 *   AUTH_METHOD_UNAVAILABLE
 *
 * 의사코드:
 *   return candidates.filter((c) =>
 *     c.available && !violatesHardConstraints(c, ctx));
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function filterCandidates(_candidates: Candidate[], _ctx: SessionContext): Candidate[] {
  return todo("filterCandidates", "hardConstraint 위반 후보 제외");
}

/**
 * STEP 5 — recommend
 *
 * 목적:
 *   남은 후보의 순위를 정하고 1순위를 고릅니다.
 *
 * 입력:
 *   Candidate[] (필터 통과), SessionContext, UserProfile
 *
 * 반환:
 *   Recommendation
 *
 * 반드시:
 *   - 가중치와 점수 설계는 전적으로 여러분의 몫이며 심사 대상입니다
 *   - 확신이 낮으면 requiresReconfirmation 을 true 로
 *   - 사용자 사실과 충돌하지 않는 후보를 고를 것 (Stage A 검증)
 *
 * 금지:
 *   - 사용자가 UNKNOWN 이라고 한 값을 임의로 정해서 고르기
 *   - 병원에서 증상으로 진료과를 추론하기
 *   - 관공서에서 법적 자격을 판단하기
 *
 * 관련 오류:
 *   VISIT_TYPE_MISMATCH · APPOINTMENT_MISMATCH · DEPARTMENT_MISMATCH
 *   AUTH_METHOD_UNAVAILABLE · REQUESTED_SERVICE_MISMATCH
 *   LOW_CONFIDENCE_RECONFIRMATION_REQUIRED
 *
 * 의사코드:
 *   const ranked = survivors.map((c) => ({ c, score: myScore(c, ctx) }))
 *                           .sort((a, b) => b.score - a.score);
 *   return { recommendedCandidateId: ranked[0].c.candidateId, ... };
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function recommend(_candidates: Candidate[], _ctx: SessionContext, _profile: UserProfile): Recommendation {
  return todo("recommend", "후보 순위 결정 및 1순위 추천");
}

/**
 * STEP 6 — explainRecommendation
 *
 * 목적:
 *   왜 이것을 추천했는지 사용자의 말로 설명합니다.
 *
 * 입력:
 *   Recommendation, SessionContext
 *
 * 반환:
 *   string[] — 최소 1개 (진행검사에서 확인합니다)
 *
 * 반드시:
 *   - 사용한 사용자 정보를 밝힐 것
 *   - 외부 맥락(날씨 등)을 썼다면 그 이유도 한 줄 포함할 것
 *   - 제외한 조건도 설명할 것
 *
 * 금지 (이런 문장은 설명이 아닙니다):
 *   "AI가 추천했습니다" · "최적의 선택입니다" · "시스템 판단입니다"
 *
 * 권장:
 *   "포장을 선호하셔서 포장 가능한 메뉴를 먼저 보여드렸습니다."
 *   "등록하신 알레르기와 겹치는 메뉴는 제외했습니다."
 *   "지금 비가 내려 따뜻한 메뉴를 앞에 두었습니다."
 *
 * 관련 오류:
 *   (없음 — 하지만 이유가 비어 있으면 진행검사가 경고합니다)
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function explainRecommendation(_rec: Recommendation, _ctx: SessionContext): string[] {
  return todo("explainRecommendation", "추천 이유 설명 생성");
}

/**
 * STEP 7 — buildAlternatives
 *
 * 목적:
 *   1순위가 사용자의 뜻과 다를 때 돌아갈 길을 만듭니다.
 *
 * 입력:
 *   Candidate[], Recommendation
 *
 * 반환:
 *   string[] — 대안 후보 ID 목록
 *
 * 반드시:
 *   - 대안도 hardConstraints 를 지킬 것
 *   - 화면에 "다른 것 보기" 를 제공할 것
 *
 * 금지:
 *   - 제외된 후보를 대안으로 되살리기
 *
 * 관련 오류:
 *   EXCLUDED_CANDIDATE_NOT_FOUND
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export function buildAlternatives(_candidates: Candidate[], _rec: Recommendation): string[] {
  return todo("buildAlternatives", "대안 후보 목록 구성");
}

/* ═══════════════════════ 3. 승인과 실행계획 ═══════════════════════ */

/**
 * STEP 8 — collectUserDecision
 *
 * 목적:
 *   사용자에게 최종 확인을 받습니다. 자동 추천을 자동 실행으로 잇지 마세요.
 *
 * 입력:
 *   Recommendation
 *
 * 반환:
 *   UserDecision
 *
 * 반드시:
 *   - 수락 / 거절 / 다른 후보 선택 / 다시 입력 경로를 제공할 것
 *   - 거절하면 executionPlan.actions 는 빈 배열
 *   - confirmedAt 을 넣는다면 UTC Z 형식일 것
 *
 * 금지:
 *   - 승인 없이 실행계획 만들기
 *   - "확인" 버튼 없이 바로 진행
 *
 * 관련 오류:
 *   ACTIONS_WITHOUT_APPROVAL · USER_NOT_APPROVED · INVALID_UTC_TIMESTAMP
 *
 * 완료 확인:
 *   npm run participant:progress
 */
export async function collectUserDecision(_rec: Recommendation): Promise<UserDecision> {
  return todo("collectUserDecision", "사용자 승인/거절 수집");
}

/**
 * STEP 9 — buildExecutionPlan
 *
 * 목적:
 *   승인된 결정을 의미 기반 실행계획으로 바꿉니다.
 *
 * 입력:
 *   UserDecision, Recommendation, PublicFixture
 *
 * 반환:
 *   ExecutionPlan
 *
 * 반드시:
 *   - target 은 { kind, id, groupId? } 의미 대상. 좌표·컨트롤 ID 를 쓰지 않습니다
 *   - fixture.transitions 를 따라 expectedBeforeState / expectedAfterState 를 채울 것
 *   - manifest.reviewBoundaryState 에서 멈추고 필수 verifier 를 실행할 것
 *   - 실제로 고른 값이 사용자 맥락과 맞을 것 (Stage B 검증)
 *
 * 금지:
 *   - 결제 · 본인확인 완료 · 행정처리 확정 Action (계획에 넣기만 해도 FAIL)
 *   - 같은 단일선택 옵션 그룹을 서로 다른 값으로 두 번 선택
 *   - 화면 페이지 이동 Action (Driver 가 알아서 넘깁니다)
 *
 * 관련 오류:
 *   SELECTED_VISIT_TYPE_MISMATCH · SELECTED_APPOINTMENT_MISMATCH
 *   SELECTED_DEPARTMENT_MISMATCH · SELECTED_AUTH_METHOD_UNAVAILABLE
 *   SELECTED_QUANTITY_MISMATCH · EXECUTION_REQUIRED_OPTION_MISSING
 *   EXECUTION_OPTION_DUPLICATE · STATE_MISMATCH · MISSING_VERIFIER
 *   BOUNDARY_NOT_REACHED · FORBIDDEN_ACTION
 *
 * 의사코드:
 *   const actions = [];
 *   actions.push({ actionIndex: 0, action: "select_menu",
 *                  target: { kind: "candidate", id: rec.recommendedCandidateId },
 *                  expectedBeforeState, expectedAfterState });
 *   // ... 필수 옵션 그룹을 사용자 선택대로 채움
 *   // ... 마지막에 verifier action
 *
 * 완료 확인:
 *   npm run participant:validate -- --file <출력 JSON> --execute
 */
export function buildExecutionPlan(_decision: UserDecision, _rec: Recommendation, _fixture: PublicFixture): ExecutionPlan {
  return todo("buildExecutionPlan", "의미 기반 실행계획 생성 (경계 전 정지 + verifier)");
}

/* ═══════════════════════════ 조립 ═══════════════════════════ */

/** 위 9단계를 순서대로 엮어 제출물을 만듭니다. 구현 전에는 STEP 1 에서 멈춥니다. */
export async function buildSubmission(fixture: PublicFixture, teamId: string): Promise<ParticipantSubmission> {
  const raw = await collectProfile();
  const profile = mapToCanonicalInput(raw);
  const sessionContext = createSessionContext(raw, fixture);

  const survivors = filterCandidates(fixture.candidates, sessionContext);
  const recommendation = recommend(survivors, sessionContext, profile);
  recommendation.recommendationReasons = explainRecommendation(recommendation, sessionContext);
  recommendation.alternativeCandidateIds = buildAlternatives(survivors, recommendation);

  const userDecision = await collectUserDecision(recommendation);
  const executionPlan = buildExecutionPlan(userDecision, recommendation, fixture);

  return {
    inputContractVersion: "1.0.0",
    submissionVersion: "1.0.0",
    teamId,
    environmentId: fixture.manifest.environmentId,
    profile, sessionContext, recommendation, userDecision, executionPlan,
  } as ParticipantSubmission;
}
