import type { WalletToken } from "./wallet-session";
import {validSubmissionFailure,type SubmissionFailure,type GasEstimate} from "./transaction-safety";
export class ClaimNotSubmitted extends Error {}
// An unresolved request on the old origin must not become a new send on this one.
export const deploymentAccountHeld=(account:string,contract:string)=>
  account.toLowerCase()==="0xbf9bf852225899b667aa4c73bb082e830abb9de1"&&
  contract.toLowerCase()==="0x2b6becf31c41c25f3a4ef73f6daeeff85db8ed1a";
export function assertDeploymentWriteAllowed(account:string,contract:string){
  if(deploymentAccountHeld(account,contract))throw new Error("claim.deploymentHold");
}
export type ClaimQuote={id:string;account:string;amount:bigint;withdrawn:bigint;block:bigint;at:bigint;token:WalletToken;gasEstimate?:GasEstimate};
export type ClaimEvidence={hash:`0x${string}`;block:bigint;amount:bigint;logIndex:number};
export type PendingClaim={version:1;account:string;contract:string;chainId:11155111;id:string;createdAt:number;hash?:`0x${string}`;failure?:SubmissionFailure;evidence?:{block:string;amount:string;logIndex:number}};
export const claimPendingKey=(account:string,contract:string)=>`vestora:claim-pending:11155111:${contract.toLowerCase()}:${account.toLowerCase()}`;
export function decodeClaimPending(raw:string|null,account:string,contract:string):PendingClaim|null{
  if(raw===null)return null;
  try{
    const p=JSON.parse(raw);
    if(p.version!==1||p.chainId!==11155111||typeof p.account!=="string"||p.account.toLowerCase()!==account.toLowerCase()||typeof p.contract!=="string"||p.contract.toLowerCase()!==contract.toLowerCase()||!/^0x[\da-f]{40}$/i.test(p.account)||typeof p.id!=="string"||!/^\d+$/.test(p.id)||BigInt(p.id)<=0n||typeof p.createdAt!=="number"||!Number.isSafeInteger(p.createdAt)||p.createdAt<0)throw 0;
    if(p.hash!==undefined&&(typeof p.hash!=="string"||!/^0x[\da-f]{64}$/i.test(p.hash)))throw 0;
    if(p.failure!==undefined&&!validSubmissionFailure(p.failure))throw 0;
    if(p.evidence&&(!p.hash||typeof p.evidence.block!=="string"||!/^\d+$/.test(p.evidence.block)||typeof p.evidence.amount!=="string"||!/^\d+$/.test(p.evidence.amount)||BigInt(p.evidence.amount)<=0n||!Number.isInteger(p.evidence.logIndex)||p.evidence.logIndex<0))throw 0;
    return p;
  }catch{throw new Error("claim.pendingCorrupt");}
}
export function assertQuoteUnchanged(prior:ClaimQuote,next:ClaimQuote){
  if(prior.account!==next.account||prior.id!==next.id||prior.withdrawn!==next.withdrawn||next.amount<prior.amount||next.amount<=0n)throw new Error("claim.conditionsChanged");
}
export function projectionHasClaim(projectionBlock:string|null,evidence:ClaimEvidence,claims:{transactionHash:string;recipient:string;streamId:string;amount:string;logIndex:number}[],account:string,id:string){
  return projectionBlock!==null&&BigInt(projectionBlock)>=evidence.block&&claims.some(c=>c.transactionHash.toLowerCase()===evidence.hash.toLowerCase()&&c.recipient.toLowerCase()===account.toLowerCase()&&c.streamId===id&&BigInt(c.amount)===evidence.amount&&c.logIndex===evidence.logIndex);
}
