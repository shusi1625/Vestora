import {useState} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {useLiveWorkspace} from "@/providers/live-context";
import {LIVE_MARKET} from "@/lib/live-config";
import {parsePrice} from "@/lib/price";
import type {MarketActionDraft} from "@/lib/market-action-model";
import type {MarketActionState} from "@/lib/market-action-engine";
import {FieldRow,Figure} from "./WorkspaceUI";
import {GasReview} from "./GasReview";
import {LiveActionGate} from "./LiveActionGate";
import {TransactionProgress} from "./TransactionProgress";

const busy=(phase?:string)=>Boolean(phase&&["checking","wallet","submitted","indexing","unknown"].includes(phase));

export function MarketProgress({state,account}:{state:MarketActionState;account:string}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  const step=state.evidence?.step||state.pending?.step||state.quote?.step,hash=state.evidence?.hash||state.pending?.hash;
  return <TransactionProgress title={t(`actions.marketStep.${step||"buy"}`)} account={account} id={state.id} phase={state.phase} hash={hash} hasEvidence={Boolean(state.evidence)} pending={Boolean(state.pending)} error={state.error} warning={state.warning} onResume={()=>live.market.engine.resume(account)} onRecover={value=>live.market.engine.recover(account,value)}/>;
}

export function MarketActivity(){
  const live=useLiveWorkspace();if(!live?.connectedAddress)return null;
  const state=live.market.states[live.connectedAddress];
  return state&&!["checking","review"].includes(state.phase)?<MarketProgress state={state} account={live.connectedAddress}/>:null;
}

export function MarketAction({id,action,price=0n}:{id:string;action:MarketActionDraft["action"];price?:bigint}){
  const live=useLiveWorkspace(),{t}=useTranslation(),[priceText,setPriceText]=useState(""),[priceError,setPriceError]=useState(false);
  if(!live)return null;
  const account=live.connectedAddress,state=account?live.market.states[account]:undefined;
  const parsed=parsePrice(priceText,"MockUSDC"),raw=action==="list"?parsed.raw:price;
  const draft:MarketActionDraft=action==="cancel-listing"?{action,id}:{action,id,price:raw};
  const q=state?.quote,relevant=state?.id===id&&(q?.draft.action===action||state.pending?.action===action);
  const reviewed=relevant&&state?.phase==="review"&&q&&(action!=="list"||!parsed.error&&q.price===raw);
  const review=()=>{if(action==="list"&&(parsed.error||raw>2n**256n-1n)){setPriceError(true);return;}setPriceError(false);void live.market.engine.review(draft);};
  return <LiveActionGate><section className="ws-detail-section"><h3>{t(`actions.market.${action}`)}</h3>
    {action==="list"&&<form className="ws-form" onSubmit={event=>{event.preventDefault();review();}}><label>{t("workspace.price")} (MockUSDC)<input value={priceText} onChange={event=>setPriceText(event.target.value)} inputMode="decimal" maxLength={100} placeholder="0.00" required disabled={busy(state?.phase)}/></label>{priceError&&<p role="alert" className="ws-form-error">{t("market.invalidPrice")}</p>}<Button type="submit" variant="outline" disabled={busy(state?.phase)}>{t("actions.checkConditions")}</Button></form>}
    {state&&state.phase!=="review"&&state.phase!=="checking"&&<MarketProgress state={state} account={account!}/>}
    {reviewed?<div className="claim-review"><h3>{t(`actions.marketStep.${q.step}`)}</h3><dl>
      <FieldRow label={t("workspace.currentOwner")}><span className="ws-address">{q.owner}</span></FieldRow>
      <FieldRow label={t("actions.marketContract")}><span className="ws-address">{LIVE_MARKET}</span></FieldRow>
      <FieldRow label={t("workspace.price")}><Figure raw={q.price} token="MockUSDC" exact/></FieldRow>
      <FieldRow label={t("workspace.unclaimed")}><Figure raw={q.remaining} token="MockUSDC" exact/></FieldRow>
      <FieldRow label={t("claim.chainBasis")}>#{q.block.toString()} · {new Date(Number(q.at)*1000).toLocaleString("ko-KR")}</FieldRow></dl>
      <p className="ws-caption">{t(q.step==="nft-approval"?"actions.nftApprovalNotice":q.step==="erc20-approval"?"actions.paymentApprovalNotice":action==="buy"?"actions.buyProtection":"actions.marketNotice")}</p>
      {action==="buy"&&q.cancelable&&!q.canceled&&<p className="ws-risk warning">{t("workspace.cancelRisk")}</p>}
      <GasReview estimate={q.gasEstimate}/><footer className="ws-review-footer"><Button type="button" variant="outline" onClick={review}>{t("claim.requote")}</Button><Button type="button" onClick={()=>void live.market.engine.execute(account!)}>{t(`actions.confirm.${q.step}`)}</Button></footer></div>
      :action!=="list"&&<footer className="ws-review-footer"><span>{t("actions.preflightNotice")}</span><Button type="button" disabled={busy(state?.phase)} onClick={review}>{t(state?.phase==="approved"?"actions.nextStep":"actions.checkConditions")}</Button></footer>}
  </section></LiveActionGate>;
}
