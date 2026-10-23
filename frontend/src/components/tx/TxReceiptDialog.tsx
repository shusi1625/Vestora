import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ExternalLink, RefreshCw, RotateCcw } from "lucide-react";

import { Amount } from "@/components/common/Amount";
import { InlineNotice } from "@/components/common/InlineNotice";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TX_KIND, TX_PHASE } from "@/lib/status";
import type { TxKind, TxRecord } from "@/lib/types";
import { ACCOUNTS, type AccountKey } from "@/prototype/fixtures";

import { useTx } from "@/providers/tx-context";
import { KeyValue, KeyValueDivider } from "@/components/common/Section";

import { TxStatusTimeline } from "./TxStatusTimeline";

const AMOUNT_LABEL_KEY: Record<TxKind, string> = {
  create: "receipt.amount.deposited",
  approve: "receipt.amount.approved",
  list: "receipt.amount.listPrice",
  unlist: "receipt.amount.listPrice",
  buy: "receipt.amount.paid",
  claim: "receipt.amount.claimed",
  "cancel-payment": "receipt.amount.refunded",
};

const titleKey = (record: TxRecord): string => {
  if (record.phase === "completed") return "receipt.title.completed";
  if (record.phase === "rejected" || record.phase === "failed-onchain" || record.phase === "replaced") {
    return "receipt.title.failed";
  }
  return "receipt.title.pending";
};

/**
 * 거래 완료·영수 화면.
 * 승인 성공과 본 거래 실패를 분리해 보여주고, 알림이 사라져도 거래 활동에서 다시 열 수 있습니다.
 */
export const TxReceiptDialog = () => {
  const { t } = useTranslation();
  const { records, receiptId, closeReceipt, resumeTx, retryTx } = useTx();
  const record = receiptId ? records.find((item) => item.id === receiptId) ?? null : null;
  const approvalRecord =
    record && record.kind !== "approve"
      ? records.find((item) => item.id === record.id.replace("-main", "-approve")) ?? null
      : null;

  const open = Boolean(record);
  const approvalSeparated =
    Boolean(record) &&
    record!.kind !== "approve" &&
    approvalRecord?.phase === "completed" &&
    record!.phase !== "completed";
  const account = record?.accountKey
    ? ACCOUNTS[record.accountKey as AccountKey]
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : closeReceipt())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {record ? (
          <>
            <DialogHeader>
              <DialogTitle>{t(titleKey(record))}</DialogTitle>
              <DialogDescription>
                {t("receipt.description", { id: record.claimId })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge meta={TX_PHASE[record.phase]} />
                <span className="text-caption text-muted-foreground">
                  {t(TX_KIND[record.kind])}
                </span>
              </div>

              <div className="rounded-md border border-border bg-muted/60 px-3 py-3">
                <p className="text-caption text-muted-foreground">
                  {t(AMOUNT_LABEL_KEY[record.kind])}
                </p>
                <Amount
                  value={{ token: record.token, raw: record.amountRaw }}
                  size="title"
                  className="mt-1"
                />
              </div>

              {record.failureReason ? (
                <InlineNotice tone="danger" titleKey="receipt.failureTitle">
                  {t(record.failureReason)}
                </InlineNotice>
              ) : null}

              {approvalSeparated ? (
                <InlineNotice tone="success" titleKey="receipt.approvalSeparated.title">
                  {t("receipt.approvalSeparated.body")}
                </InlineNotice>
              ) : null}

              <div>
                <KeyValue labelKey="receipt.field.claim">
                  <Link
                    to={`/claims/${record.claimId}`}
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={closeReceipt}
                  >
                    {t("common.claimId", { id: record.claimId })}
                  </Link>
                </KeyValue>
                <KeyValueDivider />
                <KeyValue labelKey="receipt.field.executedBy">
                  <span className="figure">{account?.label ?? "-"}</span>
                </KeyValue>
                <KeyValueDivider />
                <KeyValue labelKey="receipt.field.requestedAt">
                  <span className="figure">
                    {new Date(record.requestedAt).toLocaleString("ko-KR")}
                  </span>
                </KeyValue>
                {record.hash ? (
                  <>
                    <KeyValueDivider />
                    <KeyValue labelKey="receipt.field.hash">
                      <a
                        href={record.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="figure inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                      >
                        {`${record.hash.slice(0, 10)}…${record.hash.slice(-6)}`}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    </KeyValue>
                  </>
                ) : null}
              </div>

              <div className="rounded-md border border-border px-3 py-3">
                <p className="mb-2 text-body-sm font-semibold">{t("receipt.timeline")}</p>
                <TxStatusTimeline record={record} />
              </div>

              {record.kind === "buy" && record.phase === "completed" ? (
                <InlineNotice tone="info" titleKey="receipt.buyNotice.title">
                  {t("receipt.buyNotice.body")}
                </InlineNotice>
              ) : null}
              {record.kind === "list" && record.phase === "completed" ? (
                <InlineNotice tone="info" titleKey="receipt.listNotice.title">
                  {t("receipt.listNotice.body")}
                </InlineNotice>
              ) : null}

              <p className="text-caption text-muted-foreground">
                {t("receipt.reopenHint")}
              </p>
            </div>

            <DialogFooter className="flex-wrap gap-2 sm:justify-end">
              {record.phase === "stalled" || record.phase === "mining" || record.phase === "submitted" || record.phase === "indexing" ? (
                <Button variant="outline" onClick={() => void resumeTx(record.id)}>
                  <RefreshCw aria-hidden className="size-4" />
                  {t("tx.action.recheck")}
                </Button>
              ) : null}
              {record.phase === "rejected" || record.phase === "failed-onchain" || record.phase === "replaced" ? (
                <Button variant="outline" onClick={() => void retryTx(record.id)}>
                  <RotateCcw aria-hidden className="size-4" />
                  {t("tx.action.retry")}
                </Button>
              ) : null}
              {record.phase === "completed" && record.kind === "buy" ? (
                <Button asChild>
                  <Link to={`/claims/${record.claimId}`} onClick={closeReceipt}>
                    {t("receipt.action.claimNow")}
                  </Link>
                </Button>
              ) : null}
              <Button variant={record.phase === "completed" ? "default" : "secondary"} asChild>
                <Link to="/assets" onClick={closeReceipt}>
                  {t("receipt.action.goAssets")}
                </Link>
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
