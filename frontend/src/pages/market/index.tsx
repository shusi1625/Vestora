import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { BuyDialog } from "@/components/claim/BuyDialog";
import { DataState } from "@/components/common/DataState";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineNotice } from "@/components/common/InlineNotice";
import { ListingCard } from "@/components/market/ListingCard";
import {
  MarketToolbar,
  type CancellableFilter,
  type PhaseFilter,
  type SortKey,
  type TokenFilter,
} from "@/components/market/MarketToolbar";
import { PageHeader } from "@/components/layout/PageHeader";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { getClaimTotals } from "@/lib/claim-math";
import type { Claim, Listing } from "@/lib/types";
import { usePrototypeData } from "@/providers/prototype-data-context";
import { useScenario } from "@/providers/scenario-context";
import { useWallet } from "@/providers/wallet-context";

const readParam = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const TOKENS = ["all", "MockUSDC", "mWETH"] as const;
const CANCELLABLE = ["all", "yes", "no"] as const;
const PHASES = ["all", "streaming", "ended"] as const;
const SORTS = ["price-asc", "price-desc", "unclaimed-desc", "end-asc"] as const;

const MarketPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { address, canTransact } = useWallet();
  const { scenario } = useScenario();
  const { claims, listings, pendingIndexClaimIds } = usePrototypeData();
  const [buyTarget, setBuyTarget] = useState<{ claim: Claim; listing: Listing } | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  useScrollRestore("market");

  const token = readParam<TokenFilter>(searchParams.get("token"), TOKENS, "all");
  const cancellable = readParam<CancellableFilter>(
    searchParams.get("cancellable"),
    CANCELLABLE,
    "all",
  );
  const phase = readParam<PhaseFilter>(searchParams.get("phase"), PHASES, "all");
  const sort = readParam<SortKey>(searchParams.get("sort"), SORTS, "price-asc");

  const updateParams = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => params.set(key, value));
    setSearchParams(params, { replace: true });
  };

  const screen = scenario.screens.market;
  const condition = scenario.dataCondition;
  const isFirstLoad = screen === "first-load";
  const isEmpty = screen === "empty";
  const isError = condition === "failure";
  const isRefreshing = condition === "refreshing";
  const isStale = screen === "stale" || condition === "stale";
  const isPendingIndex = condition === "pending-index";
  const changed = screen === "changed";

  const now = new Date();
  const rows = (() => {
    if (isEmpty) return [];
    const active = listings.filter((listing) => listing.status === "active");
    const mapped = active
      .map((listing) => {
        const claim = claims.find((item) => item.id === listing.claimId);
        if (!claim) return null;
        return { listing, claim, totals: getClaimTotals(claim, now) };
      })
      .filter((row): row is { listing: Listing; claim: Claim; totals: ReturnType<typeof getClaimTotals> } => row !== null)
      .filter((row) => (token === "all" ? true : row.claim.token === token))
      .filter((row) =>
        cancellable === "all" ? true : cancellable === "yes" ? row.claim.cancellable : !row.claim.cancellable,
      )
      .filter((row) =>
        phase === "all"
          ? true
          : phase === "ended"
            ? row.totals.paymentStatus === "completed"
            : row.totals.paymentStatus === "streaming",
      );

    return mapped.sort((a, b) => {
      switch (sort) {
        case "price-desc":
          return Number(b.listing.priceRaw - a.listing.priceRaw);
        case "unclaimed-desc":
          return Number(b.totals.totalUnclaimed.raw - a.totals.totalUnclaimed.raw);
        case "end-asc":
          return Date.parse(a.claim.endAt) - Date.parse(b.claim.endAt);
        case "price-asc":
        default:
          return Number(a.listing.priceRaw - b.listing.priceRaw);
      }
    });
  })();

  const hasFilters = token !== "all" || cancellable !== "all" || phase !== "all";
  const filteredEmpty = hasFilters && rows.length === 0 && !isEmpty;

  const resetFilters = () => {
    const params = new URLSearchParams();
    params.set("sort", sort);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader titleKey="market.title" descriptionKey="market.description" />

      {changed ? (
        <InlineNotice tone="warning" titleKey="market.changed.title">
          {t("market.changed.body")}
        </InlineNotice>
      ) : null}

      <MarketToolbar
        token={token}
        cancellable={cancellable}
        phase={phase}
        sort={sort}
        resultCount={rows.length}
        hasFilters={hasFilters}
        isRefreshing={isRefreshing}
        onTokenChange={(value) => updateParams({ token: value })}
        onCancellableChange={(value) => updateParams({ cancellable: value })}
        onPhaseChange={(value) => updateParams({ phase: value })}
        onSortChange={(value) => updateParams({ sort: value })}
        onReset={resetFilters}
        onRefresh={() => window.location.reload()}
      />

      {isPendingIndex ? (
        <InlineNotice tone="warning" titleKey="state.pendingIndex.title">
          {t("state.pendingIndex.body")}
        </InlineNotice>
      ) : null}

      <DataState
        isLoading={isFirstLoad}
        isError={isError}
        isStale={isStale}
        onRetry={() => window.location.reload()}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-64 animate-pulse rounded-lg border border-border bg-muted"
              />
            ))}
          </div>
        }
      >
        {filteredEmpty ? (
          <EmptyState
            titleKey="market.empty.filtered.title"
            bodyKey="market.empty.filtered.body"
            actionLabelKey="market.empty.filtered.action"
            onAction={resetFilters}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            titleKey="market.empty.title"
            bodyKey="market.empty.body"
            actionLabelKey="market.empty.action"
            onAction={() => navigate("/assets")}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <ListingCard
                key={row.listing.id}
                claim={row.claim}
                listing={row.listing}
                totals={row.totals}
                address={address}
                canTransact={canTransact}
                isPendingIndex={pendingIndexClaimIds.includes(row.claim.id)}
                onBuy={() => {
                  setBuyTarget({ claim: row.claim, listing: row.listing });
                  setBuyOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </DataState>

      <BuyDialog
        claim={buyTarget?.claim ?? null}
        listing={buyTarget?.listing ?? null}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />
    </div>
  );
};

export default MarketPage;
