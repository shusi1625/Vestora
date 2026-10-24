import type {WalletSession} from "./wallet-session";
import {walletRejected} from "./wallet-session";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {LIVE_STREAM} from "./live-config";
import {submissionFailure,submissionFailureMessage} from "./transaction-safety";
import {sameMarketReservation} from "./market-action-storage";
import {MarketActionNotSubmitted,assertMarketQuoteUnchanged,isMarketApproval,marketActionRecord,sameAddress,validMarketHash,validateMarketDraft,
  type MarketActionDraft,type MarketActionQuote,type MarketActionEvidence,type PendingMarketAction,type MarketHash} from "./market-action-model";

export type MarketActionPhase = "checking"|"review"|"wallet"|"submitted"|"approved"|"indexing"|"completed"|"rejected"|"reverted"|"replaced"|"unknown"|"error";
export type MarketActionState = {phase:MarketActionPhase;id?:string;quote?:MarketActionQuote;pending?:PendingMarketAction;evidence?:MarketActionEvidence;error?:string;warning?:string};
export type MarketActionPorts = {
  session:WalletSession; storage:{read:(account:string)=>PendingMarketAction|null;save:(r:PendingMarketAction)=>void;clear:(r:PendingMarketAction)=>void};
  quote:(token:MarketActionQuote["token"],draft:MarketActionDraft)=>Promise<MarketActionQuote>;
  send:(q:MarketActionQuote)=>Promise<MarketHash>;
  receipt:(r:PendingMarketAction,onReplacement:(hash:MarketHash)=>void)=>Promise<MarketActionEvidence|"reverted"|"replaced">;
  verifyRecovery:(r:PendingMarketAction,hash:MarketHash)=>Promise<void>;
  projected:(r:PendingMarketAction,e:MarketActionEvidence)=>Promise<boolean>;
  refresh:(account:string)=>Promise<void>; lock:(account:string,fn:()=>Promise<void>)=>Promise<void>;
  assertNoOtherPending?:(account:string)=>void|Promise<void>; now?:()=>number; reservationId?:()=>string;
};
const message=(e:unknown) => e instanceof Error && /^(market|claim|create|workspace|live|cancel|actions)\./.test(e.message)?e.message:"market.readFailed";
export function createMarketActionEngine(ports:MarketActionPorts) {
  let states:Record<string,MarketActionState>={};
  const listeners=new Set<()=>void>(),busy=new Set<string>();
  const put=(account:string,state:MarketActionState) => {states={...states,[account]:state};for(const fn of listeners){try{fn();}catch{/* Observers cannot change transaction outcomes. */}}};
  const run=async(account:string,fn:()=>Promise<void>) => {if(busy.has(account)) return;busy.add(account);try{await fn();}finally{busy.delete(account);}};
  const pending=(a:string) => {
    const saved=ports.storage.read(a),memory=states[a]?.pending;
    return saved && memory && sameMarketReservation(saved,memory) && !saved.hash && memory.hash ? memory : saved || memory;
  };
  const clear=(r:PendingMarketAction) => {try{ports.storage.clear(r);return undefined;}catch{return "market.storageWarning";}};
  const blocked=(a:string,r:PendingMarketAction) => put(a,{...states[a],phase:states[a]?.evidence?states[a].phase:"unknown",id:r.id,pending:r,error:states[a]?.evidence?undefined:submissionFailureMessage(r.failure)});
  const terminal=(r:PendingMarketAction,phase:MarketActionPhase,evidence?:MarketActionEvidence,warning?:string) => {
    if(evidence){try{const saved=ports.storage.read(r.account);if(saved && sameMarketReservation(saved,r) && !saved.hash) ports.storage.save(r);}catch{warning="market.storageWarning";}}
    const storageWarning=clear(r);put(r.account,{phase,id:r.id,evidence,pending:storageWarning?r:undefined,warning:storageWarning||warning});
  };
  const project=async(r:PendingMarketAction,e:MarketActionEvidence) => {
    let ready=false,warning=states[r.account]?.warning;
    try{ready=await ports.projected(r,e);}catch{warning=warning||"market.refreshWarning";}
    if(!ready){put(r.account,{phase:"indexing",id:r.id,pending:r,evidence:e,warning});return;}
    try{await ports.refresh(r.account);}catch{warning=warning||"market.refreshWarning";}
    terminal(r,"completed",e,warning);
  };
  const settle=async(initial:PendingMarketAction) => {
    let r=initial;
    const known=states[r.account]?.evidence;
    if(known && known.hash===r.hash && known.id===r.id && known.step===r.step){
      if(isMarketApproval(r.step)) terminal(r,"approved",known); else await project(r,known);return;
    }
    try{
      const e=await ports.receipt(r,hash=>{
        if(!validMarketHash(hash)) throw new Error("market.unknownHash");
        r={...r,hash};let warning:string|undefined;
        try{ports.storage.save(r);}catch{warning="market.storageWarning";}
        put(r.account,{phase:"submitted",id:r.id,pending:r,warning});
      });
      if(e==="reverted" || e==="replaced"){terminal(r,e);return;}
      if(!validMarketHash(e.hash) || e.id!==r.id || e.step!==r.step || e.price!==BigInt(r.price) || e.block<=BigInt(r.reviewBlock) || !Number.isSafeInteger(e.logIndex) || e.logIndex<0 || !sameAddress(e.hash,r.hash)) throw new Error("market.receiptUnavailable");
      r={...r,hash:e.hash};
      if(isMarketApproval(r.step)){terminal(r,"approved",e,states[r.account]?.warning);return;}
      let warning=states[r.account]?.warning;
      try{ports.storage.save(r);}catch{warning="market.storageWarning";}
      put(r.account,{phase:"indexing",id:r.id,pending:r,evidence:e,warning});await project(r,e);
    }catch(e){put(r.account,{phase:"unknown",id:r.id,pending:r,error:message(e),warning:states[r.account]?.warning});}
  };
  const restore=(input:string) => {const a=input.toLowerCase();try{const r=ports.storage.read(a);if(r && !states[a]) blocked(a,r);}catch(e){put(a,{phase:"error",error:message(e)});}};
  const review=async(draft:MarketActionDraft) => {
    let token:MarketActionQuote["token"];try{token=ports.session.capture();}catch{return;}
    const a=token.account.toLowerCase();
    await run(a,async()=>{try{
      const r=pending(a);if(r){blocked(a,r);return;}
      assertDeploymentWriteAllowed(a,LIVE_STREAM);await ports.assertNoOtherPending?.(a);validateMarketDraft(draft);
      const copy={...draft};put(a,{phase:"checking",id:copy.id});
      const q=await ports.quote(token,copy);await ports.session.assertCurrent(token);
      if(!sameAddress(q.account,a)||q.id!==copy.id||q.draft.action!==copy.action) throw new Error("market.conditionsChanged");
      put(a,{phase:"review",id:q.id,quote:q,warning:"market.walletCostUncertain"});
    }catch(e){put(a,{phase:"error",id:draft?.id,error:message(e)});}});
  };
  const execute=async(input:string) => {const a=input.toLowerCase();await run(a,async()=>{
    const q=states[a]?.quote;if(states[a]?.phase!=="review"||!q) return;
    let r:PendingMarketAction|undefined,requested=false,submitted=false;
    try{
      await ports.lock(a,async()=>{
        const existing=pending(a);if(existing){blocked(a,existing);return;}
        assertDeploymentWriteAllowed(a,LIVE_STREAM);await ports.assertNoOtherPending?.(a);
        put(a,{phase:"checking",id:q.id});await ports.session.assertCurrent(q.token);
        const next=await ports.quote(q.token,{...q.draft});assertMarketQuoteUnchanged(q,next);
        await ports.session.assertCurrent(q.token);await ports.assertNoOtherPending?.(a);
        r=marketActionRecord(next,ports.now?.()??Date.now(),ports.reservationId?.()??crypto.randomUUID());
        ports.storage.save(r);
        put(a,{phase:"wallet",id:r.id,pending:r,warning:"market.walletCostUncertain"});requested=true;
        const hash=await ports.send(next);if(!validMarketHash(hash)) throw new Error("market.unknownHash");
        r={...r,hash};submitted=true;let warning:string|undefined;
        try{ports.storage.save(r);}catch{warning="market.storageWarning";}
        put(a,{phase:"submitted",id:r.id,pending:r,warning});
      });
      if(submitted && r) await settle(r);
    }catch(e){
      if(!r){put(a,{phase:"error",id:q.id,error:message(e)});return;}
      if(!requested || !submitted && (walletRejected(e)||e instanceof MarketActionNotSubmitted)){
        terminal(r,walletRejected(e)?"rejected":"error");put(a,{...states[a],error:walletRejected(e)?undefined:message(e)});return;
      }
      let warning:string|undefined;
      if(!submitted){
        const diagnostic={...r,failure:submissionFailure(e,ports.now?.()??Date.now())};r=diagnostic;
        try{await ports.lock(a,async()=>{const saved=ports.storage.read(a);if(!saved || !sameMarketReservation(saved,diagnostic) || saved.hash!==diagnostic.hash) throw new Error("market.storageConflict");ports.storage.save(diagnostic);});}catch{warning="market.storageWarning";}
      }
      put(a,{phase:"unknown",id:r.id,pending:r,error:submissionFailureMessage(r.failure)||message(e),warning});
    }
  });};
  const resume=async(input:string) => {const a=input.toLowerCase();await run(a,async()=>{try{
    const r=pending(a);if(!r) return;
    if(!r.hash){blocked(a,r);return;}
    await settle(r);
  }catch(e){put(a,{...states[a],phase:states[a]?.evidence?states[a].phase:states[a]?.pending?"unknown":"error",error:message(e)});}});};
  const recover=async(input:string,hash:string) => {const a=input.toLowerCase();await run(a,async()=>{
    let prior=states[a];try{
      const token=ports.session.capture();if(!sameAddress(token.account,a)||!validMarketHash(hash)) throw new Error("market.recoveryMismatch");
      let recovered:PendingMarketAction|undefined;
      await ports.lock(a,async()=>{
        const r=pending(a);if(!r) throw new Error("market.recoveryMismatch");
        if(!prior){prior={phase:"unknown",id:r.id,pending:r};put(a,prior);}
        await ports.verifyRecovery(r,hash);await ports.session.assertCurrent(token);
        const saved=ports.storage.read(a);
        if(!saved || !sameMarketReservation(saved,r) || saved.hash!==r.hash) throw new Error("market.recoveryMismatch");
        recovered={...saved,hash,failure:undefined};ports.storage.save(recovered);put(a,{phase:"submitted",id:r.id,pending:recovered});
      });
      if(recovered) await settle(recovered);
    }catch(e){put(a,{...prior,phase:prior?.evidence?prior.phase:prior?.pending?"unknown":"error",error:message(e)});}
  });};
  const invalidate=() => {for(const [a,s] of Object.entries(states)){if(s.phase!=="review"||!s.quote) continue;try{const t=ports.session.capture();if(sameAddress(t.account,a)&&t.revision===s.quote.token.revision&&t.provider===s.quote.token.provider&&t.chainId===s.quote.token.chainId) continue;}catch{/* Expire the review below. */}put(a,{phase:"error",id:s.id,error:"claim.sessionChanged"});}};
  return {getSnapshot:()=>states,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},review,execute,restore,resume,recover,invalidate,invalidateReviews:invalidate};
}
export type MarketActionEngine = ReturnType<typeof createMarketActionEngine>;
