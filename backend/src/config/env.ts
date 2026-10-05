import "dotenv/config";

function readPort(value: string | undefined) {
  const port = Number(value ?? "3001");

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function readInteger(name: string, value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
) {
  const parsed = readInteger(name, value, fallback);

  if (parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function readBlockNumber(
  name: string,
  value: string | undefined,
  fallback: bigint,
) {
  try {
    const parsed = BigInt(value ?? fallback);

    if (parsed < 0n) {
      throw new Error();
    }

    return parsed;
  } catch {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "127.0.0.1",
  port: readPort(process.env.PORT),
  logLevel: process.env.LOG_LEVEL ?? "info",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgresql://vestora:vestora@127.0.0.1:5433/vestora?schema=public",
  sepoliaChainId: readInteger(
    "SEPOLIA_CHAIN_ID",
    process.env.SEPOLIA_CHAIN_ID,
    11155111,
  ),
  sepoliaRpcUrl:
    process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  receivableStreamAddress:
    process.env.RECEIVABLE_STREAM_ADDRESS ??
    "0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",
  receivableMarketplaceAddress:
    process.env.RECEIVABLE_MARKETPLACE_ADDRESS ??
    "0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7",
  indexerSyncId: process.env.INDEXER_SYNC_ID ?? "sepolia-v4",
  indexerStartBlock: readBlockNumber(
    "INDEXER_START_BLOCK",
    process.env.INDEXER_START_BLOCK,
    11849510n,
  ),
  indexerBatchSize: readPositiveInteger(
    "INDEXER_BATCH_SIZE",
    process.env.INDEXER_BATCH_SIZE,
    2_000,
  ),
  indexerConfirmations: readBlockNumber(
    "INDEXER_CONFIRMATIONS",
    process.env.INDEXER_CONFIRMATIONS,
    2n,
  ),
  indexerPollIntervalMs: readPositiveInteger(
    "INDEXER_POLL_INTERVAL_MS",
    process.env.INDEXER_POLL_INTERVAL_MS,
    15_000,
  ),
} as const;
