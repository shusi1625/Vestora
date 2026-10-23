import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { AddressText } from "@/components/common/AddressText";
import { Amount } from "@/components/common/Amount";
import { InlineNotice } from "@/components/common/InlineNotice";
import { KeyValue, KeyValueDivider } from "@/components/common/Section";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClaimTotals } from "@/lib/claim-math";
import { TX_PHASE } from "@/lib/status";
import type { Claim } from "@/lib/types";

type CancelPaymentDialogProps = {
  claim: Claim;
  totals: ClaimTotals;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  submitting: boolean;
  currentPhase?: keyof typeof TX_PHASE;
};

/** 지급 취소 확인. 송금자 환급 예상액과 소유자에게 남는 권리를 분리해 보여줍니다. */
export const CancelPaymentDialog = ({
  claim,
  totals,
  open,
  onOpenChange,
  onConfirm,
  submitting,
  currentPhase,
}: CancelPaymentDialogProps) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("cancelPayment.title")}</DialogTitle>
          <DialogDescription>
            {t("cancelPayment.description", { id: claim.id })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <KeyValue labelKey="cancelPayment.refund">
              <Amount value={totals.futureAmount} size="title" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="cancelPayment.remainingRight">
              <Amount value={totals.claimableNow} size="body" />
            </KeyValue>
            <KeyValueDivider />
            <KeyValue labelKey="cancelPayment.currentOwner">
              <AddressText address={claim.owner} />
            </KeyValue>
          </div>

          <InlineNotice tone="danger" titleKey="cancelPayment.effect.title">
            {t("cancelPayment.effect.body")}
          </InlineNotice>

          {!submitting && totals.futureAmount.raw > 0n ? (
            <p className="text-caption text-muted-foreground">
              {t("cancelPayment.note")}
            </p>
          ) : null}

          {submitting && currentPhase ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2.5">
              <StatusBadge meta={TX_PHASE[currentPhase]} size="sm" />
              <span className="inline-flex items-center gap-1.5 text-body-sm">
                <Loader2 aria-hidden className="size-3 animate-spin" />
                {t(TX_PHASE[currentPhase].hintKey)}
              </span>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={onConfirm}>
            {t("cancelPayment.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
