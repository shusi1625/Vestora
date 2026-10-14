import { Prisma } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { type Address } from "viem";

import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { publicClient, getSafeBlockNumber } from "./chain.js";
import { indexedContracts } from "./contracts.js";
import {
  decodeVestoraLog,
  normalizeAddress,
  type VestoraRawLog,
} from "./event-decoder.js";

export type IndexerRunResult = {
  fromBlock: string;
  toBlock: string;
  latestBlock: string;
  safeLatestBlock: string;
  scannedBlocks: string;
  rawLogs: number;
  decodedEvents: number;
  insertedEvents: number;
  skippedDuplicates: number;
  batches: number;
  cycleLimited: boolean;
  remainingBlocks: string;
  durationMs: number;
  blocksPerSecond: number;
  rpcCalls: number;
  getLogsDurationMs: number;
  dbWriteDurationMs: number;
};

type BlockTimestampCache = Map<bigint, Date>;

const indexedContractsByAddress = new Map(
  indexedContracts.map((contract) => [
    normalizeAddress(contract.address),
    contract,
  ]),
);
const indexedContractAddresses = indexedContracts.map(
  (contract) => contract.address,
) as Address[];

function roundMetric(value: number) {
  return Number(value.toFixed(2));
}

async function getBlockTimestamp(
  blockNumber: bigint,
  cache: BlockTimestampCache,
) {
  const cached = cache.get(blockNumber);

  if (cached) {
    return cached;
  }

  const block = await publicClient.getBlock({ blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1_000);

  cache.set(blockNumber, timestamp);

  return timestamp;
}

async function getNextFromBlock() {
  const state = await prisma.syncState.findUnique({
    where: {
      id: env.indexerSyncId,
    },
  });

  if (!state || state.latestIndexedBlock < env.indexerStartBlock) {
    return env.indexerStartBlock;
  }

  return state.latestIndexedBlock + 1n;
}

async function updateSyncState(blockNumber: bigint) {
  await prisma.syncState.upsert({
    where: {
      id: env.indexerSyncId,
    },
    create: {
      id: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      latestIndexedBlock: blockNumber,
    },
    update: {
      chainId: env.sepoliaChainId,
      latestIndexedBlock: blockNumber,
    },
  });
}

async function readAndDecodeRange(fromBlock: bigint, toBlock: bigint) {
  const timestamps: BlockTimestampCache = new Map();
  const data: Prisma.StreamEventCreateManyInput[] = [];
  const getLogsStartedAt = performance.now();
  const logs = await publicClient.getLogs({
    address: indexedContractAddresses,
    fromBlock,
    toBlock,
  });
  const getLogsDurationMs = performance.now() - getLogsStartedAt;

  for (const log of logs as VestoraRawLog[]) {
    const contract = indexedContractsByAddress.get(
      normalizeAddress(log.address),
    );

    if (!contract) {
      continue;
    }

    const decoded = decodeVestoraLog(contract, log);

    if (!decoded || log.blockNumber === null || log.logIndex === null) {
      continue;
    }

    data.push({
      chainId: env.sepoliaChainId,
      contractAddress: normalizeAddress(contract.address),
      eventName: decoded.eventName,
      blockNumber: log.blockNumber,
      blockHash: log.blockHash,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      streamId: decoded.streamId,
      payload: decoded.payload,
      blockTimestamp: await getBlockTimestamp(log.blockNumber, timestamps),
    });
  }

  return {
    rawLogs: logs.length,
    events: data,
    rpcCalls: 1,
    getLogsDurationMs,
  };
}

async function indexBlockRange(fromBlock: bigint, toBlock: bigint) {
  const { rawLogs, events, rpcCalls, getLogsDurationMs } =
    await readAndDecodeRange(fromBlock, toBlock);

  if (events.length === 0) {
    return {
      rawLogs,
      decodedEvents: 0,
      insertedEvents: 0,
      rpcCalls,
      getLogsDurationMs,
      dbWriteDurationMs: 0,
    };
  }

  const dbWriteStartedAt = performance.now();
  const result = await prisma.streamEvent.createMany({
    data: events,
    skipDuplicates: true,
  });
  const dbWriteDurationMs = performance.now() - dbWriteStartedAt;

  return {
    rawLogs,
    decodedEvents: events.length,
    insertedEvents: result.count,
    rpcCalls,
    getLogsDurationMs,
    dbWriteDurationMs,
  };
}

export async function runIndexerOnce() {
  const runStartedAt = performance.now();
  const latestBlock = await publicClient.getBlockNumber();
  const safeLatestBlock = getSafeBlockNumber(latestBlock);
  const fromBlock = await getNextFromBlock();

  if (fromBlock > safeLatestBlock) {
    const durationMs = performance.now() - runStartedAt;

    return {
      fromBlock: fromBlock.toString(),
      toBlock: safeLatestBlock.toString(),
      latestBlock: latestBlock.toString(),
      safeLatestBlock: safeLatestBlock.toString(),
      scannedBlocks: "0",
      rawLogs: 0,
      decodedEvents: 0,
      insertedEvents: 0,
      skippedDuplicates: 0,
      batches: 0,
      cycleLimited: false,
      remainingBlocks: "0",
      durationMs: roundMetric(durationMs),
      blocksPerSecond: 0,
      rpcCalls: 0,
      getLogsDurationMs: 0,
      dbWriteDurationMs: 0,
    } satisfies IndexerRunResult;
  }

  const cycleToBlock =
    fromBlock + BigInt(env.indexerMaxBlocksPerCycle - 1) > safeLatestBlock
      ? safeLatestBlock
      : fromBlock + BigInt(env.indexerMaxBlocksPerCycle - 1);
  let cursor = fromBlock;
  let rawLogs = 0;
  let decodedEvents = 0;
  let insertedEvents = 0;
  let batches = 0;
  let rpcCalls = 0;
  let getLogsDurationMs = 0;
  let dbWriteDurationMs = 0;

  while (cursor <= cycleToBlock) {
    const batchEnd =
      cursor + BigInt(env.indexerBatchSize - 1) > cycleToBlock
        ? cycleToBlock
        : cursor + BigInt(env.indexerBatchSize - 1);

    const batchResult = await indexBlockRange(cursor, batchEnd);

    rawLogs += batchResult.rawLogs;
    decodedEvents += batchResult.decodedEvents;
    insertedEvents += batchResult.insertedEvents;
    batches += 1;
    rpcCalls += batchResult.rpcCalls;
    getLogsDurationMs += batchResult.getLogsDurationMs;
    dbWriteDurationMs += batchResult.dbWriteDurationMs;

    const syncStateWriteStartedAt = performance.now();
    await updateSyncState(batchEnd);
    dbWriteDurationMs += performance.now() - syncStateWriteStartedAt;

    if (
      batches === 1 ||
      batches % env.indexerProgressLogIntervalBatches === 0 ||
      batchEnd === cycleToBlock
    ) {
      console.log(
        JSON.stringify({
          level: "info",
          message: "indexer batch progress",
          syncId: env.indexerSyncId,
          batch: batches,
          fromBlock: fromBlock.toString(),
          currentFromBlock: cursor.toString(),
          currentToBlock: batchEnd.toString(),
          cycleToBlock: cycleToBlock.toString(),
          safeLatestBlock: safeLatestBlock.toString(),
          rawLogs,
          decodedEvents,
          insertedEvents,
          rpcCalls,
        }),
      );
    }

    cursor = batchEnd + 1n;
  }

  const scannedBlocks = cycleToBlock - fromBlock + 1n;
  const remainingBlocks =
    safeLatestBlock > cycleToBlock ? safeLatestBlock - cycleToBlock : 0n;
  const durationMs = performance.now() - runStartedAt;
  const blocksPerSecond =
    durationMs > 0 ? Number(scannedBlocks) / (durationMs / 1_000) : 0;

  return {
    fromBlock: fromBlock.toString(),
    toBlock: cycleToBlock.toString(),
    latestBlock: latestBlock.toString(),
    safeLatestBlock: safeLatestBlock.toString(),
    scannedBlocks: scannedBlocks.toString(),
    rawLogs,
    decodedEvents,
    insertedEvents,
    skippedDuplicates: decodedEvents - insertedEvents,
    batches,
    cycleLimited: cycleToBlock < safeLatestBlock,
    remainingBlocks: remainingBlocks.toString(),
    durationMs: roundMetric(durationMs),
    blocksPerSecond: roundMetric(blocksPerSecond),
    rpcCalls,
    getLogsDurationMs: roundMetric(getLogsDurationMs),
    dbWriteDurationMs: roundMetric(dbWriteDurationMs),
  } satisfies IndexerRunResult;
}
