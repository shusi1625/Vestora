import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NetworkSwitchResult } from "@/prototype/scenarios";

import { useWallet } from "@/providers/wallet-context";

type NetworkBadgeProps = {
  className?: string;
};

const resultKey: Record<Exclude<NetworkSwitchResult, "pending">, string> = {
  success: "network.switch.success",
  rejected: "network.switch.rejected",
  failed: "network.switch.failed",
};

/** 네트워크 표시: 지원 네트워크 / 다른 네트워크 / 확인 불가를 구분합니다. */
export const NetworkBadge = ({ className }: NetworkBadgeProps) => {
  const { t } = useTranslation();
  const { network, switchingNetwork, requestNetworkSwitch } = useWallet();
  const [result, setResult] = useState<NetworkSwitchResult | null>(null);

  const handleSwitch = () => {
    setResult("pending");
    void requestNetworkSwitch().then((next) => setResult(next));
  };

  if (network === "sepolia") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-claimable-border bg-claimable-bg px-2.5 py-1 text-caption font-medium text-claimable",
          className,
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-claimable" />
        {t("network.sepolia")}
      </span>
    );
  }

  if (network === "unknown") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-scheduled-border bg-scheduled-bg px-2.5 py-1 text-caption font-medium text-scheduled",
          className,
        )}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-scheduled" />
        {t("network.unknown")}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-void-border bg-void-bg px-2.5 py-1 text-caption font-medium text-void">
        <TriangleAlert aria-hidden className="size-3" />
        {t("network.unsupported")}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-caption"
        disabled={switchingNetwork}
        onClick={handleSwitch}
      >
        {switchingNetwork ? (
          <Loader2 aria-hidden className="size-3 animate-spin" />
        ) : null}
        {switchingNetwork ? t("network.switch.pending") : t("network.switch.action")}
      </Button>
      {result && result !== "pending" ? (
        <span className="text-caption text-muted-foreground">{t(resultKey[result])}</span>
      ) : null}
    </span>
  );
};
