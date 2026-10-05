import type { FastifyInstance } from "fastify";

import { prisma } from "../../db/prisma.js";
import { notFound } from "../errors.js";
import { serializeClaim, serializeStream } from "../serializers.js";
import { getProjectionSyncContext, projectionSyncMeta } from "../sync-context.js";
import { parseStreamId } from "../validation.js";

type StreamParams = {
  streamId: string;
};

export async function registerStreamRoutes(app: FastifyInstance) {
  app.get("/streams", async () => {
    const syncContext = await getProjectionSyncContext();
    const streams = await prisma.streamProjection.findMany({
      orderBy: {
        streamId: "asc",
      },
    });
    const listings = await prisma.listingProjection.findMany({
      where: {
        streamId: {
          in: streams.map((stream) => stream.streamId),
        },
      },
    });
    const listingsByStreamId = new Map(
      listings.map((listing) => [listing.streamId.toString(), listing]),
    );

    return {
      data: streams.map((stream) =>
        serializeStream(
          {
            ...stream,
            listing: listingsByStreamId.get(stream.streamId.toString()) ?? null,
          },
          {
            estimateAt: syncContext.estimateAt,
          },
        ),
      ),
      meta: {
        count: streams.length,
        ownershipSource: "indexed_transfer_events",
        ownershipSourceOfTruth: "receivableStream.ownerOf(streamId)",
        ...projectionSyncMeta(syncContext),
      },
    };
  });

  app.get<{ Params: StreamParams }>("/streams/:streamId", async (request) => {
    const syncContext = await getProjectionSyncContext();
    const streamId = parseStreamId(request.params.streamId);
    const stream = await prisma.streamProjection.findUnique({
      where: {
        streamId,
      },
    });

    if (!stream) {
      throw notFound(`stream ${streamId.toString()} was not found`);
    }

    const listing = await prisma.listingProjection.findUnique({
      where: {
        streamId,
      },
    });
    const claims = await prisma.claimProjection.findMany({
      where: {
        streamId,
      },
      orderBy: [{ claimedAt: "desc" }, { logIndex: "desc" }],
    });

    return {
      data: {
        ...serializeStream(
          {
            ...stream,
            listing,
          },
          {
            estimateAt: syncContext.estimateAt,
          },
        ),
        claims: claims.map((claim) => serializeClaim(claim)),
      },
      meta: {
        ...projectionSyncMeta(syncContext),
      },
    };
  });
}
