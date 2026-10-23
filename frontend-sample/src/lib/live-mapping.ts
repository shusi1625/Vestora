import type { ApiStream, ApiTrade, Projection } from "./live-api";
import type { Claim, Listing, TxRecord } from "./types";
import { sameAddress } from "./workspace-model";

export function projectionTime(projection:Projection): Date {
  if (projection.latestProjectedBlock === null || !projection.estimateAt || !projection.latestProjectedBlockTimestamp || projection.projectionStatus === "not_started") throw new Error("Projection timestamp unavailable");
  if (Date.parse(projection.estimateAt) !== Date.parse(projection.latestProjectedBlockTimestamp)) throw new Error("Projection timestamp mismatch");
  return new Date(projection.estimateAt);
}

/** Unknown contract addresses are never guessed from token symbols. */
export function mapStream(stream:ApiStream, projection:Projection, usdcAddress:string):Claim | null {
  if (!sameAddress(stream.token, usdcAddress)) return null;
  const at = projectionTime(projection).toISOString();
  if (stream.computed.estimateTimestamp === null || Date.parse(stream.computed.estimateTimestamp) !== Date.parse(at) || stream.computed.vestedAmount === null || stream.computed.claimableEstimate === null || stream.computed.remainingReceivable === null) throw new Error("Stream valuation unavailable");
  const deposited=BigInt(stream.depositedAmount), claimed=BigInt(stream.withdrawnAmount), vested=BigInt(stream.computed.vestedAmount);
  if (claimed > vested || vested > deposited || Date.parse(stream.endTime) <= Date.parse(stream.startTime)) throw new Error("Invalid stream accounting");
  const claimable=vested-claimed, remaining=(stream.canceledAt ? vested : deposited)-claimed;
  if (BigInt(stream.computed.claimableEstimate)!==claimable || BigInt(stream.computed.remainingReceivable)!==remaining) throw new Error("Inconsistent API valuation");
  return { id:stream.streamId, token:"MockUSDC", payer:stream.sender, originalRecipient:stream.recipient,
    owner:stream.currentOwner || "", deposited, claimed, startAt:stream.startTime, endAt:stream.endTime,
    cancellable:stream.cancelable, cancelledAt:stream.canceledAt || undefined,
    ownership:stream.currentOwner ? "verifying" : "unverified", valuation:{ at, vestedRaw:vested } };
}

export function mapListing(stream:ApiStream):Listing | null {
  const listing=stream.listing;
  if (!listing) return null;
  const states={ACTIVE:"active",SOLD:"sold",CANCELED:"unlisted",INVALIDATED:"void"} as const;
  return { id:`${listing.streamId}:${listing.listingTxHash}`, claimId:listing.streamId, seller:listing.seller,
    priceRaw:BigInt(listing.price), status:states[listing.status], closedAt:listing.soldAt || listing.canceledAt || listing.invalidatedAt || undefined,
    invalidReason:listing.status === "INVALIDATED" ? "ownership-changed" : undefined };
}

export function mapRecords(streams:ApiStream[], trades:ApiTrade[], account:string, cutoff:Date, usdcAddress:string):TxRecord[] {
  const known = new Set(streams.filter(s => sameAddress(s.token,usdcAddress)).map(s => s.streamId));
  const records:TxRecord[] = [];
  for (const trade of trades) {
    if (!known.has(trade.streamId) || Date.parse(trade.tradedAt)>cutoff.getTime()) continue;
    const buyer=sameAddress(trade.buyer,account), seller=sameAddress(trade.seller,account);
    if (!buyer && !seller) continue;
    records.push({ id:`trade:${trade.id}:${trade.logIndex}`, claimId:trade.streamId, kind:"buy", role:buyer?"buyer":"seller", token:"MockUSDC", amountRaw:BigInt(trade.price), requestedAt:trade.tradedAt, phase:"completed", accountKey:account.toLowerCase(), hash:trade.transactionHash, explorerUrl:`https://sepolia.etherscan.io/tx/${trade.transactionHash}` });
  }
  for (const stream of streams) for (const claim of stream.claims || []) {
    if(claim.streamId!==stream.streamId)throw new Error("Claim stream mismatch");
    if (!known.has(stream.streamId) || !sameAddress(claim.recipient,account) || Date.parse(claim.claimedAt)>cutoff.getTime()) continue;
    records.push({ id:`claim:${claim.transactionHash}:${claim.logIndex}`, claimId:stream.streamId, kind:"claim", role:"owner", token:"MockUSDC", amountRaw:BigInt(claim.amount), requestedAt:claim.claimedAt, phase:"completed", accountKey:account.toLowerCase(), hash:claim.transactionHash, explorerUrl:`https://sepolia.etherscan.io/tx/${claim.transactionHash}` });
  }
  return [...new Map(records.map(r => [r.id,r])).values()];
}
