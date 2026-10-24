import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const PUBLIC_READ_LIMITS = {
  perIp: 90,
  total: 300,
  windowMs: 60_000,
  concurrent: 2,
} as const;

const publicPath = /^\/(?:health|streams(?:\/[1-9]\d{0,77})?|users\/0x[\da-fA-F]{40}\/trades)$/;
const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function readPublicReadMode(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("PUBLIC_READ_MODE must be true or false");
}

type Limits = { perIp: number; total: number; windowMs: number; concurrent: number };

/** Single-process demo guard. Not a distributed limiter or a DDoS/cost guarantee. */
export function registerPublicReadProtection(
  app: FastifyInstance,
  enabled: boolean,
  limits: Limits = PUBLIC_READ_LIMITS,
) {
  if (!enabled) return;
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid public read limits");
  }

  app.register(rateLimit, { global: false, cache: 1_000, skipOnError: false });
  let total: ReturnType<FastifyInstance["createRateLimit"]>;
  let perIp: ReturnType<FastifyInstance["createRateLimit"]>;
  let active = 0;
  const admitted = new WeakSet<FastifyRequest>();

  app.addHook("onReady", async () => {
    total = app.createRateLimit({ max: limits.total, timeWindow: limits.windowMs, keyGenerator: () => "all" });
    perIp = app.createRateLimit({
      max: limits.perIp, timeWindow: limits.windowMs,
      keyGenerator: (request) => request.raw.socket.remoteAddress ?? "unknown",
    });
  });

  const reject = (reply: FastifyReply, status: number, code: string) =>
    reply.code(status).send({ error: { code, message: "Request is not available" } });

  app.addHook("onRequest", async (request, reply) => {
    reply.headers({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "x-vestora-read-policy": "public-v1",
    });

    // Only the container's real loopback health probe bypasses public budgets.
    if (request.method === "GET" && request.raw.url === "/health" &&
        loopback.has(request.raw.socket.remoteAddress ?? "")) return;

    for (const check of [total, perIp]) {
      const state = await check(request);
      if (!state.isAllowed && state.isExceeded) {
        reply.header("retry-after", Math.max(1, state.ttlInSeconds));
        return reject(reply, 429, "RATE_LIMITED");
      }
    }
    if (request.method !== "GET") {
      reply.header("allow", "GET");
      return reject(reply, 405, "METHOD_NOT_ALLOWED");
    }
    // Match the raw URL: queries, encodings, dot segments and extra slashes are not accepted.
    if (!publicPath.test(request.raw.url ?? "")) return reject(reply, 404, "NOT_FOUND");
    if (request.headers["transfer-encoding"] ||
        (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) {
      return reject(reply, 413, "BODY_NOT_ALLOWED");
    }
    if (active >= limits.concurrent) {
      reply.header("retry-after", "1");
      return reject(reply, 503, "READ_CAPACITY_REACHED");
    }
    active++;
    admitted.add(request);
  });

  const release = (request: FastifyRequest) => {
    if (admitted.delete(request)) active--;
  };
  // Do not release on client abort while a DB/RPC operation could still be running.
  app.addHook("onSend", async (request, _reply, payload) => { release(request); return payload; });
  app.addHook("onResponse", async (request) => { release(request); });
}
