import { useTranslation } from "react-i18next";
import { Check, CircleAlert, Loader2 } from "lucide-react";

import { TX_PHASE } from "@/lib/status";
import type { TxPhase, TxRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

import { toneTextClass } from "@/components/common/tone";

const EXECUTION_STEPS: TxPhase[] = [
  "preparing",
  "wallet-pending",
  "submitted",
  "mining",
  "indexing",
  "completed",
];

const APPROVAL_STEPS: TxPhase[] = [
  "preparing",
  "approval-required",
  "wallet-pending",
  "submitted",
  "mining",
  "completed",
];

/** 확정 대기·반영 지연·실패를 한눈에 구분할 수 있게 하는 거래 상태 타임라인. */
export const TxStatusTimeline = ({
  record,
  className,
}: {
  record: TxRecord;
  className?: string;
}) => {
  const { t } = useTranslation();
  const steps = record.kind === "approve" ? APPROVAL_STEPS : EXECUTION_STEPS;
  const currentIndex = steps.indexOf(record.phase);
  const isFailure = currentIndex === -1;
  const meta = TX_PHASE[record.phase];

  return (
    <ol className={cn("space-y-0", className)}>
      {steps.map((step, index) => {
        const reached = !isFailure && index <= currentIndex;
        const isCurrent = !isFailure && index === currentIndex;
        const done = reached && !isCurrent;
        return (
          <li key={step} className="flex gap-2.5">
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border",
                  done && "border-claimable-border bg-claimable-bg text-claimable",
                  isCurrent &&
                    "border-listed-border bg-listed-bg text-listed",
                  !reached && !isCurrent && "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-3" />
                ) : isCurrent ? (
                  <Loader2 aria-hidden className="size-3 animate-spin" />
                ) : (
                  <span aria-hidden className="size-1 rounded-full bg-current" />
                )}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "my-0.5 w-px flex-1",
                    done ? "bg-claimable-border" : "bg-border",
                  )}
                />
              ) : null}
            </span>
            <span className="pb-3">
              <span
                className={cn(
                  "block text-body-sm",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {t(TX_PHASE[step].key)}
              </span>
              {isCurrent ? (
                <span className="block text-caption text-muted-foreground">
                  {t(TX_PHASE[step].hintKey)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
      {isFailure ? (
        <li className="flex gap-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full border border-void-border bg-void-bg">
            <CircleAlert aria-hidden className={cn("size-3", toneTextClass.void)} />
          </span>
          <span className="space-y-0.5">
            <span className="block text-body-sm font-semibold text-void">
              {t(meta.key)}
            </span>
            <span className="block text-caption text-muted-foreground">
              {t(meta.hintKey)}
            </span>
          </span>
        </li>
      ) : null}
    </ol>
  );
};
