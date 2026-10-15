import { type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export class WriterBusyError extends Error {
  constructor() {
    super("Projection writer is busy; retry the cycle");
    this.name = "WriterBusyError";
  }
}

// Projection tables are shared by all sync IDs within one database schema.
export function withWriterTransaction<T>(
  action: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(946, hashtext(current_schema())) AS acquired
    `;
    if (!lock?.acquired) {
      console.warn(JSON.stringify({ level: "warn", message: "writer lock contention", retryable: true }));
      throw new WriterBusyError();
    }
    return action(tx);
  }, { timeout: 30_000, maxWait: 5_000 });
}
