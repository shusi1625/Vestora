import type {WalletToken} from "./wallet-session";
import type {GasEstimate, SubmissionFailure} from "./transaction-safety";
import {LIVE_STREAM, LIVE_USDC, LIVE_MARKET} from "./live-config";

export {LIVE_MARKET} from "./live-config";
export const MARKET_CHAIN_ID = 11155111 as const;
export const UINT256_MAX = 2n ** 256n - 1n;
export type MarketHash = `0x${string}`;
export type MarketActionDraft = {action:"buy"|"list"; id:string; price:bigint} | {action:"cancel-listing"; id:string};
export type MarketActionStep = "erc20-approval"|"nft-approval"|"buy"|"list"|"cancel-listing";
export type MarketActionQuote = {
  draft:MarketActionDraft; id:string; account:string; token:WalletToken; step:MarketActionStep;
  owner:string; seller:string; price:bigint; remaining:bigint; withdrawn:bigint; claimable:bigint;
  canceled:boolean; cancelable:boolean; allowance:bigint; approved:string; approvedForAll:boolean;
  block:bigint; at:bigint; gasEstimate?:GasEstimate;
};
export type MarketActionEvidence = {hash:MarketHash; block:bigint; logIndex:number; id:string; step:MarketActionStep; price:bigint};
export type PendingMarketAction = {
  version:1; reservation:string; account:string; contract:string; stream:string; paymentToken:string;
  chainId:typeof MARKET_CHAIN_ID; action:MarketActionDraft["action"]; step:MarketActionStep; id:string;
  price:string; seller:string; remaining:string; withdrawn:string; canceled:boolean; reviewBlock:string; createdAt:number;
  hash?:MarketHash; failure?:SubmissionFailure;
};
export class MarketActionNotSubmitted extends Error {}
export const sameAddress = (a?:string|null,b?:string|null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const validMarketHash = (h:unknown):h is MarketHash => typeof h === "string" && /^0x[\da-f]{64}$/i.test(h);
export const validMarketAddress = (a:unknown):a is string => typeof a === "string" && /^0x[\da-f]{40}$/i.test(a);
export function marketId(id:unknown):bigint {
  if(typeof id !== "string" || !/^[1-9]\d{0,77}$/.test(id) || BigInt(id)>UINT256_MAX) throw new Error("market.invalidId");
  return BigInt(id);
}
export function validateMarketDraft(d:MarketActionDraft) {
  if(!d || !["buy","list","cancel-listing"].includes(d.action)) throw new Error("market.invalidDraft");
  marketId(d.id);
  if(d.action !== "cancel-listing" && (typeof d.price !== "bigint" || d.price<=0n || d.price>UINT256_MAX)) throw new Error("market.invalidPrice");
}
export const isMarketApproval = (step:MarketActionStep) => step === "erc20-approval" || step === "nft-approval";
export function assertMarketQuoteUnchanged(a:MarketActionQuote,b:MarketActionQuote) {
  if(!sameAddress(a.account,b.account) || a.id!==b.id || a.draft.action!==b.draft.action || a.step!==b.step ||
    !sameAddress(a.owner,b.owner) || !sameAddress(a.seller,b.seller) || a.price!==b.price ||
    a.withdrawn!==b.withdrawn || b.remaining<a.remaining || a.canceled!==b.canceled || a.cancelable!==b.cancelable ||
    a.token.provider!==b.token.provider || a.token.revision!==b.token.revision || a.token.chainId!==b.token.chainId)
    throw new Error("market.conditionsChanged");
}
export function marketActionRecord(q:MarketActionQuote,now:number,reservation:string):PendingMarketAction {
  return {version:1,reservation,account:q.account.toLowerCase(),contract:LIVE_MARKET,stream:LIVE_STREAM,paymentToken:LIVE_USDC,
    chainId:MARKET_CHAIN_ID,action:q.draft.action,step:q.step,id:q.id,price:q.price.toString(),seller:q.seller,
    remaining:q.remaining.toString(),withdrawn:q.withdrawn.toString(),canceled:q.canceled,reviewBlock:q.block.toString(),createdAt:now};
}
export function marketDraftFromRecord(r:PendingMarketAction):MarketActionDraft {
  return r.action === "cancel-listing" ? {action:r.action,id:r.id} : {action:r.action,id:r.id,price:BigInt(r.price)};
}
