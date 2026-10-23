import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { toneSurfaceClass, toneTextClass } from "./tone";

export type NoticeTone = "info" | "warning" | "danger" | "success" | "muted";

const noticeConfig: Record<NoticeTone, { wrapper: string; text: string; Icon: LucideIcon }> = {
  info: {
    wrapper: toneSurfaceClass.listed,
    text: toneTextClass.listed,
    Icon: Info,
  },
  warning: {
    wrapper: toneSurfaceClass.warning,
    text: toneTextClass.warning,
    Icon: TriangleAlert,
  },
  danger: {
    wrapper: toneSurfaceClass.void,
    text: toneTextClass.void,
    Icon: CircleAlert,
  },
  success: {
    wrapper: toneSurfaceClass.claimable,
    text: toneTextClass.claimable,
    Icon: CircleCheck,
  },
  muted: {
    wrapper: toneSurfaceClass.muted,
    text: toneTextClass.muted,
    Icon: Info,
  },
};

type InlineNoticeProps = {
  tone?: NoticeTone;
  titleKey?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  /** 본문 텍스트도 톤 색으로 표시할지 여부(기본은 본문 가독성을 위해 foreground 유지) */
  strongBody?: boolean;
};

/** 주요 조건과 경고는 호버에 숨기지 않고 화면에 그대로 노출합니다. */
export const InlineNotice = ({
  tone = "info",
  titleKey,
  children,
  action,
  className,
  strongBody = false,
}: InlineNoticeProps) => {
  const { t } = useTranslation();
  const config = noticeConfig[tone];

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5",
        config.wrapper,
        className,
      )}
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
    >
      <config.Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", config.text)} />
      <div className="min-w-0 flex-1 space-y-1">
        {titleKey ? (
          <p className={cn("text-body-sm font-semibold", config.text)}>{t(titleKey)}</p>
        ) : null}
        <div
          className={cn(
            "text-body-sm",
            strongBody ? config.text : "text-foreground/90",
          )}
        >
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
};
