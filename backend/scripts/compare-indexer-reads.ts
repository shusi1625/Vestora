import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { publicClient } from "../src/indexer/chain.js";
import { runIndexerOnce } from "../src/indexer/service.js";
import { rebuildProjections } from "../src/projections/rebuild.js";

// Refuse remote/operational databases before any writes, including cleanup.
const database = new URL(env.databaseUrl);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(database.hostname));
assert.equal(database.searchParams.get("schema"), "phase95_benchmark");
assert.equal(env.indexerSyncId, "phase95-benchmark");
assert.equal(env.indexerBatchSize, 10);
assert.equal(env.indexerMaxBlocksPerCycle, 110);
assert.equal(env.indexerStartBlock, 11849510n);

const originalGetLogs = publicClient.getLogs;
const originalGetBlock = publicClient.getBlock;
const originalGetBlockNumber = publicClient.getBlockNumber;
let mode: "separate" | "merged" = "merged";
let logCalls = 0;
let blockCalls = 0;
let headCalls = 0;

// Keep decoding, timestamp caching and DB work identical to isolate read strategy.
publicClient.getLogs = (async (args: Parameters<typeof originalGetLogs>[0]) => {
  if (mode === "separate" && Array.isArray(args?.address)) {
    const logs = [];
    for (const address of args.address) {
      logCalls++;
      logs.push(...await originalGetLogs({ ...args, address }));
    }
    return logs;
  }
  logCalls++;
  return originalGetLogs(args);
}) as typeof originalGetLogs;

publicClient.getBlock = (async (args: Parameters<typeof originalGetBlock>[0]) => {
  blockCalls++;
  return originalGetBlock(args);
}) as typeof originalGetBlock;

publicClient.getBlockNumber = (async (...args: Parameters<typeof originalGetBlockNumber>) => {
  headCalls++;
  return originalGetBlockNumber(...args);
}) as typeof originalGetBlockNumber;

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value, (key, item) => {
    if (["id", "createdAt", "updatedAt"].includes(key)) return undefined;
    return typeof item === "bigint" ? item.toString() : item;
  })).digest("hex");
}

const results = [];
let expectedEvents: string | undefined;
let expectedProjection: string | undefined;

try {
  for (let pair = 1; pair <= 3; pair++) {
    const order = pair % 2 === 1
      ? ["separate", "merged"] as const
      : ["merged", "separate"] as const;
    for (const strategy of order) {
      mode = strategy;
      // Only the guarded disposable schema is cleared, never AWS or public.
      await prisma.streamEvent.deleteMany();
      await prisma.syncState.deleteMany();
      await prisma.projectionState.deleteMany();
      logCalls = blockCalls = headCalls = 0;
      const cycle = await runIndexerOnce();
      assert.equal(cycle.scannedBlocks, "110");
      assert.equal(cycle.insertedEvents, 5);
      assert.equal(logCalls, strategy === "separate" ? 22 : 11);
      const fetchCounters = { getLogsCalls: logCalls, getBlockCalls: blockCalls, getBlockNumberCalls: headCalls };
      const events = await prisma.streamEvent.findMany({ orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }] });
      const projectionStarted = performance.now();
      await rebuildProjections();
      const projectionMs = performance.now() - projectionStarted;
      const projection = {
        streams: await prisma.streamProjection.findMany({ orderBy: { streamId: "asc" } }),
        listings: await prisma.listingProjection.findMany({ orderBy: { streamId: "asc" } }),
        trades: await prisma.tradeProjection.findMany({ orderBy: { logIndex: "asc" } }),
      };
      const eventHash = fingerprint(events);
      const projectionHash = fingerprint(projection);
      expectedEvents ??= eventHash;
      expectedProjection ??= projectionHash;
      assert.equal(eventHash, expectedEvents);
      assert.equal(projectionHash, expectedProjection);
      const result = { pair, strategy, ...cycle, ...fetchCounters, projectionMs: Number(projectionMs.toFixed(2)), eventHash, projectionHash };
      results.push(result);
      console.log(JSON.stringify({ message: "comparison run complete", ...result }));
    }
  }
  const report = {
    measuredAt: new Date().toISOString(),
    providerHost: new URL(env.sepoliaRpcUrl).hostname,
    scope: "Controlled read-strategy comparison, not a full historical-version benchmark; logical call counts exclude transport retries.",
    databaseScope: "local phase95_benchmark schema; operating cursor unchanged",
    results,
  };
  if (process.env.INDEXER_COMPARISON_OUTPUT) {
    await writeFile(process.env.INDEXER_COMPARISON_OUTPUT, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  publicClient.getLogs = originalGetLogs;
  publicClient.getBlock = originalGetBlock;
  publicClient.getBlockNumber = originalGetBlockNumber;
  await prisma.$disconnect();
}
