import {useEffect,useRef,useState} from "react";
import {useTranslation} from "react-i18next";
import {Link} from "react-router-dom";
import {ExternalLink,RefreshCw,Loader2} from "lucide-react";
import {useLiveWorkspace} from "@/providers/live-context";
import {usePaymentNames} from "@/hooks/use-payment-names";
import {Button} from "@/components/ui/button";
import {formatFullUnits} from "@/lib/format";
import {samePayment,unpackPayment,type PaymentDraft} from "@/lib/create-payment-model";
import type {PaymentState} from "@/lib/create-payment-engine";
import {LIVE_STREAM} from "@/lib/live-config";
import {canDismissTransactionNotice} from "@/lib/notice-policy";
import {DismissibleNotice} from "./DismissibleNotice";
import {GasReview} from "./GasReview";

function PaymentProgress({state,historical=false}:{state:PaymentState;historical?:boolean}){
  const {t}=useTranslation(),live=useLiveWorkspace(),[hash,setHash]=useState("");
  const names=usePaymentNames(live?.connectedAddress||null),saved=useRef("");
  const record=state.pending,e=state.evidence,account=live?.connectedAddress;
  useEffect(()=>{
    if(!account||!record||!e?.streamId||!record.draft.name||saved.current===e.hash)return;
    saved.current=e.hash;names.save(e.streamId,record.draft.name);
  },[account,record,e,names]);
  if(!live||!account)return null;
  const waiting=["checking","wallet","submitted"].includes(state.phase),txHash=e?.hash||record?.hash;
  const tone=state.phase==="completed"||state.phase==="approved"?"completed":["unknown","indexing"].includes(state.phase)?"unknown":["error","rejected","reverted","replaced"].includes(state.phase)?"error":"submitted";
  const body=t(`create.body.${state.phase}`);
  return <DismissibleNotice noticeKey={`create:${account}:${state.phase}:${txHash||""}:${state.error||""}:${state.warning||""}`} dismissible={canDismissTransactionNotice(state.phase,Boolean(e))} closeLabel={t("notice.closeCreate")} className={`claim-progress claim-${tone}`}><div className="claim-phase-heading">{waiting&&<Loader2 size={15} className="animate-spin"/>}<strong>{t(historical?"create.lastPreflight":`create.phase.${state.phase}`)}{record&&!["completed","indexing","approved"].includes(state.phase)?` · ${t(`create.step.${record.step}`)}`:""}</strong></div><p>{body}</p>
    {e?.streamId&&<p>{t("common.claimId",{id:e.streamId})} · {t("workspace.deposited")} <strong>{record?formatFullUnits(BigInt(record.draft.amount),"MockUSDC"):""} MockUSDC</strong></p>}
    {record&&<p className="ws-caption">{t("workspace.originalRecipient")} <span className="ws-address">{record.draft.recipient}</span></p>}
    {state.phase==="unknown"&&record&&!record.hash&&!record.failure&&<p className="ws-caption">{t("claim.legacyPending")}</p>}
    {state.error&&<p className="ws-form-error">{t(state.error)}</p>}{state.warning&&t(state.warning)!==body&&<p className="ws-text-warning">{t(state.warning)}</p>}{!names.persisted&&<p className="ws-text-warning">{t("create.nameWarning")}</p>}
    {txHash&&<a className="ws-inline-action ws-address" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/>{txHash.slice(0,12)}…{txHash.slice(-8)}</a>}
    {["unknown","indexing"].includes(state.phase)&&record?.hash&&<Button size="sm" variant="outline" onClick={()=>void live.creation.engine.resume(account)}><RefreshCw size={13}/>{t("claim.resume")}</Button>}
    {state.phase==="unknown"&&record&&!record.hash&&<form className="ws-form" onSubmit={event=>{event.preventDefault();void live.creation.engine.recover(account,hash.trim());}}><label>{t("create.recoveryHash")}<input value={hash} onChange={event=>setHash(event.target.value)} minLength={66} maxLength={66} placeholder="0x…" required/></label><Button variant="outline" size="sm" type="submit">{t("claim.recover")}</Button></form>}
    {e?.streamId&&<Link className="ws-inline-action" to="/manage/issued">{t("workspace.issuedTitle")}</Link>}
  </DismissibleNotice>;
}

export function CreatePaymentActivity(){
  const live=useLiveWorkspace();if(!live?.connectedAddress)return null;
  const state=live.creation.states[live.connectedAddress];if(!state||["review","checking"].includes(state.phase))return null;
  return <PaymentProgress state={state} historical={state.phase==="error"&&Boolean(state.reviewDraft)&&!state.pending&&!state.evidence}/>;
}
export function CreatePaymentAction({draft}:{draft:PaymentDraft}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  if(!live.connectedAddress)return <footer className="ws-review-footer"><span>{t("create.walletRequired")}</span><Button onClick={live.connect}>{t("wallet.connect")}</Button></footer>;
  if(live.chainId!=="0xaa36a7")return <footer className="ws-review-footer"><span>{t("claim.network")}</span><Button disabled={live.switchingChain} onClick={()=>void live.switchChain()}>{t("claim.switchNetwork")}</Button></footer>;
  const account=live.connectedAddress,state=live.creation.states[account],q=state?.quote;
  if(state?.phase==="completed"&&state.pending&&samePayment(unpackPayment(state.pending),draft))return <PaymentProgress state={state}/>;
  const pending=state&&["checking","wallet","submitted","indexing","unknown"].includes(state.phase);
  const changedReview=state?.phase==="error"&&state.reviewDraft&&!state.pending&&!state.evidence&&!samePayment(state.reviewDraft,draft);
  if(state?.phase==="review"&&q&&samePayment(q.draft,draft))return <section className="claim-review"><h3>{t(`create.step.${q.step}`)}</h3><dl><div className="ws-field-row"><dt>{t("create.exactAmount")}</dt><dd className="claim-exact-amount">{formatFullUnits(draft.amount,"MockUSDC")} MockUSDC</dd></div><div className="ws-field-row"><dt>{t("create.spender")}</dt><dd className="ws-address">{LIVE_STREAM}</dd></div><div className="ws-field-row"><dt>{t("claim.chainBasis")}</dt><dd>#{q.block.toString()} · {new Date(Number(q.at)*1000).toLocaleString("ko-KR")}</dd></div></dl><p className="ws-caption">{t(q.step==="approval"?"create.approvalNotice":"create.escrowNotice")}</p><GasReview estimate={q.gasEstimate}/><footer className="ws-review-footer"><Button variant="outline" onClick={()=>void live.creation.engine.review(draft)}><RefreshCw size={13}/>{t("claim.requote")}</Button><Button onClick={()=>void live.creation.engine.execute(account)}>{t(q.step==="approval"?"create.approveInWallet":"create.createInWallet")}</Button></footer></section>;
  return <div>{changedReview?<p className="ws-notice" role="status">{t("create.draftChanged")}</p>:state&&state.phase!=="review"&&<PaymentProgress state={state}/>}<footer className="ws-review-footer"><span>{t("create.preflightNotice")}</span><Button disabled={Boolean(pending)} onClick={()=>void live.creation.engine.review(draft)}>{t("create.checkConditions")}</Button></footer></div>;
}
