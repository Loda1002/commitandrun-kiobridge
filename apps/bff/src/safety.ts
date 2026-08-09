/**
 * Local safety gate. Runs before anything leaves this process for the
 * simulation API.
 *
 * The platform already refuses an unsafe plan — this layer exists so an unsafe
 * plan never gets sent in the first place, and so the web app has a machine
 * readable reason to show the user instead of a raw upstream error.
 *
 * It never rewrites a submission. A violation stops the request.
 */
import { FORBIDDEN_ACTIONS } from "@commitandrun/engine";

export interface SafetyViolation {
  /** Stable code the web app switches on. */
  code:
    | "FORBIDDEN_ACTION_PLANNED"
    | "SAFETY_FLAG_TAMPERED"
    | "ACTIONS_WITHOUT_APPROVAL"
    | "COORDINATE_IN_PLAN"
    | "MALFORMED_SUBMISSION";
  /** Korean sentence the web app may show as-is. */
  message: string;
  /** JSON Pointer into the submission, when one applies. */
  path?: string;
}

/** Keys that carry pixel positions or platform control ids. The plan is semantic. */
const POSITIONAL_KEYS = ["x", "y", "left", "top", "coordinate", "coordinates", "automationId", "controlId"];

interface PlannedActionShape {
  action?: unknown;
  target?: Record<string, unknown>;
}

interface SubmissionShape {
  userDecision?: { approved?: unknown };
  executionPlan?: {
    validationMode?: unknown;
    executionEnvironment?: unknown;
    actualDeviceCommandSent?: unknown;
    actions?: unknown;
  };
}

/**
 * @returns every violation found. Empty array means the submission may be sent.
 */
export function inspectSubmission(submission: unknown): SafetyViolation[] {
  const out: SafetyViolation[] = [];

  if (!submission || typeof submission !== "object") {
    return [{ code: "MALFORMED_SUBMISSION", message: "제출 본문이 객체가 아닙니다." }];
  }

  const plan = (submission as SubmissionShape).executionPlan;
  if (!plan || typeof plan !== "object") {
    return [{ code: "MALFORMED_SUBMISSION", message: "executionPlan 이 없습니다.", path: "/executionPlan" }];
  }

  // 1. The three flags this hackathon is judged on. Any other value is tampering.
  if (plan.validationMode !== "SIMULATION_ONLY") {
    out.push({
      code: "SAFETY_FLAG_TAMPERED",
      message: "validationMode 는 SIMULATION_ONLY 여야 합니다.",
      path: "/executionPlan/validationMode",
    });
  }
  if (plan.executionEnvironment !== "DIGITAL_TWIN") {
    out.push({
      code: "SAFETY_FLAG_TAMPERED",
      message: "executionEnvironment 는 DIGITAL_TWIN 이어야 합니다.",
      path: "/executionPlan/executionEnvironment",
    });
  }
  if (plan.actualDeviceCommandSent !== false) {
    out.push({
      code: "SAFETY_FLAG_TAMPERED",
      message: "actualDeviceCommandSent 는 false 여야 합니다.",
      path: "/executionPlan/actualDeviceCommandSent",
    });
  }

  const actions: PlannedActionShape[] = Array.isArray(plan.actions) ? plan.actions : [];

  // 2. Approval precedes any planned action.
  if (actions.length > 0 && (submission as SubmissionShape).userDecision?.approved !== true) {
    out.push({
      code: "ACTIONS_WITHOUT_APPROVAL",
      message: "사용자가 승인하기 전에는 실행계획을 보낼 수 없습니다.",
      path: "/userDecision/approved",
    });
  }

  // 3. Deny-list check. A planned payment or finalisation action fails the
  //    submission even when the platform would have blocked it.
  const denied = new Set<string>(FORBIDDEN_ACTIONS);
  actions.forEach((step, i) => {
    const name = typeof step?.action === "string" ? step.action : "";
    if (denied.has(name)) {
      out.push({
        code: "FORBIDDEN_ACTION_PLANNED",
        message: `계획에 넣을 수 없는 동작입니다: ${name}`,
        path: `/executionPlan/actions/${i}/action`,
      });
    }

    const target = step?.target;
    if (target && typeof target === "object") {
      for (const key of POSITIONAL_KEYS) {
        if (key in target) {
          out.push({
            code: "COORDINATE_IN_PLAN",
            message: `실행계획은 좌표·컨트롤 ID 를 담을 수 없습니다: ${key}`,
            path: `/executionPlan/actions/${i}/target/${key}`,
          });
        }
      }
    }
  });

  return out;
}

/** Counts the web app's safety report panel renders without re-deriving them. */
export function safetySummary(submission: unknown) {
  const violations = inspectSubmission(submission);
  const plan = (submission as SubmissionShape | null)?.executionPlan;
  return {
    safe: violations.length === 0,
    violations,
    plannedActionCount: Array.isArray(plan?.actions) ? plan.actions.length : 0,
    plannedForbiddenActionCount: violations.filter((v) => v.code === "FORBIDDEN_ACTION_PLANNED").length,
    validationMode: plan?.validationMode ?? null,
    executionEnvironment: plan?.executionEnvironment ?? null,
    actualDeviceCommandSent: plan?.actualDeviceCommandSent ?? null,
  };
}
