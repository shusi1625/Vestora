import {assertDeploymentWriteAllowed,claimPendingKey} from "./claim-policy";
import {LIVE_STREAM,LIVE_USDC} from "./live-config";

export type LiveOperation="claim"|"create"|"market"|"cancel"|"mint";

export function livePendingKeys(account:string):Record<LiveOperation,string>{
  if(!/^0x[\da-f]{40}$/i.test(account))throw new Error("claim.sessionChanged");
  const owner=account.toLowerCase(),stream=LIVE_STREAM.toLowerCase();
  return {
    claim:claimPendingKey(owner,LIVE_STREAM),
    create:`vestora:create-pending:11155111:${stream}:${owner}`,
    market:`vestora:market-pending:11155111:${stream}:${owner}`,
    cancel:`vestora:cancel-payment-pending:11155111:${stream}:${owner}`,
    mint:`vestora:mint-pending:11155111:${LIVE_USDC.toLowerCase()}:${owner}`,
  };
}

/** Own records are validated by their engine; any foreign record blocks a new send. */
export function assertNoOtherLivePending(account:string,operation:LiveOperation,storage:Pick<Storage,"getItem">=localStorage){
  assertDeploymentWriteAllowed(account,LIVE_STREAM);
  const keys=livePendingKeys(account);
  for(const kind of Object.keys(keys) as LiveOperation[]){
    if(kind===operation)continue;
    let raw:string|null;
    try{raw=storage.getItem(keys[kind]);}catch{throw new Error("actions.storageUnavailable");}
    if(raw!==null)throw new Error("actions.otherPending");
  }
}

export async function withLiveTransactionLock(account:string,operation:LiveOperation,action:()=>Promise<void>,options:{checkPending?:boolean}={}){
  if(!navigator.locks)throw new Error("claim.lockUnavailable");
  await navigator.locks.request(`vestora:claim:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`,{ifAvailable:true},async lock=>{
    if(!lock)throw new Error("claim.tabBusy");
    if(options.checkPending!==false)assertNoOtherLivePending(account,operation);
    await action();
  });
}
