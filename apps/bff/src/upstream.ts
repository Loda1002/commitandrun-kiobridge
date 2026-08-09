/**
 * Client for the official KioBridge simulation API.
 *
 * That API is a platform file — we never modify it and never re-implement what
 * it does. This module only speaks HTTP to it.
 */
const BASE = (process.env.SIM_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`simulation-api ${status}`);
  }
}

async function call<T>(method: "GET" | "POST", route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* upstream returned non-JSON; hand the raw text to the caller */
  }

  if (!res.ok) throw new UpstreamError(res.status, parsed);
  return parsed as T;
}

export const upstream = {
  baseUrl: BASE,

  health: () => call<{ status: string; productVersion: string }>("GET", "/health"),

  environments: () => call<unknown[]>("GET", "/api/v1/environments"),

  fixture: (environmentId: string) =>
    call<unknown>("GET", `/api/v1/environments/${encodeURIComponent(environmentId)}/fixture`),

  compatibilityRules: (environmentId: string) =>
    call<unknown>("GET", `/api/v1/environments/${encodeURIComponent(environmentId)}/compatibility-rules`),

  createSession: (environmentId: string) =>
    call<{ sessionId: string }>("POST", "/api/v1/sessions", { environmentId }),

  submit: (sessionId: string, submission: unknown) =>
    call<unknown>("POST", `/api/v1/sessions/${sessionId}/submission`, submission),

  validate: (sessionId: string) =>
    call<{ valid: boolean; errors?: unknown[] }>("POST", `/api/v1/sessions/${sessionId}/validate`),

  execute: (sessionId: string) =>
    call<{ valid: boolean; run?: unknown; evidence?: unknown; validation?: unknown }>(
      "POST",
      `/api/v1/sessions/${sessionId}/execute`,
    ),

  /** Drives the live safety demo screen. `code` is a platform SafetyErrorCode. */
  injectError: (sessionId: string, code: string) =>
    call<{ valid: boolean; injected?: string; run?: unknown; evidence?: unknown; validation?: unknown }>(
      "POST",
      `/api/v1/sessions/${sessionId}/error-injection`,
      { code },
    ),
};
