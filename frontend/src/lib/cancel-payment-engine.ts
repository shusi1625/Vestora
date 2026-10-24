import type {WalletSession} from "./wallet-session";
import {walletRejected} from "./wallet-session";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {LIVE_STREAM} from "./live-config";
import {submissionFailure,submissionFailureMessage} from "./transaction-safety";
import {
  CancelPaymentNotSubmitted,assertCancelQuoteUnchanged,cancelPaymentId,cancelHash,cancelPaymentRecord,
  packCancelEvidence,unpackCancelEvidence,sameCancelRecord,sameCancelReservation,
  type CancelPaymentQuote,type CancelPaymentEvidence,type PendingCancelPayment,
} from "./cancel-payment-model";

export type CancelPaymentPhase="checking"|"review"|"wallet"|"submitted"|"indexing"|"completed"|"rejected"|"reverted"|"replaced"|"unknown"|"error";
export type CancelPaymentState={phase:CancelPaymentPhase;id?:string;quote?:CancelPaymentQuote;pending?:PendingCancelPayment;evidence?:CancelPaymentEvidence;error?:string;warning?:string};
export type CancelPaymentPorts={
  session:WalletSession;
  storage:{read:(account:string)=>PendingCancelPayment|null;save:(record:PendingCancelPayment)=>void;clear:(record:PendingCancelPayment)=>void};
  quote:(token:CancelPaymentQuote["token"],id:string)=>Promise<CancelPaymentQuote>;
  send:(quote:CancelPaymentQuote)=>Promise<`0x${string}`>;
  receipt:(record:PendingCancelPayment,onReplacement:(hash:`0x${string}`)=>void)=>Promise<CancelPaymentEvidence|"reverted"|"replaced">;
  verifyRecovery:(record:PendingCancelPayment,hash:`0x${string}`)=>Promise<void>;
  projected:(record:PendingCancelPayment,evidence:CancelPaymentEvidence)=>Promise<boolean>;
  refresh:(account:string)=>Promise<void>;lock:(account:string,action:()=>Promise<void>)=>Promise<void>;
  assertNoOtherPending?:(account:string)=>void|Promise<void>;now?:()=>number;
};
const message=(error:unknown)=>error instanceof Error&&/^(cancel|claim|create|workspace|live|actions)\./.test(error.message)?error.message:"cancel.readFailed";
const keyOf=(e:CancelPaymentEvidence)=>`${e.hash.toLowerCase()}:${e.blockHash.toLowerCase()}`;

export function createCancelPaymentEngine(ports:CancelPaymentPorts){
  let states:Record<string,CancelPaymentState>={};
  const listeners=new Set<()=>void>(),busy=new Set<string>(),reservations=new Map<string,PendingCancelPayment>(),verified=new Set<string>();
  const put=(a:string,s:CancelPaymentState)=>{states={...states,[a]:s};listeners.forEach(fn=>fn());};
  const run=async(a:string,action:()=>Promise<void>)=>{if(busy.has(a))return;busy.add(a);try{await action();}finally{busy.delete(a);}};
  const existing=(a:string)=>{
    const disk=ports.storage.read(a),memory=reservations.get(a);
    if(!disk)return memory;
    // A different persisted hash may be another tab's recovery. Never replace it with stale memory.
    if(memory&&sameCancelReservation(disk,memory)&&(!disk.hash||disk.hash===memory.hash)&&states[a]?.warning==="cancel.storageWarning")return memory;
    return disk;
  };
  const showPending=(r:PendingCancelPayment)=>{
    reservations.set(r.account,r);
    const prior=states[r.account],e=prior?.pending&&sameCancelRecord(prior.pending,r)?prior.evidence:unpackCancelEvidence(r);
    put(r.account,{phase:e?"indexing":"unknown",id:r.id,quote:prior?.quote,pending:r,evidence:e,
      error:submissionFailureMessage(r.failure),warning:e&&!verified.has(keyOf(e))?"cancel.receiptRecheckWarning":prior?.warning});
  };
  const failed=(a:string,error:unknown)=>{
    const prior=states[a],r=reservations.get(a)||prior?.pending;
    put(a,{...prior,phase:prior?.evidence?"indexing":r?"unknown":"error",pending:r,error:message(error)});
  };
  const persist=async(before:PendingCancelPayment,next:PendingCancelPayment)=>{
    reservations.set(next.account,next);
    try{await ports.lock(next.account,async()=>{
      const saved=ports.storage.read(next.account);
      if(!saved||!sameCancelRecord(saved,before))throw new Error("cancel.storageChanged");
      ports.storage.save(next);
    });return undefined;}catch{return "cancel.storageWarning";}
  };
  const clear=async(r:PendingCancelPayment)=>{
    try{await ports.lock(r.account,async()=>ports.storage.clear(r));reservations.delete(r.account);return undefined;}
    catch{return "cancel.storageWarning";}
  };
  const project=async(r:PendingCancelPayment,e:CancelPaymentEvidence)=>{
    let ready=false,warning=states[r.account]?.warning==="cancel.storageWarning"?"cancel.storageWarning":undefined;
    try{ready=await ports.projected(r,e);}catch{warning=warning||"cancel.refreshWarning";}
    if(!ready){put(r.account,{...states[r.account],phase:"indexing",id:r.id,pending:r,evidence:e,error:undefined,warning});return;}
    try{await ports.refresh(r.account);}catch{warning=warning||"cancel.refreshWarning";}
    warning=await clear(r)||warning;
    put(r.account,{...states[r.account],phase:"completed",id:r.id,pending:warning==="cancel.storageWarning"?r:undefined,evidence:e,error:undefined,warning});
  };
  const settle=async(initial:PendingCancelPayment)=>{
    let r=initial,updates=Promise.resolve(),warning=states[r.account]?.warning;
    try{
      const known=states[r.account]?.evidence;
      if(known&&known.hash.toLowerCase()===r.hash?.toLowerCase()&&verified.has(keyOf(known))){await project(r,known);return;}
      const result=await ports.receipt(r,hash=>{
        if(!cancelHash(hash))return;
        const before=r;r={...r,hash,evidence:undefined};const next=r;
        reservations.set(r.account,r);
        updates=updates.then(async()=>{warning=await persist(before,next)||warning;});
        put(r.account,{...states[r.account],phase:"submitted",id:r.id,pending:r,evidence:undefined,error:undefined,warning});
      });
      await updates;
      if(result==="reverted"||result==="replaced"){
        warning=await clear(r)||warning;
        put(r.account,{...states[r.account],phase:result,id:r.id,pending:warning==="cancel.storageWarning"?r:undefined,evidence:undefined,error:undefined,warning});return;
      }
      const next={...r,hash:result.hash,failure:undefined,evidence:packCancelEvidence(result)};
      warning=await persist(r,next)||warning;r=next;verified.add(keyOf(result));
      put(r.account,{...states[r.account],phase:"indexing",id:r.id,pending:r,evidence:result,error:undefined,warning});
      await project(r,result);
    }catch(error){
      await updates;reservations.set(r.account,r);
      const prior=states[r.account];
      put(r.account,{...prior,phase:prior?.evidence?"indexing":"unknown",id:r.id,pending:r,error:message(error),warning:warning||prior?.warning});
    }
  };
  const restore=(account:string)=>{
    const a=account.toLowerCase();try{const r=existing(a);if(r&&!busy.has(a))showPending(r);}catch(error){failed(a,error);}
  };
  const review=async(id:string)=>{
    let token:CancelPaymentQuote["token"];try{token=ports.session.capture();}catch{return;}
    const a=token.account.toLowerCase();
    await run(a,async()=>{try{
      const r=existing(a);if(r){showPending(r);return;}
      assertDeploymentWriteAllowed(a,LIVE_STREAM);await ports.assertNoOtherPending?.(a);cancelPaymentId(id);
      put(a,{phase:"checking",id});
      const quote=await ports.quote(token,id);await ports.session.assertCurrent(token);
      if(quote.account.toLowerCase()!==a||quote.id!==id)throw new Error("cancel.conditionsChanged");
      put(a,{phase:"review",id,quote});
    }catch(error){failed(a,error);}});
  };
  const execute=async(account:string)=>{
    const a=account.toLowerCase();await run(a,async()=>{
      const q=states[a]?.quote;if(states[a]?.phase!=="review"||!q)return;
      let r:PendingCancelPayment|undefined,submitted=false,walletRequested=false,warning:string|undefined;
      try{
        await ports.lock(a,async()=>{
          const pending=existing(a);if(pending){showPending(pending);return;}
          assertDeploymentWriteAllowed(a,LIVE_STREAM);await ports.assertNoOtherPending?.(a);
          put(a,{phase:"checking",id:q.id,quote:q});await ports.session.assertCurrent(q.token);
          const next=await ports.quote(q.token,q.id);assertCancelQuoteUnchanged(q,next);await ports.session.assertCurrent(q.token);
          await ports.assertNoOtherPending?.(a);
          const reservation=cancelPaymentRecord(next,ports.now?.()??Date.now());
          ports.storage.save(reservation);r=reservation;reservations.set(a,r);
          put(a,{phase:"wallet",id:q.id,quote:next,pending:r});walletRequested=true;
          const hash=await ports.send(next);
          if(!cancelHash(hash))throw new Error("cancel.unknownHash");
          const before=r;r={...r,hash};submitted=true;reservations.set(a,r);
          try{
            const saved=ports.storage.read(a);if(!saved||!sameCancelRecord(saved,before))throw new Error("cancel.storageChanged");
            ports.storage.save(r);
          }catch{warning="cancel.storageWarning";}
          put(a,{phase:"submitted",id:q.id,quote:next,pending:r,warning});
        });
        if(submitted&&r)await settle(r);
      }catch(error){
        if(!r){failed(a,error);return;}
        if(!walletRequested||!submitted&&(walletRejected(error)||error instanceof CancelPaymentNotSubmitted)){
          warning=await clear(r)||warning;
          put(a,{phase:walletRejected(error)?"rejected":"error",id:q.id,quote:q,pending:warning?r:undefined,error:walletRejected(error)?undefined:message(error),warning});
        }else{
          if(!submitted){const next={...r,failure:submissionFailure(error,ports.now?.()??Date.now())};warning=await persist(r,next)||warning;r=next;}
          put(a,{phase:"unknown",id:q.id,quote:states[a]?.quote||q,pending:r,error:submissionFailureMessage(r.failure)||message(error),warning});
        }
      }
    });
  };
  const resume=async(account:string)=>{
    const a=account.toLowerCase();await run(a,async()=>{try{
      const r=existing(a);if(!r)return;
      showPending(r);if(!r.hash)return;await settle(r);
    }catch(error){failed(a,error);}});
  };
  const recover=async(account:string,hash:string)=>{
    const a=account.toLowerCase();await run(a,async()=>{try{
      const token=ports.session.capture();if(token.account.toLowerCase()!==a)throw new Error("claim.sessionChanged");
      let recovered:PendingCancelPayment|undefined;
      await ports.lock(a,async()=>{
        const r=existing(a);if(!r||!cancelHash(hash))throw new Error("cancel.recoveryMismatch");
        await ports.verifyRecovery(r,hash);await ports.session.assertCurrent(token);
        const saved=ports.storage.read(a);if(!saved||!sameCancelRecord(saved,r))throw new Error("cancel.recoveryMismatch");
        const next={...saved,hash,failure:undefined,evidence:undefined};ports.storage.save(next);reservations.set(a,next);recovered=next;
        put(a,{...states[a],phase:"submitted",id:r.id,pending:next,evidence:undefined,error:undefined});
      });
      if(recovered)await settle(recovered);
    }catch(error){failed(a,error);}});
  };
  const invalidateReviews=()=>{
    for(const [a,s]of Object.entries(states)){
      if(s.phase!=="review"||!s.quote)continue;
      try{const t=ports.session.capture();if(t.account.toLowerCase()===a&&t.revision===s.quote.token.revision&&t.provider===s.quote.token.provider&&t.chainId===s.quote.token.chainId)continue;}catch{/* Invalidate below. */}
      put(a,{phase:"error",id:s.id,error:"claim.sessionChanged"});
    }
  };
  return {getSnapshot:()=>states,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},review,execute,restore,resume,recover,invalidateReviews,invalidate:invalidateReviews};
}
export type CancelPaymentEngine=ReturnType<typeof createCancelPaymentEngine>;
