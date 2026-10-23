import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Copy, Fuel, Loader2, LogOut, TriangleAlert } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatUnits, gasText, shortenAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCOUNTS, type AccountKey } from "@/prototype/fixtures";

import { useTx } from "@/providers/tx-context";
import { useWallet } from "@/providers/wallet-context";

const ACCOUNT_KEYS: AccountKey[] = ["A", "B", "C"];

/**
 * 지갑 버튼.
 * 미연결 / 연결 중 / 연결됨 / 연결 실패를 각각 다르게 보여주고,
 * 결제 토큰 잔액과 가스용 ETH 잔액을 분리 표기합니다.
 */
export const WalletButton = () => {
  const { t } = useTranslation();
  const {
    state,
    address,
    account,
    accountKey,
    balances,
    gasRaw,
    copyState,
    connect,
    disconnect,
    switchAccount,
  } = useWallet();
  const { setActivityOpen } = useTx();

  if (state === "disconnected") {
    return (
      <Button size="sm" onClick={connect}>
        {t("wallet.connect")}
      </Button>
    );
  }

  if (state === "connecting") {
    return (
      <Button size="sm" variant="secondary" disabled>
        <Loader2 aria-hidden className="size-4 animate-spin" />
        {t("wallet.connecting")}
      </Button>
    );
  }

  if (state === "failed") {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" className="border-void-border text-void" onClick={connect}>
          <TriangleAlert aria-hidden className="size-4" />
          {t("wallet.retry")}
        </Button>
        <span className="text-caption text-void">{t("wallet.failed")}</span>
      </span>
    );
  }

  const primaryBalance = balances[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-secondary px-3 py-1.5 text-secondary-foreground transition-colors duration-fast hover:bg-accent",
          )}
          aria-label={t("wallet.menuOpen")}
        >
          {primaryBalance ? (
            <span className="figure hidden text-caption font-semibold sm:inline">
              {formatUnits(primaryBalance.raw, primaryBalance.token)}{" "}
              {primaryBalance.token}
            </span>
          ) : null}
          <span className="figure text-caption font-semibold">
            {address ? shortenAddress(address) : ""}
          </span>
          <ChevronDown aria-hidden className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-body-sm font-semibold">{account?.label}</span>
          <span className="text-caption font-normal text-muted-foreground">
            {t("wallet.connectedTo", { network: t("network.sepolia") })}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="space-y-1.5 px-2 py-2">
          <p className="text-caption text-muted-foreground">{t("wallet.addressFull")}</p>
          <div className="flex items-center gap-2">
            <code className="figure flex-1 break-all rounded-md border border-border bg-muted px-2 py-1 text-caption">
              {address}
            </code>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-caption"
              onClick={() => {
                void navigator.clipboard?.writeText(address ?? "");
              }}
            >
              <Copy aria-hidden className="size-3" />
              {copyState === "copied" ? t("common.copied") : t("common.copy")}
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-caption font-medium text-muted-foreground">
          {t("wallet.paymentBalance")}
        </DropdownMenuLabel>
        <div className="space-y-1 px-2 pb-2">
          {balances.map((item) => (
            <div key={item.token} className="flex items-center justify-between gap-2">
              <Amount value={item} size="caption" />
            </div>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-caption font-medium text-muted-foreground">
          {t("wallet.gasBalance")}
        </DropdownMenuLabel>
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
            <Fuel aria-hidden className="size-3" />
            {t("wallet.gasNote")}
          </span>
          <span className="figure text-caption font-semibold">{gasText(gasRaw)}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{t("wallet.switchAccount")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ACCOUNT_KEYS.map((key) => (
              <DropdownMenuItem key={key} onSelect={() => switchAccount(key)}>
                <span className="flex-1">{ACCOUNTS[key].label}</span>
                {accountKey === key ? <Check aria-hidden className="size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => setActivityOpen(true)}>
          {t("txActivity.title")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 pb-1 pt-1">
          <p className="text-caption text-muted-foreground">{t("wallet.disconnectNote")}</p>
        </div>
        <DropdownMenuItem onSelect={disconnect} className="text-void">
          <LogOut aria-hidden className="size-3.5" />
          {t("wallet.disconnect")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
