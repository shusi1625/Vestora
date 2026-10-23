import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Claim } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { issuedSummary, isPaymentToken, sameAddress, paymentPhase } from "@/lib/workspace-model";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { usePaymentNames } from "@/hooks/use-payment-names";
import { FundFlow } from "@/components/workspace/FundFlow";
import { PaymentStatus } from "@/components/workspace/PaymentStatus";
import { DetailButton, EmptyRows, FieldRow, Figure, FilterTabs, Metric, PageHeading, ReviewModal, Tag, WalletGate } from "@/components/workspace/WorkspaceUI";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";
import { PaymentDetails } from "./PaymentDetails";
import { CreatePaymentDialog } from "./CreatePaymentDialog";

export default function IssuedPage() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot(), navigate = useNavigate(), location = useLocation();
  const [filter, setFilter] = useState("all"), [token, setToken] = useState<"MockUSDC" | "mWETH">("MockUSDC"), [selected, setSelected] = useState<Claim | null>(null), [balanceOpen, setBalanceOpen] = useState(false);
  const { address, claims, now, scenario } = snapshot, names = usePaymentNames(address);
  const source = scenario.dataCondition === "empty" ? [] : claims;
  const own = source.filter(c => sameAddress(c.payer, address) && c.token === token);
  const visible = own.filter(c => filter === "all" || paymentPhase(c, now) === filter);
  const totals = issuedSummary(source, address, token, now);
  return <div className="ws-page"><PageHeading title={t("workspace.issuedTitle")} description={t("workspace.issuedDescription")} action={<Button onClick={() => navigate("/manage/create")}><Plus size={15} />{t("workspace.createTitle")}</Button>} onRefresh={snapshot.refresh} />
    <WalletGate address={address} connect={snapshot.connect}><WorkspaceDataState condition={scenario.dataCondition} onRetry={snapshot.refresh}>
      <div className="ws-token-picker"><label>{t("workspace.token")}<select value={token} onChange={e => { if (isPaymentToken(e.target.value)) setToken(e.target.value); }}>{snapshot.paymentTokens.map(token=><option key={token}>{token}</option>)}</select></label></div>
      <div className="ws-metric-strip ws-issued-overview" data-testid="issued-summary"><Metric label={t("workspace.remainingDeposit")} note={<button className="ws-inline-action" onClick={() => setBalanceOpen(true)}>{t("workspace.balanceRecords")}<ArrowUpRight size={13} /></button>}><Figure large raw={totals.remaining} token={token} /></Metric><Metric label={t("workspace.recipientClaimable")} note={t("workspace.vestedNotPaid")}><Figure large raw={totals.claimable} token={token} /></Metric><Metric label={t("workspace.futurePayout")} note={t("workspace.noMoreDebit")}><Figure large raw={totals.future} token={token} /></Metric></div>
      <div className="ws-issued-info"><span>{t("workspace.refundable")} <Figure raw={totals.refundable} token={token} /> · {t("workspace.includedInDeposit")}</span><span>{t("workspace.allCount", { count: own.length })} · {now.toLocaleString("ko-KR")}</span></div>
      <div className="ws-page-tools"><FilterTabs label={t("workspace.paymentState")} options={["all", "scheduled", "streaming", "completed", "cancelled"].map(value => ({ value, label: t(value === "all" ? "workspace.all" : `workspace.phase.${value}`) }))} value={filter} onChange={setFilter} /><span className="ws-caption" aria-live="polite">{t("workspace.count", { count: visible.length })}</span></div>
      <table className="ws-table ws-issued-table"><thead><tr>{["paymentOwner", "deposited", "fundingComposition", "periodConditions", ""].map((key, i) => <th key={i}>{key ? t(`workspace.${key}`) : ""}</th>)}</tr></thead><tbody>{!visible.length && <EmptyRows columns={5} />}{visible.map(claim => <tr key={claim.id}><td data-label={t("workspace.paymentOwner")}><strong>{names.nameFor(claim.id) || t("workspace.paymentFallback", { id: claim.id })}</strong><small>{t("common.claimId", { id: claim.id })}</small><small>{claim.owner.slice(0, 8)}…{claim.owner.slice(-4)}</small></td><td data-label={t("workspace.deposited")}><Figure raw={claim.deposited} token={claim.token} /></td><td className="ws-flow-cell" data-label={`${t("workspace.fundingComposition")} · ${token}`}><FundFlow claim={claim} now={now} /></td><td data-label={t("workspace.periodConditions")}><div className="ws-status-stack"><PaymentStatus claim={claim} now={now} /><small>{formatDate(claim.startAt)}<br />~ {formatDate(claim.endAt)}</small><Tag tone={claim.cancellable && !claim.cancelledAt ? "warning" : "neutral"}>{t(claim.cancelledAt ? "workspace.returnedDone" : claim.cancellable ? "workspace.cancelable" : "workspace.nonCancelable")}</Tag></div></td><td><DetailButton onClick={() => setSelected(claim)} /></td></tr>)}</tbody></table><p className="ws-caption ws-bottom-note">{t("workspace.issuerCancelRisk")}</p>
      {selected && <PaymentDetails key={selected.id} claim={selected} now={now} name={names.nameFor(selected.id)} persisted={names.persisted} onSave={name => names.save(selected.id, name)} onClose={() => setSelected(null)} />}
      <ReviewModal title={t("workspace.balanceComposition")} open={balanceOpen} onOpenChange={setBalanceOpen}><dl>{(["remaining", "claimable", "future", "refundable", "deposited", "claimed", "returned"] as const).map(key => <FieldRow key={key} label={t(`workspace.summary.${key}`)}><Figure raw={totals[key]} token={token} /></FieldRow>)}</dl><p className="ws-notice">{t("workspace.remainingNotPaid")}</p></ReviewModal>
      <CreatePaymentDialog key={address} open={location.pathname === "/manage/create"} onClose={() => navigate("/manage/issued", { replace: true })} balances={snapshot.balances} balanceKnown={snapshot.balancesReady} paymentTokens={snapshot.paymentTokens} />
    </WorkspaceDataState></WalletGate></div>;
}
