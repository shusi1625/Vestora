import { ListingStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";

import { prisma } from "../../db/prisma.js";
import { getProjectionSyncContext, projectionSyncMeta } from "../sync-context.js";

export async function registerMarketRoutes(app: FastifyInstance) {
  app.get("/market/stats", async () => {
    const syncContext = await getProjectionSyncContext();
    const [streamCount, listingCounts, listings, tradeCount, trades] =
      await Promise.all([
        prisma.streamProjection.count(),
        prisma.listingProjection.groupBy({
          by: ["status"],
          _count: {
            status: true,
          },
        }),
        prisma.listingProjection.findMany({
          select: {
            price: true,
            status: true,
          },
        }),
        prisma.tradeProjection.count(),
        prisma.tradeProjection.findMany({
          select: {
            price: true,
          },
        }),
      ]);

    const listingCountByStatus = Object.fromEntries(
      Object.values(ListingStatus).map((status) => [status, 0]),
    ) as Record<ListingStatus, number>;

    for (const row of listingCounts) {
      listingCountByStatus[row.status] = row._count.status;
    }

    const activeListingValue = listings
      .filter((listing) => listing.status === ListingStatus.ACTIVE)
      .reduce((total, listing) => total + BigInt(listing.price), 0n);
    const tradeVolume = trades.reduce(
      (total, trade) => total + BigInt(trade.price),
      0n,
    );

    return {
      data: {
        streams: {
          total: streamCount,
        },
        listings: {
          total: listings.length,
          byStatus: listingCountByStatus,
          activeValue: activeListingValue.toString(),
        },
        trades: {
          total: tradeCount,
          volume: tradeVolume.toString(),
        },
      },
      meta: {
        valuesUseTokenBaseUnits: true,
        generatedAt: new Date().toISOString(),
        ...projectionSyncMeta(syncContext),
      },
    };
  });
}
