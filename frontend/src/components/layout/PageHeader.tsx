import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  titleKey?: string;
  title?: string;
  descriptionKey?: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

/** 화면 상단 제목 영역. 제목·설명·행동·기준 시점의 위치를 모든 화면에서 동일하게 유지합니다. */
export const PageHeader = ({
  titleKey,
  title,
  descriptionKey,
  description,
  action,
  meta,
  className,
}: PageHeaderProps) => {
  const { t } = useTranslation();

  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          {title ?? (titleKey ? t(titleKey) : null)}
        </h1>
        {descriptionKey || description ? (
          <p className="text-[15px] text-muted-foreground">
            {description ?? (descriptionKey ? t(descriptionKey) : null)}
          </p>
        ) : null}
        {meta}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
};
