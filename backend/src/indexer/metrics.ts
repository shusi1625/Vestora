import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { publicClient, getSafeBlockNumber } from "./chain.js";

export async function getIndexerMetrics() {
  const state = await prisma.syncState.findUnique({
    where: {
      id: env.indexerSyncId,
    },
  });

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const safeLatestBlock = getSafeBlockNumber(latestBlock);
    const latestIndexedBlock = state?.latestIndexedBlock ?? 0n;
    const lagBlocks =
      safeLatestBlock > latestIndexedBlock
        ? safeLatestBlock - latestIndexedBlock
        : 0n;

    return {
      status:
        latestIndexedBlock === 0n
          ? "not_started"
          : lagBlocks === 0n
            ? "synced"
            : "lagging",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      startBlock: env.indexerStartBlock.toString(),
      latestBlock: latestBlock.toString(),
      safeLatestBlock: safeLatestBlock.toString(),
      latestIndexedBlock: latestIndexedBlock.toString(),
      lagBlocks: lagBlocks.toString(),
      updatedAt: state?.updatedAt.toISOString() ?? null,
    };
  } catch (error) {
    return {
      status: "rpc_error",
      syncId: env.indexerSyncId,
      chainId: env.sepoliaChainId,
      startBlock: env.indexerStartBlock.toString(),
      latestBlock: null,
      safeLatestBlock: null,
      latestIndexedBlock: state?.latestIndexedBlock.toString() ?? "0",
      lagBlocks: null,
      updatedAt: state?.updatedAt.toISOString() ?? null,
      error: error instanceof Error ? error.message : "unknown RPC error",
    };
  }
}
