import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { getSafeBlockNumber, publicClient } from "../indexer/chain.js";

export type ProjectionSyncContext = {
  status: "not_started" | "synced" | "lagging" | "rpc_error";
  syncId: string;
  chainId: number;
  latestBlock: string | null;
  safeLatestBlock: string | null;
  latestIndexedBlock: string;
  latestIndexedBlockTimestamp: string | null;
  lagBlocks: string | null;
  updatedAt: string | null;
  estimateAt: Date;
  error?: string;
};

export async function getProjectionSyncContext(): Promise<ProjectionSyncContext> {
  const state = await prisma.syncState.findUnique({
    where: {
      id: env.indexerSyncId,
    },
  });
  const latestIndexedBlock = state?.latestIndexedBlock ?? 0n;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const safeLatestBlock = getSafeBlockNumber(latestBlock);
    const lagBlocks =
      safeLatestBlock > latestIndexedBlock
        ? safeLatestBlock - latestIndexedBlock
        : 0n;
    const indexedBlock =
      latestIndexedBlock > 0n
        ? await publicClient.getBlock({ blockNumber: latestIndexedBlock })
        : null;
    const latestIndexedBlockTimestamp = indexedBlock
      ? new Date(Number(indexedBlock.timestamp) * 1_000)
      : null;

    return {
      status:
        latestIndexedBlock === 0n
          ? "not_started"
          : lagBlocks === 0n
            ? "synced"
            : "lagging",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      latestBlock: latestBlock.toString(),
      safeLatestBlock: safeLatestBlock.toString(),
      latestIndexedBlock: latestIndexedBlock.toString(),
      latestIndexedBlockTimestamp:
        latestIndexedBlockTimestamp?.toISOString() ?? null,
      lagBlocks: lagBlocks.toString(),
      updatedAt: state?.updatedAt.toISOString() ?? null,
      estimateAt: latestIndexedBlockTimestamp ?? state?.updatedAt ?? new Date(0),
    };
  } catch (error) {
    return {
      status: "rpc_error",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      latestBlock: null,
      safeLatestBlock: null,
      latestIndexedBlock: latestIndexedBlock.toString(),
      latestIndexedBlockTimestamp: null,
      lagBlocks: null,
      updatedAt: state?.updatedAt.toISOString() ?? null,
      estimateAt: state?.updatedAt ?? new Date(0),
      error: error instanceof Error ? error.message : "unknown RPC error",
    };
  }
}

export function projectionSyncMeta(context: ProjectionSyncContext) {
  return {
    projection: {
      status: context.status,
      syncId: context.syncId,
      chainId: context.chainId,
      latestBlock: context.latestBlock,
      safeLatestBlock: context.safeLatestBlock,
      latestIndexedBlock: context.latestIndexedBlock,
      latestIndexedBlockTimestamp: context.latestIndexedBlockTimestamp,
      lagBlocks: context.lagBlocks,
      updatedAt: context.updatedAt,
      estimateAt: context.estimateAt.toISOString(),
      error: context.error,
    },
  };
}
