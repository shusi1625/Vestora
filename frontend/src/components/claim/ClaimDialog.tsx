import { useCallback, useEffect, useMemo, useState } from "react";import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Fuel, Loader2 } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { AddressText } from "@/components/common/AddressText";
import { InlineNotice } from "@/components/common/InlineNotice";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TimestampMeta } from "@/components/common/TimestampMeta";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getClaimTotals } from "@/lib/claim-math";
import { gasText } from "@/lib/format";
import { TX_PHASE } from "@/lib/status";
import type { Claim } from "@/lib/types";

import { GAS_ESTIMATE, type AccountKey } from "@/prototype/fixtures";
import { useTx } from "@/providers/tx-context";
import { useWallet } from "@/providers/wallet-context";

type ClaimDialogProps = {
  claim: Claim | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 청구 확인 다이얼로그.
 * 실행 직전에 소유권·금액·네트워크·가스 잔액을 다시 확인하고, 청구는 수취권별로 실행합니다.
 */
export const ClaimDialog = ({ claim, open, onOpenChange }: ClaimDialogProps) => {
  const { t } = useTranslation();
  const { address, network, gasRaw, accountKey, requestNetworkSwitch, switchingNetwork } =
    useWallet();
  const { records, runTx } = useTx();
  const [checking, setChecking] = useState(false);
  const [openedAmount, setOpenedAmount] = useState<bigint | null>(null);
  const [started, setStarted] = useState(false);

  const totals = claim ? getClaimTotals(claim, new Date()) : null;

  const liveRecord = useMemo(
    () =>
      claim
        ? records.find((record) => record.claimId === claim.id && record.kind === "claim")
        : undefined,
    [claim, records],
  );

  const recheck = useCallback(() => {
    setChecking(true);
    const timer = window.setTimeout(() => setChecking(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open || !claim) return;
    setStarted(false);
    setOpenedAmount(getClaimTotals(claim, new Date()).claimableNow.raw);
    return recheck();
  }, [open, claim, recheck]);

  useEffect(() => {
    if (!started || !liveRecord) return;
    if (liveRecord.phase === "completed") {
      onOpenChange(false);
    }
  }, [started, liveRecord, onOpenChange]);

  if (!claim || !totals) {
    return null;
  }

  const isOwner = claim.owner === address;
  const networkBlocked = network !== "sepolia";
  const gasInsufficient = gasRaw < GAS_ESTIMATE.claim;
  const noAmount = totals.claimableNow.raw === 0n;
  // 선형 누적은 초 단위로도 값이 변하므로, 의미 있는 차이만 변경으로 표시합니다.
  const changeTolerance = claim.deposited / 1000n;
  const amountChanged =
    openedAmount !== null &&
    (openedAmount > totals.claimableNow.raw
      ? openedAmount - totals.claimableNow.raw
      : totals.claimableNow.raw - openedAmount) > changeTolerance;
  const canSubmit = !checking && isOwner && !networkBlocked && !gasInsufficient && !noAmount;

  const submit = async () => {
    setStarted(true);
    await runTx({
      kind: "claim",
      claimId: claim.id,
      account: accountKey,
      token: claim.token,
      amountRaw: totals.claimableNow.raw,
      role: "owner",
      requiresApproval: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("claimDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("claimDialog.description", { id: claim.id })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {checking ? (
            <InlineNotice tone="info" titleKey="claimDialog.checking.title">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 aria-hidden className="size-3 animate-spin" />
                {t("claimDialog.checking.body")}
              </span>
            </InlineNotice>
          ) : null}

          <div className="space-y-2 rounded-md border border-border bg-muted/50 px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption text-muted-foreground">
                {t("claimDialog.claimable")}
              </span>
              <Amount
                value={totals.claimableNow}
                size="title"
                estimateAt={totals.isEstimate ? new Date().toISOString() : null}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption text-muted-foreground">
                {t("claimDialog.remaining")}
              </span>
              <Amount
                value={{
                  token: claim.token,
                  raw: totals.totalUnclaimed.raw - totals.claimableNow.raw,
                }}
                size="body"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                <Fuel aria-hidden className="size-3" />
                {t("claimDialog.gas")}
              </span>
              <span className="figure text-body-sm">{gasText(GAS_ESTIMATE.claim)}</span>
            </div>
            <TimestampMeta at={new Date().toISOString()} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground">
            <AddressText address={claim.owner} labelKey="claimDialog.recipient" />
            <span>{t("claimDialog.tokenNote", { token: claim.token })}</span>
          </div>

          {amountChanged ? (
            <InlineNotice tone="warning" titleKey="claimDialog.changed.title">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-caption">{t("claimDialog.changed.before")}</span>
                <Amount
                  value={{ token: claim.token, raw: openedAmount ?? 0n }}
                  size="caption"
                />
                <span className="text-caption">{t("claimDialog.changed.after")}</span>
                <Amount value={totals.claimableNow} size="caption" />
              </span>
            </InlineNotice>
          ) : null}

          {!isOwner ? (
            <InlineNotice tone="danger" titleKey="claimDialog.notOwner.title">
              {t("claimDialog.notOwner.body")}
            </InlineNotice>
          ) : null}

          {networkBlocked ? (
            <InlineNotice
              tone="warning"
              titleKey="claimDialog.wrongNetwork.title"
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
              {t("claimDialog.wrongNetwork.body")}
            </InlineNotice>
          ) : null}

          {gasInsufficient ? (
            <InlineNotice tone="warning" titleKey="claimDialog.gasInsufficient.title">
              {t("claimDialog.gasInsufficient.body", {
                have: gasText(gasRaw),
                need: gasText(GAS_ESTIMATE.claim),
              })}
            </InlineNotice>
          ) : null}

          {noAmount ? (
            <InlineNotice tone="muted" titleKey="claimDialog.noAmount.title">
              {t("claimDialog.noAmount.body")}
            </InlineNotice>
          ) : null}

          {started && liveRecord ? (
            <div className="space-y-2 rounded-md border border-border px-3 py-3">
              <div className="flex items-center gap-2">
                <StatusBadge meta={TX_PHASE[liveRecord.phase]} size="sm" />
                <span className="text-body-sm">
                  {t(TX_PHASE[liveRecord.phase].hintKey)}
                </span>
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
              {liveRecord.phase === "rejected" ? (
                <p className="text-caption text-warning">{t("claimDialog.rejectedHint")}</p>
              ) : null}
              {liveRecord.phase === "failed-onchain" || liveRecord.phase === "stalled" ? (
                <p className="text-caption text-void">{t("claimDialog.failedHint")}</p>
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
            {t("claimDialog.submit")}
          </Button>
        </DialogFooter>
        {!canSubmit && !started ? (
          <p className="text-caption text-warning">{t("claimDialog.submitBlocked")}</p>
        ) : null}
        {started ? (
          <p className="text-caption text-muted-foreground">{t("claimDialog.trackHint")}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
