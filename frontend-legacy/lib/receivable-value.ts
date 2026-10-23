import type { ApiListing, ApiStream } from "./api";

/**
 * Monetary view-model functions. All values stay in token base units.
 * Null means unknown; it must never silently become a zero balance.
 */
export function parseBaseUnits(value: string | null | undefined): bigint | null {
  if (value == null || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function formatAmount(value: bigint | null, decimals = 6): string {
  if (value === null) return "확인 불가";
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = decimals ? digits.slice(0, -decimals) : digits;
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, "") : "";
  return (negative ? "−" : "") + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
}

export type Holding = {
  currentOwner: string | null;
  token: string;
  remaining: bigint | null;
  claimable: bigint | null;
  cancelable: boolean;
  canceled: boolean;
};

export function portfolioValue(wallet: bigint | null, holdings: Holding[], owner: string, token: string) {
  const owned = holdings.filter(h => h.currentOwner?.toLowerCase() === owner.toLowerCase() && h.token.toLowerCase() === token.toLowerCase());
  const unresolvedOwnership = holdings.some(h => h.currentOwner === null && h.token.toLowerCase() === token.toLowerCase());
  const incomplete = unresolvedOwnership || owned.some(h => h.remaining === null || h.claimable === null || h.claimable > h.remaining || h.claimable < BigInt(0) || h.remaining < BigInt(0) || (h.canceled && h.claimable !== h.remaining));
  if (incomplete) return { total: null, remaining: null, claimable: null, future: null, cancelableFuture: null };
  const remaining = owned.reduce((n, h) => n + h.remaining!, BigInt(0));
  const claimable = owned.reduce((n, h) => n + h.claimable!, BigInt(0));
  const cancelableFuture = owned.filter(h => h.cancelable && !h.canceled).reduce((n, h) => n + h.remaining! - h.claimable!, BigInt(0));
  return { total: wallet === null ? null : wallet + remaining, remaining, claimable, future: remaining - claimable, cancelableFuture };
}

export function priceComparison(remaining: bigint | null, price: bigint | null, active: boolean) {
  if (!active || remaining === null || price === null || remaining <= BigInt(0) || price <= BigInt(0)) return null;
  return {
    difference: remaining - price,
    yieldBps: (remaining - price) * BigInt(10000) / price,
    premium: price > remaining,
  };
}

/** API projections are estimates, not authorization to transact. */
export function streamHolding(stream: ApiStream): Holding {
  return {
    currentOwner: stream.currentOwner,
    token: stream.token,
    remaining: parseBaseUnits(stream.computed.remainingReceivable),
    claimable: parseBaseUnits(stream.computed.claimableEstimate),
    cancelable: stream.cancelable,
    canceled: stream.canceledAt !== null,
  };
}

export function portfolioFromStreams(wallet: bigint | null, streams: ApiStream[] | undefined, owner: string, token: string) {
  if (streams === undefined) return { total: null, remaining: null, claimable: null, future: null, cancelableFuture: null };
  return portfolioValue(wallet, streams.map(streamHolding), owner, token);
}

export function userStreamGroups(streams: ApiStream[], account: string) {
  const matches = (value: string | null) => value?.toLowerCase() === account.toLowerCase();
  return {
    owned: streams.filter(s => matches(s.currentOwner)),
    sent: streams.filter(s => matches(s.sender)),
    // Seller history remains visible even after ownership transfers.
    sales: streams.filter(s => s.listing !== null && matches(s.listing.seller)),
    ownershipUnknown: streams.filter(s => s.currentOwner === null),
  };
}

export function dateLabel(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "시각 확인 불가";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function streamView(stream: ApiStream) {
  const holding = streamHolding(stream);
  const at = Date.parse(stream.computed.estimateTimestamp ?? "");
  const end = Date.parse(stream.endTime);
  const start = Date.parse(stream.startTime);
  const hasTime = Number.isFinite(at) && Number.isFinite(end) && Number.isFinite(start);
  const paymentState = holding.canceled ? "지급 취소됨"
    : !hasTime ? "지급 시점 확인 불가"
    : at < start ? "지급 시작 전"
    : at >= end ? "지급 종료" : "지급 진행 중";
  return {
    id: stream.streamId,
    // API has no user-defined title: never invent a commercial contract name.
    name: "수취권 #" + stream.streamId,
    remaining: holding.remaining,
    claimable: holding.claimable,
    endLabel: dateLabel(stream.endTime),
    cancelable: holding.cancelable,
    canceled: holding.canceled,
    ended: hasTime && at >= end,
    listed: stream.listing?.status === "ACTIVE",
    paymentState,
    claimState: holding.remaining === BigInt(0) ? "청구 완료"
      : holding.claimable === null ? "청구 가능액 확인 불가"
      : holding.claimable > BigInt(0) ? "청구 가능" : "현재 청구 가능액 없음",
    estimateAt: stream.computed.estimateTimestamp,
  };
}

export function listingView(listing: ApiListing, account?: string) {
  const remaining = parseBaseUnits(listing.computed.remainingReceivable);
  const claimable = parseBaseUnits(listing.computed.claimableEstimate);
  const price = parseBaseUnits(listing.price);
  const owner = listing.stream?.currentOwner ?? null;
  const ownListing = !!account && account.toLowerCase() === listing.seller.toLowerCase();
  const ownerMatchesSeller = owner !== null && owner.toLowerCase() === listing.seller.toLowerCase();
  const active = listing.status === "ACTIVE";
  const comparable = active && ownerMatchesSeller;
  const reason = !active ? "현재 판매 중인 매물이 아닙니다."
    : ownListing ? "본인이 판매 중인 수취권입니다."
    : !owner ? "현재 소유권을 확인하지 못했습니다."
    : !ownerMatchesSeller ? "판매자와 현재 소유자가 다릅니다."
    : remaining === null || claimable === null || price === null ? "금액 정보를 확인하지 못했습니다."
    : price <= BigInt(0) ? "유효한 판매 가격이 아닙니다."
    : remaining <= BigInt(0) ? "남은 수취액이 없습니다."
    : claimable > remaining ? "수취액 정보가 일치하지 않습니다." : null;
  return {
    id: listing.streamId,
    price, remaining, claimable, status: listing.status, ownListing,
    comparison: priceComparison(remaining, price, comparable),
    reviewBlockReason: reason,
    // Even a synced projection is not an on-chain buy preflight.
    requiresOnchainRecheck: true as const,
    stale: listing.computed.freshness === "stale" || listing.computed.freshness === "unavailable",
  };
}
