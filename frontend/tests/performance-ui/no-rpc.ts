import type { readBalances as readLiveBalances } from "../../src/lib/live-chain";

export async function readBalances(
  ..._args: Parameters<typeof readLiveBalances>
): ReturnType<typeof readLiveBalances> {
  throw new Error("QA RPC measurement excluded");
}
