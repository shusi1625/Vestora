type ApiResponseSample = {
  method: string;
  path: string;
  statusCode: number;
  responseTimeMs: number;
  recordedAtMs: number;
};

type EndpointMetric = {
  requestCount: number;
  errorCount: number;
  totalLatencyMs: number;
};

const MAX_SAMPLES = 1_000;
const samples: ApiResponseSample[] = [];
const endpointMetrics = new Map<string, EndpointMetric>();

function percentile(values: number[], percentileRank: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileRank / 100) * sorted.length) - 1,
  );

  return Number(sorted[index].toFixed(2));
}

function pathFromUrl(url: string) {
  const normalizePath = (path: string) =>
    path
      .replace(/\/0x[a-fA-F0-9]{40}/g, "/:address")
      .replace(/\/\d+/g, "/:id");

  try {
    return normalizePath(new URL(url, "http://vestora.local").pathname);
  } catch {
    return normalizePath(url.split("?")[0] ?? url);
  }
}

export function recordApiResponse(input: {
  method: string;
  url: string;
  statusCode: number;
  responseTimeMs: number;
}) {
  const path = pathFromUrl(input.url);
  const sample = {
    method: input.method,
    path,
    statusCode: input.statusCode,
    responseTimeMs: input.responseTimeMs,
    recordedAtMs: Date.now(),
  } satisfies ApiResponseSample;

  samples.push(sample);

  if (samples.length > MAX_SAMPLES) {
    samples.shift();
  }

  const key = `${input.method} ${path}`;
  const metric =
    endpointMetrics.get(key) ??
    ({
      requestCount: 0,
      errorCount: 0,
      totalLatencyMs: 0,
    } satisfies EndpointMetric);

  metric.requestCount += 1;
  metric.totalLatencyMs += input.responseTimeMs;

  if (input.statusCode >= 400) {
    metric.errorCount += 1;
  }

  endpointMetrics.set(key, metric);
}

export function getApiMetrics() {
  const requestCount = samples.length;
  const latencies = samples.map((sample) => sample.responseTimeMs);
  const status4xx = samples.filter(
    (sample) => sample.statusCode >= 400 && sample.statusCode < 500,
  ).length;
  const status5xx = samples.filter((sample) => sample.statusCode >= 500).length;
  const nowMs = Date.now();
  const recentWindowMs = 5 * 60 * 1_000;
  const recentRequestCount = samples.filter(
    (sample) => nowMs - sample.recordedAtMs <= recentWindowMs,
  ).length;

  return {
    sampleLimit: MAX_SAMPLES,
    sampleCount: requestCount,
    recentWindowSeconds: recentWindowMs / 1_000,
    recentRequestCount,
    requestsPerMinute:
      recentRequestCount === 0
        ? 0
        : Number((recentRequestCount / (recentWindowMs / 60_000)).toFixed(2)),
    statusCodeCounts: {
      "2xx": samples.filter(
        (sample) => sample.statusCode >= 200 && sample.statusCode < 300,
      ).length,
      "3xx": samples.filter(
        (sample) => sample.statusCode >= 300 && sample.statusCode < 400,
      ).length,
      "4xx": status4xx,
      "5xx": status5xx,
    },
    errorRate:
      requestCount === 0
        ? 0
        : Number(((status4xx + status5xx) / requestCount).toFixed(4)),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
    },
    endpoints: [...endpointMetrics.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([endpoint, metric]) => ({
        endpoint,
        requestCount: metric.requestCount,
        errorCount: metric.errorCount,
        averageLatencyMs: Number(
          (metric.totalLatencyMs / metric.requestCount).toFixed(2),
        ),
      })),
  };
}
