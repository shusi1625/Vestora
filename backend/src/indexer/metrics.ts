import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { publicClient, getSafeBlockNumber } from "./chain.js";
import { indexedContracts } from "./contracts.js";

const EVENT_RATE_WINDOW_MINUTES = 5;

async function getIndexedEventMetrics() {
  const activeContractAddresses = indexedContracts.map((contract) =>
    contract.address.toLowerCase(),
  );
  const windowStart = new Date(
    Date.now() - EVENT_RATE_WINDOW_MINUTES * 60 * 1_000,
  );
  const where = {
    chainId: env.sepoliaChainId,
    blockNumber: {
      gte: env.indexerStartBlock,
    },
    contractAddress: {
      in: activeContractAddresses,
    },
  };
  const [totalIndexedEvents, recentIndexedEvents, eventsByName, latestEvent] =
    await Promise.all([
      prisma.streamEvent.count({
        where,
      }),
      prisma.streamEvent.count({
        where: {
          ...where,
          createdAt: {
            gte: windowStart,
          },
        },
      }),
      prisma.streamEvent.groupBy({
        by: ["eventName"],
        where,
        _count: {
          _all: true,
        },
        orderBy: {
          eventName: "asc",
        },
      }),
      prisma.streamEvent.findFirst({
        where,
        orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
        select: {
          eventName: true,
          blockNumber: true,
          transactionHash: true,
          logIndex: true,
          blockTimestamp: true,
        },
      }),
    ]);

  return {
    activeContractAddresses,
    totalIndexedEvents,
    recentWindowMinutes: EVENT_RATE_WINDOW_MINUTES,
    recentIndexedEvents,
    processedEventsPerMinute: Number(
      (recentIndexedEvents / EVENT_RATE_WINDOW_MINUTES).toFixed(2),
    ),
    eventsByName: Object.fromEntries(
      eventsByName.map((event) => [event.eventName, event._count._all]),
    ),
    latestEvent: latestEvent
      ? {
          eventName: latestEvent.eventName,
          blockNumber: latestEvent.blockNumber.toString(),
          transactionHash: latestEvent.transactionHash,
          logIndex: latestEvent.logIndex,
          blockTimestamp: latestEvent.blockTimestamp.toISOString(),
        }
      : null,
  };
}

export async function getIndexerMetrics() {
  const state = await prisma.syncState.findUnique({
    where: {
      id: env.indexerSyncId,
    },
  });

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const safeLatestBlock = getSafeBlockNumber(latestBlock);
    const latestIndexedBlock = state?.latestIndexedBlock ?? 0n;
    const lagBlocks =
      safeLatestBlock > latestIndexedBlock
        ? safeLatestBlock - latestIndexedBlock
        : 0n;
    const indexedBlock =
      latestIndexedBlock > 0n
        ? await publicClient.getBlock({ blockNumber: latestIndexedBlock })
        : null;
    const latestIndexedBlockTimestamp = indexedBlock
      ? new Date(Number(indexedBlock.timestamp) * 1_000).toISOString()
      : null;

    return {
      status:
        latestIndexedBlock === 0n
          ? "not_started"
          : lagBlocks === 0n
            ? "synced"
            : "lagging",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      startBlock: env.indexerStartBlock.toString(),
      latestBlock: latestBlock.toString(),
      safeLatestBlock: safeLatestBlock.toString(),
      latestIndexedBlock: latestIndexedBlock.toString(),
      latestIndexedBlockTimestamp,
      lagBlocks: lagBlocks.toString(),
      updatedAt: state?.updatedAt.toISOString() ?? null,
      events: await getIndexedEventMetrics(),
    };
  } catch (error) {
    return {
      status: "rpc_error",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      startBlock: env.indexerStartBlock.toString(),
      latestBlock: null,
      safeLatestBlock: null,
      latestIndexedBlock: state?.latestIndexedBlock.toString() ?? "0",
      latestIndexedBlockTimestamp: null,
      lagBlocks: null,
      updatedAt: state?.updatedAt.toISOString() ?? null,
      events: await getIndexedEventMetrics(),
      error: error instanceof Error ? error.message : "unknown RPC error",
    };
  }
}
