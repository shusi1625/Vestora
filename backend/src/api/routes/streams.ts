import type { FastifyInstance } from "fastify";

import { notFound } from "../errors.js";
import { withLocalSpan } from "../local-spans.js";
import { serializeClaim, serializeStream } from "../serializers.js";
import { withProjectionSnapshot, projectionSyncMeta } from "../sync-context.js";
import { parseStreamId } from "../validation.js";

type StreamParams = {
  streamId: string;
};

export async function registerStreamRoutes(app: FastifyInstance) {
  app.get("/streams", async () => {
    return withProjectionSnapshot(async (prisma, syncContext) => {
    const streams = await withLocalSpan("query.stream.find_many", () => prisma.streamProjection.findMany({
      orderBy: {
        streamId: "asc",
      },
    }));
    const listings = await withLocalSpan("query.listing.find_many", () => prisma.listingProjection.findMany({
      where: {
        streamId: {
          in: streams.map((stream) => stream.streamId),
        },
      },
    }));
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
  });

  app.get<{ Params: StreamParams }>("/streams/:streamId", async (request) => {
    return withProjectionSnapshot(async (prisma, syncContext) => {
    const streamId = parseStreamId(request.params.streamId);
    const stream = await withLocalSpan("query.stream.find_unique", () => prisma.streamProjection.findUnique({
      where: {
        streamId,
      },
    }));

    if (!stream) {
      throw notFound(`stream ${streamId.toString()} was not found`);
    }

    const listing = await withLocalSpan("query.listing.find_unique", () => prisma.listingProjection.findUnique({
      where: {
        streamId,
      },
    }));
    const claims = await withLocalSpan("query.claim.find_many", () => prisma.claimProjection.findMany({
      where: {
        streamId,
      },
      orderBy: [{ claimedAt: "desc" }, { logIndex: "desc" }],
    }));

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
  });
}
