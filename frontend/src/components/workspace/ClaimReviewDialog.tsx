import { useTranslation } from "react-i18next";
import { getClaimTotals } from "@/lib/claim-math";
import { formatDate } from "@/lib/format";
import type { Claim, Listing, TxRecord } from "@/lib/types";
import { acquisitionFor, sameAddress } from "@/lib/workspace-model";
import { ExecutionFooter, FieldRow, Figure, ReviewModal } from "./WorkspaceUI";
import { PaymentStatus } from "./PaymentStatus";
import { LIVE_MODE } from "@/lib/live-config";
import { ClaimAction } from "./ClaimAction";
import { useLiveWorkspace } from "@/providers/live-context";

type Props = { claim: Claim | null; listing?: Listing; mode?: "detail" | "buy" | "claim" | "list" | "unlist"; now: Date; address: string | null; accountKey: string; records: TxRecord[]; historyReady?:boolean; onClose: () => void };
export function ClaimReviewDialog({ claim: initialClaim, listing: initialListing, mode = "detail", now, address, accountKey, records, historyReady=true, onClose }: Props) {
  const { t } = useTranslation();
  const live=useLiveWorkspace();
  const claim=live?.claims.find(item=>item.id===initialClaim?.id)||initialClaim;
  const listing=live?live.listings.find(item=>item.claimId===claim?.id):initialListing;
  if (!claim) return null;
  const totals = getClaimTotals(claim, now), own = sameAddress(claim.owner, address);
  const acquisition = acquisitionFor(claim, records, accountKey);
  return <ReviewModal open onOpenChange={open => { if (!open) onClose(); }} title={`${t(mode === "buy" ? "workspace.buyReview" : "workspace.claimDetails")} · #${claim.id}`}>
    <div className="ws-detail-columns"><dl>{listing && <FieldRow label={t("workspace.price")}><Figure raw={listing.priceRaw} token={claim.token} /></FieldRow>}
      <FieldRow label={t("workspace.unclaimed")}><Figure raw={totals.totalUnclaimed.raw} token={claim.token} /></FieldRow>
      <FieldRow label={t("workspace.claimable")}><Figure raw={totals.claimableNow.raw} token={claim.token} /></FieldRow>
      <FieldRow label={t("workspace.future")}><Figure raw={totals.futureAmount.raw} token={claim.token} /></FieldRow>
      <FieldRow label={t("workspace.globalClaimed")}><Figure raw={claim.claimed} token={claim.token} /></FieldRow></dl>
      <dl><FieldRow label={t("workspace.paymentState")}><PaymentStatus claim={claim} now={now} /></FieldRow>
        <FieldRow label={t("workspace.endsAt")}>{formatDate(claim.endAt)}</FieldRow>
        <FieldRow label={t("workspace.currentOwner")}><span className="ws-address">{claim.owner}</span></FieldRow>
        <FieldRow label={t("workspace.sender")}><span className="ws-address">{claim.payer}</span></FieldRow></dl></div>
    {own && <section className="ws-detail-section"><h3>{t("workspace.myAcquisition")}</h3><dl>
      <FieldRow label={t("workspace.acquiredBy")}>{t(acquisition.purchase ? "workspace.purchased" : sameAddress(claim.originalRecipient, address) ? "workspace.direct" : "workspace.transferUnknown")}</FieldRow>
      <FieldRow label={t("workspace.myPrice")}>{!historyReady ? t("workspace.unknown") : acquisition.purchase ? <Figure raw={acquisition.purchase.amountRaw} token={acquisition.purchase.token} /> : t(sameAddress(claim.originalRecipient, address) ? "workspace.noPurchase" : "workspace.unknown")}</FieldRow>
      <FieldRow label={t("workspace.myReceived")}>{historyReady ? <Figure raw={acquisition.received} token={claim.token} /> : t("workspace.unknown")}</FieldRow></dl><p className="ws-caption">{t("workspace.claimHistoryScope")}</p></section>}
    <div className={`ws-risk ${claim.cancelledAt ? "negative" : claim.cancellable ? "warning" : "neutral"}`}>{t(claim.cancelledAt ? "workspace.cancelledRisk" : claim.cancellable ? "workspace.cancelRisk" : "workspace.noCancelRisk")}</div>
    {LIVE_MODE&&(mode==="detail"||mode==="claim") ? <ClaimAction id={claim.id}/> : <ExecutionFooter label={t(mode === "buy" ? "workspace.executeBuy" : mode === "unlist" ? "workspace.executeUnlist" : mode === "list" ? "workspace.executeList" : "workspace.executeClaim")} />}
  </ReviewModal>;
}
