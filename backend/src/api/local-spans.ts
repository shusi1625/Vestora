import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { FastifyInstance, FastifyRequest } from "fastify";

export const localApiSpansEnabled = process.env.LOCAL_API_SPANS === "true";

const spanNames = [
  "api.request", "api.before_handler", "api.handler", "api.serialize", "api.send",
  "freshness.rpc", "snapshot.acquire", "snapshot.transaction", "snapshot.callback",
  "snapshot.domain", "sync.state", "sync.projection",
  "query.stream.find_many", "query.stream.find_unique", "query.stream.count",
  "query.listing.find_many", "query.listing.find_unique", "query.listing.group_by",
  "query.claim.find_many", "query.trade.find_many", "query.trade.count",
  "metrics.hit", "metrics.new", "metrics.join", "metrics.collection",
  "metrics.indexer", "metrics.database",
] as const;
type SpanName = typeof spanNames[number];
type SpanStatus = "ok" | "error" | "aborted" | "timeout";
type SpanRecord = {
  route: string;
  requestId: string;
  span: SpanName;
  durationMs: number;
  status: SpanStatus;
};
type SpanContext = {
  route: string;
  requestId: string;
  emit: (record: SpanRecord) => void;
  active: ReadonlySet<SpanName>;
};
const allowedSpans = new Set<string>(spanNames);
const storage = new AsyncLocalStorage<SpanContext>();
const routeLabels: Record<string, string> = {
  "/health": "health", "/metrics": "metrics", "/streams": "streams.list",
  "/streams/:streamId": "streams.detail", "/listings": "listings.list",
  "/market/stats": "market.stats", "/users/:address/streams": "users.streams",
  "/users/:address/trades": "users.trades",
};

function startSpan(context: SpanContext, name: SpanName) {
  const startedAt = performance.now();
  let ended = false;
  return (status: SpanStatus = "ok") => {
    if (ended) return;
    ended = true;
    try {
      context.emit({
        route: context.route,
        requestId: context.requestId,
        span: name,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        status,
      });
    } catch {
      // Diagnostics must not turn a successful read into an API failure.
    }
  };
}

export function startLocalSpan(name: SpanName) {
  const context = storage.getStore();
  return localApiSpansEnabled && context && allowedSpans.has(name)
    ? startSpan(context, name)
    : (_status: SpanStatus = "ok") => {};
}

export async function withLocalSpan<T>(name: SpanName, read: () => T | PromiseLike<T>): Promise<T> {
  const context = storage.getStore();
  if (!localApiSpansEnabled || !context || !allowedSpans.has(name) || context.active.has(name)) {
    return await read();
  }
  const finish = startSpan(context, name);
  // A child gets its own set: siblings remain independent, re-entrant names do not duplicate.
  return storage.run({ ...context, active: new Set([...context.active, name]) }, async () => {
    try {
      const result = await read();
      finish();
      return result;
    } catch (error) {
      finish("error");
      throw error;
    }
  });
}

export function registerLocalApiSpans(app: FastifyInstance) {
  if (!localApiSpansEnabled) return;
  type Trace = {
    finishRequest: (status?: SpanStatus) => void;
    finishPhase: (status?: SpanStatus) => void;
    context: SpanContext;
    failed: boolean;
    phase: SpanName;
  };
  const requests = new WeakMap<FastifyRequest, Trace>();
  function transition(request: FastifyRequest, name: SpanName) {
    const trace = requests.get(request);
    if (!trace || trace.phase === name) return;
    trace.finishPhase(trace.failed ? "error" : "ok");
    trace.finishPhase = startSpan(trace.context, name);
    trace.phase = name;
  }
  function complete(request: FastifyRequest, status: SpanStatus) {
    const trace = requests.get(request);
    if (!trace) return;
    trace.finishPhase(status);
    trace.finishRequest(status);
    requests.delete(request);
  }
  app.addHook("onRequest", (request, reply, done) => {
    const context: SpanContext = {
      route: routeLabels[request.routeOptions.url ?? ""] ?? "unmatched",
      requestId: request.id,
      emit: (record) => app.log.info(record, "local api span"),
      active: new Set(),
    };
    requests.set(request, {
      context, failed: false, phase: "api.before_handler",
      finishRequest: startSpan(context, "api.request"),
      finishPhase: startSpan(context, "api.before_handler"),
    });
    reply.header("x-request-id", request.id);
    // Run Fastify's continuation inside ALS; enterWith would leak into sibling requests.
    storage.run(context, done);
  });
  app.addHook("preHandler", (request, _reply, done) => {
    transition(request, "api.handler");
    done();
  });
  app.addHook("preSerialization", (request, _reply, payload, done) => {
    transition(request, "api.serialize");
    done(null, payload);
  });
  app.addHook("onSend", (request, _reply, payload, done) => {
    transition(request, "api.send");
    done(null, payload);
  });
  app.addHook("onError", (request, _reply, _error, done) => {
    const trace = requests.get(request);
    if (trace) trace.failed = true;
    done();
  });
  app.addHook("onResponse", (request, reply, done) => {
    complete(request, reply.statusCode >= 400 || requests.get(request)?.failed ? "error" : "ok");
    done();
  });
  app.addHook("onTimeout", (request, _reply, done) => {
    complete(request, "timeout");
    done();
  });
  app.addHook("onRequestAbort", (request, done) => {
    complete(request, "aborted");
    done();
  });
}
