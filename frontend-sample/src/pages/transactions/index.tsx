import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import type { DataCondition, TxRecord } from "@/lib/types";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";
import { DetailButton, EmptyRows, FieldRow, Figure, FilterTabs, PageHeading, ReviewModal, Tag, WalletGate } from "@/components/workspace/WorkspaceUI";

export default function TransactionsPage() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot();
  const [filter,setFilter]=useState("all"),[selected,setSelected]=useState<TxRecord|null>(null);
  const live=snapshot.source==="live";
  const kind=(r:TxRecord)=>r.kind==="buy"&&r.role==="seller"?"sale":r.kind;
  const label=(r:TxRecord)=>t(kind(r)==="sale"?"live.saleTx":`workspace.txKind.${r.kind}`);
  const rows=snapshot.records.filter(r=>r.accountKey===snapshot.accountKey&&(filter==="all"||kind(r)===filter)).sort((a,b)=>Date.parse(b.requestedAt)-Date.parse(a.requestedAt));
  const failed=(r:TxRecord)=>["rejected","failed-onchain","replaced"].includes(r.phase);
  const status=(r:TxRecord)=><Tag tone={r.phase==="completed"?"positive":failed(r)?"negative":"info"}>{t(r.phase==="completed"?(live?"live.txCompleted":"workspace.txCompleted"):failed(r)?"workspace.txFailed":"workspace.txPending")}</Tag>;
  const condition:DataCondition=live&&!snapshot.historyReady&&snapshot.scenario.dataCondition!=="loading"?"failure":snapshot.scenario.dataCondition;
  return <div className="ws-page"><PageHeading title={t("workspace.transactionsTitle")} description={t("workspace.transactionsDescription")} onRefresh={snapshot.refresh}/><WalletGate address={snapshot.address} connect={snapshot.connect}><WorkspaceDataState condition={condition} onRetry={snapshot.refresh}>
    <div className="ws-page-tools"><FilterTabs label={t("workspace.txType")} options={(live?["all","buy","sale","claim"]:["all","buy","claim","create"]).map(value=>({value,label:t(value==="all"?"workspace.all":value==="sale"?"live.saleTx":`workspace.txKind.${value}`)}))} value={filter} onChange={setFilter}/><span className="ws-caption">{t("workspace.count",{count:rows.length})}</span></div>
    <table className="ws-table"><thead><tr>{["txType","claim","txAmount","txTime","txState",""].map((key,i)=><th key={i}>{key?t(`workspace.${key}`):""}</th>)}</tr></thead><tbody>{!rows.length&&<EmptyRows columns={6}/>}{rows.map(r=><tr key={r.id}><td data-label={t("workspace.txType")}><strong>{label(r)}</strong></td><td data-label={t("workspace.claim")}>#{r.claimId}</td><td data-label={t("workspace.txAmount")}><Figure raw={r.amountRaw} token={r.token}/><small>{t(r.phase==="completed"?"workspace.recordedAmount":"workspace.requestedAmount")}</small></td><td data-label={t("workspace.txTime")}>{new Date(r.requestedAt).toLocaleString("ko-KR")}</td><td data-label={t("workspace.txState")}>{status(r)}</td><td><DetailButton onClick={()=>setSelected(r)}/></td></tr>)}</tbody></table>
    <p className="ws-bottom-note ws-caption">{t(live?"live.historyScope":"workspace.historyScope")}</p>
    {selected&&<ReviewModal title={t("workspace.transactionDetail")} open onOpenChange={open=>{if(!open)setSelected(null);}}><dl><FieldRow label={t("workspace.txType")}>{label(selected)}</FieldRow><FieldRow label={t("workspace.claim")}>#{selected.claimId}</FieldRow><FieldRow label={t("workspace.txState")}>{status(selected)}</FieldRow><FieldRow label={t(selected.phase==="completed"?"workspace.recordedAmount":"workspace.requestedAmount")}><Figure raw={selected.amountRaw} token={selected.token}/></FieldRow><FieldRow label={t("workspace.txTime")}>{new Date(selected.requestedAt).toLocaleString("ko-KR")}</FieldRow></dl><p className="ws-notice">{t(live?"live.receipt":"workspace.simulatedReceipt")}</p>{live&&selected.explorerUrl&&<a href={selected.explorerUrl} target="_blank" rel="noreferrer" className="ws-inline-action">{t("live.explorer")}</a>}</ReviewModal>}
  </WorkspaceDataState></WalletGate></div>;
}
