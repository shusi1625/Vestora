import { performance } from "node:perf_hooks";

import { createPublicClient, http } from "viem";

import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { checkDatabaseConnection, prisma } from "../src/db/prisma.js";
import { indexedContracts } from "../src/indexer/contracts.js";

type Measurement = {
  scenario: string;
  environment: string;
  sampleSize: number;
  count: number | null;
  minMs: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

type StreamsResponse = {
  data?: Array<{
    streamId?: string;
    sender?: string;
    recipient?: string;
    currentOwner?: string;
  }>;
};

const sampleSize = readPositiveInteger(
  "PERFORMANCE_SAMPLE_SIZE",
  process.env.PERFORMANCE_SAMPLE_SIZE,
  20,
);

const app = buildApp();
const publicClient = createPublicClient({
  transport: http(env.sepoliaRpcUrl),
});

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
) {
  const parsed = Number(value ?? fallback);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function percentile(sorted: number[], percentileValue: number) {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const boundedIndex = Math.min(Math.max(index, 0), sorted.length - 1);

  return sorted[boundedIndex];
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function summarize(
  scenario: string,
  environment: string,
  durations: number[],
  count: number | null,
): Measurement {
  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    scenario,
    environment,
    sampleSize: sorted.length,
    count,
    minMs: round(sorted[0] ?? 0),
    averageMs: round(total / sorted.length),
    p50Ms: round(percentile(sorted, 50)),
    p95Ms: round(percentile(sorted, 95)),
    p99Ms: round(percentile(sorted, 99)),
    maxMs: round(sorted[sorted.length - 1] ?? 0),
  };
}

async function measureApiPath(path: string): Promise<Measurement> {
  const durations: number[] = [];
  let count: number | null = null;

  for (let index = 0; index < sampleSize; index += 1) {
    const startedAt = performance.now();
    const response = await app.inject({
      method: "GET",
      url: path,
    });
    const duration = performance.now() - startedAt;

    if (response.statusCode !== 200) {
      throw new Error(
        `${path} expected 200 but received ${response.statusCode}: ${response.body}`,
      );
    }

    const body = response.json();
    count = body.meta?.count ?? body.data?.length ?? count;
    durations.push(duration);
  }

  return summarize(`backend API ${path}`, "local Fastify inject", durations, count);
}

async function measureRpcLogs(
  contractName: string,
  address: `0x${string}`,
): Promise<Measurement> {
  const latestBlock = await publicClient.getBlockNumber();
  const safeLatestBlock =
    latestBlock > env.indexerConfirmations
      ? latestBlock - env.indexerConfirmations
      : latestBlock;
  const toBlock =
    safeLatestBlock >= env.indexerStartBlock
      ? safeLatestBlock
      : env.indexerStartBlock;
  const durations: number[] = [];
  let count: number | null = null;

  for (let index = 0; index < sampleSize; index += 1) {
    const startedAt = performance.now();
    const logs = await publicClient.getLogs({
      address,
      fromBlock: env.indexerStartBlock,
      toBlock,
    });
    const duration = performance.now() - startedAt;

    count = logs.length;
    durations.push(duration);
  }

  return summarize(
    `direct RPC logs ${contractName}`,
    `Sepolia ${env.indexerStartBlock.toString()}-${toBlock.toString()}`,
    durations,
    count,
  );
}

function renderMarkdownTable(measurements: Measurement[]) {
  console.log("| Scenario | Environment | Samples | Count | Avg ms | p50 ms | p95 ms | p99 ms | Min ms | Max ms |");
  console.log("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");

  for (const measurement of measurements) {
    console.log(
      [
        `| ${measurement.scenario}`,
        measurement.environment,
        measurement.sampleSize.toString(),
        measurement.count === null ? "-" : measurement.count.toString(),
        measurement.averageMs.toString(),
        measurement.p50Ms.toString(),
        measurement.p95Ms.toString(),
        measurement.p99Ms.toString(),
        measurement.minMs.toString(),
        `${measurement.maxMs.toString()} |`,
      ].join(" | "),
    );
  }
}

try {
  try {
    await checkDatabaseConnection();
  } catch (error) {
    throw new Error(
      [
        "Performance measurement requires the local PostgreSQL database to be reachable.",
        "Start it with `pnpm --dir backend compose:up`, run migrations, and rebuild projections before measuring.",
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      ].join(" "),
    );
  }

  await app.ready();

  const streamsResponse = await app.inject({
    method: "GET",
    url: "/streams",
  });

  if (streamsResponse.statusCode !== 200) {
    throw new Error(
      `/streams warmup expected 200 but received ${streamsResponse.statusCode}: ${streamsResponse.body}`,
    );
  }

  const streamsBody = streamsResponse.json<StreamsResponse>();
  const firstStream = streamsBody.data?.[0];
  const streamId = firstStream?.streamId;
  const address =
    firstStream?.currentOwner ?? firstStream?.recipient ?? firstStream?.sender;

  const apiPaths = [
    "/health",
    "/streams",
    "/listings",
    "/market/stats",
    "/metrics",
    ...(streamId ? [`/streams/${streamId}`] : []),
    ...(address ? [`/users/${address}/streams`, `/users/${address}/trades`] : []),
  ];

  const measurements: Measurement[] = [];

  for (const path of apiPaths) {
    measurements.push(await measureApiPath(path));
  }

  for (const contract of indexedContracts) {
    measurements.push(await measureRpcLogs(contract.name, contract.address));
  }

  console.log("# Vestora Performance Measurements");
  console.log("");
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Sample size per scenario: ${sampleSize}`);
  console.log("");
  renderMarkdownTable(measurements);
} finally {
  await app.close();
  await prisma.$disconnect();
}
