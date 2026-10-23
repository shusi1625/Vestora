import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { BuyDialog } from "@/components/claim/BuyDialog";
import { ClaimConditions } from "@/components/claim/ClaimConditions";
import { ClaimDialog } from "@/components/claim/ClaimDialog";
import { ClaimSummary } from "@/components/claim/ClaimSummary";
import { PayoutTimeline } from "@/components/claim/PayoutTimeline";
import { RoleActionPanel } from "@/components/claim/RoleActionPanel";
import { AddressText } from "@/components/common/AddressText";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineNotice } from "@/components/common/InlineNotice";
import { KeyValue, KeyValueDivider, Section } from "@/components/common/Section";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getClaimTotals, resolveListingStatus } from "@/lib/claim-math";
import { LISTING_STATUS, OWNERSHIP_STATE, PAYMENT_STATUS } from "@/lib/status";
import { usePrototypeData } from "@/providers/prototype-data-context";
import { useScenario } from "@/providers/scenario-context";
import { useTx } from "@/providers/tx-context";
import { useWallet } from "@/providers/wallet-context";

import { CancelPaymentDialog } from "./CancelPaymentDialog";

const ClaimDetailPage = () => {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address, canTransact, accountKey } = useWallet();
  const { scenario } = useScenario();
  const { claims, listings } = usePrototypeData();
  const { records, runTx } = useTx();

  // 화면 검토용: ?open=claim 또는 ?open=buy 로 다이얼로그 상태를 바로 열어 볼 수 있습니다.
  const openParam = searchParams.get("open");
  const [claimOpen, setClaimOpen] = useState(openParam === "claim");
  const [buyOpen, setBuyOpen] = useState(openParam === "buy");
  const [cancelOpen, setCancelOpen] = useState(false);

  const screen = scenario.screens.claim;
  const invalidId = screen === "invalid-id" || !/^\d+$/.test(id);
  const found = claims.find((item) => item.id === id) ?? null;
  const notFound = screen === "not-found" || !found;
  const mismatch = screen === "mismatch";

  const claim = useMemo(() => {
    if (!found) return null;
    switch (screen) {
      case "force-fully-claimed":
        return { ...found, claimed: found.deposited };
      case "force-cancelled":
        return {
          ...found,
          cancellable: true,
          cancelledAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        };
      case "verifying":
        return { ...found, ownership: "verifying" as const };
      default:
        return found;
    }
  }, [found, screen]);

  const listing = claim
    ? listings.find((item) => item.claimId === claim.id && item.status !== "unlisted") ?? null
    : null;
  const isListedByMe =
    listing?.status === "active" && Boolean(address) && listing.seller === address;
  const totals = claim ? getClaimTotals(claim, new Date()) : null;
  const cancelRecord = claim
    ? records.find(
        (record) => record.claimId === claim.id && record.kind === "cancel-payment",
      )
    : undefined;
  const cancelSubmitting = Boolean(
    cancelRecord && !["failed-onchain", "rejected", "replaced", "completed"].includes(cancelRecord.phase),
  );

  if (invalidId) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="claim.title" />
        <EmptyState
          titleKey="claim.error.invalidId.title"
          bodyKey="claim.error.invalidId.body"
          actionLabelKey="claim.error.goMarket"
          onAction={() => navigate("/market")}
        />
      </div>
    );
  }

  if (notFound || !claim || !totals) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="claim.title" />
        <EmptyState
          titleKey="claim.error.notFound.title"
          bodyKey="claim.error.notFound.body"
          actionLabelKey="claim.error.goMarket"
          onAction={() => navigate("/market")}
        />
        <InlineNotice tone="muted">{t("claim.error.notFound.hint")}</InlineNotice>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft aria-hidden className="size-4" />
          {t("common.back")}
        </Button>
      </div>

      <PageHeader
        title={t("common.claimId", { id: claim.id })}
        description={t("claim.subtitle", { token: claim.token })}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={PAYMENT_STATUS[totals.paymentStatus]} />
            <StatusBadge meta={LISTING_STATUS[resolveListingStatus(claim, listing)]} />
            {scenario.screens.claim !== "as-is" ? (
              <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw aria-hidden className="size-4" />
                {t("common.recheck")}
              </Button>
            ) : null}
          </div>
        }
      />

      {mismatch ? (
        <InlineNotice tone="warning" titleKey="claim.mismatch.title">
          {t("claim.mismatch.body")}
        </InlineNotice>
      ) : null}
      {!totals.ownershipVerified ? (
        <InlineNotice tone="warning" titleKey="claim.verifying.title">
          {t("claim.verifying.body")}
        </InlineNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section titleKey="claim.overview.title">
            <KeyValue labelKey="claim.overview.owner">
              <AddressText address={claim.owner} />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.overview.recipient">
              <AddressText address={claim.originalRecipient} />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.overview.payer">
              <AddressText address={claim.payer} />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.overview.ownership">
              <StatusBadge meta={OWNERSHIP_STATE[claim.ownership]} size="sm" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.overview.more">
              <span className="text-body-sm text-muted-foreground">
                {t("claim.overview.contractPending")}
              </span>
            </KeyValue>
            <p className="mt-2 text-caption text-muted-foreground">
              {t("claim.overview.addressNote")}
            </p>
          </Section>

          <Section titleKey="claim.schedule.title" descriptionKey="claim.schedule.description">
            <PayoutTimeline totals={totals} />
          </Section>

          <Section titleKey="claim.amounts.title">
            <ClaimSummary totals={totals} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section titleKey="claim.actions.title" descriptionKey="claim.actions.description">
            <RoleActionPanel
              claim={claim}
              totals={totals}
              listing={listing}
              onClaim={() => setClaimOpen(true)}
              onBuy={() => setBuyOpen(true)}
              onCancelPayment={() => setCancelOpen(true)}
              onRecheck={() => window.location.reload()}
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isListedByMe ? null : (
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/claims/${claim.id}/sell`}>{t("claim.action.sell")}</Link>
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link to="/transactions">{t("claim.action.viewHistory")}</Link>
              </Button>
            </div>
          </Section>

          <Section titleKey="claim.conditions.title">
            <ClaimConditions totals={totals} mismatch={mismatch} />
          </Section>
        </div>
      </div>

      <ClaimDialog claim={claim} open={claimOpen} onOpenChange={setClaimOpen} />
      <BuyDialog claim={claim} listing={listing} open={buyOpen} onOpenChange={setBuyOpen} />
      <CancelPaymentDialog
        claim={claim}
        totals={totals}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        submitting={cancelSubmitting}
        currentPhase={cancelRecord?.phase}
        onConfirm={() => {
          void runTx({
            kind: "cancel-payment",
            claimId: claim.id,
            account: accountKey,
            token: claim.token,
            amountRaw: totals.futureAmount.raw,
            role: "payer",
            requiresApproval: false,
          });
        }}
      />

      {!canTransact && address ? (
        <InlineNotice tone="warning" titleKey="claim.networkBlocked.title">
          {t("claim.networkBlocked.body")}
        </InlineNotice>
      ) : null}
    </div>
  );
};

export default ClaimDetailPage;
