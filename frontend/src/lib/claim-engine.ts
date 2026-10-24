import type {WalletSession} from "./wallet-session";
import {walletRejected} from "./wallet-session";
import {ClaimNotSubmitted,assertQuoteUnchanged,assertDeploymentWriteAllowed,type ClaimQuote,type ClaimEvidence,type PendingClaim} from "./claim-policy";
import {submissionFailure,submissionFailureMessage} from "./transaction-safety";

export type ClaimPhase="idle"|"preparing"|"review"|"wallet"|"submitted"|"indexing"|"completed"|"rejected"|"reverted"|"replaced"|"unknown"|"error";
export type ClaimState={phase:ClaimPhase;id?:string;quote?:ClaimQuote;pending?:PendingClaim;evidence?:ClaimEvidence;error?:string;warning?:string};
export type ClaimPorts={
  contract:string;session:WalletSession;
  storage:{read:(account:string)=>PendingClaim|null;save:(record:PendingClaim)=>void;clear:(record:PendingClaim)=>void};
  quote:(token:ClaimQuote["token"],id:string)=>Promise<ClaimQuote>;
  send:(quote:ClaimQuote)=>Promise<`0x${string}`>;
  receipt:(record:PendingClaim,onReplacement:(hash:`0x${string}`)=>void)=>Promise<ClaimEvidence|"reverted"|"replaced">;
  verifyRecovery:(record:PendingClaim,hash:`0x${string}`)=>Promise<void>;
  projected:(record:PendingClaim,evidence:ClaimEvidence)=>Promise<boolean>;
  refresh:(account:string)=>Promise<void>;
  lock:(account:string,action:()=>Promise<void>)=>Promise<void>;
  assertNoOtherPending?:(account:string)=>void|Promise<void>;
  now?:()=>number;
};
const message=(error:unknown)=>walletRejected(error)?"claim.rejected":error instanceof Error&&/^(claim|actions)\./.test(error.message)?error.message:"claim.readFailed";

/** Receipt evidence is never downgraded to a failed transaction by a subsequent read error. */
export function createClaimEngine(ports:ClaimPorts){
  let states:Record<string,ClaimState>={};const listeners=new Set<()=>void>(),busy=new Set<string>();
  const put=(account:string,state:ClaimState)=>{states={...states,[account]:state};listeners.forEach(fn=>fn());};
  const run=async(account:string,action:()=>Promise<void>)=>{if(busy.has(account))return;busy.add(account);try{await action();}finally{busy.delete(account);}};
  const clear=(record:PendingClaim)=>{try{ports.storage.clear(record);return undefined;}catch{return "claim.storageWarning";}};
  const project=async(record:PendingClaim,evidence:ClaimEvidence)=>{
    let ready=false,warning=states[record.account]?.warning==="claim.storageWarning"?"claim.storageWarning":undefined;
    try{ready=await ports.projected(record,evidence);}catch{warning="claim.refreshWarning";}
    if(!ready){put(record.account,{phase:"indexing",id:record.id,pending:record,evidence,warning});return;}
    try{await ports.refresh(record.account);}catch{warning="claim.refreshWarning";}
    warning=clear(record)||warning;
    put(record.account,{phase:"completed",id:record.id,evidence,warning});
  };
  const settle=async(initial:PendingClaim)=>{
    let record=initial;
    try{
      const known=states[record.account];
      if(known?.evidence&&known.id===record.id&&known.evidence.hash===record.hash){await project(record,known.evidence);return;}
      const result=await ports.receipt(record,hash=>{
        record={...record,hash};
        try{ports.storage.save(record);}catch{/* Keep monitoring the known hash in this session. */}
        put(record.account,{phase:"submitted",id:record.id,pending:record});
      });
      if(result==="reverted"||result==="replaced"){
        put(record.account,{phase:result,id:record.id,pending:record,warning:clear(record)});return;
      }
      record={...record,hash:result.hash,evidence:{block:result.block.toString(),amount:result.amount.toString(),logIndex:result.logIndex}};
      let warning:string|undefined;
      try{ports.storage.save(record);}catch{warning="claim.storageWarning";}
      put(record.account,{phase:"indexing",id:record.id,pending:record,evidence:result,warning});
      // A post-receipt read may lag; it is not permission to send again.
      await project(record,result);
    }catch(error){put(record.account,{phase:"unknown",id:record.id,pending:record,error:message(error)});}
  };
  const restore=(account:string)=>{
    try{const pending=ports.storage.read(account);if(pending&&!states[account])put(account,{phase:"unknown",id:pending.id,pending,error:submissionFailureMessage(pending.failure)});}
    catch(error){put(account,{phase:"error",error:message(error)});}
  };
  const review=async(id:string)=>{
    let token:ClaimQuote["token"];
    try{token=ports.session.capture();}catch{return;}
    await run(token.account,async()=>{
      try{
        const existing=ports.storage.read(token.account);
        if(existing){put(token.account,{phase:"unknown",id:existing.id,pending:existing,error:submissionFailureMessage(existing.failure)});return;}
        assertDeploymentWriteAllowed(token.account,ports.contract);
        await ports.assertNoOtherPending?.(token.account);
        put(token.account,{phase:"preparing",id});
        const quote=await ports.quote(token,id);await ports.session.assertCurrent(token);
        put(token.account,{phase:"review",id,quote});
      }catch(error){put(token.account,{phase:"error",id,error:message(error)});}
    });
  };
  const execute=async(account:string)=>run(account,async()=>{
    const quote=states[account]?.quote;if(states[account]?.phase!=="review"||!quote)return;
    let record:PendingClaim|undefined,submitted=false,walletRequested=false;
    try{
      await ports.lock(account,async()=>{
        const existing=ports.storage.read(account);
        if(existing){put(account,{phase:"unknown",id:existing.id,pending:existing,error:submissionFailureMessage(existing.failure)});return;}
        assertDeploymentWriteAllowed(account,ports.contract);
        await ports.assertNoOtherPending?.(account);
        put(account,{phase:"preparing",id:quote.id});
        await ports.session.assertCurrent(quote.token);
        const latest=await ports.quote(quote.token,quote.id);assertQuoteUnchanged(quote,latest);
        await ports.session.assertCurrent(quote.token);
        await ports.assertNoOtherPending?.(account);
        record={version:1,account,contract:ports.contract,chainId:11155111,id:quote.id,createdAt:ports.now?.()??Date.now()};
        ports.storage.save(record); // Persist the reservation before opening the wallet.
        put(account,{phase:"wallet",id:quote.id,pending:record});
        walletRequested=true;
        const hash=await ports.send(latest);
        if(!/^0x[\da-f]{64}$/i.test(hash))throw new Error("claim.unknownHash");
        record={...record,hash};submitted=true;
        try{ports.storage.save(record);}catch{/* The hash remains visible and monitored in memory. */}
        put(account,{phase:"submitted",id:quote.id,pending:record});
      });
      if(submitted&&record)await settle(record);
    }catch(error){
      if(record){
        if(!walletRequested||!submitted&&(walletRejected(error)||error instanceof ClaimNotSubmitted)){put(account,{phase:walletRejected(error)?"rejected":"error",id:quote.id,error:walletRejected(error)?undefined:message(error),warning:clear(record)});}
        else {
          let warning:string|undefined;
          if(!submitted){
            const diagnostic={...record,failure:submissionFailure(error,ports.now?.()??Date.now())};record=diagnostic;
            try{await ports.lock(account,async()=>{const saved=ports.storage.read(account);if(!saved||saved.id!==diagnostic.id||saved.createdAt!==diagnostic.createdAt||saved.hash!==diagnostic.hash)throw new Error("claim.storageWarning");ports.storage.save(diagnostic);});}catch{warning="claim.storageWarning";}
          }
          put(account,{phase:"unknown",id:quote.id,pending:record,error:submissionFailureMessage(record.failure)||message(error),warning});
        }
      }else put(account,{phase:"error",id:quote.id,error:message(error)});
    }
  });
  const resume=async(account:string)=>run(account,async()=>{
    try{const record=ports.storage.read(account)||states[account]?.pending;if(!record)return;
      if(!record.hash){put(account,{phase:"unknown",id:record.id,pending:record,error:submissionFailureMessage(record.failure)});return;}
      const prior=states[account],evidence=prior?.id===record.id&&prior.evidence?.hash===record.hash?prior.evidence:undefined;
      put(account,{phase:evidence?"indexing":"submitted",id:record.id,pending:record,evidence});await settle(record);
    }catch(error){put(account,{phase:"error",error:message(error)});}
  });
  const recover=async(account:string,hash:string)=>run(account,async()=>{
    try{
      const token=ports.session.capture();if(token.account!==account)throw new Error("claim.sessionChanged");
      let recovered:PendingClaim|undefined;
      await ports.lock(account,async()=>{
        const record=ports.storage.read(account)||states[account]?.pending;if(!record||!/^0x[\da-f]{64}$/i.test(hash))throw new Error("claim.recoveryMismatch");
        const candidate=hash as `0x${string}`;await ports.verifyRecovery(record,candidate);await ports.session.assertCurrent(token);
        const saved=ports.storage.read(account);
        if(!saved||saved.id!==record.id||saved.createdAt!==record.createdAt||saved.hash!==record.hash)throw new Error("claim.recoveryMismatch");
        const next={...saved,hash:candidate,failure:undefined};ports.storage.save(next);put(account,{phase:"submitted",id:record.id,pending:next});recovered=next;
      });
      if(recovered)await settle(recovered);
    }catch(error){const previous=states[account];put(account,{...previous,phase:previous?.pending?"unknown":"error",error:message(error)});}
  });
  const reconcile=async(id:string,hash:string)=>{
    let token:ClaimQuote["token"];
    try{token=ports.session.capture();}catch{return;}
    const account=token.account;
    await run(account,async()=>{
      const previous=states[account];
      try{
        let verified:PendingClaim|undefined;
        await ports.lock(account,async()=>{
          const existing=ports.storage.read(account);
          if(existing){put(account,{phase:"unknown",id:existing.id,pending:existing});return;}
          if(!/^0x[\da-f]{64}$/i.test(hash))throw new Error("claim.recoveryMismatch");
          const record:PendingClaim={version:1,account,contract:ports.contract,chainId:11155111,id,createdAt:ports.now?.()??Date.now(),hash:hash as `0x${string}`};
          put(account,{phase:"submitted",id,pending:record});
          await ports.verifyRecovery(record,record.hash!);
          await ports.session.assertCurrent(token);
          ports.storage.save(record);verified=record;
        });
        if(verified)await settle(verified);
      }catch(error){put(account,previous?.pending?{...previous,error:message(error)}:{phase:"error",id,error:message(error)});}
    });
  };
  const invalidateReviews=()=>{for(const [account,s]of Object.entries(states)){if(s.phase==="review"&&s.quote){try{const current=ports.session.capture();if(current.revision===s.quote.token.revision&&current.account===account)continue;}catch{/* Invalidate below. */}put(account,{phase:"error",id:s.id,error:"claim.sessionChanged"});}}};
  return {getSnapshot:()=>states,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},review,execute,restore,resume,recover,reconcile,invalidateReviews};
}
export type ClaimEngine=ReturnType<typeof createClaimEngine>;
