import { Prisma } from "@prisma/client";

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
};

type BlockTimestampCache = Map<bigint, Date>;

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
  let rawLogs = 0;

  for (const contract of indexedContracts) {
    const logs = await publicClient.getLogs({
      address: contract.address,
      fromBlock,
      toBlock,
    });

    rawLogs += logs.length;

    for (const log of logs as VestoraRawLog[]) {
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
  }

  return {
    rawLogs,
    events: data,
  };
}

async function indexBlockRange(fromBlock: bigint, toBlock: bigint) {
  const { rawLogs, events } = await readAndDecodeRange(fromBlock, toBlock);

  if (events.length === 0) {
    return {
      rawLogs,
      decodedEvents: 0,
      insertedEvents: 0,
    };
  }

  const result = await prisma.streamEvent.createMany({
    data: events,
    skipDuplicates: true,
  });

  return {
    rawLogs,
    decodedEvents: events.length,
    insertedEvents: result.count,
  };
}

export async function runIndexerOnce() {
  const latestBlock = await publicClient.getBlockNumber();
  const safeLatestBlock = getSafeBlockNumber(latestBlock);
  const fromBlock = await getNextFromBlock();

  if (fromBlock > safeLatestBlock) {
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
    } satisfies IndexerRunResult;
  }

  let cursor = fromBlock;
  let rawLogs = 0;
  let decodedEvents = 0;
  let insertedEvents = 0;
  let batches = 0;

  while (cursor <= safeLatestBlock) {
    const batchEnd =
      cursor + BigInt(env.indexerBatchSize - 1) > safeLatestBlock
        ? safeLatestBlock
        : cursor + BigInt(env.indexerBatchSize - 1);

    const batchResult = await indexBlockRange(cursor, batchEnd);

    rawLogs += batchResult.rawLogs;
    decodedEvents += batchResult.decodedEvents;
    insertedEvents += batchResult.insertedEvents;
    batches += 1;

    await updateSyncState(batchEnd);

    cursor = batchEnd + 1n;
  }

  return {
    fromBlock: fromBlock.toString(),
    toBlock: safeLatestBlock.toString(),
    latestBlock: latestBlock.toString(),
    safeLatestBlock: safeLatestBlock.toString(),
    scannedBlocks: (safeLatestBlock - fromBlock + 1n).toString(),
    rawLogs,
    decodedEvents,
    insertedEvents,
    skippedDuplicates: decodedEvents - insertedEvents,
    batches,
  } satisfies IndexerRunResult;
}
