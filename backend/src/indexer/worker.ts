import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { rebuildProjections } from "../projections/rebuild.js";
import { runIndexerOnce } from "./service.js";

let stopping = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  while (!stopping) {
    try {
      const result = await runIndexerOnce();
      const projection =
        result.insertedEvents > 0 ? await rebuildProjections() : null;

      console.log(
        JSON.stringify({
          level: "info",
          message: "indexer cycle completed",
          result,
          projection,
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "indexer cycle failed",
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
