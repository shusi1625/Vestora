import {LIVE_STREAM,LIVE_USDC} from "./live-config";
import {validSubmissionFailure} from "./transaction-safety";
import {LIVE_MARKET,MARKET_CHAIN_ID,UINT256_MAX,marketId,sameAddress,validMarketAddress,validMarketHash,type PendingMarketAction} from "./market-action-model";

export const marketPendingKey = (account:string) => `vestora:market-pending:${MARKET_CHAIN_ID}:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`;
const uint = (v:unknown) => typeof v === "string" && /^(0|[1-9]\d{0,77})$/.test(v) && BigInt(v)<=UINT256_MAX;
export function decodePendingMarketAction(raw:string|null,account:string):PendingMarketAction|null {
  if(raw===null) return null;
  try {
    const r=JSON.parse(raw) as PendingMarketAction;
    if(r.version!==1 || r.chainId!==MARKET_CHAIN_ID || !validMarketAddress(r.account) || !sameAddress(r.account,account) ||
      !sameAddress(r.contract,LIVE_MARKET) || !sameAddress(r.stream,LIVE_STREAM) || !sameAddress(r.paymentToken,LIVE_USDC) ||
      typeof r.reservation!=="string" || !/^[\w-]{1,100}$/.test(r.reservation) || !validMarketAddress(r.seller) || /^0x0{40}$/i.test(r.seller) ||
      !Number.isSafeInteger(r.createdAt) || r.createdAt<0 || !uint(r.price) || BigInt(r.price)<=0n ||
      !uint(r.remaining) || !uint(r.withdrawn) || !uint(r.reviewBlock) || typeof r.canceled!=="boolean") throw 0;
    marketId(r.id);
    if(!(r.action==="buy" && ["erc20-approval","buy"].includes(r.step) || r.action==="list" && ["nft-approval","list"].includes(r.step) || r.action==="cancel-listing" && r.step==="cancel-listing")) throw 0;
    if(r.hash!==undefined && !validMarketHash(r.hash) || r.failure!==undefined && !validSubmissionFailure(r.failure)) throw 0;
    return r;
  } catch {throw new Error("market.pendingCorrupt");}
}
export const sameMarketReservation = (a:PendingMarketAction,b:PendingMarketAction) => a.reservation===b.reservation &&
  sameAddress(a.account,b.account) && a.id===b.id && a.step===b.step && a.action===b.action && a.createdAt===b.createdAt &&
  a.price===b.price && sameAddress(a.seller,b.seller) && a.remaining===b.remaining && a.withdrawn===b.withdrawn && a.canceled===b.canceled && a.reviewBlock===b.reviewBlock;
export function browserMarketActionStorage() {
  const read=(account:string) => {
    try {return decodePendingMarketAction(localStorage.getItem(marketPendingKey(account)),account);}
    catch(e) {if(e instanceof Error && e.message==="market.pendingCorrupt") throw e; throw new Error("market.storageUnavailable");}
  };
  return {read,
    save:(r:PendingMarketAction) => {
      decodePendingMarketAction(JSON.stringify(r),r.account);
      const previous=read(r.account);
      if(previous && !sameMarketReservation(previous,r)) throw new Error("market.storageConflict");
      try {const raw=JSON.stringify(r),key=marketPendingKey(r.account); localStorage.setItem(key,raw); if(localStorage.getItem(key)!==raw) throw 0;}
      catch {throw new Error("market.storageUnavailable");}
    },
    clear:(r:PendingMarketAction) => {
      const previous=read(r.account);
      if(!previous) return;
      if(!sameMarketReservation(previous,r) || previous.hash!==r.hash) throw new Error("market.storageConflict");
      try {const key=marketPendingKey(r.account);localStorage.removeItem(key);if(localStorage.getItem(key)!==null) throw 0;}
      catch {throw new Error("market.storageUnavailable");}
    },
  };
}
