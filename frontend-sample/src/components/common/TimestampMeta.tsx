import { useTranslation } from "react-i18next";
import { Clock, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Freshness = "fresh" | "refreshing" | "stale";

type TimestampMetaProps = {
  at: string | null;
  freshness?: Freshness;
  onRecheck?: () => void;
  className?: string;
};

const freshnessClass: Record<Freshness, string> = {
  fresh: "text-muted-foreground",
  refreshing: "text-listed",
  stale: "text-figure-stale",
};

/** 기준 시점과 최신/갱신 중/오래됨을 항상 함께 보여줍니다. */
export const TimestampMeta = ({
  at,
  freshness = "fresh",
  onRecheck,
  className,
}: TimestampMetaProps) => {
  const { t } = useTranslation();

  if (!at) {
    return (
      <p className={cn("text-caption text-muted-foreground", className)}>
        {t("common.basisTimeUnknown")}
      </p>
    );
  }

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      <span className={cn("inline-flex items-center gap-1 text-caption", freshnessClass[freshness])}>
        <Clock aria-hidden className="size-3" />
        {t("common.basisTime", { time: formatDateTime(at) })}
      </span>
      <span className={cn("text-caption font-medium", freshnessClass[freshness])}>
        {freshness === "fresh"
          ? t("common.freshness.fresh")
          : freshness === "refreshing"
            ? t("common.freshness.refreshing")
            : t("common.freshness.stale")}
      </span>
      {freshness === "stale" && onRecheck ? (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-caption" onClick={onRecheck}>
          <RefreshCw aria-hidden className="size-3" />
          {t("common.recheck")}
        </Button>
      ) : null}
    </p>
  );
};
