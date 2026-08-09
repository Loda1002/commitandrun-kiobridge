/**
 * COMMITANDRUN BFF — the only server our web app talks to.
 *
 * Why it exists: the official simulation API needs five calls in order
 * (session → submission → validate → execute → evidence) and the browser
 * should not orchestrate that, nor should the browser be trusted to run the
 * safety gate. One POST /api/run in, one result out.
 *
 * This process never executes anything on a real device. It forwards a plan to
 * the digital-twin simulator and returns what the simulator reports.
 */
import cors from "@fastify/cors";
import Fastify from "fastify";
import { ENVIRONMENT_BOUNDARY } from "@commitandrun/engine";
import { safetySummary } from "./safety.js";
import { UpstreamError, upstream } from "./upstream.js";

const PORT = Number(process.env.PORT ?? 5174);
const HOST = process.env.HOST ?? "0.0.0.0";
/** Comma-separated list, or "*" while developing. */
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN ?? "*";

const OFFICIAL_ENVIRONMENTS = new Set(Object.keys(ENVIRONMENT_BOUNDARY));

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

await app.register(cors, {
  origin: ALLOWED_ORIGINS === "*" ? true : ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
});

/** Upstream failures are reported as upstream failures, never as our own 500. */
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof UpstreamError) {
    return reply.code(502).send({
      error: "UPSTREAM_ERROR",
      message: "시뮬레이션 서버가 요청을 거절했습니다.",
      upstreamStatus: err.status,
      upstreamBody: err.body,
    });
  }
  // Fastify 5 hands the error in as `unknown`. Narrow once, then read it.
  const { code, message } = (err ?? {}) as { code?: string; message?: string };
  if (code === "ECONNREFUSED" || (message ?? "").includes("fetch failed")) {
    return reply.code(503).send({
      error: "UPSTREAM_UNREACHABLE",
      message: "시뮬레이션 서버에 연결하지 못했습니다.",
      simApiUrl: upstream.baseUrl,
    });
  }
  app.log.error(err);
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: message ?? "unknown error" });
});

function assertEnvironment(id: string): void {
  if (!OFFICIAL_ENVIRONMENTS.has(id)) {
    throw Object.assign(new Error(`알 수 없는 환경: ${id}`), { statusCode: 400 });
  }
}

/* ── health ─────────────────────────────────────────────────────────────── */

app.get("/health", async () => {
  let sim: unknown = null;
  let simReachable = true;
  try {
    sim = await upstream.health();
  } catch {
    simReachable = false;
  }
  return { status: "ok", service: "commitandrun-bff", simApiUrl: upstream.baseUrl, simReachable, sim };
});

/* ── read-only environment data the web app renders ─────────────────────── */

app.get("/api/environments", async () => upstream.environments());

app.get<{ Params: { id: string } }>("/api/environments/:id/fixture", async (req) => {
  assertEnvironment(req.params.id);
  return upstream.fixture(req.params.id);
});

app.get<{ Params: { id: string } }>("/api/environments/:id/compatibility-rules", async (req) => {
  assertEnvironment(req.params.id);
  return upstream.compatibilityRules(req.params.id);
});

/* ── safety ─────────────────────────────────────────────────────────────── */

/**
 * Local gate only — nothing is sent upstream. The final-confirmation screen
 * calls this to render the safety panel before the user approves.
 */
app.post<{ Body: { submission?: unknown } }>("/api/submissions/preflight", async (req, reply) => {
  const summary = safetySummary(req.body?.submission);
  return reply.code(summary.safe ? 200 : 422).send(summary);
});

/* ── the one call that matters ──────────────────────────────────────────── */

interface RunBody {
  environmentId?: string;
  submission?: unknown;
  /** Live safety demo: a platform SafetyErrorCode to inject instead of a clean run. */
  injectError?: string;
}

/**
 * Safety gate → session → submission → validate → execute.
 * A submission that fails our own gate is never forwarded.
 */
app.post<{ Body: RunBody }>("/api/run", async (req, reply) => {
  const { environmentId, submission, injectError } = req.body ?? {};

  if (!environmentId) return reply.code(400).send({ error: "environmentId 가 필요합니다." });
  assertEnvironment(environmentId);

  const safety = safetySummary(submission);
  if (!safety.safe) {
    return reply.code(422).send({
      error: "SAFETY_GATE_BLOCKED",
      message: "안전 검사를 통과하지 못해 시뮬레이터로 보내지 않았습니다.",
      safety,
    });
  }

  const session = await upstream.createSession(environmentId);
  await upstream.submit(session.sessionId, submission);
  const validation = await upstream.validate(session.sessionId);

  if (!validation.valid) {
    return reply.code(422).send({
      error: "CONTRACT_VALIDATION_FAILED",
      message: "제출물이 계약 검증을 통과하지 못했습니다.",
      sessionId: session.sessionId,
      safety,
      validation,
    });
  }

  const executed = injectError
    ? await upstream.injectError(session.sessionId, injectError)
    : await upstream.execute(session.sessionId);

  return {
    sessionId: session.sessionId,
    injectedError: injectError ?? null,
    safety,
    validation,
    run: executed.run ?? null,
    evidence: executed.evidence ?? null,
  };
});

await app.listen({ port: PORT, host: HOST });
app.log.info(`SIMULATION_ONLY BFF · upstream ${upstream.baseUrl}`);
