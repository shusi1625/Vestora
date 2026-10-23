import { useTranslation } from "react-i18next";

import { Amount } from "@/components/common/Amount";
import type { ClaimTotals } from "@/lib/claim-math";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (ratio: number): string => `${Math.max(0, Math.min(1, ratio)) * 100}%`;

type PayoutTimelineProps = {
  totals: ClaimTotals;
  className?: string;
};

/**
 * 지급 일정 시각화.
 * 청구 완료 / 지금 청구 가능 / 앞으로 예정 구간을 나눠 보여주고,
 * 취소 가능한 예정 구간은 빗금으로 구분합니다.
 */
export const PayoutTimeline = ({ totals, className }: PayoutTimelineProps) => {
  const { t } = useTranslation();
  const { segments, claim } = totals;
  const total = segments.claimed + segments.claimable + segments.future;
  const scale = total > 0 ? total : 1;
  const claimedRatio = segments.claimed / scale;
  const claimableRatio = segments.claimable / scale;
  const cursorRatio = claimedRatio + claimableRatio;
  const isCancelled = Boolean(claim.cancelledAt);
  const cancellableFuture = totals.cancellableFuture.raw > 0n;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-border bg-muted">
        <div
          className="absolute inset-y-0 left-0 bg-scheduled"
          style={{ width: pct(claimedRatio) }}
        />
        <div
          className="absolute inset-y-0 bg-claimable"
          style={{ left: pct(claimedRatio), width: pct(claimableRatio) }}
        />
        <div
          className="absolute inset-y-0"
          style={{
            left: pct(cursorRatio),
            width: pct(1 - cursorRatio),
            backgroundColor: "hsl(var(--muted))",
            backgroundImage: cancellableFuture
              ? "repeating-linear-gradient(45deg, hsl(var(--warning-border)) 0 4px, transparent 4px 8px)"
              : undefined,
          }}
        />
        <div
          className="absolute -top-0.5 h-5 w-0.5 bg-foreground"
          style={{ left: `calc(${pct(cursorRatio)} - 1px)` }}
          aria-hidden
        />
      </div>

      <ul className="space-y-1.5">
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
            <span aria-hidden className="size-2 rounded-sm bg-scheduled" />
            {t("timeline.claimed")}
          </span>
          <Amount value={totals.claimedToDate} size="caption" />
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
            <span aria-hidden className="size-2 rounded-sm bg-claimable" />
            {t("timeline.claimable")}
          </span>
          <Amount
            value={totals.claimableNow}
            size="caption"
            estimateAt={totals.isEstimate ? new Date().toISOString() : null}
          />
        </li>
        <li className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
            <span
              aria-hidden
              className="size-2 rounded-sm border border-warning-border bg-warning-bg"
            />
            {t("timeline.future")}
          </span>
          <Amount value={totals.futureAmount} size="caption" />
        </li>
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <span>{t("claim.schedule.start", { date: formatDate(claim.startAt) })}</span>
        <span>{t("claim.schedule.now", { date: formatDate(new Date().toISOString()) })}</span>
        {isCancelled ? (
          <span className="text-void">
            {t("claim.schedule.cancelledAt", { date: formatDate(claim.cancelledAt ?? "") })}
          </span>
        ) : (
          <span>{t("claim.schedule.end", { date: formatDate(claim.endAt) })}</span>
        )}
      </div>

      {isCancelled ? (
        <p className="text-caption text-void">{t("timeline.cancelledNote")}</p>
      ) : null}
      {cancellableFuture ? (
        <p className="text-caption text-warning">{t("timeline.cancellableNote")}</p>
      ) : null}
    </div>
  );
};
