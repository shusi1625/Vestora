import type {WalletToken} from "./wallet-session";
import {LIVE_STREAM,LIVE_USDC} from "./live-config";
import {validSubmissionFailure,type SubmissionFailure,type GasEstimate} from "./transaction-safety";

export type PaymentDraft={recipient:string;amount:bigint;start:bigint;end:bigint;cancelable:boolean;name:string};
export type PaymentStep="approval"|"create";
export type PaymentQuote={draft:PaymentDraft;account:string;token:WalletToken;step:PaymentStep;allowance:bigint;block:bigint;at:bigint;gasEstimate?:GasEstimate};
export type PaymentEvidence={hash:`0x${string}`;block:bigint;streamId?:string};
export type PendingPayment={version:1;account:string;contract:string;tokenAddress:string;chainId:11155111;step:PaymentStep;createdAt:number;draft:Omit<PaymentDraft,"amount"|"start"|"end">&{amount:string;start:string;end:string};hash?:`0x${string}`;failure?:SubmissionFailure};
export class PaymentNotSubmitted extends Error {}
const address=(value:unknown):value is string=>typeof value==="string"&&/^0x[\da-f]{40}$/i.test(value);
export function validatePayment(draft:PaymentDraft){
  if(!address(draft.recipient)||/^0x0{40}$/i.test(draft.recipient))throw new Error("workspace.invalidRecipient");
  if(typeof draft.amount!=="bigint"||draft.amount<=0n||draft.amount>2n**256n-1n)throw new Error("workspace.invalidAmount");
  if(typeof draft.start!=="bigint"||typeof draft.end!=="bigint"||draft.start<0n||draft.end<=draft.start||draft.end>2n**64n-1n)throw new Error("workspace.invalidPeriod");
  if(typeof draft.cancelable!=="boolean"||typeof draft.name!=="string"||draft.name.length>60)throw new Error("create.invalidDraft");
}
export const samePayment=(a:PaymentDraft,b:PaymentDraft)=>a.recipient.toLowerCase()===b.recipient.toLowerCase()&&a.amount===b.amount&&a.start===b.start&&a.end===b.end&&a.cancelable===b.cancelable&&a.name===b.name;
export const pendingPaymentKey=(account:string)=>`vestora:create-pending:11155111:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`;
export const unpackPayment=(pending:PendingPayment):PaymentDraft=>({...pending.draft,amount:BigInt(pending.draft.amount),start:BigInt(pending.draft.start),end:BigInt(pending.draft.end)});
export function paymentRecord(quote:PaymentQuote,now:number):PendingPayment{
  const d=quote.draft;
  return {version:1,account:quote.account,contract:LIVE_STREAM,tokenAddress:LIVE_USDC,chainId:11155111,step:quote.step,createdAt:now,draft:{...d,amount:d.amount.toString(),start:d.start.toString(),end:d.end.toString()}};
}
export function decodePendingPayment(raw:string|null,account:string):PendingPayment|null{
  if(raw===null)return null;
  try{
    const p=JSON.parse(raw);
    if(p.version!==1||p.chainId!==11155111||!address(p.account)||p.account.toLowerCase()!==account.toLowerCase()||p.contract?.toLowerCase()!==LIVE_STREAM.toLowerCase()||p.tokenAddress?.toLowerCase()!==LIVE_USDC.toLowerCase()||!["approval","create"].includes(p.step)||!Number.isSafeInteger(p.createdAt)||p.createdAt<0)throw 0;
    for(const key of ["amount","start","end"])if(typeof p.draft?.[key]!=="string"||!/^\d+$/.test(p.draft[key]))throw 0;
    if(p.hash!==undefined&&(typeof p.hash!=="string"||!/^0x[\da-f]{64}$/i.test(p.hash)))throw 0;
    if(p.failure!==undefined&&!validSubmissionFailure(p.failure))throw 0;
    validatePayment(unpackPayment(p));return p;
  }catch{throw new Error("create.pendingCorrupt");}
}
export function paymentStorage(){
  return {
    read:(account:string)=>{try{return decodePendingPayment(localStorage.getItem(pendingPaymentKey(account)),account);}catch(error){if(error instanceof Error&&error.message==="create.pendingCorrupt")throw error;throw new Error("create.storageUnavailable");}},
    save:(record:PendingPayment)=>{try{const key=pendingPaymentKey(record.account),raw=JSON.stringify(record);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw 0;}catch{throw new Error("create.storageUnavailable");}},
    clear:(record:PendingPayment)=>{try{const key=pendingPaymentKey(record.account),saved=decodePendingPayment(localStorage.getItem(key),record.account);if(saved?.createdAt===record.createdAt&&saved.step===record.step&&saved.hash===record.hash)localStorage.removeItem(key);}catch{throw new Error("create.storageUnavailable");}},
  };
}
