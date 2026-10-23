import cors from "@fastify/cors";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";

import { ApiError, sendApiError, sendInternalError } from "./api/errors.js";
import { localApiSpansEnabled, registerLocalApiSpans, withLocalSpan } from "./api/local-spans.js";
import { getApiMetrics, recordApiResponse } from "./api/request-metrics.js";
import { registerApiRoutes } from "./api/routes/index.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection, prisma } from "./db/prisma.js";
import { getDatabaseMetrics } from "./db/metrics.js";
import { getIndexerMetrics } from "./indexer/metrics.js";

const startedAt = Date.now();
const requestStartTimes = new WeakMap<object, number>();

type OperationalMetrics = {
  indexer: Awaited<ReturnType<typeof getIndexerMetrics>>;
  database: Awaited<ReturnType<typeof getDatabaseMetrics>>;
  collectedAt: string;
  expiresAtMs: number;
};

let operationalMetricsCache: OperationalMetrics | null = null;
let pendingOperationalMetrics: Promise<OperationalMetrics> | null = null;

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

async function collectOperationalMetrics() {
  return withLocalSpan("metrics.collection", async () => {
    const [indexer, database] = await Promise.all([
      withLocalSpan("metrics.indexer", () => getIndexerMetrics()),
      withLocalSpan("metrics.database", () => getDatabaseMetrics()),
    ]);
    const now = Date.now();

    return {
      indexer,
      database,
      collectedAt: new Date(now).toISOString(),
      expiresAtMs: now + env.indexerMetricsCacheTtlMs,
    } satisfies OperationalMetrics;
  });
}

async function getCachedOperationalMetrics() {
  const now = Date.now();

  if (operationalMetricsCache && operationalMetricsCache.expiresAtMs > now) {
    const metrics = operationalMetricsCache;
    return withLocalSpan("metrics.hit", () => ({
      cacheHit: true,
      metrics,
    }));
  }

  return withLocalSpan(pendingOperationalMetrics ? "metrics.join" : "metrics.new", async () => {
    pendingOperationalMetrics ??= collectOperationalMetrics().finally(() => {
      pendingOperationalMetrics = null;
    });

    operationalMetricsCache = await pendingOperationalMetrics;

    return {
      cacheHit: false,
      metrics: operationalMetricsCache,
    };
  });
}

export function buildApp(): FastifyInstance {
  const app = Fastify({
    ...(localApiSpansEnabled ? {
      logController: new LogController({ disableRequestLogging: true }),
    } : {}),
    logger: {
      level: env.logLevel,
    },
  });

  registerLocalApiSpans(app);

  app.register(cors, {
    origin: true,
  });

  app.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, performance.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAtMs = requestStartTimes.get(request);
    const responseTimeMs =
      startedAtMs === undefined ? null : performance.now() - startedAtMs;
    const roundedResponseTimeMs =
      responseTimeMs === null ? null : Number(responseTimeMs.toFixed(2));

    if (roundedResponseTimeMs !== null) {
      recordApiResponse({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: roundedResponseTimeMs,
      });
    }

    if (!localApiSpansEnabled) app.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs: roundedResponseTimeMs,
      },
      "api response",
    );
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return sendApiError(reply, error);
    }

    if (!localApiSpansEnabled) app.log.error({ error }, "unhandled api error");

    return sendInternalError(reply);
  });

  app.get("/health", async (_request, reply) => {
    try {
      await checkDatabaseConnection();

      return {
        status: "ok",
        service: "vestora-backend",
        layer: "indexing-analytics",
        database: "ok",
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (!localApiSpansEnabled) app.log.error({ error }, "health check failed");

      return reply.code(503).send({
        status: "degraded",
        service: "vestora-backend",
        layer: "indexing-analytics",
        database: "error",
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.get("/metrics", async () => {
    const { cacheHit, metrics } = await getCachedOperationalMetrics();
    const cacheAgeMs = Math.max(
      0,
      Date.now() -
        (metrics.expiresAtMs - env.indexerMetricsCacheTtlMs),
    );

    return {
      service: "vestora-backend",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      phase: "event-indexer",
      indexer: metrics.indexer,
      api: getApiMetrics(),
      database: metrics.database,
      cache: {
        operationalMetricsHit: cacheHit,
        operationalMetricsTtlMs: env.indexerMetricsCacheTtlMs,
        operationalMetricsAgeMs: roundMetric(cacheAgeMs),
        operationalMetricsCollectedAt: metrics.collectedAt,
        operationalMetricsExpiresAt: new Date(metrics.expiresAtMs).toISOString(),
      },
      timestamp: new Date().toISOString(),
    };
  });

  void app.register(registerApiRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
