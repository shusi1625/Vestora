import { ListingStatus } from "@prisma/client";

import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { rebuildProjections } from "../src/projections/rebuild.js";

const streamId = 999_000_000_001n;
const blockTimestamp = new Date("2026-01-01T00:00:00.000Z");

const zeroAddress = "0x0000000000000000000000000000000000000000";
const sender = "0x1111111111111111111111111111111111111111";
const originalOwner = "0x2222222222222222222222222222222222222222";
const externalOwner = "0x3333333333333333333333333333333333333333";
const token = "0x4444444444444444444444444444444444444444";

function fakeHash(value: number) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

async function seedSyntheticEvents() {
  await prisma.streamEvent.deleteMany({
    where: {
      streamId,
    },
  });

  await prisma.streamEvent.createMany({
    data: [
      {
        chainId: env.sepoliaChainId,
        contractAddress: env.receivableStreamAddress.toLowerCase(),
        eventName: "Transfer",
        blockNumber: 999_000_001n,
        blockHash: fakeHash(1),
        transactionHash: fakeHash(101),
        logIndex: 0,
        streamId,
        payload: {
          from: zeroAddress,
          to: originalOwner,
          tokenId: streamId.toString(),
        },
        blockTimestamp,
      },
      {
        chainId: env.sepoliaChainId,
        contractAddress: env.receivableStreamAddress.toLowerCase(),
        eventName: "StreamCreated",
        blockNumber: 999_000_001n,
        blockHash: fakeHash(1),
        transactionHash: fakeHash(101),
        logIndex: 1,
        streamId,
        payload: {
          streamId: streamId.toString(),
          sender,
          recipient: originalOwner,
          token,
          depositedAmount: "1000000",
          startTime: "1767225600",
          endTime: "1767229200",
          cancelable: false,
        },
        blockTimestamp,
      },
      {
        chainId: env.sepoliaChainId,
        contractAddress: env.receivableMarketplaceAddress.toLowerCase(),
        eventName: "Listed",
        blockNumber: 999_000_002n,
        blockHash: fakeHash(2),
        transactionHash: fakeHash(102),
        logIndex: 0,
        streamId,
        payload: {
          streamId: streamId.toString(),
          seller: originalOwner,
          price: "400000",
        },
        blockTimestamp,
      },
      {
        chainId: env.sepoliaChainId,
        contractAddress: env.receivableStreamAddress.toLowerCase(),
        eventName: "Transfer",
        blockNumber: 999_000_003n,
        blockHash: fakeHash(3),
        transactionHash: fakeHash(103),
        logIndex: 0,
        streamId,
        payload: {
          from: originalOwner,
          to: externalOwner,
          tokenId: streamId.toString(),
        },
        blockTimestamp,
      },
    ],
  });
}

try {
  await seedSyntheticEvents();

  const rebuildResult = await rebuildProjections();
  const [stream, listing] = await Promise.all([
    prisma.streamProjection.findUnique({
      where: {
        streamId,
      },
    }),
    prisma.listingProjection.findUnique({
      where: {
        streamId,
      },
    }),
  ]);

  if (!stream || stream.currentOwner !== externalOwner) {
    throw new Error("synthetic stream owner was not updated from Transfer");
  }

  if (
    !listing ||
    listing.status !== ListingStatus.INVALIDATED ||
    listing.invalidatedTxHash !== fakeHash(103)
  ) {
    throw new Error("synthetic listing was not invalidated by external Transfer");
  }

  console.log(
    JSON.stringify(
      {
        rebuildResult,
        streamId: streamId.toString(),
        currentOwner: stream.currentOwner,
        listingStatus: listing.status,
        invalidatedTxHash: listing.invalidatedTxHash,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.streamEvent.deleteMany({
    where: {
      streamId,
    },
  });
  await rebuildProjections();
  await prisma.$disconnect();
}
