import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { recoverProjections } from "../projections/rebuild.js";
import { runIndexerOnce } from "./service.js";

let stopping = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  let failures = 0;
  while (!stopping) {
    let stage = "startup_projection_recovery";
    try {
      await recoverProjections();
      stage = "ingestion";
      const result = await runIndexerOnce();
      stage = "projection_recovery";
      const projection = await recoverProjections();
      failures = 0;

      console.log(
        JSON.stringify({
          level: "info",
          message: "indexer cycle completed",
          result,
          projection,
        }),
      );
    } catch (error) {
      failures += 1;
      console.error(
        JSON.stringify({
          level: "error",
          message: "indexer cycle failed",
          stage,
          consecutiveFailures: failures,
          retryInMs: env.indexerPollIntervalMs,
          error: error instanceof Error ? error.message : "unknown error",
        }),
      );
    }

    if (!stopping) {
      await wait(env.indexerPollIntervalMs);
    }
  }
}

function stop(signal: string) {
  console.log(
    JSON.stringify({
      level: "info",
      message: "stopping indexer",
      signal,
    }),
  );

  stopping = true;
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

try {
  await runLoop();
} finally {
  await prisma.$disconnect();
}
