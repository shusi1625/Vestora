import { useTranslation } from "react-i18next";

import { InlineNotice } from "@/components/common/InlineNotice";
import type { ClaimTotals } from "@/lib/claim-math";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ClaimConditionsProps = {
  totals: ClaimTotals;
  /** 온체인 조회 결과와 백엔드 반영 값이 다를 때 구분 표시 */
  mismatch?: boolean;
  className?: string;
};

const CONDITION_KEYS = [
  "conditions.transfer",
  "conditions.claimWho",
  "conditions.payerCancel",
  "conditions.cancelEffect",
  "conditions.depositIsNotRiskFree",
] as const;

/** 구매·청구 판단에 필요한 조건 설명. 위험을 점수로 축약하지 않고 사실을 그대로 진술합니다. */
export const ClaimConditions = ({
  totals,
  mismatch = false,
  className,
}: ClaimConditionsProps) => {
  const { t } = useTranslation();

  return (
    <div className={cn("space-y-3", className)}>
      <ul className="space-y-2">
        {CONDITION_KEYS.map((key) => (
          <li key={key} className="flex gap-2 text-body-sm text-muted-foreground">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <InlineNotice tone={totals.claim.cancellable ? "warning" : "muted"}>
        {totals.claim.cancellable
          ? t("conditions.cancellableNow")
          : t("conditions.notCancellableNow")}
      </InlineNotice>

      {mismatch ? (
        <InlineNotice tone="warning" titleKey="conditions.mismatch.title">
          {t("conditions.mismatch.body")}
        </InlineNotice>
      ) : null}

      <p className="text-caption text-muted-foreground">
        {t("conditions.checkedAt", { time: formatDateTime(new Date().toISOString()) })}
      </p>
    </div>
  );
};
