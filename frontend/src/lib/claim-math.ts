import { percentRatio } from "./format";
import { addAmount, amount, sumByToken } from "./tokens";
import type {
  Amount,
  Claim,
  ClaimRole,
  ClaimStatus,
  Listing,
  ListingStatus,
  PaymentStatus,
} from "./types";

/**
 * 명세 2장의 금액 계산 규칙을 강제하는 순수 함수 모음.
 * 온체인 연동 후에도 이 함수들이 그대로 계산의 단일 경로가 됩니다.
 */

export type ClaimTotals = {
  claim: Claim;
  deposited: Amount;
  claimedToDate: Amount;
  /** 현재 조건을 충족했지만 아직 청구하지 않은 금액(추정) */
  claimableNow: Amount;
  /** 아직 지급 조건을 충족하지 않은 금액(취소된 경우 0) */
  futureAmount: Amount;
  /** 보유자가 앞으로 청구할 수 있는 잔여 권리 = 청구 가능액 + 앞으로 예정액 */
  totalUnclaimed: Amount;
  /** 앞으로 예정액 중 송금자가 취소할 수 있는 부분 */
  cancellableFuture: Amount;
  paymentStatus: PaymentStatus;
  claimStatus: ClaimStatus;
  /** 지급 계산이 멈추는 시점(취소된 경우 취소 시점) */
  accrualStopAt: string;
  isEstimate: boolean;
  ownershipVerified: boolean;
  /** 예치액 대비 진행 구간 비율(시각화용) */
  segments: { claimed: number; claimable: number; future: number };
};

const toTime = (iso: string): number => new Date(iso).getTime();

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const getClaimTotals = (claim: Claim, now: Date): ClaimTotals => {
  const start = toTime(claim.startAt);
  const end = toTime(claim.endAt);
  const cancelledAt = claim.cancelledAt ? toTime(claim.cancelledAt) : null;
  const current = claim.valuation ? Date.parse(claim.valuation.at) : now.getTime();
  // 취소된 지급은 취소 시점까지만 권리가 발생합니다.
  const accrualStop = cancelledAt !== null ? Math.min(cancelledAt, end) : end;
  const span = Math.max(end - start, 1);
  const effectiveStop = Math.min(current, accrualStop);
  const elapsed = clamp(effectiveStop - start, 0, span);

  const accruedRaw = claim.valuation?.vestedRaw ?? (claim.deposited * BigInt(Math.round(elapsed))) / BigInt(span);
  const claimableNowRaw = accruedRaw > claim.claimed ? accruedRaw - claim.claimed : 0n;
  // 취소된 지급은 앞으로 지급 예정액이 0입니다.
  const futureRaw =
    cancelledAt !== null ? 0n : claim.deposited - accruedRaw > 0n ? claim.deposited - accruedRaw : 0n;

  const paymentStatus: PaymentStatus =
    cancelledAt !== null ? "cancelled" : current >= end ? "completed" : "streaming";

  const totalUnclaimedRaw = claimableNowRaw + futureRaw;
  const claimStatus: ClaimStatus =
    claimableNowRaw > 0n
      ? "claimable"
      : totalUnclaimedRaw === 0n
        ? "fully-claimed"
        : "not-accrued";

  // 지급이 끝났거나 취소된 뒤에는 청구 가능액이 시간에 따라 변하지 않으므로 확정값입니다.
  const isEstimate = paymentStatus === "streaming";

  const deposited = claim.deposited === 0n ? 1n : claim.deposited;

  return {
    claim,
    deposited: amount(claim.token, claim.deposited),
    claimedToDate: amount(claim.token, claim.claimed),
    claimableNow: amount(claim.token, claimableNowRaw),
    futureAmount: amount(claim.token, futureRaw),
    totalUnclaimed: amount(claim.token, totalUnclaimedRaw),
    cancellableFuture: amount(
      claim.token,
      claim.cancellable && cancelledAt === null ? futureRaw : 0n,
    ),
    paymentStatus,
    claimStatus,
    accrualStopAt: new Date(accrualStop).toISOString(),
    isEstimate,
    ownershipVerified: claim.ownership === "verified",
    segments: {
      claimed: Number(claim.claimed) / Number(deposited),
      claimable: Number(claimableNowRaw) / Number(deposited),
      future: Number(futureRaw) / Number(deposited),
    },
  };
};

export type ListingMetrics = {
  price: Amount;
  listingStatus: ListingStatus;
  /** (미청구 수취액 − 가격) / 미청구 수취액. 수취액이 0이면 null */
  discountRate: number | null;
  /** 가격이 수취액보다 높을 때의 초과 금액. 0%로 숨기지 않기 위해 별도 보관 */
  excessAmount: Amount | null;
  /** 구매 예상 차익 = 미청구 수취액 − 구매 가격(비용 제외·조건 유지 가정) */
  expectedProfit: Amount;
  /** 가격 대비 예상 차익률. 가격이 0이면 null */
  profitRateVsPrice: number | null;
  /** 판매 완료 항목에는 현재 수취액 기준 차익률을 표시하지 않습니다 */
  showProfitRate: boolean;
};

export const resolveListingStatus = (
  claim: Claim,
  listing: Listing | null | undefined,
): ListingStatus => {
  if (!listing) return "unlisted";
  if (listing.status === "sold") return "sold";
  if (listing.status === "unlisted") return "cancelled";
  if (listing.status === "void") return "void";
  return "listed";
};

export const getListingMetrics = (
  claim: Claim,
  listing: Listing,
  now: Date,
  totals: ClaimTotals = getClaimTotals(claim, now),
): ListingMetrics => {
  const unclaimed = totals.totalUnclaimed.raw;
  const price = listing.priceRaw;
  const expectedProfitRaw = unclaimed - price;
  const isSold = listing.status === "sold";

  return {
    price: amount(claim.token, price),
    listingStatus: resolveListingStatus(claim, listing),
    discountRate: unclaimed === 0n ? null : percentRatio(unclaimed - price, unclaimed),
    excessAmount: price > unclaimed ? amount(claim.token, price - unclaimed) : null,
    expectedProfit: amount(claim.token, expectedProfitRaw),
    profitRateVsPrice: price === 0n ? null : percentRatio(expectedProfitRaw, price),
    showProfitRate: !isSold,
  };
};

export type TokenPortfolio = {
  token: Claim["token"];
  walletBalance: Amount;
  claimableNow: Amount;
  futureAmount: Amount;
  cancellableFuture: Amount;
  /** 소유 수취권의 총 미청구 합계 */
  ownedUnclaimed: Amount;
  /** 지갑 잔액 + 소유 수취권의 총 미청구 합계(명목) */
  holdingsTotal: Amount;
  /** 판매 등록한 보유 수취권의 총 미청구 수취액(holdingsTotal에 이미 포함됨) */
  listedUnclaimed: Amount;
  /** 본인 활성 매물의 판매가 합계. 자산 합계에 더하지 않습니다 */
  listedAskingTotal: Amount;
  ownedClaimCount: number;
  listedCount: number;
  unverifiedClaimCount: number;
};

export type PortfolioSummary = {
  tokens: TokenPortfolio[];
  listedCount: number;
  unverifiedClaimCount: number;
  /** 조건 재확인이 필요한 매물 수 */
  needsRecheckCount: number;
};

export const getPortfolioSummary = (
  claims: Claim[],
  listings: Listing[],
  balances: Amount[],
  address: string | null,
  now: Date,
): PortfolioSummary => {
  const ownedClaims = claims.filter((claim) => claim.owner === address);
  const activeListings = listings.filter((listing) => listing.status === "active");
  const ownedListingIds = new Set(
    activeListings.filter((l) => l.seller === address).map((l) => l.claimId),
  );

  const totals = ownedClaims.map((claim) => getClaimTotals(claim, now));
  const totalsByToken = new Map(totals.map((item) => [item.claim.id, item]));

  const balanceTotals = sumByToken(balances);
  const tokenOrder = [
    ...new Set([
      ...balanceTotals.map((item) => item.token),
      ...totals.map((item) => item.claim.token),
    ]),
  ];

  const tokens: TokenPortfolio[] = tokenOrder.map((token) => {
    const tokenTotals = totals.filter((item) => item.claim.token === token);
    const walletBalance =
      balanceTotals.find((item) => item.token === token) ?? amount(token, 0n);

    const claimableNow = tokenTotals.reduce(
      (acc, item) => acc + item.claimableNow.raw,
      0n,
    );
    const futureAmount = tokenTotals.reduce(
      (acc, item) => acc + item.futureAmount.raw,
      0n,
    );
    const cancellableFuture = tokenTotals.reduce(
      (acc, item) => acc + item.cancellableFuture.raw,
      0n,
    );
    const ownedUnclaimed = tokenTotals.reduce(
      (acc, item) => acc + item.totalUnclaimed.raw,
      0n,
    );
    const listedUnclaimed = tokenTotals
      .filter((item) => ownedListingIds.has(item.claim.id))
      .reduce((acc, item) => acc + item.totalUnclaimed.raw, 0n);
    const listedAskingTotal = activeListings
      .filter((listing) => listing.seller === address)
      .filter((listing) => {
        const claim = claims.find((item) => item.id === listing.claimId);
        return claim?.token === token;
      })
      .reduce((acc, listing) => acc + listing.priceRaw, 0n);

    return {
      token,
      walletBalance,
      claimableNow: amount(token, claimableNow),
      futureAmount: amount(token, futureAmount),
      cancellableFuture: amount(token, cancellableFuture),
      ownedUnclaimed: amount(token, ownedUnclaimed),
      // 보유 합계 = 지갑 잔액 + 총 미청구 수취액(판매가·청구 가능액을 중복 가산하지 않음)
      holdingsTotal: addAmount(walletBalance, amount(token, ownedUnclaimed)),
      listedUnclaimed: amount(token, listedUnclaimed),
      listedAskingTotal: amount(token, listedAskingTotal),
      ownedClaimCount: tokenTotals.length,
      listedCount: tokenTotals.filter((item) => ownedListingIds.has(item.claim.id)).length,
      unverifiedClaimCount: tokenTotals.filter((item) => !item.ownershipVerified).length,
    };
  });

  return {
    tokens,
    listedCount: tokens.reduce((acc, item) => acc + item.listedCount, 0),
    unverifiedClaimCount: tokens.reduce((acc, item) => acc + item.unverifiedClaimCount, 0),
    needsRecheckCount: activeListings.filter((listing) => listing.seller === address).length,
  };
};

/** 예상 수령액: 확인된 비용만 반영하며, 비용을 확정할 수 없으면 미확인으로 표시합니다. */
export type ExpectedProceeds = {
  amount: Amount;
  costStatus: "confirmed" | "unknown";
  confirmedCost: Amount | null;
};

export const getExpectedProceeds = (
  token: Claim["token"],
  priceRaw: bigint,
  confirmedCostRaw: bigint | null,
): ExpectedProceeds => ({
  amount: amount(token, priceRaw - (confirmedCostRaw ?? 0n)),
  costStatus: confirmedCostRaw === null ? "unknown" : "confirmed",
  confirmedCost: confirmedCostRaw === null ? null : amount(token, confirmedCostRaw),
});

export type ActionVariant =
  | "connect"
  | "verifying"
  | "claim-and-sell"
  | "claim-only"
  | "sell-only"
  | "manage-listing"
  | "buy"
  | "unavailable"
  | "closed";

export type ActorContext = {
  roles: ClaimRole[];
  variant: ActionVariant;
  canClaim: boolean;
  hasRemainingFuture: boolean;
  /** 송금자로서 지급을 취소할 수 있는 상태인지 */
  canCancelPayment: boolean;
  claimableNow: Amount;
  totalUnclaimed: Amount;
};

/** 역할은 복수일 수 있습니다. 하나로 단정하지 않고 해당하는 역할을 모두 돌려줍니다. */
export const getActorContext = (
  claim: Claim,
  listing: Listing | null,
  address: string | null,
  totals: ClaimTotals,
): ActorContext => {
  const roles: ClaimRole[] = [];
  const connected = Boolean(address);
  const isOwner = connected && claim.owner === address;
  const isPayer = connected && claim.payer === address;
  const isRecipient = connected && claim.originalRecipient === address;
  if (isOwner) roles.push("owner");
  if (isPayer) roles.push("payer");
  if (isRecipient) roles.push("recipient");

  const canClaim = totals.claimableNow.raw > 0n;
  const hasRemainingFuture = totals.futureAmount.raw > 0n;
  const isListedByMe =
    listing?.status === "active" && connected && listing.seller === address;
  const hasActiveListing = listing?.status === "active";
  const canCancelPayment =
    isPayer && claim.cancellable && !claim.cancelledAt && totals.futureAmount.raw > 0n;

  let variant: ActionVariant;
  if (!connected) {
    variant = "connect";
  } else if (!totals.ownershipVerified) {
    variant = "verifying";
  } else if (isOwner && isListedByMe) {
    variant = "manage-listing";
  } else if (isOwner && canClaim && totals.paymentStatus === "cancelled") {
    // 지급이 취소된 뒤에는 남은 청구 권리만 행사할 수 있습니다(판매 대상 아님).
    variant = "claim-only";
  } else if (isOwner && canClaim) {
    variant = "claim-and-sell";
  } else if (isOwner && !canClaim && totals.paymentStatus === "cancelled") {
    variant = "closed";
  } else if (isOwner && !canClaim && hasRemainingFuture) {
    variant = "sell-only";
  } else if (isOwner) {
    variant = "closed";
  } else if (hasActiveListing) {
    variant = "buy";
  } else {
    variant = "unavailable";
  }

  return {
    roles,
    variant,
    canClaim,
    hasRemainingFuture,
    canCancelPayment,
    claimableNow: totals.claimableNow,
    totalUnclaimed: totals.totalUnclaimed,
  };
};
