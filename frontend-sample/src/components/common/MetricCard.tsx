import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/ui/skeleton";
import type { Amount as AmountValue } from "@/lib/types";
import { cn } from "@/lib/utils";

import { Amount, type AmountSize } from "./Amount";

type MetricCardProps = {
  labelKey: string;
  value?: AmountValue | null;
  /** 금액이 아닌 수치(매물 수 등)를 표시할 때 */
  textValue?: string;
  size?: AmountSize;
  estimateAt?: string | null;
  confirmed?: boolean;
  hintKey?: string;
  /** 합계의 일부임을 설명하는 등 하위 설명 */
  footnote?: ReactNode;
  state?: "normal" | "loading" | "unavailable";
  /** 금액이 0일 때 금액 대신 보여줄 라벨(예: 없음) */
  emptyLabelKey?: string;
  className?: string;
};

/** 요약 수치 카드. 추정/확정 여부와 기준 시점을 값과 함께 노출합니다. */
export const MetricCard = ({
  labelKey,
  value,
  textValue,
  size = "title",
  estimateAt,
  confirmed,
  hintKey,
  footnote,
  emptyLabelKey,
  state = "normal",
  className,
}: MetricCardProps) => {
  const { t } = useTranslation();
  const isZero = value ? value.raw === 0n : false;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3.5 shadow-card",
        className,
      )}
    >
      <p className="text-body-sm text-muted-foreground">{t(labelKey)}</p>
      {state === "loading" ? (
        <Skeleton className="h-7 w-32" />
      ) : state === "unavailable" ? (
        <p className="text-xl font-semibold text-figure-muted">{t("common.unavailable")}</p>
      ) : isZero && emptyLabelKey ? (
        <p className="text-xl font-semibold text-figure-muted">{t(emptyLabelKey)}</p>
      ) : value ? (
        <Amount
          value={value}
          size={size}
          estimateAt={estimateAt}
          confirmed={confirmed}
        />
      ) : (
        <p className="figure text-xl font-semibold">{textValue}</p>
      )}
      {hintKey ? (
        <p className="text-caption text-muted-foreground">{t(hintKey)}</p>
      ) : null}
      {footnote ? <div className="text-caption text-muted-foreground">{footnote}</div> : null}
    </div>
  );
};
