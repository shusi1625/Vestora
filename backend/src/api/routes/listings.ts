import { ListingStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";

import { badRequest } from "../errors.js";
import { withLocalSpan } from "../local-spans.js";
import { serializeListing } from "../serializers.js";
import { withProjectionSnapshot, projectionSyncMeta } from "../sync-context.js";

type ListingQuery = {
  status?: string;
};

function parseListingStatus(status: string | undefined) {
  if (status === undefined) {
    return undefined;
  }

  if (
    status === ListingStatus.ACTIVE ||
    status === ListingStatus.CANCELED ||
    status === ListingStatus.SOLD ||
    status === ListingStatus.INVALIDATED
  ) {
    return status;
  }

  throw badRequest(
    "status must be one of ACTIVE, CANCELED, SOLD, or INVALIDATED",
  );
}

export async function registerListingRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListingQuery }>("/listings", async (request) => {
    const status = parseListingStatus(request.query.status);
    return withProjectionSnapshot(async (prisma, syncContext) => {
    const listings = await withLocalSpan("query.listing.find_many", () => prisma.listingProjection.findMany({
      where: {
        status,
      },
      orderBy: [{ listedAt: "desc" }, { streamId: "asc" }],
    }));
    const streams = await withLocalSpan("query.stream.find_many", () => prisma.streamProjection.findMany({
      where: {
        streamId: {
          in: listings.map((listing) => listing.streamId),
        },
      },
    }));
    const streamsById = new Map(
      streams.map((stream) => [stream.streamId.toString(), stream]),
    );

    return {
      data: listings.map((listing) =>
        serializeListing(
          listing,
          streamsById.get(listing.streamId.toString()) ?? null,
          {
            estimateAt: syncContext.estimateAt,
          },
        ),
      ),
      meta: {
        count: listings.length,
        status: status ?? "ALL",
        ownershipSourceOfTruth: "receivableStream.ownerOf(streamId)",
        ...projectionSyncMeta(syncContext),
      },
    };
    });
  });
}
