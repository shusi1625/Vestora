import { useTranslation } from "react-i18next";

import { Amount } from "@/components/common/Amount";
import { KeyValue, KeyValueDivider } from "@/components/common/Section";
import type { ClaimTotals } from "@/lib/claim-math";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StatusBadge } from "@/components/common/StatusBadge";
import { CLAIM_STATUS, PAYMENT_STATUS } from "@/lib/status";

/** 금액·지급 일정 요약. 누적 청구액을 "내가 받은 금액"으로 표현하지 않습니다. */
export const ClaimSummary = ({
  totals,
  className,
}: {
  totals: ClaimTotals;
  className?: string;
}) => {
  const { t } = useTranslation();
  const { claim } = totals;
  const nowIso = new Date().toISOString();

  return (
    <div className={cn("divide-y divide-border", className)}>
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <StatusBadge meta={PAYMENT_STATUS[totals.paymentStatus]} size="sm" />
        <StatusBadge meta={CLAIM_STATUS[totals.claimStatus]} size="sm" />
      </div>

      <div className="pt-2">
        <KeyValue labelKey="claim.amount.deposited">
          <Amount value={totals.deposited} size="body" />
        </KeyValue>
        <KeyValueDivider />
        <KeyValue
          labelKey="claim.amount.claimedToDate"
          hintKey="claim.amount.claimedToDateHint"
        >
          <Amount value={totals.claimedToDate} size="body" />
        </KeyValue>
        <KeyValueDivider />
        <KeyValue labelKey="claim.amount.totalUnclaimed">
          <Amount value={totals.totalUnclaimed} size="body" />
        </KeyValue>
        <KeyValueDivider />
        <KeyValue labelKey="claim.amount.claimableNow">
          <Amount
            value={totals.claimableNow}
            size="body"
            estimateAt={totals.isEstimate ? nowIso : null}
            confirmed={!totals.isEstimate}
          />
        </KeyValue>
        <KeyValueDivider />
        <KeyValue
          labelKey="claim.amount.future"
          hintKey={totals.paymentStatus === "cancelled" ? "claim.amount.futureCancelledHint" : undefined}
        >
          <Amount value={totals.futureAmount} size="body" />
        </KeyValue>
        <KeyValueDivider />
        <KeyValue labelKey="claim.amount.cancellable">
          {totals.cancellableFuture.raw > 0n ? (
            <Amount value={totals.cancellableFuture} size="body" />
          ) : (
            <span className="text-body-sm text-muted-foreground">
              {t("claim.amount.none")}
            </span>
          )}
        </KeyValue>
        <KeyValueDivider />
        <KeyValue labelKey="claim.schedule.label">
          <span className="figure text-body-sm">
            {t("claim.schedule.range", {
              start: formatDateTime(claim.startAt),
              end: formatDateTime(claim.endAt),
            })}
          </span>
        </KeyValue>
        <KeyValueDivider />
        <KeyValue labelKey="claim.cancel.label">
          <span className="text-body-sm">
            {claim.cancellable ? t("claim.cancel.available") : t("claim.cancel.unavailable")}
          </span>
        </KeyValue>
        {claim.cancelledAt ? (
          <>
            <KeyValueDivider />
            <KeyValue labelKey="claim.cancel.cancelledAt">
              <span className="figure text-body-sm text-void">
                {formatDateTime(claim.cancelledAt)}
              </span>
            </KeyValue>
          </>
        ) : null}
        <KeyValueDivider />
        <KeyValue labelKey="claim.calculatedAt">
          <span className="figure text-body-sm">{formatDateTime(nowIso)}</span>
        </KeyValue>
      </div>
    </div>
  );
};
