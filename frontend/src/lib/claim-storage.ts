import {claimPendingKey,decodeClaimPending,type PendingClaim} from "./claim-policy";
import {LIVE_STREAM} from "./live-config";
export function browserClaimStorage(){
  return {
    read:(account:string)=>{try{return decodeClaimPending(localStorage.getItem(claimPendingKey(account,LIVE_STREAM)),account,LIVE_STREAM);}catch(error){if(error instanceof Error&&error.message==="claim.pendingCorrupt")throw error;throw new Error("claim.storageUnavailable");}},
    save:(record:PendingClaim)=>{try{const key=claimPendingKey(record.account,LIVE_STREAM),raw=JSON.stringify(record);localStorage.setItem(key,raw);if(localStorage.getItem(key)!==raw)throw 0;}catch{throw new Error("claim.storageUnavailable");}},
    clear:(record:PendingClaim)=>{try{const key=claimPendingKey(record.account,LIVE_STREAM),saved=decodeClaimPending(localStorage.getItem(key),record.account,LIVE_STREAM);if(saved?.createdAt===record.createdAt)localStorage.removeItem(key);}catch{throw new Error("claim.storageUnavailable");}},
  };
}
