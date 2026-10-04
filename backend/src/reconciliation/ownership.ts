import { parseAbi, type Address } from "viem";

import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { publicClient } from "../indexer/chain.js";

const ownerOfAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
]);

export type OwnershipMismatch = {
  streamId: string;
  projectedOwner: string | null;
  onchainOwner: string;
};

export type OwnershipReconciliationResult = {
  checked: number;
  matched: number;
  mismatched: number;
  mismatches: OwnershipMismatch[];
};

function normalizeAddress(value: string) {
  return value.toLowerCase();
}

function normalizeNullableAddress(value: string | null) {
  return value?.toLowerCase() ?? null;
}

export async function reconcileOwnership(): Promise<OwnershipReconciliationResult> {
  const streams = await prisma.streamProjection.findMany({
    orderBy: {
      streamId: "asc",
    },
    select: {
      streamId: true,
      currentOwner: true,
    },
  });

  let matched = 0;
  const mismatches: OwnershipMismatch[] = [];

  for (const stream of streams) {
    const onchainOwner = normalizeAddress(
      await publicClient.readContract({
        address: env.receivableStreamAddress as Address,
        abi: ownerOfAbi,
        functionName: "ownerOf",
        args: [stream.streamId],
      }),
    );
    const projectedOwner = normalizeNullableAddress(stream.currentOwner);
    const isMatched = projectedOwner === onchainOwner;

    await prisma.ownershipReconciliation.create({
      data: {
        streamId: stream.streamId,
        projectedOwner,
        onchainOwner,
        matched: isMatched,
      },
    });

    if (isMatched) {
      matched += 1;
    } else {
      mismatches.push({
        streamId: stream.streamId.toString(),
        projectedOwner,
        onchainOwner,
      });
    }
  }

  return {
    checked: streams.length,
    matched,
    mismatched: mismatches.length,
    mismatches,
  };
}
