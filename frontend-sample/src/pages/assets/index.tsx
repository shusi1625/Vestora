import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Wallet } from "lucide-react";

import { ClaimDialog } from "@/components/claim/ClaimDialog";
import { DataState } from "@/components/common/DataState";
import { InlineNotice } from "@/components/common/InlineNotice";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { getPortfolioSummary } from "@/lib/claim-math";
import type { Claim } from "@/lib/types";
import { useScrollRestore } from "@/hooks/use-scroll-restore";
import { usePrototypeData } from "@/providers/prototype-data-context";
import { useScenario } from "@/providers/scenario-context";
import { useWallet } from "@/providers/wallet-context";

import { AssetsSummary } from "./AssetsSummary";
import { HoldingsList } from "./HoldingsList";
import { isClaimFilter, type ClaimFilter } from "./filters";

const AssetsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { address, state, connect, canTransact, accountKey } = useWallet();
  const { scenario } = useScenario();
  const { claims, listings, balancesByAccount, pendingIndexClaimIds } =
    usePrototypeData();
  const [claimTarget, setClaimTarget] = useState<Claim | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);

  useScrollRestore("assets");

  const rawFilter = searchParams.get("filter");
  const filter: ClaimFilter = isClaimFilter(rawFilter) ? rawFilter : "all";
  const setFilter = (next: ClaimFilter) => {
    const params = new URLSearchParams(searchParams);
    params.set("filter", next);
    setSearchParams(params, { replace: true });
  };

  const screen = scenario.screens.assets;
  const condition = scenario.dataCondition;
  const isLoading = screen === "first-load";
  const isEmpty = screen === "empty";
  const isPartial = screen === "partial-failure" || condition === "partial-failure";
  const isPendingIndex =
    screen === "pending-index" || condition === "pending-index";
  const isStale = screen === "stale" || condition === "stale";
  const isRefreshing = condition === "refreshing";
  const isError = condition === "failure";

  const summary = getPortfolioSummary(
    claims,
    listings,
    balancesByAccount[accountKey] ?? [],
    address,
    new Date(),
  );

  const openClaimDialog = (claim: Claim) => {
    setClaimTarget(claim);
    setClaimOpen(true);
  };

  if (!address) {
    return (
      <div className="space-y-6">
        <PageHeader titleKey="assets.title" descriptionKey="assets.description" />
        <div className="rounded-lg border border-border bg-card px-6 py-10 text-center shadow-card">
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-border bg-muted">
            {state === "connecting" ? (
              <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Wallet aria-hidden className="size-5 text-muted-foreground" />
            )}
          </span>
          <h2 className="mt-3 text-[15px] font-semibold">{t("assets.connect.title")}</h2>
          <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
            {t("assets.connect.body")}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button disabled={state === "connecting"} onClick={connect}>
              {state === "connecting" ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : null}
              {state === "failed" ? t("wallet.retry") : t("wallet.connect")}
            </Button>
            <Button variant="outline" onClick={() => navigate("/market")}>
              {t("assets.connect.browseMarket")}
            </Button>
          </div>
          {state === "failed" ? (
            <p className="mt-3 text-caption text-void">{t("wallet.failed")}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader titleKey="assets.title" descriptionKey="assets.description" />

      {!canTransact ? (
        <InlineNotice tone="warning" titleKey="assets.networkBlocked.title">
          {t("assets.networkBlocked.body")}
        </InlineNotice>
      ) : null}

      <DataState
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isError={isError}
        isEmpty={isEmpty}
        isPartial={isPartial}
        isStale={isStale}
        isPendingIndex={isPendingIndex}
        emptyTitleKey="assets.empty.title"
        emptyBodyKey="assets.empty.body"
        emptyAction={{ labelKey: "assets.empty.action", onClick: () => navigate("/market") }}
        onRetry={() => window.location.reload()}
        skeleton={
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-lg border border-border bg-muted"
                />
              ))}
            </div>
            <div className="h-40 animate-pulse rounded-lg border border-border bg-muted" />
          </div>
        }
      >
        <div className="space-y-6">
          <AssetsSummary
            summary={summary}
            ownershipUnknown={summary.unverifiedClaimCount > 0}
            freshness={isStale ? "stale" : isRefreshing ? "refreshing" : "fresh"}
            isPendingIndex={isPendingIndex}
            unavailableKeys={isPartial ? ["balances"] : []}
            onRecheck={() => window.location.reload()}
          />
          <HoldingsList
            claims={claims}
            listings={listings}
            address={address}
            canTransact={canTransact}
            pendingIndexClaimIds={pendingIndexClaimIds}
            filter={filter}
            onFilterChange={setFilter}
            onClaim={openClaimDialog}
            onGoMarket={() => navigate("/market")}
          />
        </div>
      </DataState>

      <ClaimDialog claim={claimTarget} open={claimOpen} onOpenChange={setClaimOpen} />
    </div>
  );
};

export default AssetsPage;
