import type { FastifyInstance } from "fastify";

import { prisma } from "../../db/prisma.js";
import { serializeStream, serializeTrade } from "../serializers.js";
import { parseAddress } from "../validation.js";

type AddressParams = {
  address: string;
};

function userRoles(stream: {
  sender: string;
  recipient: string;
  currentOwner: string | null;
}, address: string) {
  const roles: string[] = [];

  if (stream.sender === address) {
    roles.push("sender");
  }

  if (stream.recipient === address) {
    roles.push("initial_recipient");
  }

  if (stream.currentOwner === address) {
    roles.push("current_owner");
  }

  return roles;
}

export async function registerUserRoutes(app: FastifyInstance) {
  app.get<{ Params: AddressParams }>(
    "/users/:address/streams",
    async (request) => {
      const address = parseAddress(request.params.address);
      const streams = await prisma.streamProjection.findMany({
        where: {
          OR: [
            {
              sender: address,
            },
            {
              recipient: address,
            },
            {
              currentOwner: address,
            },
          ],
        },
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
        data: streams.map((stream) => ({
          ...serializeStream({
            ...stream,
            listing: listingsByStreamId.get(stream.streamId.toString()) ?? null,
          }),
          userRoles: userRoles(stream, address),
        })),
        meta: {
          address,
          count: streams.length,
        },
      };
    },
  );

  app.get<{ Params: AddressParams }>("/users/:address/trades", async (request) => {
    const address = parseAddress(request.params.address);
    const trades = await prisma.tradeProjection.findMany({
      where: {
        OR: [
          {
            seller: address,
          },
          {
            buyer: address,
          },
        ],
      },
      orderBy: [{ tradedAt: "desc" }, { logIndex: "desc" }],
    });

    return {
      data: trades.map((trade) => ({
        ...serializeTrade(trade),
        userRole:
          trade.buyer === address
            ? "buyer"
            : trade.seller === address
              ? "seller"
              : "unknown",
      })),
      meta: {
        address,
        count: trades.length,
      },
    };
  });
}
