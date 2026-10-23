import type {WalletSession} from "./wallet-session";
import {walletRejected} from "./wallet-session";
import {PaymentNotSubmitted,paymentRecord,samePayment,validatePayment,type PaymentDraft,type PaymentQuote,type PendingPayment,type PaymentEvidence} from "./create-payment-model";
import {submissionFailure,submissionFailureMessage} from "./transaction-safety";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {LIVE_STREAM} from "./live-config";

export type PaymentPhase="checking"|"review"|"wallet"|"submitted"|"approved"|"indexing"|"completed"|"rejected"|"reverted"|"replaced"|"unknown"|"error";
export type PaymentState={phase:PaymentPhase;quote?:PaymentQuote;pending?:PendingPayment;evidence?:PaymentEvidence;error?:string;warning?:string};
export type PaymentPorts={session:WalletSession;storage:{read:(account:string)=>PendingPayment|null;save:(record:PendingPayment)=>void;clear:(record:PendingPayment)=>void};
  quote:(token:PaymentQuote["token"],draft:PaymentDraft)=>Promise<PaymentQuote>;
  send:(quote:PaymentQuote)=>Promise<`0x${string}`>;
  receipt:(record:PendingPayment,onReplacement:(hash:`0x${string}`)=>void)=>Promise<PaymentEvidence|"reverted"|"replaced">;
  verifyRecovery:(record:PendingPayment,hash:`0x${string}`)=>Promise<void>;
  projected:(record:PendingPayment,evidence:PaymentEvidence)=>Promise<boolean>;
  refresh:(account:string)=>Promise<void>;lock:(account:string,fn:()=>Promise<void>)=>Promise<void>;now?:()=>number};
const message=(error:unknown)=>error instanceof Error&&/^(create|claim|workspace|live)\./.test(error.message)?error.message:"create.readFailed";
/** Approval and escrow creation always require separate explicit wallet actions. */
export function createPaymentEngine(ports:PaymentPorts){
  let states:Record<string,PaymentState>={};const listeners=new Set<()=>void>(),busy=new Set<string>();
  const put=(a:string,s:PaymentState)=>{states={...states,[a]:s};listeners.forEach(fn=>fn());};
  const run=async(a:string,fn:()=>Promise<void>)=>{if(busy.has(a))return;busy.add(a);try{await fn();}finally{busy.delete(a);}};
  const clear=(r:PendingPayment)=>{try{ports.storage.clear(r);return undefined;}catch{return "create.storageWarning";}};
  const project=async(r:PendingPayment,e:PaymentEvidence)=>{
    let ready=false,warning=states[r.account]?.warning;
    try{ready=await ports.projected(r,e);}catch{warning="create.refreshWarning";}
    if(!ready){put(r.account,{phase:"indexing",pending:r,evidence:e,warning});return;}
    try{await ports.refresh(r.account);}catch{warning="create.refreshWarning";}
    warning=clear(r)||warning;put(r.account,{phase:"completed",pending:r,evidence:e,warning});
  };
  const settle=async(initial:PendingPayment)=>{
    let r=initial;
    try{
      const known=states[r.account];
      if(r.step==="create"&&known?.evidence?.streamId&&known.evidence.hash===r.hash){await project(r,known.evidence);return;}
      const e=await ports.receipt(r,hash=>{r={...r,hash};try{ports.storage.save(r);}catch{/* Continue with the known hash in memory. */}put(r.account,{phase:"submitted",pending:r});});
      if(e==="reverted"||e==="replaced"){put(r.account,{phase:e,pending:r,warning:clear(r)});return;}
      r={...r,hash:e.hash};
      if(r.step==="approval"){put(r.account,{phase:"approved",pending:r,evidence:e,warning:clear(r)});return;}
      let warning:string|undefined;try{ports.storage.save(r);}catch{warning="create.storageWarning";}
      put(r.account,{phase:"indexing",pending:r,evidence:e,warning});await project(r,e);
    }catch(error){put(r.account,{phase:"unknown",pending:r,error:message(error)});}
  };
  const restore=(account:string)=>{try{const pending=ports.storage.read(account);if(pending&&!states[account])put(account,{phase:"unknown",pending,error:submissionFailureMessage(pending.failure)});}catch(error){put(account,{phase:"error",error:message(error)});}};
  const review=async(draft:PaymentDraft)=>{
    let token:PaymentQuote["token"];try{token=ports.session.capture();}catch{return;}
    await run(token.account,async()=>{try{
      const pending=ports.storage.read(token.account);if(pending){put(token.account,{phase:"unknown",pending,error:submissionFailureMessage(pending.failure)});return;}
      assertDeploymentWriteAllowed(token.account,LIVE_STREAM);
      validatePayment(draft);put(token.account,{phase:"checking"});
      const quote=await ports.quote(token,{...draft});await ports.session.assertCurrent(token);
      put(token.account,{phase:"review",quote});
    }catch(error){put(token.account,{phase:"error",error:message(error)});}});
  };
  const execute=async(account:string)=>run(account,async()=>{
    const q=states[account]?.quote;if(states[account]?.phase!=="review"||!q)return;
    let record:PendingPayment|undefined,submitted=false,walletRequested=false;
    try{
      await ports.lock(account,async()=>{
        const pending=ports.storage.read(account);if(pending){put(account,{phase:"unknown",pending,error:submissionFailureMessage(pending.failure)});return;}
        assertDeploymentWriteAllowed(account,LIVE_STREAM);
        put(account,{phase:"checking"});await ports.session.assertCurrent(q.token);
        const next=await ports.quote(q.token,q.draft);await ports.session.assertCurrent(q.token);
        if(next.account!==q.account||next.step!==q.step||!samePayment(next.draft,q.draft))throw new Error("create.conditionsChanged");
        record=paymentRecord(next,ports.now?.()??Date.now());ports.storage.save(record);
        put(account,{phase:"wallet",pending:record});walletRequested=true;const hash=await ports.send(next);
        if(!/^0x[\da-f]{64}$/i.test(hash))throw new Error("create.unknownHash");
        record={...record,hash};submitted=true;try{ports.storage.save(record);}catch{/* Hash remains visible in memory. */}
        put(account,{phase:"submitted",pending:record});
      });
      if(submitted&&record)await settle(record);
    }catch(error){
      if(record){
        if(!walletRequested||!submitted&&(walletRejected(error)||error instanceof PaymentNotSubmitted))put(account,{phase:walletRejected(error)?"rejected":"error",error:walletRejected(error)?undefined:message(error),warning:clear(record)});
        else {
          let warning:string|undefined;
          if(!submitted){
            const diagnostic={...record,failure:submissionFailure(error,ports.now?.()??Date.now())};record=diagnostic;
            try{await ports.lock(account,async()=>{const saved=ports.storage.read(account);if(!saved||saved.step!==diagnostic.step||saved.createdAt!==diagnostic.createdAt||saved.hash!==diagnostic.hash)throw new Error("create.storageWarning");ports.storage.save(diagnostic);});}catch{warning="create.storageWarning";}
          }
          put(account,{phase:"unknown",pending:record,error:submissionFailureMessage(record.failure)||message(error),warning});
        }
      }else put(account,{phase:"error",error:message(error)});
    }
  });
  const resume=async(account:string)=>run(account,async()=>{try{
    const r=ports.storage.read(account)||states[account]?.pending;if(!r)return;
    if(!r.hash){put(account,{phase:"unknown",pending:r,error:submissionFailureMessage(r.failure)});return;}
    const previous=states[account],evidence=previous?.evidence?.hash===r.hash?previous.evidence:undefined;
    put(account,{phase:evidence?.streamId?"indexing":"submitted",pending:r,evidence});await settle(r);
  }catch(error){put(account,{phase:"error",error:message(error)});}});
  const recover=async(account:string,hash:string)=>run(account,async()=>{const prior=states[account];try{
    const token=ports.session.capture();if(token.account!==account)throw new Error("claim.sessionChanged");
    let recovered:PendingPayment|undefined;
    await ports.lock(account,async()=>{
      const r=ports.storage.read(account)||prior?.pending;if(!r||!/^0x[\da-f]{64}$/i.test(hash))throw new Error("create.recoveryMismatch");
      const candidate=hash as `0x${string}`;await ports.verifyRecovery(r,candidate);await ports.session.assertCurrent(token);
      const saved=ports.storage.read(account);
      if(!saved||saved.step!==r.step||saved.createdAt!==r.createdAt||saved.hash!==r.hash)throw new Error("create.recoveryMismatch");
      const next={...saved,hash:candidate,failure:undefined};ports.storage.save(next);put(account,{phase:"submitted",pending:next});recovered=next;
    });
    if(recovered)await settle(recovered);
  }catch(error){put(account,{...prior,phase:prior?.pending?"unknown":"error",error:message(error)});}});
  const invalidate=()=>{for(const [a,s]of Object.entries(states)){if(s.phase!=="review"||!s.quote)continue;try{const t=ports.session.capture();if(t.account===a&&t.revision===s.quote.token.revision)continue;}catch{/* Invalidate below. */}put(a,{phase:"error",error:"claim.sessionChanged"});}};
  return{getSnapshot:()=>states,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},review,execute,restore,resume,recover,invalidate};
}
