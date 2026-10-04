import { ListingStatus, Prisma } from "@prisma/client";

import { prisma } from "../db/prisma.js";

type ProjectionRebuildResult = {
  processedEvents: number;
  streams: number;
  activeListings: number;
  claims: number;
  trades: number;
};

type EventPayload = Record<string, unknown>;

function asPayload(value: Prisma.JsonValue): EventPayload {
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new Error("stream event payload must be a JSON object");
  }

  return value as EventPayload;
}

function requiredString(payload: EventPayload, key: string) {
  const value = payload[key];

  if (typeof value !== "string") {
    throw new Error(`payload.${key} must be a string`);
  }

  return value.toLowerCase();
}

function requiredAmount(payload: EventPayload, key: string) {
  const value = payload[key];

  if (typeof value !== "string") {
    throw new Error(`payload.${key} must be a string amount`);
  }

  return value;
}

function requiredBool(payload: EventPayload, key: string) {
  const value = payload[key];

  if (typeof value !== "boolean") {
    throw new Error(`payload.${key} must be a boolean`);
  }

  return value;
}

function requiredTimestamp(payload: EventPayload, key: string) {
  const value = payload[key];

  if (typeof value !== "string") {
    throw new Error(`payload.${key} must be a string timestamp`);
  }

  return new Date(Number(value) * 1_000);
}

async function clearProjectionTables(tx: Prisma.TransactionClient) {
  await tx.tradeProjection.deleteMany();
  await tx.claimProjection.deleteMany();
  await tx.listingProjection.deleteMany();
  await tx.streamProjection.deleteMany();
}

async function applyStreamCreated(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    transactionHash: string;
    payload: Prisma.JsonValue;
  },
) {
  if (event.streamId === null) {
    throw new Error("StreamCreated event is missing streamId");
  }

  const payload = asPayload(event.payload);
  const recipient = requiredString(payload, "recipient");

  await tx.streamProjection.upsert({
    where: {
      streamId: event.streamId,
    },
    create: {
      streamId: event.streamId,
      sender: requiredString(payload, "sender"),
      recipient,
      currentOwner: recipient,
      token: requiredString(payload, "token"),
      depositedAmount: requiredAmount(payload, "depositedAmount"),
      withdrawnAmount: "0",
      startTime: requiredTimestamp(payload, "startTime"),
      endTime: requiredTimestamp(payload, "endTime"),
      cancelable: requiredBool(payload, "cancelable"),
      createdTxHash: event.transactionHash,
    },
    update: {
      sender: requiredString(payload, "sender"),
      recipient,
      currentOwner: recipient,
      token: requiredString(payload, "token"),
      depositedAmount: requiredAmount(payload, "depositedAmount"),
      startTime: requiredTimestamp(payload, "startTime"),
      endTime: requiredTimestamp(payload, "endTime"),
      cancelable: requiredBool(payload, "cancelable"),
      createdTxHash: event.transactionHash,
    },
  });
}

async function applyStreamClaimed(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    blockTimestamp: Date;
    transactionHash: string;
    logIndex: number;
    payload: Prisma.JsonValue;
  },
) {
  if (event.streamId === null) {
    throw new Error("StreamClaimed event is missing streamId");
  }

  const payload = asPayload(event.payload);
  const amount = requiredAmount(payload, "amount");

  await tx.claimProjection.create({
    data: {
      streamId: event.streamId,
      recipient: requiredString(payload, "recipient"),
      amount,
      claimedAt: event.blockTimestamp,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    },
  });

  const stream = await tx.streamProjection.findUnique({
    where: {
      streamId: event.streamId,
    },
    select: {
      withdrawnAmount: true,
    },
  });

  if (!stream) {
    return;
  }

  await tx.streamProjection.update({
    where: {
      streamId: event.streamId,
    },
    data: {
      withdrawnAmount: (BigInt(stream.withdrawnAmount) + BigInt(amount)).toString(),
    },
  });
}

async function applyStreamCanceled(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    blockTimestamp: Date;
  },
) {
  if (event.streamId === null) {
    throw new Error("StreamCanceled event is missing streamId");
  }

  await tx.streamProjection.updateMany({
    where: {
      streamId: event.streamId,
    },
    data: {
      canceledAt: event.blockTimestamp,
    },
  });
}

async function applyListed(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    blockTimestamp: Date;
    transactionHash: string;
    payload: Prisma.JsonValue;
  },
) {
  if (event.streamId === null) {
    throw new Error("Listed event is missing streamId");
  }

  const payload = asPayload(event.payload);

  await tx.listingProjection.upsert({
    where: {
      streamId: event.streamId,
    },
    create: {
      streamId: event.streamId,
      seller: requiredString(payload, "seller"),
      price: requiredAmount(payload, "price"),
      status: ListingStatus.ACTIVE,
      listedAt: event.blockTimestamp,
      listingTxHash: event.transactionHash,
    },
    update: {
      seller: requiredString(payload, "seller"),
      price: requiredAmount(payload, "price"),
      status: ListingStatus.ACTIVE,
      listedAt: event.blockTimestamp,
      soldAt: null,
      canceledAt: null,
      buyer: null,
      listingTxHash: event.transactionHash,
      boughtTxHash: null,
      canceledTxHash: null,
    },
  });
}

async function applyListingCanceled(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    blockTimestamp: Date;
    transactionHash: string;
  },
) {
  if (event.streamId === null) {
    throw new Error("ListingCanceled event is missing streamId");
  }

  await tx.listingProjection.updateMany({
    where: {
      streamId: event.streamId,
    },
    data: {
      status: ListingStatus.CANCELED,
      canceledAt: event.blockTimestamp,
      canceledTxHash: event.transactionHash,
    },
  });
}

async function applyPurchased(
  tx: Prisma.TransactionClient,
  event: {
    streamId: bigint | null;
    blockTimestamp: Date;
    transactionHash: string;
    logIndex: number;
    payload: Prisma.JsonValue;
  },
) {
  if (event.streamId === null) {
    throw new Error("Purchased event is missing streamId");
  }

  const payload = asPayload(event.payload);
  const seller = requiredString(payload, "seller");
  const buyer = requiredString(payload, "buyer");
  const price = requiredAmount(payload, "price");

  await tx.tradeProjection.create({
    data: {
      streamId: event.streamId,
      seller,
      buyer,
      price,
      tradedAt: event.blockTimestamp,
      transactionHash: event.transactionHash,
      logIndex: event.logIndex,
    },
  });

  await tx.listingProjection.upsert({
    where: {
      streamId: event.streamId,
    },
    create: {
      streamId: event.streamId,
      seller,
      price,
      status: ListingStatus.SOLD,
      listedAt: event.blockTimestamp,
      soldAt: event.blockTimestamp,
      buyer,
      listingTxHash: event.transactionHash,
      boughtTxHash: event.transactionHash,
    },
    update: {
      status: ListingStatus.SOLD,
      soldAt: event.blockTimestamp,
      buyer,
      boughtTxHash: event.transactionHash,
    },
  });

  await tx.streamProjection.updateMany({
    where: {
      streamId: event.streamId,
    },
    data: {
      currentOwner: buyer,
    },
  });
}

export async function rebuildProjections(): Promise<ProjectionRebuildResult> {
  const events = await prisma.streamEvent.findMany({
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
  });

  await prisma.$transaction(
    async (tx) => {
      await clearProjectionTables(tx);

      for (const event of events) {
        switch (event.eventName) {
          case "StreamCreated":
            await applyStreamCreated(tx, event);
            break;
          case "StreamClaimed":
            await applyStreamClaimed(tx, event);
            break;
          case "StreamCanceled":
            await applyStreamCanceled(tx, event);
            break;
          case "Listed":
            await applyListed(tx, event);
            break;
          case "ListingCanceled":
            await applyListingCanceled(tx, event);
            break;
          case "Purchased":
            await applyPurchased(tx, event);
            break;
        }
      }
    },
    {
      timeout: 30_000,
    },
  );

  const [streams, activeListings, claims, trades] = await Promise.all([
    prisma.streamProjection.count(),
    prisma.listingProjection.count({
      where: {
        status: ListingStatus.ACTIVE,
      },
    }),
    prisma.claimProjection.count(),
    prisma.tradeProjection.count(),
  ]);

  return {
    processedEvents: events.length,
    streams,
    activeListings,
    claims,
    trades,
  };
}
