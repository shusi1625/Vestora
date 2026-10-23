import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { InlineNotice } from "@/components/common/InlineNotice";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { getListingMetrics, type ClaimTotals } from "@/lib/claim-math";
import { formatDate, formatPercent } from "@/lib/format";
import { LISTING_INVALID_REASON, LISTING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import type { Claim, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

type ListingCardProps = {
  claim: Claim;
  listing: Listing;
  totals: ClaimTotals;
  address: string | null;
  canTransact: boolean;
  onBuy: () => void;
  isPendingIndex?: boolean;
  className?: string;
};

/**
 * 매물 카드. 구매 판단에 필요한 사실(가격·남은 권리·취소 가능 여부·예상 차익 조건)을 그대로 노출합니다.
 * 여러 조건을 하나의 위험 점수로 축약하지 않습니다.
 */
export const ListingCard = ({
  claim,
  listing,
  totals,
  address,
  canTransact,
  onBuy,
  isPendingIndex = false,
  className,
}: ListingCardProps) => {
  const { t } = useTranslation();
  const now = new Date();
  const metrics = getListingMetrics(claim, listing, now);
  const isMine = listing.seller === address;
  const listingStatus = metrics.listingStatus;
  const ended = totals.paymentStatus === "completed";
  const noUnclaimed = totals.totalUnclaimed.raw === 0n;
  const discount = formatPercent(metrics.discountRate);
  const profitRate = metrics.showProfitRate
    ? formatPercent(metrics.profitRateVsPrice)
    : null;
  const invalidReasonKey = listing.invalidReason
    ? LISTING_INVALID_REASON[listing.invalidReason]
    : null;

  const blockedReason = isMine
    ? t("market.card.blocked.mine")
    : listing.status !== "active"
      ? t("market.card.blocked.inactive")
      : noUnclaimed
        ? t("market.card.blocked.noUnclaimed")
        : totals.paymentStatus === "cancelled"
          ? t("market.card.blocked.cancelled")
          : !canTransact
            ? t("wallet.blockedReason")
            : null;

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-lg border border-border bg-card px-4 py-4 shadow-card",
        isPendingIndex && "border-warning-border",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={`/claims/${claim.id}`}
            className="text-[15px] font-semibold underline-offset-2 hover:underline"
          >
            {t("common.claimId", { id: claim.id })}
          </Link>
          <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-caption font-medium">
            {claim.token}
          </span>
          {isMine ? (
            <span className="rounded-md border border-listed-border bg-listed-bg px-1.5 py-0.5 text-caption font-medium text-listed">
              {t("market.card.mine")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge meta={LISTING_STATUS[listingStatus]} size="sm" />
          <StatusBadge meta={PAYMENT_STATUS[totals.paymentStatus]} size="sm" />
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-caption text-muted-foreground">{t("market.card.price")}</p>
          <Amount value={metrics.price} size="title" className="mt-0.5" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {discount && metrics.discountRate !== null && metrics.discountRate > 0 ? (
            <span className="rounded-full border border-claimable-border bg-claimable-bg px-2 py-0.5 text-caption font-medium text-claimable">
              {t("market.card.discount", { rate: discount })}
            </span>
          ) : null}
          {metrics.excessAmount ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-caption font-medium text-warning">
              <CircleAlert aria-hidden className="size-3" />
              {t("market.card.excessBadge")}
            </span>
          ) : null}
          {metrics.discountRate === null ? (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-caption text-muted-foreground">
              {t("market.card.discountUnavailable")}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-body-sm text-muted-foreground">{t("claim.amount.totalUnclaimed")}</dt>
          <dd>
            <Amount value={totals.totalUnclaimed} size="body" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-body-sm text-muted-foreground">{t("claim.amount.claimableNow")}</dt>
          <dd>
            <Amount
              value={totals.claimableNow}
              size="body"
              estimateAt={totals.isEstimate ? new Date().toISOString() : null}
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-body-sm text-muted-foreground">{t("market.card.expectedProfit")}</dt>
          <dd>
            <Amount value={metrics.expectedProfit} size="body" />
          </dd>
        </div>
        {metrics.excessAmount ? (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-body-sm text-warning">{t("market.card.excessAmount")}</dt>
            <dd>
              <Amount value={metrics.excessAmount} size="body" />
            </dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-2 text-caption text-muted-foreground">
        {t("market.card.profitBasis")}
        {profitRate ? ` · ${t("market.card.profitRate", { rate: profitRate })}` : ""}
      </p>

      <div className="mt-3 space-y-1.5 text-caption">
        <p className="text-muted-foreground">
          {ended
            ? t("market.card.ended", { date: formatDate(claim.endAt) })
            : t("market.card.endsAt", { date: formatDate(claim.endAt) })}
        </p>
        <p className={claim.cancellable ? "text-warning" : "text-muted-foreground"}>
          {claim.cancellable
            ? t("market.card.cancellable")
            : t("market.card.notCancellable")}
        </p>
        {invalidReasonKey ? (
          <p className="text-void">{t(invalidReasonKey)}</p>
        ) : null}
        {isPendingIndex ? (
          <p className="text-warning">{t("assets.row.pendingIndex")}</p>
        ) : null}
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-3">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/claims/${claim.id}`}>
            {t("common.viewDetail")}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
        {isMine ? (
          <Button size="sm" variant="secondary" asChild>
            <Link to="/my/sales">{t("claim.action.manageListing")}</Link>
          </Button>
        ) : (
          <Button size="sm" disabled={Boolean(blockedReason)} onClick={onBuy}>
            {t("market.card.buy")}
          </Button>
        )}
      </footer>
      {blockedReason && !isMine && !noUnclaimed ? (
        <p className="mt-2 text-caption text-warning">{blockedReason}</p>
      ) : null}
      {noUnclaimed ? (
        <InlineNotice tone="warning" className="mt-3">
          {t("market.card.noUnclaimedNote")}
        </InlineNotice>
      ) : null}
    </article>
  );
};
