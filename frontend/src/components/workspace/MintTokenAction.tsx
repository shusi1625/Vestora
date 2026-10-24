import {useState} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {useLiveWorkspace} from "@/providers/live-context";
import type {MintTokenState} from "@/lib/mint-token-engine";
import {parsePrice} from "@/lib/price";
import {LIVE_USDC} from "@/lib/live-config";
import {FieldRow,Figure,ReviewModal} from "./WorkspaceUI";
import {GasReview} from "./GasReview";
import {LiveActionGate} from "./LiveActionGate";
import {TransactionProgress} from "./TransactionProgress";

export function MintTokenProgress({state,account}:{state:MintTokenState;account:string}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  return <TransactionProgress title={t("mint.title")} account={account} phase={state.phase} hash={state.evidence?.hash||state.pending?.hash} hasEvidence={Boolean(state.evidence)} pending={Boolean(state.pending)} error={state.error} warning={state.warning} onResume={()=>live.mint.engine.resume(account)} onRecover={hash=>live.mint.engine.recover(account,hash)}>
    {state.evidence&&<p>{t("mint.actualAmount")} <Figure raw={state.evidence.amount} token="MockUSDC" exact/></p>}
    {state.balance&&<p>{t("mint.receiptBlockBalance",{block:state.balance.block.toString()})} <Figure raw={state.balance.balance} token="MockUSDC" exact/></p>}
  </TransactionProgress>;
}

export function MintTokenActivity(){
  const live=useLiveWorkspace();if(!live?.connectedAddress)return null;
  const state=live.mint.states[live.connectedAddress];
  return state&&!["checking","review"].includes(state.phase)?<MintTokenProgress state={state} account={live.connectedAddress}/>:null;
}

export function MintTokenDialog({open,onClose}:{open:boolean;onClose:()=>void}){
  const live=useLiveWorkspace(),{t}=useTranslation(),[amount,setAmount]=useState("10"),[invalid,setInvalid]=useState(false);
  if(!live)return null;
  const account=live.connectedAddress,state=account?live.mint.states[account]:undefined,parsed=parsePrice(amount,"MockUSDC");
  const q=state?.phase==="review"&&!parsed.error&&state.quote?.amount===parsed.raw?state.quote:undefined;
  const pending=Boolean(state&&["checking","wallet","submitted","unknown"].includes(state.phase));
  return <ReviewModal open={open} onOpenChange={value=>{if(!value)onClose();}} title={t("mint.title")} description={t("mint.description")}><LiveActionGate>
    <form className="ws-form" onSubmit={event=>{event.preventDefault();if(parsed.error||parsed.raw>2n**256n-1n){setInvalid(true);return;}setInvalid(false);void live.mint.engine.review(parsed.raw);}}><label>{t("mint.amount")} (MockUSDC)<input value={amount} onChange={event=>setAmount(event.target.value)} inputMode="decimal" maxLength={100} required disabled={pending}/></label>{invalid&&<p className="ws-form-error" role="alert">{t("mint.invalidAmount")}</p>}<Button type="submit" variant="outline" disabled={pending}>{t("actions.checkConditions")}</Button></form>
    {state&&state.phase!=="review"&&state.phase!=="checking"&&<MintTokenProgress state={state} account={account!}/>}
    {q&&<section className="claim-review"><dl><FieldRow label={t("mint.amount")}><Figure raw={q.amount} token="MockUSDC" exact/></FieldRow><FieldRow label={t("claim.receivingAddress")}><span className="ws-address">{q.account}</span></FieldRow><FieldRow label={t("mint.contract")}><span className="ws-address">{LIVE_USDC}</span></FieldRow></dl><p className="ws-caption">{t("mint.gasNotice")}</p><GasReview estimate={q.gasEstimate}/><Button type="button" onClick={()=>void live.mint.engine.execute(account!)}>{t("mint.confirmInWallet")}</Button></section>}
  </LiveActionGate></ReviewModal>;
}
