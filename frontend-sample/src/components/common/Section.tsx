import type { HTMLAttributes, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SectionProps = {
  titleKey?: string;
  title?: string;
  descriptionKey?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
  as?: "section" | "div";
} & Pick<HTMLAttributes<HTMLDivElement>, "aria-live">;

/** 카드형 섹션: 제목·설명·행동을 같은 구조로 맞춰 화면 간 리듬을 유지합니다. */
export const Section = ({
  titleKey,
  title,
  descriptionKey,
  description,
  action,
  children,
  className,
  contentClassName,
  id,
  as = "section",
}: SectionProps) => {
  const { t } = useTranslation();
  const Comp = as;

  return (
    <Comp id={id} className={cn("rounded-lg border border-border bg-card shadow-card", className)}>
      {titleKey || title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-[15px] font-semibold leading-6">
              {title ?? (titleKey ? t(titleKey) : null)}
            </h2>
            {descriptionKey || description ? (
              <p className="text-body-sm text-muted-foreground">
                {description ?? (descriptionKey ? t(descriptionKey) : null)}
              </p>
            ) : null}
          </div>
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("px-4 py-4 sm:px-5", contentClassName)}>{children}</div>
    </Comp>
  );
};

/** 라벨·값 한 줄. 값이 확정되지 않은 경우에도 라벨을 유지합니다. */
export const KeyValue = ({
  labelKey,
  children,
  hintKey,
  className,
  valueClassName,
}: {
  labelKey: string;
  children: ReactNode;
  hintKey?: string;
  className?: string;
  valueClassName?: string;
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2",
        className,
      )}
    >
      <span className="flex flex-col">
        <span className="text-body-sm text-muted-foreground">{t(labelKey)}</span>
        {hintKey ? (
          <span className="text-caption text-muted-foreground">{t(hintKey)}</span>
        ) : null}
      </span>
      <span className={cn("text-right text-body-sm font-medium", valueClassName)}>
        {children}
      </span>
    </div>
  );
};

export const KeyValueDivider = () => <div className="h-px w-full bg-border" />;

export { Card };
