import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatFullUnits,
  formatTime,
  formatUnits,
  hasHiddenPrecision,
} from "@/lib/format";
import { TOKENS, getDecimals } from "@/lib/tokens";
import type { Amount as AmountValue } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AmountSize = "display" | "title" | "body" | "caption";

const sizeClass: Record<AmountSize, string> = {
  display: "text-[32px] font-bold leading-10",
  title: "text-xl font-semibold leading-7",
  body: "text-[15px] font-medium leading-6",
  caption: "text-caption font-medium",
};

const unitClass: Record<AmountSize, string> = {
  display: "text-sm font-semibold",
  title: "text-body-sm font-semibold",
  body: "text-body-sm font-semibold",
  caption: "text-caption font-semibold",
};

type AmountProps = {
  value: AmountValue;
  size?: AmountSize;
  /** 추정치 계산 시점(ISO). 값이 있으면 추정 마커를 함께 표시합니다. */
  estimateAt?: string | null;
  /** 확정값임을 명시해야 하는 자리(청구 완료 후 등) */
  confirmed?: boolean;
  className?: string;
  digits?: number;
  /** 라벨이 이미 단위를 말하는 경우에도 단위 표기는 유지합니다 */
  hideUnit?: boolean;
};

/**
 * 금액 표시. 토큰 단위를 항상 함께 노출하고, 반올림 표시와 전체 정밀값 확인을 분리합니다.
 */
export const Amount = ({
  value,
  size = "body",
  estimateAt,
  confirmed = false,
  className,
  digits,
  hideUnit = false,
}: AmountProps) => {
  const { t } = useTranslation();
  const info = TOKENS[value.token];
  const needsPrecisionDisclosure = hasHiddenPrecision(value.raw, value.token, digits);
  // 큰 금액에서는 정밀값 라벨을 함께 보여주고, 목록처럼 빽빽한 자리에서는 아이콘만 노출합니다.
  const showPrecisionLabel = size === "display" || size === "title";

  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn("figure", sizeClass[size])}>
        {formatUnits(value.raw, value.token, digits)}
      </span>
      {hideUnit ? null : (
        <span className={cn("figure text-figure-muted", unitClass[size])}>
          {value.token}
        </span>
      )}
      {estimateAt ? (
        <span className="rounded-full border border-listed-border bg-listed-bg px-1.5 text-caption font-medium text-listed">
          {t("amount.estimateMark", { time: formatTime(estimateAt) })}
        </span>
      ) : null}
      {confirmed && !estimateAt ? (
        <span className="rounded-full border border-scheduled-border bg-scheduled-bg px-1.5 text-caption font-medium text-scheduled">
          {t("amount.confirmedMark")}
        </span>
      ) : null}
      {needsPrecisionDisclosure ? (
        <Popover>
          <PopoverTrigger
            className={cn(
              "inline-flex items-center gap-1 rounded-sm text-caption text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors duration-fast hover:text-foreground",
              !showPrecisionLabel && "decoration-transparent",
            )}
            aria-label={t("amount.precisionOpen")}
          >
            <Info aria-hidden className="size-3" />
            {showPrecisionLabel ? t("amount.precisionShort") : null}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-2">
            <p className="text-body-sm font-semibold">{t("amount.precisionTitle")}</p>
            <p className="figure break-all rounded-md border border-border bg-muted px-2 py-1.5 text-caption text-foreground">
              {formatFullUnits(value.raw, value.token)} {value.token}
            </p>
            <p className="text-caption text-muted-foreground">
              {t("amount.precisionBody", {
                decimals: getDecimals(value.token),
                symbol: info.symbol,
              })}
            </p>
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
};
