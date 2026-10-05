import { performance } from "node:perf_hooks";

import { checkDatabaseConnection, prisma } from "./prisma.js";

export async function getDatabaseMetrics() {
  const startedAt = performance.now();
  await checkDatabaseConnection();
  const healthCheckLatencyMs = performance.now() - startedAt;

  const [
    syncStates,
    streamEvents,
    streams,
    listings,
    claims,
    trades,
    ownershipReconciliations,
  ] = await Promise.all([
    prisma.syncState.count(),
    prisma.streamEvent.count(),
    prisma.streamProjection.count(),
    prisma.listingProjection.count(),
    prisma.claimProjection.count(),
    prisma.tradeProjection.count(),
    prisma.ownershipReconciliation.count(),
  ]);

  return {
    status: "ok",
    healthCheckLatencyMs: Number(healthCheckLatencyMs.toFixed(2)),
    rowCounts: {
      syncStates,
      streamEvents,
      streams,
      listings,
      claims,
      trades,
      ownershipReconciliations,
    },
  };
}
