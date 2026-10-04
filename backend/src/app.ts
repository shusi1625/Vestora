import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { env } from "./config/env.js";
import { checkDatabaseConnection, prisma } from "./db/prisma.js";
import { getIndexerMetrics } from "./indexer/metrics.js";

const startedAt = Date.now();

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.logLevel,
    },
  });

  app.register(cors, {
    origin: true,
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

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  return app;
}
