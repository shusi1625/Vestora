import { useTranslation } from "react-i18next";
import { RefreshCw, RotateCcw } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TX_KIND, TX_PHASE } from "@/lib/status";
import { formatDateTime } from "@/lib/format";
import type { TxPhase } from "@/lib/types";

import { useTx } from "@/providers/tx-context";

const RESUMABLE: TxPhase[] = ["submitted", "mining", "stalled", "indexing"];
const RETRYABLE: TxPhase[] = ["rejected", "failed-onchain", "replaced"];

/**
 * 세션 거래 활동. 성공 알림이 사라진 뒤에도 결과를 다시 확인할 수 있게 합니다.
 * 이 목록은 이 세션에서 실행한 거래만 담으므로 전체 이력으로 표현하지 않습니다.
 */
export const TxActivityDialog = () => {
  const { t } = useTranslation();
  const { records, activityOpen, setActivityOpen, openReceipt, resumeTx, retryTx } = useTx();

  return (
    <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("txActivity.title")}</DialogTitle>
          <DialogDescription>{t("txActivity.description")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {records.map((record) => (
            <li
              key={record.id}
              className="rounded-md border border-border bg-card px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge meta={TX_PHASE[record.phase]} size="sm" />
                  <span className="text-body-sm font-medium">{t(TX_KIND[record.kind])}</span>
                  <span className="text-caption text-muted-foreground">
                    {t("common.claimId", { id: record.claimId })}
                  </span>
                </div>
                <span className="text-caption text-muted-foreground">
                  {formatDateTime(record.requestedAt)}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Amount value={{ token: record.token, raw: record.amountRaw }} size="body" />
                <div className="flex flex-wrap items-center gap-2">
                  {RESUMABLE.includes(record.phase) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-caption"
                      onClick={() => void resumeTx(record.id)}
                    >
                      <RefreshCw aria-hidden className="size-3" />
                      {t("tx.action.recheck")}
                    </Button>
                  ) : null}
                  {RETRYABLE.includes(record.phase) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-caption"
                      onClick={() => void retryTx(record.id)}
                    >
                      <RotateCcw aria-hidden className="size-3" />
                      {t("tx.action.retry")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2 text-caption"
                    onClick={() => {
                      setActivityOpen(false);
                      openReceipt(record.id);
                    }}
                  >
                    {t("tx.activity.view")}
                  </Button>
                </div>
              </div>
              {record.failureReason ? (
                <p className="mt-2 text-caption text-void">{t(record.failureReason)}</p>
              ) : null}
            </li>
          ))}
        </ul>

        <p className="text-caption text-muted-foreground">{t("txActivity.scopeNote")}</p>
      </DialogContent>
    </Dialog>
  );
};
