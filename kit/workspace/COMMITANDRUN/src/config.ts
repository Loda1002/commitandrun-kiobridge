/** 팀 설정. init 이 만든 participant.config.json 과 함께 쓰세요. */
export const TEAM_CONFIG = {
  teamId: "TEAM-001",
  environmentId: "sandbox",
  /** 외부 API 는 없어도 기본 흐름이 동작해야 합니다. */
  externalApi: {
    enabled: false,
    timeoutMs: 2000,
    /** 실패하면 맥락 없이 진행합니다. 오래된 값으로 자동 실행하지 마세요. */
    fallback: "PROCEED_WITHOUT_CONTEXT" as const,
    cacheTtlMs: 10 * 60 * 1000,
  },
} as const;
