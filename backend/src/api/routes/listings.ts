import { ListingStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";

import { prisma } from "../../db/prisma.js";
import { badRequest } from "../errors.js";
import { serializeListing } from "../serializers.js";

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
    const listings = await prisma.listingProjection.findMany({
      where: {
        status,
      },
      orderBy: [{ listedAt: "desc" }, { streamId: "asc" }],
    });
    const streams = await prisma.streamProjection.findMany({
      where: {
        streamId: {
          in: listings.map((listing) => listing.streamId),
        },
      },
    });
    const streamsById = new Map(
      streams.map((stream) => [stream.streamId.toString(), stream]),
    );

    return {
      data: listings.map((listing) =>
        serializeListing(
          listing,
          streamsById.get(listing.streamId.toString()) ?? null,
        ),
      ),
      meta: {
        count: listings.length,
        status: status ?? "ALL",
        ownershipSourceOfTruth: "receivableStream.ownerOf(streamId)",
      },
    };
  });
}
