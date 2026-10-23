import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { explorerAddressUrl, explorerTokenUrl } from "@/prototype/fixtures";
import { shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

type AddressTextProps = {
  address: string;
  /** 수취권 ID를 함께 주면 컨트랙트 탐색기 링크를 만듭니다 */
  tokenId?: string;
  className?: string;
  labelKey?: string;
  muted?: boolean;
};

/** 긴 주소는 축약해 보여주되 전체 확인·복사를 항상 제공합니다. */
export const AddressText = ({
  address,
  tokenId,
  className,
  labelKey,
  muted = true,
}: AddressTextProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");

  const copy = () => {
    if (!navigator.clipboard) {
      setCopied("failed");
      window.setTimeout(() => setCopied("idle"), 1600);
      return;
    }
    navigator.clipboard
      .writeText(address)
      .then(() => setCopied("copied"))
      .catch(() => setCopied("failed"))
      .finally(() => window.setTimeout(() => setCopied("idle"), 1600));
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {labelKey ? (
        <span className="text-caption text-muted-foreground">{t(labelKey)}</span>
      ) : null}
      <Popover>
        <PopoverTrigger
          className={cn(
            "figure rounded-sm px-1 text-body-sm underline decoration-dotted underline-offset-2 transition-colors duration-fast",
            muted ? "text-muted-foreground hover:text-foreground" : "text-foreground",
          )}
          aria-label={t("common.addressOpenFull")}
        >
          {shortenAddress(address)}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <p className="text-caption font-semibold text-muted-foreground">
            {t("common.addressFull")}
          </p>
          <p className="figure break-all rounded-md border border-border bg-muted px-2 py-1.5 text-caption">
            {address}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-caption font-medium transition-colors duration-fast hover:bg-accent"
            >
              {copied === "copied" ? (
                <Check aria-hidden className="size-3" />
              ) : (
                <Copy aria-hidden className="size-3" />
              )}
              {copied === "copied"
                ? t("common.copied")
                : copied === "failed"
                  ? t("common.copyFailed")
                  : t("common.copy")}
            </button>
            <a
              href={
                tokenId
                  ? explorerTokenUrl(address, tokenId)
                  : explorerAddressUrl(address)
              }
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-caption font-medium transition-colors duration-fast hover:bg-accent"
            >
              <ExternalLink aria-hidden className="size-3" />
              {t("common.explorer")}
            </a>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
};
