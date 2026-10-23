import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type TokenFilter = "all" | "MockUSDC" | "mWETH";
export type CancellableFilter = "all" | "yes" | "no";
export type PhaseFilter = "all" | "streaming" | "ended";
export type SortKey = "price-asc" | "price-desc" | "unclaimed-desc" | "end-asc";

const TOKEN_OPTIONS: { value: TokenFilter; key: string }[] = [
  { value: "all", key: "market.filter.tokenAll" },
  { value: "MockUSDC", key: "market.filter.tokenUsdc" },
  { value: "mWETH", key: "market.filter.tokenWeth" },
];

const CANCELLABLE_OPTIONS: { value: CancellableFilter; key: string }[] = [
  { value: "all", key: "market.filter.cancellableAll" },
  { value: "yes", key: "market.filter.cancellableYes" },
  { value: "no", key: "market.filter.cancellableNo" },
];

const PHASE_OPTIONS: { value: PhaseFilter; key: string }[] = [
  { value: "all", key: "market.filter.phaseAll" },
  { value: "streaming", key: "market.filter.phaseStreaming" },
  { value: "ended", key: "market.filter.phaseEnded" },
];

const SORT_OPTIONS: { value: SortKey; key: string }[] = [
  { value: "price-asc", key: "market.sort.priceAsc" },
  { value: "price-desc", key: "market.sort.priceDesc" },
  { value: "unclaimed-desc", key: "market.sort.unclaimedDesc" },
  { value: "end-asc", key: "market.sort.endAsc" },
];

type MarketToolbarProps = {
  token: TokenFilter;
  cancellable: CancellableFilter;
  phase: PhaseFilter;
  sort: SortKey;
  resultCount: number;
  hasFilters: boolean;
  isRefreshing: boolean;
  onTokenChange: (value: TokenFilter) => void;
  onCancellableChange: (value: CancellableFilter) => void;
  onPhaseChange: (value: PhaseFilter) => void;
  onSortChange: (value: SortKey) => void;
  onReset: () => void;
  onRefresh: () => void;
  className?: string;
};

export const MarketToolbar = ({
  token,
  cancellable,
  phase,
  sort,
  resultCount,
  hasFilters,
  isRefreshing,
  onTokenChange,
  onCancellableChange,
  onPhaseChange,
  onSortChange,
  onReset,
  onRefresh,
  className,
}: MarketToolbarProps) => {
  const { t } = useTranslation();

  return (
    <section
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-card",
        className,
      )}
      aria-label={t("market.toolbar.label")}
    >
      <label className="space-y-1">
        <span className="block text-caption text-muted-foreground">
          {t("market.filter.token")}
        </span>
        <Select value={token} onValueChange={(value) => onTokenChange(value as TokenFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOKEN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="space-y-1">
        <span className="block text-caption text-muted-foreground">
          {t("market.filter.cancellable")}
        </span>
        <Select
          value={cancellable}
          onValueChange={(value) => onCancellableChange(value as CancellableFilter)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CANCELLABLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="space-y-1">
        <span className="block text-caption text-muted-foreground">
          {t("market.filter.phase")}
        </span>
        <Select value={phase} onValueChange={(value) => onPhaseChange(value as PhaseFilter)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PHASE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <label className="space-y-1">
        <span className="block text-caption text-muted-foreground">
          {t("market.sort.label")}
        </span>
        <Select value={sort} onValueChange={(value) => onSortChange(value as SortKey)}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.key)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? t("state.loading.refreshing") : t("market.refresh")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset} disabled={!hasFilters}>
          {t("market.resetFilters")}
        </Button>
      </div>

      <p className="w-full text-caption text-muted-foreground" aria-live="polite">
        {t("market.resultCount", { count: resultCount })}
      </p>
    </section>
  );
};
