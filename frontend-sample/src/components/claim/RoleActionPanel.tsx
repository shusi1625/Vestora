import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { InlineNotice } from "@/components/common/InlineNotice";
import { ReasonedButton } from "@/components/common/ReasonedButton";
import { Button } from "@/components/ui/button";
import { getActorContext, type ActionVariant, type ClaimTotals } from "@/lib/claim-math";
import { PAYMENT_STATUS } from "@/lib/status";
import type { Claim, ClaimRole, Listing } from "@/lib/types";

import { useWallet } from "@/providers/wallet-context";

const ROLE_KEY: Record<ClaimRole, string> = {
  owner: "role.owner",
  payer: "role.payer",
  recipient: "role.recipient",
};

/** 시나리오별 문구를 정적으로 열거합니다(동적 키 생성 금지). */
const VARIANT_COPY: Record<ActionVariant, { titleKey: string; bodyKey: string }> = {
  connect: { titleKey: "role.title.connect", bodyKey: "role.body.connect" },
  verifying: { titleKey: "role.title.verifying", bodyKey: "role.body.verifying" },
  "claim-and-sell": {
    titleKey: "role.title.claimAndSell",
    bodyKey: "role.body.claimAndSell",
  },
  "claim-only": { titleKey: "role.title.claimOnly", bodyKey: "role.body.claimOnly" },
  "sell-only": { titleKey: "role.title.sellOnly", bodyKey: "role.body.sellOnly" },
  "manage-listing": {
    titleKey: "role.title.manageListing",
    bodyKey: "role.body.manageListing",
  },
  buy: { titleKey: "role.title.buy", bodyKey: "role.body.buy" },
  unavailable: { titleKey: "role.title.unavailable", bodyKey: "role.body.unavailable" },
  closed: { titleKey: "role.title.closed", bodyKey: "role.body.closed" },
};

type RoleActionPanelProps = {
  claim: Claim;
  totals: ClaimTotals;
  listing: Listing | null;
  onClaim: () => void;
  onBuy: () => void;
  onCancelPayment: () => void;
  onRecheck: () => void;
  className?: string;
};

/**
 * 역할별 행동 영역.
 * 역할은 복수일 수 있으므로 해당하는 역할을 모두 표시하고, 상태에 맞는 주 행동 하나를 제시합니다.
 */
export const RoleActionPanel = ({
  claim,
  totals,
  listing,
  onClaim,
  onBuy,
  onCancelPayment,
  onRecheck,
  className,
}: RoleActionPanelProps) => {
  const { t } = useTranslation();
  const { address, canTransact, connect } = useWallet();
  const actor = getActorContext(claim, listing, address, totals);
  const blockedReason = canTransact ? null : t("wallet.blockedReason");
  const copy = VARIANT_COPY[actor.variant];

  const primary = (() => {
    switch (actor.variant) {
      case "connect":
        return (
          <Button size="sm" onClick={connect}>
            {t("wallet.connect")}
          </Button>
        );
      case "verifying":
        return (
          <Button size="sm" variant="outline" onClick={onRecheck}>
            <RefreshCw aria-hidden className="size-4" />
            {t("role.recheckOwnership")}
          </Button>
        );
      case "claim-and-sell":
      case "claim-only":
        return (
          <ReasonedButton size="sm" disabledReason={blockedReason} onClick={onClaim}>
            {t("role.claimWithAmount")}
          </ReasonedButton>
        );
      case "sell-only":
        return canTransact ? (
          <Button size="sm" asChild>
            <Link to={`/claims/${claim.id}/sell`}>{t("role.sellNow")}</Link>
          </Button>
        ) : (
          <ReasonedButton size="sm" disabled disabledReason={blockedReason}>
            {t("role.sellNow")}
          </ReasonedButton>
        );
      case "manage-listing":
        return (
          <Button size="sm" variant="secondary" asChild>
            <Link to="/my/sales">{t("claim.action.manageListing")}</Link>
          </Button>
        );
      case "buy":
        return (
          <ReasonedButton size="sm" disabledReason={blockedReason} onClick={onBuy}>
            {t("role.buyNow")}
          </ReasonedButton>
        );
      case "unavailable":
        return (
          <Button size="sm" variant="outline" asChild>
            <Link to="/market">{t("role.goMarket")}</Link>
          </Button>
        );
      case "closed":
        return (
          <Button size="sm" variant="outline" asChild>
            <Link to="/transactions">{t("role.viewHistory")}</Link>
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <div className={className}>
      <div className="space-y-3 rounded-lg border border-border bg-card px-4 py-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-muted-foreground">{t("role.myRoles")}</span>
          {actor.roles.length > 0 ? (
            actor.roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-listed-border bg-listed-bg px-2 py-0.5 text-caption font-medium text-listed"
              >
                {t(ROLE_KEY[role])}
              </span>
            ))
          ) : (
            <span className="text-caption text-muted-foreground">{t("role.none")}</span>
          )}
        </div>

        <div className="space-y-1">
          <p className="text-[15px] font-semibold">{t(copy.titleKey)}</p>
          <p className="text-body-sm text-muted-foreground">{t(copy.bodyKey)}</p>
        </div>

        {actor.variant === "claim-and-sell" || actor.variant === "claim-only" ? (
          <p className="flex flex-wrap items-center gap-1.5 text-body-sm">
            <span className="text-muted-foreground">{t("role.claimAmountLabel")}</span>
            <Amount
              value={actor.claimableNow}
              size="body"
              estimateAt={totals.isEstimate ? new Date().toISOString() : null}
            />
          </p>
        ) : null}

        {!totals.ownershipVerified ? (
          <InlineNotice tone="warning">{t("role.verifyingNotice")}</InlineNotice>
        ) : null}
        {totals.paymentStatus === "cancelled" ? (
          <InlineNotice tone="danger">{t("role.cancelledNotice")}</InlineNotice>
        ) : null}
        {actor.variant === "sell-only" ? (
          <InlineNotice tone="muted">{t("role.sellOnlyHint")}</InlineNotice>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {primary}
          {actor.variant === "claim-and-sell" ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={`/claims/${claim.id}/sell`}>
                {t("claim.action.sell")}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </Button>
          ) : null}
          {actor.variant === "manage-listing" && actor.canClaim ? (
            <ReasonedButton
              size="sm"
              variant="outline"
              disabledReason={blockedReason}
              onClick={onClaim}
            >
              {t("claim.action.claim")}
            </ReasonedButton>
          ) : null}
          {actor.variant === "sell-only" ? (
            <span className="text-caption text-muted-foreground">{t("role.checkSchedule")}</span>
          ) : null}
          {actor.canCancelPayment ? (
            <ReasonedButton
              size="sm"
              variant="outline"
              disabledReason={blockedReason}
              onClick={onCancelPayment}
            >
              {t("role.reviewCancelPayment")}
            </ReasonedButton>
          ) : null}
        </div>

        <p className="text-caption text-muted-foreground">
          {t("role.recheckNote")}
          {" · "}
          {t(PAYMENT_STATUS[totals.paymentStatus].key)}
        </p>
      </div>
    </div>
  );
};
