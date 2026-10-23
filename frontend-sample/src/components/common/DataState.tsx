import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { InlineNotice } from "./InlineNotice";

type DataStateProps = {
  children: ReactNode;
  /** 최초 조회 중: 자리표시자만 노출하고 금액을 0으로 표시하지 않습니다 */
  isLoading?: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  /** 일부 영역만 실패한 경우 */
  isPartial?: boolean;
  isStale?: boolean;
  /** 거래는 확정됐지만 앱 데이터 반영이 끝나지 않은 경우 */
  isPendingIndex?: boolean;
  skeleton?: ReactNode;
  emptyTitleKey?: string;
  emptyBodyKey?: string;
  emptyAction?: { labelKey: string; onClick: () => void };
  onRetry?: () => void;
  partialTitleKey?: string;
  className?: string;
};

const DefaultSkeleton = () => (
  <div className="space-y-3" aria-hidden>
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-24 w-full" />
  </div>
);

/**
 * 조회 상태 공통 래퍼.
 * 최초 조회 중 / 갱신 중(기존 값 유지) / 없음 / 일부 실패 / 전체 실패 / 오래된 데이터 / 반영 대기를
 * 화면마다 다르게 구현하지 않도록 한 곳에서 처리합니다.
 */
export const DataState = ({
  children,
  isLoading = false,
  isRefreshing = false,
  isError = false,
  isEmpty = false,
  isPartial = false,
  isStale = false,
  isPendingIndex = false,
  skeleton,
  emptyTitleKey = "state.empty.title",
  emptyBodyKey = "state.empty.body",
  emptyAction,
  onRetry,
  partialTitleKey = "state.partial.title",
  className,
}: DataStateProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)} aria-busy="true">
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Loader2 aria-hidden className="size-3 animate-spin" />
          {t("state.loading.initial")}
        </p>
        {skeleton ?? <DefaultSkeleton />}
      </div>
    );
  }

  if (isError) {
    return (
      <div className={className}>
        <ErrorState onRetry={onRetry} />
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={className}>
        <EmptyState
          titleKey={emptyTitleKey}
          bodyKey={emptyBodyKey}
          actionLabelKey={emptyAction?.labelKey}
          onAction={emptyAction?.onClick}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {isPendingIndex ? (
        <InlineNotice tone="warning" titleKey="state.pendingIndex.title">
          {t("state.pendingIndex.body")}
        </InlineNotice>
      ) : null}
      {isPartial ? (
        <InlineNotice
          tone="warning"
          titleKey={partialTitleKey}
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-warning-border bg-card px-2 py-1 text-caption font-medium text-warning transition-colors duration-fast hover:bg-warning-bg"
              >
                {t("state.partial.retry")}
              </button>
            ) : null
          }
        >
          {t("state.partial.body")}
        </InlineNotice>
      ) : null}
      {isStale ? (
        <InlineNotice
          tone="warning"
          titleKey="state.stale.title"
          action={
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-warning-border bg-card px-2 py-1 text-caption font-medium text-warning transition-colors duration-fast hover:bg-warning-bg"
              >
                {t("common.recheck")}
              </button>
            ) : null
          }
        >
          {t("state.stale.body")}
        </InlineNotice>
      ) : null}
      {isRefreshing ? (
        <p className="flex items-center gap-1.5 text-caption text-listed" aria-live="polite">
          <Loader2 aria-hidden className="size-3 animate-spin" />
          {t("state.loading.refreshing")}
        </p>
      ) : null}
      {children}
    </div>
  );
};
