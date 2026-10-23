import { useTranslation } from "react-i18next";
import { CircleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  titleKey?: string;
  bodyKey?: string;
  onRetry?: () => void;
  retryLabelKey?: string;
  className?: string;
  compact?: boolean;
};

/** 조회 실패: 확인된 영역은 유지한 채 실패한 부분만 재시도할 수 있게 합니다. */
export const ErrorState = ({
  titleKey = "state.failure.title",
  bodyKey = "state.failure.body",
  onRetry,
  retryLabelKey = "state.failure.retry",
  className,
  compact = false,
}: ErrorStateProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border border-void-border bg-void-bg px-3 py-2.5 text-void",
        className,
      )}
      role="alert"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-body-sm font-semibold">{t(titleKey)}</p>
        {compact ? null : (
          <p className="text-body-sm text-foreground/90">{t(bodyKey)}</p>
        )}
        {onRetry ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 px-2 text-caption"
            onClick={onRetry}
          >
            <RefreshCw aria-hidden className="size-3" />
            {t(retryLabelKey)}
          </Button>
        ) : null}
      </div>
    </div>
  );
};
