import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { AddressText } from "@/components/common/AddressText";
import { Amount } from "@/components/common/Amount";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineNotice } from "@/components/common/InlineNotice";
import { KeyValue, KeyValueDivider, Section } from "@/components/common/Section";
import { ReasonedButton } from "@/components/common/ReasonedButton";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClaimTotals, getExpectedProceeds } from "@/lib/claim-math";
import { formatPercent, formatUnits } from "@/lib/format";
import { parsePrice, type PriceError } from "@/lib/price";
import { OWNERSHIP_STATE, TX_PHASE } from "@/lib/status";
import { usePrototypeData } from "@/providers/prototype-data-context";
import { useScenario } from "@/providers/scenario-context";
import { useTx } from "@/providers/tx-context";
import { useWallet } from "@/providers/wallet-context";
import { GAS_ESTIMATE } from "@/prototype/fixtures";

const PRICE_ERROR_KEYS: Record<Exclude<PriceError, null>, string> = {
  empty: "sell.price.error.empty",
  format: "sell.price.error.format",
  decimals: "sell.price.error.decimals",
  range: "sell.price.error.range",
};

const NOTICE_KEYS = [
  "sell.notice.notSold",
  "sell.notice.rightsTransfer",
  "sell.notice.claimableIncluded",
  "sell.notice.recheckAfterClaim",
] as const;

const SellPage = () => {
  const { id = "" } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { address, canTransact, accountKey, gasRaw } = useWallet();
  const { scenario, setScenario } = useScenario();
  const { claims, listings } = usePrototypeData();
  const { records, runTx } = useTx();

  const screen = scenario.screens.sell;
  const [price, setPrice] = useState("");
  const [approvedLocally, setApprovedLocally] = useState(false);

  useEffect(() => {
    if (screen === "invalid-price") setPrice("12.3456789");
    if (screen === "approval-ok-list-failed") {
      setScenario({ txOutcome: "approval-ok-execute-failed" });
    }
  }, [screen, setScenario]);

  const claim = claims.find((item) => item.id === id) ?? null;
  const totals = claim ? getClaimTotals(claim, new Date()) : null;
  const listing =
    claim ? listings.find((item) => item.claimId === claim.id && item.status === "active") ?? null : null;

  const parsed = useMemo(
    () => (claim ? parsePrice(price, claim.token) : { raw: 0n, error: "empty" as PriceError }),
    [price, claim],
  );
  const proceeds = claim ? getExpectedProceeds(claim.token, parsed.raw, null) : null;
  const discountRate =
    claim && totals && totals.totalUnclaimed.raw > 0n && parsed.raw > 0n
      ? formatPercent(
          Number(totals.totalUnclaimed.raw - parsed.raw) / Number(totals.totalUnclaimed.raw),
        )
      : null;
  const excessRaw =
    claim && totals && parsed.raw > totals.totalUnclaimed.raw
      ? parsed.raw - totals.totalUnclaimed.raw
      : null;

  const approvalRecord = claim
    ? records.find(
        (record) => record.claimId === claim.id && record.kind === "approve",
      )
    : undefined;
  const listRecord = claim
    ? records.find((record) => record.claimId === claim.id && record.kind === "list")
    : undefined;
  const approvalState = screen === "conditions-changed"
    ? "unknown"
    : approvedLocally || approvalRecord?.phase === "completed"
      ? "approved"
      : "required";

  const conditionsChanged = screen === "conditions-changed";
  const alreadyListed = screen === "already-listed" || Boolean(listing);
  const ownershipChanged = conditionsChanged;
  const fullyClaimed = totals?.claimStatus === "fully-claimed";
  const cancelledPayment = totals?.paymentStatus === "cancelled";
  const gasInsufficient = gasRaw < GAS_ESTIMATE.list;
  const isOwner = claim ? claim.owner === address : false;

  if (!claim || !totals) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="sell.title" />
        <EmptyState
          titleKey="claim.error.notFound.title"
          bodyKey="claim.error.notFound.body"
          actionLabelKey="claim.error.goMarket"
          onAction={() => navigate("/market")}
        />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="sell.title" />
        <EmptyState
          titleKey="sell.connect.title"
          bodyKey="sell.connect.body"
          actionLabelKey="sell.connect.action"
          onAction={() => navigate("/market")}
        />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="sell.title" />
        <EmptyState
          titleKey="sell.notOwner.title"
          bodyKey="sell.notOwner.body"
          actionLabelKey="common.viewDetail"
          onAction={() => navigate(`/claims/${claim.id}`)}
        />
      </div>
    );
  }

  const priceInvalid = parsed.error !== null;
  const approveBlocked = !canTransact || gasInsufficient || conditionsChanged;
  const listBlocked =
    approveBlocked ||
    approvalState !== "approved" ||
    priceInvalid ||
    alreadyListed ||
    Boolean(fullyClaimed) ||
    Boolean(cancelledPayment) ||
    ownershipChanged;

  const runApprove = async () => {
    setApprovedLocally(true);
    await runTx({
      kind: "approve",
      claimId: claim.id,
      account: accountKey,
      token: claim.token,
      amountRaw: parsed.raw,
      role: "seller",
      requiresApproval: false,
    });
  };

  const runList = async () => {
    await runTx({
      kind: "list",
      claimId: claim.id,
      account: accountKey,
      token: claim.token,
      amountRaw: parsed.raw,
      role: "seller",
      requiresApproval: false,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => navigate(`/claims/${claim.id}`)}>
          <ArrowLeft aria-hidden className="size-4" />
          {t("common.back")}
        </Button>
      </div>

      <PageHeader
        titleKey="sell.title"
        description={t("sell.subtitle", { id: claim.id })}
      />

      {alreadyListed ? (
        <InlineNotice
          tone="warning"
          titleKey="sell.alreadyListed.title"
          action={
            <Button size="sm" variant="outline" className="h-7 px-2 text-caption" asChild>
              <Link to="/my/sales">{t("claim.action.manageListing")}</Link>
            </Button>
          }
        >
          {t("sell.alreadyListed.body")}
        </InlineNotice>
      ) : null}

      {conditionsChanged ? (
        <InlineNotice tone="warning" titleKey="sell.conditionsChanged.title">
          {t("sell.conditionsChanged.body")}
        </InlineNotice>
      ) : null}

      {fullyClaimed ? (
        <InlineNotice tone="muted" titleKey="sell.fullyClaimed.title">
          {t("sell.fullyClaimed.body")}
        </InlineNotice>
      ) : null}

      {cancelledPayment ? (
        <InlineNotice tone="danger" titleKey="sell.cancelledPayment.title">
          {t("sell.cancelledPayment.body")}
        </InlineNotice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section titleKey="sell.target.title">
            <KeyValue labelKey="sell.target.claim">
              <span className="figure text-body-sm">{t("common.claimId", { id: claim.id })}</span>
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="sell.target.token">
              <span className="figure text-body-sm">{claim.token}</span>
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="sell.target.owner">
              <AddressText address={claim.owner} />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.overview.ownership">
              <StatusBadge meta={OWNERSHIP_STATE[claim.ownership]} size="sm" />
            </KeyValue>
          </Section>

          <Section titleKey="sell.rights.title" descriptionKey="sell.rights.description">
            <KeyValue labelKey="claim.amount.claimableNow">
              <Amount
                value={totals.claimableNow}
                size="body"
                estimateAt={totals.isEstimate ? new Date().toISOString() : null}
              />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.amount.future">
              <Amount value={totals.futureAmount} size="body" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.amount.totalUnclaimed">
              <Amount value={totals.totalUnclaimed} size="body" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="claim.cancel.label">
              <span className="text-body-sm">
                {claim.cancellable ? t("claim.cancel.available") : t("claim.cancel.unavailable")}
              </span>
            </KeyValue>
            {conditionsChanged ? (
              <p className="mt-2 text-caption text-warning">{t("sell.rights.changedNote")}</p>
            ) : null}
          </Section>

          <Section titleKey="sell.notice.title">
            <ul className="space-y-2">
              {NOTICE_KEYS.map((key) => (
                <li key={key} className="flex gap-2 text-body-sm text-muted-foreground">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <div className="space-y-6">
          <Section titleKey="sell.price.title" descriptionKey="sell.price.description">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="sell-price">{t("sell.price.label", { token: claim.token })}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sell-price"
                    inputMode="decimal"
                    value={price}
                    placeholder={formatUnits(totals.totalUnclaimed.raw, claim.token)}
                    onChange={(event) => setPrice(event.target.value)}
                    aria-invalid={priceInvalid}
                    className="figure"
                  />
                  <span className="text-body-sm font-medium text-muted-foreground">
                    {claim.token}
                  </span>
                </div>
                {price.trim() !== "" && parsed.error ? (
                  <p className="text-caption text-void">{t(PRICE_ERROR_KEYS[parsed.error])}</p>
                ) : (
                  <p className="text-caption text-muted-foreground">{t("sell.price.hint")}</p>
                )}
              </div>

              <div className="rounded-md border border-border bg-muted/50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-caption text-muted-foreground">
                    {t("sell.price.comparison")}
                  </span>
                  <span className="text-body-sm">
                    {parsed.raw === 0n || !discountRate
                      ? t("sell.price.comparisonNone")
                      : excessRaw
                        ? t("sell.price.excess", { rate: discountRate })
                        : parsed.raw === totals.totalUnclaimed.raw
                          ? t("sell.price.equal")
                          : t("sell.price.discount", { rate: discountRate })}
                  </span>
                </div>
                {excessRaw ? (
                  <p className="mt-1 text-caption text-warning">
                    {t("sell.price.excessAmount")}
                    <Amount value={{ token: claim.token, raw: excessRaw }} size="caption" />
                  </p>
                ) : null}
              </div>

              <div>
                <KeyValue labelKey="sell.proceeds.price">
                  {price.trim() !== "" ? (
                    <Amount value={{ token: claim.token, raw: parsed.raw }} size="body" />
                  ) : (
                    <span className="text-body-sm text-muted-foreground">
                      {t("common.notEntered")}
                    </span>
                  )}
                </KeyValue>
                <KeyValueDivider />
                <KeyValue labelKey="sell.proceeds.confirmedCost">
                  <span className="text-body-sm text-muted-foreground">
                    {t("sell.proceeds.costUnknown")}
                  </span>
                </KeyValue>
                <KeyValueDivider />
                <KeyValue labelKey="sell.proceeds.expected">
                  {price.trim() !== "" && !priceInvalid ? (
                    <Amount
                      value={proceeds?.amount ?? { token: claim.token, raw: 0n }}
                      size="body"
                    />
                  ) : (
                    <span className="text-body-sm text-muted-foreground">
                      {t("common.notEntered")}
                    </span>
                  )}
                </KeyValue>
                <p className="mt-2 text-caption text-muted-foreground">
                  {t("sell.proceeds.note")}
                </p>
              </div>
            </div>
          </Section>

          <Section titleKey="sell.execute.title" descriptionKey="sell.execute.description">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-medium">{t("sell.approval.label")}</span>
                <StatusBadge
                  meta={
                    approvalState === "approved"
                      ? { key: "sell.approval.approved", tone: "claimable" }
                      : approvalState === "unknown"
                        ? { key: "sell.approval.unknown", tone: "warning" }
                        : { key: "sell.approval.required", tone: "listed" }
                  }
                  size="sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ReasonedButton
                  size="sm"
                  variant="outline"
                  disabled={approvalState === "approved" || approveBlocked}
                  disabledReason={
                    approveBlocked ? t("sell.approval.blockedReason") : null
                  }
                  onClick={() => void runApprove()}
                >
                  {approvalState === "approved" ? (
                    <Check aria-hidden className="size-4" />
                  ) : null}
                  {t("sell.approval.action")}
                </ReasonedButton>

                <ReasonedButton
                  size="sm"
                  disabled={listBlocked}
                  disabledReason={
                    listBlocked ? t("sell.list.blockedReason") : null
                  }
                  onClick={() => void runList()}
                >
                  {t("sell.list.action")}
                </ReasonedButton>
              </div>

              {gasInsufficient ? (
                <p className="text-caption text-warning">{t("sell.gasInsufficient")}</p>
              ) : null}
              {!canTransact ? (
                <p className="text-caption text-warning">{t("wallet.blockedReason")}</p>
              ) : null}

              {listRecord ? (
                <div className="space-y-1 rounded-md border border-border px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge meta={TX_PHASE[listRecord.phase]} size="sm" />
                    <span className="inline-flex items-center gap-1.5 text-body-sm">
                      {!["completed", "rejected", "failed-onchain", "replaced"].includes(
                        listRecord.phase,
                      ) ? (
                        <Loader2 aria-hidden className="size-3 animate-spin" />
                      ) : null}
                      {t(TX_PHASE[listRecord.phase].hintKey)}
                    </span>
                  </div>
                  {listRecord.failureReason ? (
                    <p className="text-caption text-void">{t(listRecord.failureReason)}</p>
                  ) : null}
                </div>
              ) : null}

              {approvalRecord?.phase === "completed" && listRecord?.phase === "failed-onchain" ? (
                <InlineNotice tone="success" titleKey="sell.approvalSeparated.title">
                  {t("sell.approvalSeparated.body")}
                </InlineNotice>
              ) : null}

              {listRecord?.phase === "completed" ? (
                <InlineNotice tone="success" titleKey="sell.listed.title">
                  {t("sell.listed.body")}
                </InlineNotice>
              ) : null}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

export default SellPage;
