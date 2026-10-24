import { useState } from "react";
import { LIVE_MODE } from "@/lib/live-config";
import { useTranslation } from "react-i18next";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Claim } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { issuedAmounts, paymentPhase } from "@/lib/workspace-model";
import { FundFlow } from "@/components/workspace/FundFlow";
import { PaymentStatus } from "@/components/workspace/PaymentStatus";
import { ExecutionFooter, FieldRow, Figure, ReviewModal } from "@/components/workspace/WorkspaceUI";
import { useLiveWorkspace } from "@/providers/live-context";
import { CancelPaymentAction } from "@/components/workspace/CancelPaymentAction";

export function PaymentDetails({ claim:initialClaim, now, name, onSave, persisted, onClose }: { claim: Claim; now: Date; name: string; onSave: (name: string) => void; persisted: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const live=useLiveWorkspace(),claim=live?.claims.find(item=>item.id===initialClaim.id)||initialClaim;
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(name), [saved, setSaved] = useState(false), [cancelReview, setCancelReview] = useState(false);
  const amounts = issuedAmounts(claim, now), canCancel = claim.cancellable && !claim.cancelledAt && amounts.future > 0n;
  return <ReviewModal open onOpenChange={open => { if (!open) onClose(); }} title={`${t(cancelReview ? "workspace.cancelReview" : "workspace.issuedDetails")} · #${claim.id}`}>
    {editing ? <form className="ws-form" onSubmit={e => { e.preventDefault(); onSave(draft); setEditing(false); setSaved(true); }}><label>{t("workspace.paymentName")}<input value={draft} maxLength={60} onChange={e => setDraft(e.target.value)} autoFocus /></label><p className="ws-caption">{t("workspace.namePrivacy")}</p><div className="ws-form-actions"><Button type="button" variant="outline" onClick={() => { setDraft(name); setEditing(false); }}>{t("workspace.dismiss")}</Button><Button type="submit"><Check size={14} />{t("workspace.save")}</Button></div></form> : <div className="ws-name-heading"><div><h3>{name || t("workspace.paymentFallback", { id: claim.id })}</h3><p className="ws-caption">{t("workspace.privateName")}</p></div>{!cancelReview && <Button size="icon" variant="ghost" aria-label={t("workspace.editName")} title={t("workspace.editName")} onClick={() => setEditing(true)}><Pencil size={15} /></Button>}</div>}
    <p className="ws-save-feedback" role="status">{saved ? t(persisted ? "workspace.nameSaved" : "workspace.nameSessionOnly") : ""}</p>
    <div className="ws-detail-columns"><dl><FieldRow label={t("workspace.originalRecipient")}><span className="ws-address">{claim.originalRecipient}</span></FieldRow><FieldRow label={t("workspace.currentOwner")}><span className="ws-address">{claim.owner}</span></FieldRow><FieldRow label={t("workspace.paymentState")}><PaymentStatus claim={claim} now={now} /></FieldRow></dl><dl><FieldRow label={t("workspace.deposited")}><Figure raw={claim.deposited} token={claim.token} /></FieldRow><FieldRow label={t("workspace.startsAt")}>{formatDate(claim.startAt)}</FieldRow><FieldRow label={t("workspace.endsAt")}>{formatDate(claim.endAt)}</FieldRow></dl></div>
    <section className="ws-detail-section"><h3>{t("workspace.remainingDeposit")}</h3><dl><FieldRow label={t("workspace.remainingDeposit")}><Figure raw={amounts.remaining} token={claim.token} /></FieldRow><FieldRow label={t("workspace.recipientClaimable")}><Figure raw={amounts.claimable} token={claim.token} /></FieldRow><FieldRow label={t("workspace.futurePayout")}><Figure raw={amounts.future} token={claim.token} /></FieldRow><FieldRow label={t("workspace.refundable")}>{claim.cancelledAt ? t("workspace.returnedDone") : claim.cancellable ? <Figure raw={amounts.refundable} token={claim.token} /> : t("workspace.nonCancelable")}</FieldRow></dl></section>
    <section className="ws-detail-section"><h3>{t("workspace.fundingComposition")}</h3><FundFlow claim={claim} now={now} /></section>
    <div className={`ws-risk ${canCancel ? "warning" : "neutral"}`}>{t(claim.cancelledAt ? "workspace.cancelledRisk" : cancelReview ? "workspace.cancelImpact" : claim.cancellable ? "workspace.issuerCancelRisk" : "workspace.noCancelRisk")}</div>
    {cancelReview && <dl><FieldRow label={t("workspace.refundable")}><Figure raw={amounts.refundable} token={claim.token} /></FieldRow><FieldRow label={t("workspace.rightsRetained")}><Figure raw={amounts.claimable} token={claim.token} /></FieldRow></dl>}
    <p className="ws-caption">{t("workspace.claimedNotMyIncome")}</p>
    {cancelReview ? <><Button variant="outline" onClick={() => setCancelReview(false)}>{t("workspace.back")}</Button>{LIVE_MODE?<CancelPaymentAction id={claim.id}/>:<ExecutionFooter label={t("workspace.executeCancel")} />}</> : <footer className="ws-review-footer"><span>{t(LIVE_MODE ? "actions.cancelAmountNotice" : "workspace.previewOnly")}</span>{canCancel && paymentPhase(claim, now) !== "completed" && <Button variant="outline" className="ws-danger-button" onClick={() => setCancelReview(true)}>{t("workspace.cancelReview")}</Button>}</footer>}
  </ReviewModal>;
}
