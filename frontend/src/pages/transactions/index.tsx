import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import type { DataCondition, TxRecord } from "@/lib/types";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";
import { DetailButton, EmptyRows, FieldRow, Figure, FilterTabs, PageHeading, ReviewModal, Tag, WalletGate } from "@/components/workspace/WorkspaceUI";

export default function TransactionsPage() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot();
  const [filter,setFilter]=useState("all"),[selected,setSelected]=useState<TxRecord|null>(null);
  useEffect(()=>setSelected(null),[snapshot.accountKey]);
  const receipt=selected?.accountKey===snapshot.accountKey?selected:null;
  const live=snapshot.source==="live";
  const kind=(r:TxRecord)=>r.kind==="buy"&&r.role==="seller"?"sale":r.kind;
  const label=(r:TxRecord)=>t(kind(r)==="sale"?"live.saleTx":`workspace.txKind.${r.kind}`);
  const rows=snapshot.records.filter(r=>r.accountKey===snapshot.accountKey&&(filter==="all"||kind(r)===filter)).sort((a,b)=>Date.parse(b.requestedAt)-Date.parse(a.requestedAt));
  const failed=(r:TxRecord)=>["rejected","failed-onchain","replaced"].includes(r.phase);
  const status=(r:TxRecord)=><Tag tone={r.phase==="completed"?"positive":failed(r)?"negative":r.phase==="stalled"?"warning":"info"}>{t(r.origin==="local"?`actions.historyPhase.${r.phase}`:r.phase==="completed"?(live?"live.txCompleted":"workspace.txCompleted"):failed(r)?"workspace.txFailed":"workspace.txPending")}</Tag>;
  const meaning=(r:TxRecord)=>r.amountMeaning?`actions.amount.${r.amountMeaning}`:r.phase==="completed"?"workspace.recordedAmount":"workspace.requestedAmount";
  const amount=(r:TxRecord)=>r.amountMeaning==="none"||r.amountMeaning==="unknown"?<span>{t(r.amountMeaning==="none"?"actions.notApplicable":"workspace.unknown")}</span>:<Figure raw={r.amountRaw} token={r.token}/>;
  const localRows=snapshot.records.some(r=>r.origin==="local"&&r.accountKey===snapshot.accountKey);
  const unavailable=live&&!snapshot.historyReady&&snapshot.scenario.dataCondition!=="loading";
  const condition:DataCondition=unavailable?(localRows?"normal":"failure"):snapshot.scenario.dataCondition;
  return <div className="ws-page"><PageHeading title={t("workspace.transactionsTitle")} description={t("workspace.transactionsDescription")} onRefresh={snapshot.refresh}/><WalletGate address={snapshot.address} connect={snapshot.connect}><WorkspaceDataState condition={condition} onRetry={snapshot.refresh}>
    {unavailable&&localRows&&<p className="ws-notice" role="status">{t("actions.historyPartial")}</p>}
    {"historyWarning" in snapshot&&snapshot.historyWarning&&<p className="ws-notice" role="status">{t(String(snapshot.historyWarning))}</p>}
    <div className="ws-page-tools"><FilterTabs label={t("workspace.txType")} options={(live?["all","buy","sale","claim","create","approve","list","unlist","cancel-payment","mint"]:["all","buy","claim","create"]).map(value=>({value,label:t(value==="all"?"workspace.all":value==="sale"?"live.saleTx":`workspace.txKind.${value}`)}))} value={filter} onChange={setFilter}/><span className="ws-caption">{t("workspace.count",{count:rows.length})}</span></div>
    <table className="ws-table"><thead><tr>{["txType","claim","txAmount","txTime","txState",""].map((key,i)=><th key={i}>{key?t(`workspace.${key}`):""}</th>)}</tr></thead><tbody>{!rows.length&&<EmptyRows columns={6}/>}{rows.map(r=><tr key={r.id}><td data-label={t("workspace.txType")}><strong>{label(r)}</strong>{r.origin==="local"&&<small>{t("actions.localHistory")}</small>}</td><td data-label={t("workspace.claim")}>{r.claimId?`#${r.claimId}`:t("actions.noClaimId")}</td><td data-label={t("workspace.txAmount")}>{amount(r)}<small>{t(meaning(r))}</small></td><td data-label={t("workspace.txTime")}>{new Date(r.requestedAt).toLocaleString("ko-KR")}</td><td data-label={t("workspace.txState")}>{status(r)}</td><td><DetailButton onClick={()=>setSelected(r)}/></td></tr>)}</tbody></table>
    <p className="ws-bottom-note ws-caption">{t(live?"live.historyScope":"workspace.historyScope")}</p>
  </WorkspaceDataState>
    {receipt&&<ReviewModal title={t("workspace.transactionDetail")} open onOpenChange={open=>{if(!open)setSelected(null);}}>{live&&!snapshot.historyReady&&<p className="ws-notice" role="status">{t("live.historyDetailStale")}</p>}<dl><FieldRow label={t("workspace.txType")}>{label(receipt)}</FieldRow><FieldRow label={t("workspace.claim")}>{receipt.claimId?`#${receipt.claimId}`:t("actions.noClaimId")}</FieldRow><FieldRow label={t("workspace.txState")}>{status(receipt)}</FieldRow><FieldRow label={t(meaning(receipt))}>{amount(receipt)}</FieldRow><FieldRow label={t("workspace.txTime")}>{new Date(receipt.requestedAt).toLocaleString("ko-KR")}</FieldRow></dl>{receipt.failureReason&&<p className="ws-form-error" role="alert">{t(receipt.failureReason)}</p>}<p className="ws-notice">{t(live?receipt.origin==="local"?"actions.localReceipt":"live.receipt":"workspace.simulatedReceipt")}</p>{live&&receipt.explorerUrl&&<a href={receipt.explorerUrl} target="_blank" rel="noreferrer" className="ws-inline-action">{t("live.explorer")}</a>}</ReviewModal>}
  </WalletGate></div>;
}
