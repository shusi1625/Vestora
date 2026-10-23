import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { getSafeBlockNumber, publicClient } from "../indexer/chain.js";
import { startLocalSpan, withLocalSpan } from "./local-spans.js";

type Freshness = { latest: bigint | null; error?: string };
async function readFreshness(): Promise<Freshness> {
  try { return { latest: await withLocalSpan("freshness.rpc", () => publicClient.getBlockNumber()) }; }
  catch { return { latest: null, error: "Chain freshness could not be verified" }; }
}

export async function getProjectionSyncContext(
  db: Prisma.TransactionClient = prisma,
  freshness?: Freshness,
) {
  const head = freshness ?? await readFreshness();
  const state = await withLocalSpan("sync.state", () =>
    db.syncState.findUnique({ where: { id: env.indexerSyncId } }));
  const applied = await withLocalSpan("sync.projection", () =>
    db.projectionState.findUnique({ where: { id: env.indexerSyncId } }));
  const indexed = state?.latestIndexedBlock ?? 0n;
  const projected = applied?.latestProjectedBlock ?? null;
  const safe = head.latest === null ? null : getSafeBlockNumber(head.latest);
  const lag = safe === null ? null : safe > indexed ? safe - indexed : 0n;
  return {
    status: head.error ? "rpc_error" : !state ? "not_started" : lag === 0n ? "synced" : "lagging",
    syncId: env.indexerSyncId,
    chainId: env.sepoliaChainId,
    latestBlock: head.latest?.toString() ?? null,
    safeLatestBlock: safe?.toString() ?? null,
    latestIndexedBlock: indexed.toString(),
    latestIndexedBlockTimestamp: state?.latestIndexedBlockTimestamp?.toISOString() ?? null,
    latestProjectedBlock: projected?.toString() ?? null,
    latestProjectedBlockTimestamp: applied?.latestProjectedBlockTimestamp.toISOString() ?? null,
    projectionStatus: !applied ? "not_started" : projected === indexed ? "applied" : "pending",
    projectionAppliedAt: applied?.appliedAt.toISOString() ?? null,
    lagBlocks: lag?.toString() ?? null,
    updatedAt: state?.updatedAt.toISOString() ?? null,
    estimateAt: applied?.latestProjectedBlockTimestamp ?? null,
    error: head.error,
  };
}

export type ProjectionSyncContext = Awaited<ReturnType<typeof getProjectionSyncContext>>;

export function projectionSyncMeta(context: ProjectionSyncContext) {
  return { projection: { ...context, estimateAt: context.estimateAt?.toISOString() ?? null } };
}

// Fetch chain freshness before opening the DB snapshot so slow RPC does not hold it.
export async function withProjectionSnapshot<T>(
  read: (db: Prisma.TransactionClient, context: ProjectionSyncContext) => Promise<T>,
) {
  const freshness = await readFreshness();
  return withLocalSpan("snapshot.transaction", async () => {
    // Entry latency includes transaction setup; it is not a pure connection-pool metric.
    const acquired = startLocalSpan("snapshot.acquire");
    try {
      return await prisma.$transaction(async (db) => {
        acquired();
        return withLocalSpan("snapshot.callback", async () => {
          const context = await getProjectionSyncContext(db, freshness);
          return withLocalSpan("snapshot.domain", () => read(db, context));
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
    } catch (error) {
      acquired("error");
      throw error;
    }
  });
}
