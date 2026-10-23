import {useState} from "react";
import {useTranslation} from "react-i18next";
import {Loader2,RefreshCw,ExternalLink} from "lucide-react";
import {useLiveWorkspace} from "@/providers/live-context";
import {Button} from "@/components/ui/button";
import {formatFullUnits} from "@/lib/format";
import type {ClaimState} from "@/lib/claim-engine";
import {canDismissTransactionNotice} from "@/lib/notice-policy";
import {DismissibleNotice} from "./DismissibleNotice";
import {GasReview} from "./GasReview";

function ClaimProgress({state}:{state:ClaimState}){
  const {t}=useTranslation(),live=useLiveWorkspace();
  const [hash,setHash]=useState("");
  if(!live?.connectedAddress)return null;
  const account=live.connectedAddress,txHash=state.evidence?.hash||state.pending?.hash;
  const waiting=["preparing","wallet","submitted"].includes(state.phase);
  const body=t(`claim.body.${state.phase}`);
  return <DismissibleNotice noticeKey={`claim:${account}:${state.phase}:${txHash||""}:${state.error||""}:${state.warning||""}`} dismissible={canDismissTransactionNotice(state.phase,Boolean(state.evidence))} closeLabel={t("notice.closeClaim")} className={`claim-progress claim-${state.phase}`}>
    <div className="claim-phase-heading">{waiting&&<Loader2 size={15} className="animate-spin"/>}<strong>{t(`claim.phase.${state.phase}`)}{state.id?` · #${state.id}`:""}</strong></div>
    <p>{body}</p>
    {state.phase==="unknown"&&state.pending&&!state.pending.hash&&!state.pending.failure&&<p className="ws-caption">{t("claim.legacyPending")}</p>}
    {state.evidence&&<p className="claim-exact-amount">{t("claim.actualReceived")} <strong>{formatFullUnits(state.evidence.amount,"MockUSDC")} MockUSDC</strong></p>}
    {state.error&&<p className="ws-form-error">{t(state.error)}</p>}
    {state.warning&&t(state.warning)!==body&&<p className="ws-text-warning">{t(state.warning)}</p>}
    {txHash&&<a className="ws-inline-action ws-address" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={13}/>{txHash.slice(0,12)}…{txHash.slice(-8)}</a>}
    {["unknown","indexing"].includes(state.phase)&&state.pending?.hash&&<Button size="sm" variant="outline" onClick={()=>void live.claim.engine.resume(account)}><RefreshCw size={13}/>{t("claim.resume")}</Button>}
    {state.phase==="unknown"&&state.pending&&!state.pending.hash&&<form className="ws-form" onSubmit={event=>{event.preventDefault();void live.claim.engine.recover(account,hash.trim());}}><label>{t("claim.recoveryHash")}<input value={hash} onChange={event=>setHash(event.target.value)} placeholder="0x…" maxLength={66} autoComplete="off" required/></label><Button size="sm" variant="outline" type="submit">{t("claim.recover")}</Button></form>}
  </DismissibleNotice>;
}

export function ClaimAction({id}:{id:string}){
  const live=useLiveWorkspace(),{t}=useTranslation();
  const [recoveryHash,setRecoveryHash]=useState("");
  if(!live)return null;
  if(!live.connectedAddress)return <footer className="ws-review-footer"><span>{t("claim.walletRequired")}</span><Button onClick={live.connect}>{t("wallet.connect")}</Button></footer>;
  if(live.chainId!=="0xaa36a7")return <footer className="ws-review-footer"><span>{t("claim.network")}</span><Button disabled={live.switchingChain} onClick={()=>void live.switchChain()}>{t("claim.switchNetwork")}</Button></footer>;
  const account=live.connectedAddress,state=live.claim.states[account],relevant=state?.id===id;
  const pending=state?.pending&&["wallet","submitted","indexing","unknown"].includes(state.phase);
  if(pending&&!relevant)return <p className="ws-notice">{t("claim.otherPending",{id:state.id})}</p>;
  if(relevant&&state.phase==="review"&&state.quote){
    const quote=state.quote;
    return <section className="claim-review"><h3>{t("claim.reviewTitle")}</h3><dl><div className="ws-field-row"><dt>{t("workspace.claimable")}</dt><dd className="claim-exact-amount">{formatFullUnits(quote.amount,"MockUSDC")} MockUSDC</dd></div><div className="ws-field-row"><dt>{t("claim.receivingAddress")}</dt><dd className="ws-address">{quote.account}</dd></div><div className="ws-field-row"><dt>{t("claim.chainBasis")}</dt><dd>#{quote.block.toString()} · {new Date(Number(quote.at)*1000).toLocaleString("ko-KR")}</dd></div></dl><p className="ws-caption">{t("claim.quoteNotice")}</p><GasReview estimate={quote.gasEstimate}/><footer className="ws-review-footer"><Button variant="outline" onClick={()=>void live.claim.engine.review(id)}>{t("claim.requote")}</Button><Button onClick={()=>void live.claim.engine.execute(account)}>{t("claim.confirmInWallet")}</Button></footer></section>;
  }
  const blocked=relevant&&["preparing","wallet","submitted","indexing","unknown"].includes(state.phase);
  return <div className="claim-action">{relevant&&state.phase!=="idle"&&<ClaimProgress state={state}/>}<footer className="ws-review-footer"><span>{t("claim.preflightNotice")}</span><Button disabled={Boolean(blocked)} onClick={()=>void live.claim.engine.review(id)}>{t("claim.checkConditions")}</Button></footer>
    {!blocked&&(!relevant||state.phase!=="completed")&&<details className="ws-detail-section"><summary>{t("claim.reconcileTitle")}</summary><p className="ws-caption">{t("claim.reconcileNotice")}</p><form className="ws-form" onSubmit={event=>{event.preventDefault();void live.claim.engine.reconcile(id,recoveryHash.trim());}}><label>{t("claim.recoveryHash")}<input value={recoveryHash} onChange={event=>setRecoveryHash(event.target.value)} placeholder="0x…" minLength={66} maxLength={66} autoComplete="off" required/></label><Button size="sm" variant="outline" type="submit"><RefreshCw size={13}/>{t("claim.recover")}</Button></form></details>}
  </div>;
}

export function ClaimActivity(){
  const live=useLiveWorkspace();if(!live?.connectedAddress)return null;
  const state=live.claim.states[live.connectedAddress];
  if(!state||["idle","review","preparing"].includes(state.phase))return null;
  return <ClaimProgress state={state}/>;
}
