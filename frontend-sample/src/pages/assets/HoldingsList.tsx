import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ClaimRow } from "@/components/claim/ClaimRow";
import { EmptyState } from "@/components/common/EmptyState";
import { getClaimTotals } from "@/lib/claim-math";
import type { Claim, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CLAIM_FILTERS, matchesClaimFilter, type ClaimFilter } from "./filters";

type HoldingsListProps = {
  claims: Claim[];
  listings: Listing[];
  address: string | null;
  canTransact: boolean;
  pendingIndexClaimIds: string[];
  filter: ClaimFilter;
  onFilterChange: (filter: ClaimFilter) => void;
  onClaim: (claim: Claim) => void;
  onGoMarket: () => void;
};

/**
 * 보유 수취권 목록.
 * 완료된 수취권은 이력으로 조회할 수 있지만 활성 자산과 구분해 배치합니다.
 */
export const HoldingsList = ({
  claims,
  listings,
  address,
  canTransact,
  pendingIndexClaimIds,
  filter,
  onFilterChange,
  onClaim,
  onGoMarket,
}: HoldingsListProps) => {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const now = new Date();
    const owned = claims
      .filter((claim) => claim.owner === address)
      .map((claim) => {
        const totals = getClaimTotals(claim, now);
        const listing =
          listings.find(
            (item) => item.claimId === claim.id && item.status === "active",
          ) ?? null;
        return { claim, totals, listing };
      })
      .filter((row) =>
        matchesClaimFilter(filter, row.totals, row.listing?.seller === address),
      );

    return owned.sort((a, b) => {
      const aClosed = a.totals.claimStatus === "fully-claimed" ? 1 : 0;
      const bClosed = b.totals.claimStatus === "fully-claimed" ? 1 : 0;
      return aClosed - bClosed;
    });
  }, [claims, listings, address, filter]);

  const hasOwnedClaims = claims.some((claim) => claim.owner === address);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{t("assets.holdings.title")}</h2>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("assets.holdings.title")}>
          {CLAIM_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={filter === item.value}
              onClick={() => onFilterChange(item.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-body-sm font-medium transition-colors duration-fast",
                filter === item.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {t(item.key)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        hasOwnedClaims && filter !== "all" ? (
          <EmptyState
            titleKey="assets.empty.filter.title"
            bodyKey="assets.empty.filter.body"
            actionLabelKey="assets.empty.filter.action"
            onAction={() => onFilterChange("all")}
          />
        ) : (
          <EmptyState
            titleKey="assets.empty.title"
            bodyKey="assets.empty.body"
            actionLabelKey="assets.empty.action"
            onAction={onGoMarket}
          />
        )
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <ClaimRow
              key={row.claim.id}
              claim={row.claim}
              listing={row.listing}
              totals={row.totals}
              address={address}
              canTransact={canTransact}
              isPendingIndex={pendingIndexClaimIds.includes(row.claim.id)}
              onClaim={() => onClaim(row.claim)}
              className={cn(
                row.totals.claimStatus === "fully-claimed" && "opacity-90",
              )}
            />
          ))}
        </div>
      )}

      <p className="text-caption text-muted-foreground">{t("assets.holdings.scopeNote")}</p>
    </section>
  );
};
