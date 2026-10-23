import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Fuel, Loader2 } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { AddressText } from "@/components/common/AddressText";
import { InlineNotice } from "@/components/common/InlineNotice";
import { StatusBadge } from "@/components/common/StatusBadge";
import { KeyValue, KeyValueDivider } from "@/components/common/Section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getClaimTotals, getListingMetrics } from "@/lib/claim-math";
import { gasText, formatPercent } from "@/lib/format";
import { TX_PHASE } from "@/lib/status";
import type { Claim, Listing } from "@/lib/types";

import { useScenario } from "@/providers/scenario-context";
import { useTx } from "@/providers/tx-context";
import { useWallet } from "@/providers/wallet-context";
import { GAS_ESTIMATE } from "@/prototype/fixtures";

type BuyDialogProps = {
  claim: Claim | null;
  listing: Listing | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 구매 확인 다이얼로그.
 * 취득할 권리를 즉시 청구 가능분과 향후 지급분으로 나눠 보여주고,
 * 실행 직전에 가격·잔여 수취액·소유권을 다시 검증합니다. 조건이 바뀌면 자동 진행하지 않습니다.
 */
export const BuyDialog = ({ claim, listing, open, onOpenChange }: BuyDialogProps) => {
  const { t } = useTranslation();
  const { scenario } = useScenario();
  const { address, balances, gasRaw, network, accountKey, requestNetworkSwitch, switchingNetwork } =
    useWallet();
  const { records, runTx } = useTx();
  const [checking, setChecking] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reviewedChange, setReviewedChange] = useState(false);
  const [started, setStarted] = useState(false);

  const recheck = useCallback(() => {
    setChecking(true);
    const timer = window.setTimeout(() => setChecking(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    setAgreed(false);
    setReviewedChange(false);
    setStarted(false);
    return recheck();
  }, [open, listing, recheck]);

  const liveRecord =
    claim && listing
      ? records.find(
          (record) => record.claimId === claim.id && record.kind === "buy",
        )
      : undefined;

  useEffect(() => {
    if (!started || !liveRecord) return;
    if (liveRecord.phase === "completed") onOpenChange(false);
  }, [started, liveRecord, onOpenChange]);

  if (!claim || !listing) {
    return null;
  }

  const now = new Date();
  const totals = getClaimTotals(claim, now);
  const metrics = getListingMetrics(claim, listing, now);
  const priceChanged = scenario.screens.market === "changed";
  const changedPriceRaw = priceChanged ? listing.priceRaw + listing.priceRaw / 20n : listing.priceRaw;
  const effectivePrice = { token: claim.token, raw: changedPriceRaw };
  const balance =
    balances.find((item) => item.token === claim.token)?.raw ?? 0n;

  const ownListing = listing.seller === address;
  const listingInactive = listing.status !== "active";
  const insufficientBalance = balance < changedPriceRaw;
  const gasInsufficient = gasRaw < GAS_ESTIMATE.buy;
  const networkBlocked = network !== "sepolia";
  const rpcError = scenario.dataCondition === "failure";
  const needsAgreement = claim.cancellable && !listingInactive;
  const mustReviewChange = priceChanged && !reviewedChange;

  const canSubmit =
    !checking &&
    !ownListing &&
    !listingInactive &&
    !insufficientBalance &&
    !gasInsufficient &&
    !networkBlocked &&
    !rpcError &&
    !mustReviewChange &&
    (!needsAgreement || agreed);

  const submit = async () => {
    setStarted(true);
    await runTx({
      kind: "buy",
      claimId: claim.id,
      account: accountKey,
      token: claim.token,
      amountRaw: changedPriceRaw,
      role: "buyer",
      requiresApproval: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("buyDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("buyDialog.description", { id: claim.id })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {checking ? (
            <InlineNotice tone="info" titleKey="buyDialog.checking.title">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 aria-hidden className="size-3 animate-spin" />
                {t("buyDialog.checking.body")}
              </span>
            </InlineNotice>
          ) : null}

          <div>
            <KeyValue labelKey="buyDialog.seller">
              <AddressText address={listing.seller} />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="buyDialog.price">
              <Amount value={effectivePrice} size="title" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="buyDialog.acquired">
              <Amount value={totals.totalUnclaimed} size="body" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="buyDialog.claimableNow">
              <Amount
                value={totals.claimableNow}
                size="body"
                estimateAt={totals.isEstimate ? new Date().toISOString() : null}
              />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="buyDialog.future">
              <Amount value={totals.futureAmount} size="body" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue
              labelKey="buyDialog.expectedProfit"
              hintKey="buyDialog.expectedProfitHint"
            >
              {metrics.showProfitRate ? (
                <Amount value={metrics.expectedProfit} size="body" />
              ) : (
                <span className="text-body-sm text-muted-foreground">
                  {t("buyDialog.profitHidden")}
                </span>
              )}
            </KeyValue>
            {metrics.discountRate !== null && metrics.discountRate > 0 ? (
              <>
                <KeyValueDivider />
                <KeyValue labelKey="buyDialog.discount">
                  <span className="figure text-body-sm">
                    {formatPercent(metrics.discountRate)}
                  </span>
                </KeyValue>
              </>
            ) : null}
            {metrics.excessAmount ? (
              <>
                <KeyValueDivider />
                <KeyValue labelKey="buyDialog.excess">
                  <span className="inline-flex items-center gap-2">
                    <Amount value={metrics.excessAmount} size="caption" />
                    <StatusBadge
                      meta={{
                        key: "buyDialog.excessBadge",
                        tone: "warning",
                      }}
                      size="sm"
                    />
                  </span>
                </KeyValue>
              </>
            ) : null}
            <KeyValueDivider />
            <KeyValue labelKey="buyDialog.gas">
              <span className="figure inline-flex items-center gap-1.5 text-body-sm">
                <Fuel aria-hidden className="size-3" />
                {gasText(GAS_ESTIMATE.buy)}
              </span>
            </KeyValue>
          </div>

          <InlineNotice tone={claim.cancellable ? "warning" : "muted"}>
            {claim.cancellable
              ? t("buyDialog.cancelRisk")
              : t("buyDialog.noCancelRisk")}
          </InlineNotice>

          <InlineNotice tone="muted">{t("buyDialog.protectionNote")}</InlineNotice>

          {priceChanged ? (
            <InlineNotice tone="warning" titleKey="buyDialog.changed.title">
              <span className="space-y-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-caption">{t("buyDialog.changed.before")}</span>
                  <Amount value={{ token: claim.token, raw: listing.priceRaw }} size="caption" />
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-caption">{t("buyDialog.changed.after")}</span>
                  <Amount value={effectivePrice} size="caption" />
                </span>
                <label className="mt-1 flex items-start gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={reviewedChange}
                    onChange={(event) => setReviewedChange(event.target.checked)}
                    className="mt-0.5 size-4 rounded border-input"
                  />
                  {t("buyDialog.changed.ack")}
                </label>
              </span>
            </InlineNotice>
          ) : null}

          {ownListing ? (
            <InlineNotice tone="warning" titleKey="buyDialog.ownListing.title">
              {t("buyDialog.ownListing.body")}
            </InlineNotice>
          ) : null}
          {listingInactive ? (
            <InlineNotice tone="danger" titleKey="buyDialog.inactive.title">
              {t("buyDialog.inactive.body")}
            </InlineNotice>
          ) : null}
          {insufficientBalance ? (
            <InlineNotice tone="warning" titleKey="buyDialog.insufficient.title">
              {t("buyDialog.insufficient.body", { token: claim.token })}
            </InlineNotice>
          ) : null}
          {gasInsufficient ? (
            <InlineNotice tone="warning" titleKey="buyDialog.gasInsufficient.title">
              {t("buyDialog.gasInsufficient.body", {
                have: gasText(gasRaw),
                need: gasText(GAS_ESTIMATE.buy),
              })}
            </InlineNotice>
          ) : null}
          {networkBlocked ? (
            <InlineNotice
              tone="warning"
              titleKey="buyDialog.wrongNetwork.title"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-caption"
                  disabled={switchingNetwork}
                  onClick={() => void requestNetworkSwitch()}
                >
                  {t("network.switch.action")}
                </Button>
              }
            >
              {t("buyDialog.wrongNetwork.body")}
            </InlineNotice>
          ) : null}
          {rpcError ? (
            <InlineNotice tone="danger" titleKey="buyDialog.rpcError.title">
              {t("buyDialog.rpcError.body")}
            </InlineNotice>
          ) : null}

          {needsAgreement && !listingInactive ? (
            <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2.5 text-body-sm">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 size-4 rounded border-input"
              />
              {t("buyDialog.agreement")}
            </label>
          ) : null}

          {started && liveRecord ? (
            <div className="space-y-2 rounded-md border border-border px-3 py-3">
              <div className="flex items-center gap-2">
                <StatusBadge meta={TX_PHASE[liveRecord.phase]} size="sm" />
                <span className="text-body-sm">{t(TX_PHASE[liveRecord.phase].hintKey)}</span>
              </div>
              {liveRecord.explorerUrl ? (
                <a
                  href={liveRecord.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-caption text-primary underline-offset-2 hover:underline"
                >
                  {t("tx.viewTransaction")}
                  <ArrowRight aria-hidden className="size-3" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button disabled={!canSubmit || started} onClick={() => void submit()}>
            {started ? <Loader2 aria-hidden className="size-4 animate-spin" /> : null}
            {t("buyDialog.submit")}
          </Button>
        </DialogFooter>
        {!canSubmit && !started ? (
          <p className="text-caption text-warning">{t("buyDialog.submitBlocked")}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
