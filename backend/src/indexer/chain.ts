import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

import { env } from "../config/env.js";

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(env.sepoliaRpcUrl),
});

export function getSafeBlockNumber(latestBlock: bigint) {
  if (latestBlock <= env.indexerConfirmations) {
    return 0n;
  }

  return latestBlock - env.indexerConfirmations;
}
