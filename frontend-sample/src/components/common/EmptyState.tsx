import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Inbox, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  titleKey: string;
  bodyKey?: string;
  icon?: LucideIcon;
  actionLabelKey?: string;
  onAction?: () => void;
  action?: ReactNode;
  className?: string;
};

/** 데이터 없음: 이유와 다음 행동을 함께 안내합니다. */
export const EmptyState = ({
  titleKey,
  bodyKey,
  icon: Icon = Inbox,
  actionLabelKey,
  onAction,
  action,
  className,
}: EmptyStateProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-full border border-border bg-muted">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <p className="text-[15px] font-semibold">{t(titleKey)}</p>
        {bodyKey ? (
          <p className="text-body-sm text-muted-foreground">{t(bodyKey)}</p>
        ) : null}
      </div>
      {action ??
        (actionLabelKey && onAction ? (
          <Button size="sm" variant="secondary" onClick={onAction}>
            {t(actionLabelKey)}
          </Button>
        ) : null)}
    </div>
  );
};
