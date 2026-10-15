import { env } from "../config/env.js";
import type { Prisma } from "@prisma/client";
import { withProjectionSnapshot, projectionSyncMeta } from "../api/sync-context.js";
import { indexedContracts } from "./contracts.js";

const EVENT_RATE_WINDOW_MINUTES = 5;

async function getIndexedEventMetrics(prisma: Prisma.TransactionClient) {
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
          createdAt: true,
          firstProjectedAt: true,
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
          firstIngestedAt: latestEvent.createdAt.toISOString(),
          firstProjectedAt: latestEvent.firstProjectedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export async function getIndexerMetrics() {
  return withProjectionSnapshot(async (db, context) => ({
    ...projectionSyncMeta(context).projection,
    startBlock: env.indexerStartBlock.toString(),
    events: await getIndexedEventMetrics(db),
  }));
}
