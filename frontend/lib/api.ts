export type ListingStatus = "ACTIVE" | "CANCELED" | "SOLD" | "INVALIDATED";

export type ApiStream = {
  streamId: string;
  sender: string;
  recipient: string;
  currentOwner: string | null;
  ownership: {
    projectedOwner: string | null;
    source: string;
    sourceOfTruth: string;
    requiresOnchainRecheckForTransactions: boolean;
  };
  token: string;
  depositedAmount: string;
  withdrawnAmount: string;
  startTime: string;
  endTime: string;
  cancelable: boolean;
  canceledAt: string | null;
  createdTxHash: string;
  updatedAt: string;
  computed: {
    vestedAmount: string;
    claimableEstimate: string;
    remainingReceivable: string;
    fullyClaimed: boolean;
    estimateTimestamp: string;
  };
  riskLabel: string;
  listing: ApiListing | null;
  claims?: ApiClaim[];
  userRoles?: string[];
};

export type ApiStreamSummary = {
  streamId: string;
  sender: string;
  recipient: string;
  currentOwner: string | null;
  token: string;
  depositedAmount: string;
  withdrawnAmount: string;
  remainingReceivable: string;
  startTime: string;
  endTime: string;
  cancelable: boolean;
  canceledAt: string | null;
  riskLabel: string;
};

export type ApiListing = {
  streamId: string;
  seller: string;
  price: string;
  status: ListingStatus;
  listedAt: string;
  soldAt: string | null;
  canceledAt: string | null;
  invalidatedAt: string | null;
  buyer: string | null;
  listingTxHash: string;
  boughtTxHash: string | null;
  canceledTxHash: string | null;
  invalidatedTxHash: string | null;
  updatedAt: string;
  computed: {
    discountBps: number | null;
    expectedYieldBps: number | null;
    listedForSeconds: number;
    freshness: "fresh" | "same_day" | "stale";
  };
  stream: ApiStreamSummary | null;
};

export type ApiClaim = {
  id: string;
  streamId: string;
  recipient: string;
  amount: string;
  claimedAt: string;
  transactionHash: string;
  logIndex: number;
  createdAt: string;
};

export type ApiTrade = {
  id: string;
  streamId: string;
  seller: string;
  buyer: string;
  price: string;
  tradedAt: string;
  transactionHash: string;
  logIndex: number;
  createdAt: string;
  userRole?: "buyer" | "seller" | "unknown";
};

export type ApiMarketStats = {
  streams: {
    total: number;
  };
  listings: {
    total: number;
    byStatus: Record<ListingStatus, number>;
    activeValue: string;
  };
  trades: {
    total: number;
    volume: string;
  };
};

export type ApiProjectionMeta = {
  status: "not_started" | "synced" | "lagging" | "rpc_error";
  syncId: string;
  chainId: number;
  latestBlock: string | null;
  safeLatestBlock: string | null;
  latestIndexedBlock: string;
  latestIndexedBlockTimestamp: string | null;
  lagBlocks: string | null;
  updatedAt: string | null;
  estimateAt: string;
  error?: string;
};

export type ApiMetrics = {
  service: string;
  uptimeSeconds: number;
  phase: string;
  indexer: ApiProjectionMeta;
  timestamp: string;
};

type ApiListResponse<T> = {
  data: T[];
  meta: Record<string, unknown> & {
    projection?: ApiProjectionMeta;
  };
};

type ApiDataResponse<T> = {
  data: T;
  meta?: Record<string, unknown> & {
    projection?: ApiProjectionMeta;
  };
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_VESTORA_API_URL ?? "http://127.0.0.1:3001";

export class VestoraApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "VestoraApiError";
    this.status = status;
    this.code = code;
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body?.error?.message ??
      `Vestora API request failed with ${response.status}`;

    throw new VestoraApiError(message, response.status, body?.error?.code);
  }

  return body as T;
}

export async function fetchMetrics() {
  return fetchJson<ApiMetrics>("/metrics");
}

export async function fetchStreams() {
  return fetchJson<ApiListResponse<ApiStream>>("/streams");
}

export async function fetchStream(streamId: string) {
  return fetchJson<ApiDataResponse<ApiStream>>(`/streams/${streamId}`);
}

export async function fetchListings(status?: ListingStatus) {
  const search = status ? `?status=${status}` : "";

  return fetchJson<ApiListResponse<ApiListing>>(`/listings${search}`);
}

export async function fetchMarketStats() {
  return fetchJson<ApiDataResponse<ApiMarketStats>>("/market/stats");
}

export async function fetchUserStreams(address: string) {
  return fetchJson<ApiListResponse<ApiStream>>(`/users/${address}/streams`);
}

export async function fetchUserTrades(address: string) {
  return fetchJson<ApiListResponse<ApiTrade>>(`/users/${address}/trades`);
}
