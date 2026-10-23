import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { InlineNotice } from "@/components/common/InlineNotice";
import { MetricCard } from "@/components/common/MetricCard";
import { Section } from "@/components/common/Section";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TimestampMeta, type Freshness } from "@/components/common/TimestampMeta";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { PortfolioSummary } from "@/lib/claim-math";
import { cn } from "@/lib/utils";

const EXPLANATION_KEYS = [
  "assets.explain.holdings",
  "assets.explain.noDoubleCount",
  "assets.explain.cancelled",
  "assets.explain.listedIncluded",
  "assets.explain.askingExcluded",
  "assets.explain.tokenSplit",
  "assets.explain.payerDeposit",
  "assets.explain.profitNotAnnual",
] as const;

type AssetsSummaryProps = {
  summary: PortfolioSummary;
  ownershipUnknown: boolean;
  freshness: Freshness;
  isPendingIndex: boolean;
  unavailableKeys: string[];
  onRecheck: () => void;
  className?: string;
};

/** 자산 요약. 판매 중 수취액은 합계의 일부를 설명하는 정보로 배치합니다. */
export const AssetsSummary = ({
  summary,
  ownershipUnknown,
  freshness,
  isPendingIndex,
  unavailableKeys,
  onRecheck,
  className,
}: AssetsSummaryProps) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Section
      titleKey="assets.summary.title"
      descriptionKey="assets.summary.description"
      className={className}
      action={
        <Button size="sm" variant="outline" onClick={onRecheck}>
          {t("common.refresh")}
        </Button>
      }
    >
      <div className="space-y-4">
        <TimestampMeta at={new Date().toISOString()} freshness={freshness} onRecheck={onRecheck} />

        {ownershipUnknown ? (
          <InlineNotice tone="warning">{t("assets.summary.unverified")}</InlineNotice>
        ) : null}

        {summary.tokens.map((token) => (
          <div
            key={token.token}
            className="space-y-3 rounded-lg border border-border bg-card/60 px-4 py-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-caption text-muted-foreground">
                  {t("assets.summary.holdingsTotal")}
                </p>
                <Amount
                  value={token.holdingsTotal}
                  size="display"
                  className="mt-1"
                />
                <p className="mt-1 text-caption text-muted-foreground">
                  {t("assets.summary.holdingsNote")}
                </p>
              </div>
              <StatusBadge
                meta={
                  token.token === "MockUSDC"
                    ? { key: "assets.summary.tokenMock", tone: "listed" }
                    : { key: "assets.summary.tokenWeth", tone: "scheduled" }
                }
                size="sm"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                labelKey="assets.summary.walletBalance"
                value={token.walletBalance}
                state={unavailableKeys.includes("balances") ? "unavailable" : "normal"}
                hintKey="assets.summary.walletBalanceHint"
              />
              <MetricCard
                labelKey="assets.summary.claimableNow"
                value={token.claimableNow}
                estimateAt={new Date().toISOString()}
                hintKey="assets.summary.claimableNowHint"
              />
              <MetricCard
                labelKey="assets.summary.future"
                value={token.futureAmount}
                emptyLabelKey="claim.amount.none"
                hintKey="assets.summary.futureHint"
              />
              <MetricCard
                labelKey="assets.summary.cancellableFuture"
                value={token.cancellableFuture}
                emptyLabelKey="claim.amount.none"
                hintKey="assets.summary.cancellableFutureHint"
              />
            </div>

            <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("assets.summary.listedUnclaimed")}</dt>
                <dd className="flex items-center gap-2">
                  <Amount value={token.listedUnclaimed} size="body" />
                  <span className="text-caption text-muted-foreground">
                    {t("assets.summary.listedCount", { count: token.listedCount })}
                  </span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("assets.summary.listedAskingTotal")}</dt>
                <dd className="flex items-center gap-2">
                  <Amount value={token.listedAskingTotal} size="body" />
                  <span className="text-caption text-muted-foreground">
                    {t("assets.summary.notAdded")}
                  </span>
                </dd>
              </div>
            </dl>

            {token.unverifiedClaimCount > 0 ? (
              <p className="text-caption text-warning">
                {t("assets.summary.unverifiedCount", { count: token.unverifiedClaimCount })}
              </p>
            ) : null}
          </div>
        ))}

        {isPendingIndex ? (
          <InlineNotice tone="warning" titleKey="state.pendingIndex.title">
            {t("state.pendingIndex.body")}
          </InlineNotice>
        ) : null}

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground"
            >
              <ChevronDown
                aria-hidden
                className={cn("size-4 transition-transform", open && "rotate-180")}
              />
              {t("assets.explain.title")}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-md border border-border bg-muted/50 px-3 py-3">
            <ul className="space-y-1.5">
              {EXPLANATION_KEYS.map((key) => (
                <li key={key} className="flex gap-2 text-body-sm text-muted-foreground">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                  {t(key)}
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </Section>
  );
};
