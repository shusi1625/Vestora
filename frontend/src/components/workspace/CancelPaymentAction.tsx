import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import type {CancelPaymentState} from "@/lib/cancel-payment-engine";
import {useLiveWorkspace} from "@/providers/live-context";
import {FieldRow,Figure} from "./WorkspaceUI";
import {GasReview} from "./GasReview";
import {LiveActionGate} from "./LiveActionGate";
import {TransactionProgress} from "./TransactionProgress";

export function CancelPaymentProgress({state,account}:{state:CancelPaymentState;account:string}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  return <TransactionProgress title={t("workspace.executeCancel")} account={account} id={state.id} phase={state.phase} hash={state.evidence?.hash||state.pending?.hash} hasEvidence={Boolean(state.evidence)} pending={Boolean(state.pending)} error={state.error} warning={state.warning} onResume={()=>live.cancellation.engine.resume(account)} onRecover={hash=>live.cancellation.engine.recover(account,hash)}>
    {state.evidence&&<dl><FieldRow label={t("actions.actualRefund")}><Figure raw={state.evidence.refund} token="MockUSDC" exact/></FieldRow><FieldRow label={t("actions.rightsAtReceiptBlock")}><Figure raw={state.evidence.ownerUnclaimedAtBlock} token="MockUSDC" exact/></FieldRow></dl>}
  </TransactionProgress>;
}

export function CancelPaymentActivity(){
  const live=useLiveWorkspace();if(!live?.connectedAddress)return null;
  const state=live.cancellation.states[live.connectedAddress];
  return state&&!["checking","review"].includes(state.phase)?<CancelPaymentProgress state={state} account={live.connectedAddress}/>:null;
}

export function CancelPaymentAction({id}:{id:string}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  const account=live.connectedAddress,state=account?live.cancellation.states[account]:undefined,q=state?.id===id&&state.phase==="review"?state.quote:undefined;
  const pending=Boolean(state&&["checking","wallet","submitted","indexing","unknown"].includes(state.phase));
  return <LiveActionGate>{q?<section className="claim-review"><h3>{t("workspace.cancelReview")}</h3><dl>
    <FieldRow label={t("workspace.sender")}><span className="ws-address">{q.sender}</span></FieldRow><FieldRow label={t("workspace.currentOwner")}><span className="ws-address">{q.owner}</span></FieldRow>
    <FieldRow label={t("actions.estimatedRefund")}><Figure raw={q.refund} token="MockUSDC" exact/></FieldRow><FieldRow label={t("workspace.rightsRetained")}><Figure raw={q.ownerUnclaimed} token="MockUSDC" exact/></FieldRow>
    <FieldRow label={t("claim.chainBasis")}>#{q.block.toString()} · {new Date(Number(q.at)*1000).toLocaleString("ko-KR")}</FieldRow></dl>
    <p className="ws-risk warning">{t(q.listingPrice>0n?"actions.cancelListedRisk":"actions.cancelAmountNotice")}</p><GasReview estimate={q.gasEstimate}/>
    <footer className="ws-review-footer"><Button type="button" variant="outline" onClick={()=>void live.cancellation.engine.review(id)}>{t("claim.requote")}</Button><Button type="button" variant="destructive" onClick={()=>void live.cancellation.engine.execute(account!)}>{t("actions.cancelInWallet")}</Button></footer></section>
    :<div>{state&&state.phase!=="review"&&<CancelPaymentProgress state={state} account={account!}/>}<footer className="ws-review-footer"><span>{t("actions.cancelAmountNotice")}</span><Button type="button" variant="outline" disabled={pending} onClick={()=>void live.cancellation.engine.review(id)}>{t("actions.checkCancel")}</Button></footer></div>}
  </LiveActionGate>;
}
