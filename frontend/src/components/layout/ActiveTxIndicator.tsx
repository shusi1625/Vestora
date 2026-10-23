import { useTranslation } from "react-i18next";
import { Activity, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import { useTx } from "@/providers/tx-context";

/**
 * 진행 중 거래 표시. 없음 / 처리 중 / 확인 필요를 구분해 보여주고,
 * 열면 세션 거래 활동에서 결과를 다시 확인할 수 있습니다.
 */
export const ActiveTxIndicator = () => {
  const { t } = useTranslation();
  const { activeRecords, setActivityOpen } = useTx();

  const stalled = activeRecords.filter((record) => record.phase === "stalled").length;
  const total = activeRecords.length;

  return (
    <button
      type="button"
      onClick={() => setActivityOpen(true)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium transition-colors duration-fast",
        stalled > 0
          ? "border-warning-border bg-warning-bg text-warning"
          : total > 0
            ? "border-listed-border bg-listed-bg text-listed"
            : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
      aria-live="polite"
    >
      {stalled > 0 ? (
        <TriangleAlert aria-hidden className="size-3.5" />
      ) : total > 0 ? (
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <Activity aria-hidden className="size-3.5" />
      )}
      <span className="hidden sm:inline">
        {stalled > 0
          ? t("txIndicator.attention", { count: stalled })
          : total > 0
            ? t("txIndicator.pending", { count: total })
            : t("txIndicator.idle")}
      </span>
    </button>
  );
};
