import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { StatusMeta } from "@/lib/status";

import { toneChipClass, toneDotClass } from "./tone";

type StatusBadgeProps = {
  meta: StatusMeta;
  className?: string;
  /** 점 표시를 함께 노출(색 + 라벨 병기 원칙) */
  withDot?: boolean;
  size?: "sm" | "md";
};

export const StatusBadge = ({
  meta,
  className,
  withDot = true,
  size = "md",
}: StatusBadgeProps) => {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-caption" : "px-2.5 py-1 text-body-sm",
        toneChipClass[meta.tone],
        className,
      )}
    >
      {withDot ? (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", toneDotClass[meta.tone])}
        />
      ) : null}
      {t(meta.key)}
    </span>
  );
};
