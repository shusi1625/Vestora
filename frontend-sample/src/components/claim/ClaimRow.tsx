import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, CircleAlert } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { resolveListingStatus, type ClaimTotals } from "@/lib/claim-math";
import { formatDate } from "@/lib/format";
import { CLAIM_STATUS, LISTING_STATUS, PAYMENT_STATUS } from "@/lib/status";
import type { Claim, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClaimRowProps = {
  claim: Claim;
  listing: Listing | null;
  totals: ClaimTotals;
  address: string | null;
  canTransact: boolean;
  onClaim: () => void;
  isPendingIndex?: boolean;
  className?: string;
};

/** 보유 수취권 목록 행. 3개 상태 축을 각각 표시하고 조건에 맞는 행동만 노출합니다. */
export const ClaimRow = ({
  claim,
  listing,
  totals,
  address,
  canTransact,
  onClaim,
  isPendingIndex = false,
  className,
}: ClaimRowProps) => {
  const { t } = useTranslation();
  const isOwner = Boolean(address) && claim.owner === address;
  const isListedByMe = listing?.status === "active" && listing.seller === address;
  const listingStatus = resolveListingStatus(claim, listing);
  const canClaim = totals.claimableNow.raw > 0n;
  const canSell =
    isOwner &&
    !isListedByMe &&
    totals.paymentStatus !== "cancelled" &&
    totals.futureAmount.raw > 0n;

  return (
    <article
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3.5 shadow-card transition-colors duration-fast",
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
          {isOwner ? (
            <span className="rounded-md border border-listed-border bg-listed-bg px-1.5 py-0.5 text-caption font-medium text-listed">
              {t("common.mine")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge meta={PAYMENT_STATUS[totals.paymentStatus]} size="sm" />
          <StatusBadge meta={CLAIM_STATUS[totals.claimStatus]} size="sm" />
          <StatusBadge meta={LISTING_STATUS[listingStatus]} size="sm" />
        </div>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <p className="text-caption text-muted-foreground">{t("claim.amount.totalUnclaimed")}</p>
          <Amount value={totals.totalUnclaimed} size="body" />
        </div>
        <div>
          <p className="text-caption text-muted-foreground">{t("claim.amount.claimableNow")}</p>
          <Amount
            value={totals.claimableNow}
            size="body"
            estimateAt={totals.isEstimate ? new Date().toISOString() : null}
          />
        </div>
        <div>
          <p className="text-caption text-muted-foreground">{t("claim.amount.future")}</p>
          <Amount value={totals.futureAmount} size="body" />
        </div>
      </div>

      <p className="mt-3 text-caption text-muted-foreground">
        {t("claim.schedule.range", {
          start: formatDate(claim.startAt),
          end: formatDate(claim.endAt),
        })}
        {" · "}
        {claim.cancellable ? t("claim.cancel.available") : t("claim.cancel.unavailable")}
      </p>

      {isPendingIndex ? (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-warning">
          <CircleAlert aria-hidden className="size-3" />
          {t("assets.row.pendingIndex")}
        </p>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to={`/claims/${claim.id}`}>
            {t("common.viewDetail")}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
        {isOwner && canClaim ? (
          <span className="inline-flex flex-col items-start gap-1">
            <Button size="sm" disabled={!canTransact} onClick={onClaim}>
              {t("claim.action.claim")}
            </Button>
            {!canTransact ? (
              <span className="text-caption text-warning">{t("wallet.blockedReason")}</span>
            ) : null}
          </span>
        ) : null}
        {canSell ? (
          <Button asChild size="sm" variant="secondary">
            <Link to={`/claims/${claim.id}/sell`}>{t("claim.action.sell")}</Link>
          </Button>
        ) : null}
        {isListedByMe ? (
          <Button asChild size="sm" variant="secondary">
            <Link to="/my/sales">{t("claim.action.manageListing")}</Link>
          </Button>
        ) : null}
      </footer>
    </article>
  );
};
