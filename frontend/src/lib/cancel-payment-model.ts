import type {WalletToken} from "./wallet-session";
import {LIVE_STREAM,LIVE_USDC} from "./live-config";
import {validSubmissionFailure,type SubmissionFailure,type GasEstimate} from "./transaction-safety";

export class CancelPaymentNotSubmitted extends Error {}
export type CancelPaymentTerms={sender:string;owner:string;tokenAddress:string;deposited:bigint;withdrawn:bigint;start:bigint;end:bigint};
export type CancelPaymentQuote=CancelPaymentTerms&{
  id:string;account:string;token:WalletToken;block:bigint;at:bigint;
  vested:bigint;refund:bigint;ownerUnclaimed:bigint;listingSeller:string;listingPrice:bigint;gasEstimate?:GasEstimate;
};
export type CancelPaymentEvidence={
  hash:`0x${string}`;block:bigint;blockHash:`0x${string}`;at:bigint;logIndex:number;
  sender:string;recipient:string;tokenAddress:string;vested:bigint;refund:bigint;
  // These are block-end values; claims later in the same block may reduce them.
  withdrawnAtBlock:bigint;ownerUnclaimedAtBlock:bigint;refundLogIndex?:number;
};
type PackedTerms={sender:string;owner:string;tokenAddress:string;deposited:string;withdrawn:string;start:string;end:string};
type PackedEvidence=Omit<CancelPaymentEvidence,"block"|"at"|"vested"|"refund"|"withdrawnAtBlock"|"ownerUnclaimedAtBlock">&{
  block:string;at:string;vested:string;refund:string;withdrawnAtBlock:string;ownerUnclaimedAtBlock:string;
};
export type PendingCancelPayment={
  version:1;account:string;contract:string;chainId:11155111;id:string;createdAt:number;
  terms:PackedTerms;quoteBlock:string;quoteAt:string;estimatedRefund:string;estimatedOwnerUnclaimed:string;
  hash?:`0x${string}`;failure?:SubmissionFailure;evidence?:PackedEvidence;
};
export const cancelAddress=(v:unknown):v is string=>typeof v==="string"&&/^0x[\da-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
export const cancelHash=(v:unknown):v is `0x${string}`=>typeof v==="string"&&/^0x[\da-f]{64}$/i.test(v);
export const sameCancelAddress=(a?:string|null,b?:string|null)=>Boolean(a&&b&&a.toLowerCase()===b.toLowerCase());
const uint=(v:unknown,max=2n**256n-1n):v is string=>typeof v==="string"&&/^(0|[1-9]\d*)$/.test(v)&&v.length<=78&&BigInt(v)<=max;
export function cancelPaymentId(id:string){if(!uint(id)||BigInt(id)===0n)throw new Error("cancel.invalidId");return BigInt(id);}
export function validateCancelTerms(t:CancelPaymentTerms){
  if(!cancelAddress(t.sender)||!cancelAddress(t.owner)||!sameCancelAddress(t.tokenAddress,LIVE_USDC)||
    typeof t.deposited!=="bigint"||t.deposited<=0n||t.deposited>=2n**256n||
    typeof t.withdrawn!=="bigint"||t.withdrawn<0n||t.withdrawn>t.deposited||
    typeof t.start!=="bigint"||typeof t.end!=="bigint"||t.start<0n||t.end<=t.start||t.end>=2n**64n)throw new Error("cancel.conditionsChanged");
}
export function cancelAmounts(t:CancelPaymentTerms,at:bigint){
  validateCancelTerms(t);if(at<0n)throw new Error("cancel.conditionsChanged");
  const vested=at<=t.start?0n:at>=t.end?t.deposited:t.deposited*(at-t.start)/(t.end-t.start);
  if(t.withdrawn>vested)throw new Error("cancel.conditionsChanged");
  return {vested,refund:t.deposited-vested,ownerUnclaimed:vested-t.withdrawn};
}
export function assertCancelQuoteUnchanged(a:CancelPaymentQuote,b:CancelPaymentQuote){
  if(a.id!==b.id||!sameCancelAddress(a.account,b.account)||!sameCancelAddress(a.sender,b.sender)||
    !sameCancelAddress(a.owner,b.owner)||!sameCancelAddress(a.tokenAddress,b.tokenAddress)||
    a.deposited!==b.deposited||a.withdrawn!==b.withdrawn||a.start!==b.start||a.end!==b.end||
    a.listingSeller.toLowerCase()!==b.listingSeller.toLowerCase()||a.listingPrice!==b.listingPrice||b.block<a.block||b.at<a.at)
    throw new Error("cancel.conditionsChanged");
  // Time passing changes an estimate. cancel(uint256) has no minimum-refund argument.
}
export const cancelPaymentPendingKey=(account:string)=>`vestora:cancel-payment-pending:11155111:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`;
export const unpackCancelTerms=(r:PendingCancelPayment):CancelPaymentTerms=>({...r.terms,deposited:BigInt(r.terms.deposited),withdrawn:BigInt(r.terms.withdrawn),start:BigInt(r.terms.start),end:BigInt(r.terms.end)});
export function cancelPaymentRecord(q:CancelPaymentQuote,now:number):PendingCancelPayment{
  return {version:1,account:q.account.toLowerCase(),contract:LIVE_STREAM,chainId:11155111,id:q.id,createdAt:now,
    terms:{sender:q.sender,owner:q.owner,tokenAddress:q.tokenAddress,deposited:String(q.deposited),withdrawn:String(q.withdrawn),start:String(q.start),end:String(q.end)},
    quoteBlock:String(q.block),quoteAt:String(q.at),estimatedRefund:String(q.refund),estimatedOwnerUnclaimed:String(q.ownerUnclaimed)};
}
export function packCancelEvidence(e:CancelPaymentEvidence):PackedEvidence{
  return {...e,block:String(e.block),at:String(e.at),vested:String(e.vested),refund:String(e.refund),withdrawnAtBlock:String(e.withdrawnAtBlock),ownerUnclaimedAtBlock:String(e.ownerUnclaimedAtBlock)};
}
export function unpackCancelEvidence(r:PendingCancelPayment):CancelPaymentEvidence|undefined{
  const e=r.evidence;return e&&{...e,block:BigInt(e.block),at:BigInt(e.at),vested:BigInt(e.vested),refund:BigInt(e.refund),withdrawnAtBlock:BigInt(e.withdrawnAtBlock),ownerUnclaimedAtBlock:BigInt(e.ownerUnclaimedAtBlock)};
}
export function decodePendingCancelPayment(raw:string|null,account:string):PendingCancelPayment|null{
  if(raw===null)return null;
  try{
    const r=JSON.parse(raw) as PendingCancelPayment;
    if(!r||r.version!==1||r.chainId!==11155111||!cancelAddress(r.account)||!sameCancelAddress(r.account,account)||
      !sameCancelAddress(r.contract,LIVE_STREAM)||!Number.isSafeInteger(r.createdAt)||r.createdAt<0)throw 0;
    cancelPaymentId(r.id);
    if(!r.terms||![r.terms.deposited,r.terms.withdrawn,r.terms.start,r.terms.end,r.quoteBlock,r.quoteAt,r.estimatedRefund,r.estimatedOwnerUnclaimed].every(v=>uint(v)))throw 0;
    const terms=unpackCancelTerms(r);validateCancelTerms(terms);
    if(!sameCancelAddress(terms.sender,r.account)||BigInt(r.quoteAt)>=terms.end)throw 0;
    const amounts=cancelAmounts(terms,BigInt(r.quoteAt));
    if(BigInt(r.estimatedRefund)!==amounts.refund||amounts.refund<=0n||BigInt(r.estimatedOwnerUnclaimed)!==amounts.ownerUnclaimed)throw 0;
    if(r.hash!==undefined&&!cancelHash(r.hash)||r.failure!==undefined&&!validSubmissionFailure(r.failure))throw 0;
    if(r.evidence!==undefined){
      const e=r.evidence;
      if(!e||!r.hash||!sameCancelAddress(e.hash,r.hash)||!cancelHash(e.hash)||!cancelHash(e.blockHash)||
        ![e.block,e.at,e.vested,e.refund,e.withdrawnAtBlock,e.ownerUnclaimedAtBlock].every(v=>uint(v))||
        !Number.isSafeInteger(e.logIndex)||e.logIndex<0||!sameCancelAddress(e.sender,r.account)||!cancelAddress(e.recipient)||!sameCancelAddress(e.tokenAddress,terms.tokenAddress))throw 0;
      const actual=cancelAmounts({...terms,withdrawn:BigInt(e.withdrawnAtBlock)},BigInt(e.at));
      if(BigInt(e.block)<BigInt(r.quoteBlock)||BigInt(e.at)<BigInt(r.quoteAt)||BigInt(e.withdrawnAtBlock)<terms.withdrawn||
        actual.vested!==BigInt(e.vested)||actual.refund!==BigInt(e.refund)||actual.ownerUnclaimed!==BigInt(e.ownerUnclaimedAtBlock))throw 0;
      if(actual.refund>0n?(!Number.isSafeInteger(e.refundLogIndex)||e.refundLogIndex<0||e.refundLogIndex!==e.logIndex-1):e.refundLogIndex!==undefined)throw 0;
    }
    return r;
  }catch{throw new Error("cancel.pendingCorrupt");}
}
export const sameCancelRecord=(a:PendingCancelPayment,b:PendingCancelPayment)=>JSON.stringify(a)===JSON.stringify(b);
export function sameCancelReservation(a:PendingCancelPayment,b:PendingCancelPayment){
  const {hash:_aHash,failure:_aFailure,evidence:_aEvidence,...aBase}=a;
  const {hash:_bHash,failure:_bFailure,evidence:_bEvidence,...bBase}=b;
  return JSON.stringify(aBase)===JSON.stringify(bBase);
}
