import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { performance } from "node:perf_hooks";

import { ApiError, sendApiError, sendInternalError } from "./api/errors.js";
import { registerApiRoutes } from "./api/routes/index.js";
import { env } from "./config/env.js";
import { checkDatabaseConnection, prisma } from "./db/prisma.js";
import { getIndexerMetrics } from "./indexer/metrics.js";

const startedAt = Date.now();
const requestStartTimes = new WeakMap<object, number>();

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.logLevel,
    },
  });

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

    app.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTimeMs:
          responseTimeMs === null ? null : Number(responseTimeMs.toFixed(2)),
      },
      "api response",
    );
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return sendApiError(reply, error);
    }

    app.log.error({ error }, "unhandled api error");

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
      app.log.error({ error }, "health check failed");

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
    return {
      service: "vestora-backend",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      phase: "event-indexer",
      indexer: await getIndexerMetrics(),
      timestamp: new Date().toISOString(),
    };
  });

  void app.register(registerApiRoutes);

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
