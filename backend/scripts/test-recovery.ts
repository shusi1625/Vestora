import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";

// Refuse any database except the disposable local integration-test schema.
const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "5433");
assert.equal(url.pathname, "/vestora");
assert.equal(url.searchParams.get("schema"), "phase96_test");
process.env.INDEXER_SYNC_ID = "phase96-test";
process.env.INDEXER_START_BLOCK = "100";
process.env.SEPOLIA_RPC_URL = "http://127.0.0.1:1";
const { prisma } = await import("../src/db/prisma.js");
const { env } = await import("../src/config/env.js");
const { publicClient } = await import("../src/indexer/chain.js");
const { recoverProjections, rebuildProjections } = await import("../src/projections/rebuild.js");
const { withWriterTransaction, WriterBusyError } = await import("../src/db/writer.js");
const { getProjectionSyncContext, withProjectionSnapshot } = await import("../src/api/sync-context.js");
const { streamComputedValues, listingComputedValues } = await import("../src/api/serializers.js");
const { runIndexerOnce } = await import("../src/indexer/service.js");
const at = new Date("2026-01-01T00:00:00Z");
const account = "0x1111111111111111111111111111111111111111";
const originalHead = publicClient.getBlockNumber;
publicClient.getBlockNumber = async () => { throw new Error("simulated RPC outage"); };
try {
  await prisma.$transaction([
    prisma.tradeProjection.deleteMany(), prisma.claimProjection.deleteMany(),
    prisma.listingProjection.deleteMany(), prisma.streamProjection.deleteMany(),
    prisma.streamEvent.deleteMany(), prisma.syncState.deleteMany(), prisma.projectionState.deleteMany(),
  ]);
  await prisma.syncState.create({ data: { id: env.indexerSyncId, chainId: env.sepoliaChainId, latestIndexedBlock: 100n, latestIndexedBlockTimestamp: at } });
  const event = await prisma.streamEvent.create({ data: {
    chainId: env.sepoliaChainId, contractAddress: env.receivableStreamAddress.toLowerCase(),
    eventName: "StreamCreated", blockNumber: 100n, blockHash: "0x01", transactionHash: "0x01", logIndex: 0, streamId: 1n, blockTimestamp: at,
    payload: { sender: account, recipient: account, token: account, depositedAmount: "1000000", startTime: "1767225600", endTime: "1767226600", cancelable: false },
  } });
  const before = await getProjectionSyncContext();
  assert.equal(before.estimateAt, null);
  assert.equal(before.latestProjectedBlock, null);
  await recoverProjections();
  const first = await prisma.streamEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.ok(first.firstProjectedAt);
  assert.equal(await prisma.streamProjection.count(), 1);
  assert.equal(await recoverProjections(), null);
  await rebuildProjections();
  assert.deepEqual((await prisma.streamEvent.findUniqueOrThrow({ where: { id: event.id } })).firstProjectedAt, first.firstProjectedAt);
  console.log("PASS: restart recovery without new events; repeat replay preserves first application");

  await prisma.syncState.update({ where: { id: env.indexerSyncId }, data: { latestIndexedBlock: 101n } });
  const bad = await prisma.streamEvent.create({ data: { ...event, id: undefined, eventName: "StreamClaimed", blockNumber: 101n, transactionHash: "0x02", payload: {} } });
  await assert.rejects(recoverProjections(), /payload.amount/);
  assert.equal((await prisma.projectionState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestProjectedBlock, 100n);
  assert.equal(await prisma.streamProjection.count(), 1);
  assert.equal((await prisma.streamEvent.findUniqueOrThrow({ where: { id: bad.id } })).firstProjectedAt, null);
  await prisma.streamEvent.delete({ where: { id: bad.id } });
  await recoverProjections();
  assert.equal((await prisma.projectionState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestProjectedBlock, 101n);
  console.log("PASS: failed rebuild rolls back, then empty range retries successfully");

  await withWriterTransaction(async () => {
    await assert.rejects(withWriterTransaction(async () => undefined), WriterBusyError);
  });
  console.log("PASS: concurrent writer is rejected");

  const context = await getProjectionSyncContext();
  assert.equal(context.status, "rpc_error");
  assert.deepEqual(context.estimateAt, at);
  await withProjectionSnapshot(async (tx, snapshot) => {
    const beforeRow = await tx.streamProjection.findUniqueOrThrow({ where: { streamId: 1n } });
    await prisma.$transaction([
      prisma.projectionState.update({ where: { id: env.indexerSyncId }, data: { latestProjectedBlock: 102n } }),
      prisma.streamProjection.update({ where: { streamId: 1n }, data: { withdrawnAmount: "1" } }),
    ]);
    assert.equal((await tx.projectionState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestProjectedBlock.toString(), snapshot.latestProjectedBlock);
    assert.equal((await tx.streamProjection.findUniqueOrThrow({ where: { streamId: 1n } })).withdrawnAmount, beforeRow.withdrawnAmount);
  });
  await prisma.streamProjection.update({ where: { streamId: 1n }, data: { withdrawnAmount: "0" } });
  console.log("PASS: RPC outage preserves verified time; repeatable read keeps checkpoint snapshot");
  publicClient.getBlockNumber = async () => { throw new Error("simulated RPC outage"); };
  const { buildApp } = await import("../src/app.js");
  const app = buildApp();
  try {
    for (const route of ["/streams", "/streams/1", "/listings", "/market/stats", `/users/${account}/streams`, `/users/${account}/trades`]) {
      const response = await app.inject({ method: "GET", url: route });
      assert.equal(response.statusCode, 200, route);
      assert.equal(response.json().meta.projection.latestProjectedBlock, "102");
      assert.equal(response.json().meta.projection.estimateAt, at.toISOString());
    }
    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    assert.equal(metrics.statusCode, 200);
    assert.equal(metrics.json().indexer.latestProjectedBlock, "102");
    assert.equal(metrics.json().indexer.events.latestEvent.firstProjectedAt, first.firstProjectedAt.toISOString());
  } finally { await app.close(); }
  console.log("PASS: all projection API routes and metrics expose verified checkpoints during RPC outage");

  const stream = await prisma.streamProjection.findUniqueOrThrow({ where: { streamId: 1n } });
  assert.equal(streamComputedValues(stream, null).claimableEstimate, null);
  const listing = { streamId: 1n, seller: account, price: "2000000", status: "ACTIVE" as const, listedAt: at, soldAt: null, canceledAt: null, invalidatedAt: null, buyer: null, listingTxHash: "0x03", boughtTxHash: null, canceledTxHash: null, invalidatedTxHash: null, updatedAt: at };
  const values = listingComputedValues(listing, stream, at);
  assert.equal(values.discountAmount, "0");
  assert.equal(values.expectedYieldBps, -5000);
  assert.equal(listingComputedValues({ ...listing, price: "0" }, stream, at).expectedYieldBps, null);
  console.log("PASS: unavailable estimates, signed yield and undefined zero-price ratio");

  publicClient.getBlockNumber = async () => 104n;
  const originalLogs = publicClient.getLogs;
  const originalBlock = publicClient.getBlock;
  publicClient.getLogs = async () => [];
  publicClient.getBlock = (async () => ({ timestamp: BigInt(at.getTime() / 1000) })) as typeof publicClient.getBlock;
  try {
    const results = await Promise.allSettled([runIndexerOnce(), runIndexerOnce()]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal((await prisma.syncState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestIndexedBlock, 102n);
    assert.equal((await runIndexerOnce()).scannedBlocks, "0");
  } finally {
    publicClient.getLogs = originalLogs;
    publicClient.getBlock = originalBlock;
  }
  console.log("PASS: overlapping ingestion cycles cannot regress checkpoint; empty retry is idempotent");
  const savedBlock = publicClient.getBlock;
  await prisma.projectionState.deleteMany();
  await prisma.syncState.update({ where: { id: env.indexerSyncId }, data: { latestIndexedBlockTimestamp: null } });
  publicClient.getBlock = (async ({ blockNumber }: { blockNumber: bigint }) => {
    assert.equal(blockNumber, 102n);
    return { timestamp: BigInt(at.getTime() / 1000) };
  }) as typeof publicClient.getBlock;
  try {
    await recoverProjections();
    assert.deepEqual((await prisma.syncState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestIndexedBlockTimestamp, at);
  } finally { publicClient.getBlock = savedBlock; }
  console.log("PASS: legacy checkpoint bootstraps timestamp from its exact block without resetting events");
  const beyondBound = await prisma.streamEvent.create({ data: { ...event, id: undefined, blockNumber: 1000n, transactionHash: "0xfuture", payload: {} } });
  await rebuildProjections();
  assert.equal((await prisma.streamEvent.findUniqueOrThrow({ where: { id: beyondBound.id } })).firstProjectedAt, null);
  assert.equal((await prisma.projectionState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestProjectedBlock, 102n);
  await prisma.streamEvent.delete({ where: { id: beyondBound.id } });
  console.log("PASS: replay excludes events beyond captured ingestion bound");

  await prisma.projectionState.update({ where: { id: env.indexerSyncId }, data: { latestProjectedBlock: 101n } });
  const require = createRequire(import.meta.url);
  const child = spawn(process.execPath, [require.resolve("tsx/cli"), "src/indexer/worker.ts"], {
    env: { ...process.env, INDEXER_POLL_INTERVAL_MS: "100" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  const exited = once(child, "exit");
  let output = "";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Worker recovery timed out: ${output}`)), 15_000);
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Worker exited before recovery: ${code} ${output}`)); });
      child.stderr.on("data", (data) => { output += data.toString(); });
      child.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes('"message":"projection recovery completed"')) { clearTimeout(timer); resolve(); }
      });
    });
    assert.equal((await prisma.projectionState.findUniqueOrThrow({ where: { id: env.indexerSyncId } })).latestProjectedBlock, 102n);
    console.log("PASS: real worker process recovers committed ingestion before unavailable RPC");
  } finally {
    child.kill();
    await exited;
  }
} finally {
  publicClient.getBlockNumber = originalHead;
  await prisma.$disconnect();
}
