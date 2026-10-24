import { getClaimTotals } from "./claim-math";
import type { Amount, Claim, Listing, TokenSymbol, TxRecord } from "./types";

export const sameAddress = (a?: string | null, b?: string | null) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export const paymentPhase = (claim: Claim, now: Date) => claim.cancelledAt
  ? "cancelled" : (claim.valuation ? Date.parse(claim.valuation.at) : now.getTime()) < Date.parse(claim.startAt) ? "scheduled"
    : (claim.valuation ? Date.parse(claim.valuation.at) : now.getTime()) >= Date.parse(claim.endAt) ? "completed" : "streaming";

export const issuedAmounts = (claim: Claim, now: Date) => {
  const totals = getClaimTotals(claim, now);
  const remaining = totals.totalUnclaimed.raw;
  const returned = claim.cancelledAt ? claim.deposited - claim.claimed - remaining : 0n;
  return { deposited: claim.deposited, claimed: claim.claimed, remaining,
    claimable: totals.claimableNow.raw, future: totals.futureAmount.raw,
    returned, refundable: claim.cancellable && !claim.cancelledAt ? totals.futureAmount.raw : 0n };
};

export const issuedSummary = (claims: Claim[], address: string | null, token: TokenSymbol, now: Date) =>
  claims.filter(c => sameAddress(c.payer, address) && c.token === token).reduce((sum, c) => {
    const values = issuedAmounts(c, now);
    for (const key of Object.keys(values) as (keyof typeof values)[]) sum[key] += values[key];
    sum.count += 1;
    return sum;
  }, { deposited: 0n, claimed: 0n, remaining: 0n, claimable: 0n, future: 0n,
    returned: 0n, refundable: 0n, count: 0 });

export const portfolioForToken = (claims: Claim[], balances: Amount[], address: string | null, token: TokenSymbol, now: Date) => {
  const owned = claims.filter(c => sameAddress(c.owner, address) && c.token === token);
  const wallet = balances.filter(b => b.token === token).reduce((sum, b) => sum + b.raw, 0n);
  const totals = owned.map(c => getClaimTotals(c, now));
  const claimable = totals.reduce((sum, c) => sum + c.claimableNow.raw, 0n);
  const future = totals.reduce((sum, c) => sum + c.futureAmount.raw, 0n);
  return { wallet, claimable, future, total: wallet + claimable + future,
    owned, claimableCount: totals.filter(c => c.claimableNow.raw > 0n).length,
    unverified: owned.some(c => c.ownership !== "verified") };
};

export const activeListing = (listings: Listing[], id: string) =>
  listings.find(l => l.claimId === id && l.status === "active");

/** Projection-pinned summaries exclude browser diagnostics and inferred global withdrawals. */
export const acquisitionFor = (claim: Claim, records: TxRecord[], accountKey: string, historyReady = true) => {
  const own = records.filter(r => r.origin !== "local" && r.claimId === claim.id && r.accountKey === accountKey && r.phase === "completed");
  const purchases = own.filter(r => r.kind === "buy" && r.role !== "seller").sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt));
  const purchase = purchases[0];
  const received = own.filter(r => r.kind === "claim").reduce((sum, r) => sum + r.amountRaw, 0n);
  const label = !historyReady ? "unknown" : purchase ? "purchased" : sameAddress(claim.originalRecipient, accountKey) ? "direct" : "transferUnknown";
  return { purchase, received, label };
};

export const isPaymentToken = (value: string): value is "MockUSDC" | "mWETH" =>
  value === "MockUSDC" || value === "mWETH";
