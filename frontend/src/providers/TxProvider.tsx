import { useCallback, useMemo, useState, type ReactNode } from "react";

import { TX_PHASE } from "@/lib/status";
import type { TxPhase, TxRecord } from "@/lib/types";
import { explorerTxUrl, genTxHash, type AccountKey } from "@/prototype/fixtures";
import type { TxOutcome } from "@/prototype/scenarios";

import { usePrototypeData } from "./prototype-data-context";
import { useScenario } from "./scenario-context";
import { TxContext, type TxContextValue, type TxRequest, type TxRunResult } from "./tx-context";

const PHASE_MS: Record<TxPhase, number> = {
  preparing: 500,
  "approval-required": 400,
  "wallet-pending": 1100,
  rejected: 300,
  submitted: 700,
  mining: 1400,
  "failed-onchain": 300,
  indexing: 2000,
  completed: 300,
  stalled: 300,
  replaced: 300,
};

const APPROVAL_SUCCESS: TxPhase[] = [
  "preparing",
  "approval-required",
  "wallet-pending",
  "submitted",
  "mining",
  "completed",
];

const EXECUTE_BASE: TxPhase[] = ["preparing", "wallet-pending", "submitted", "mining"];

/** 시나리오에 따라 승인 단계와 실행 단계의 상태 순서를 만듭니다. */
const buildSequences = (
  requiresApproval: boolean,
  outcome: TxOutcome,
): { approval: TxPhase[]; execute: TxPhase[] } => {
  const approval = requiresApproval ? APPROVAL_SUCCESS : [];

  switch (outcome) {
    case "user-rejected":
      return {
        approval,
        execute: requiresApproval
          ? ["preparing", "approval-required", "wallet-pending", "rejected"]
          : ["preparing", "wallet-pending", "rejected"],
      };
    case "onchain-failed":
      return { approval, execute: [...EXECUTE_BASE, "failed-onchain"] };
    case "approval-ok-execute-failed":
      // 승인은 성공하지만 본 거래가 실패하는 경우: 두 기록을 분리해 표시합니다.
      return { approval, execute: [...EXECUTE_BASE, "failed-onchain"] };
    case "stalled":
      return { approval, execute: [...EXECUTE_BASE, "stalled"] };
    case "replaced":
      return { approval, execute: [...EXECUTE_BASE, "replaced"] };
    case "success":
    default:
      return { approval, execute: [...EXECUTE_BASE, "indexing", "completed"] };
  }
};

const failureReasonKey = (phase: TxPhase): string | undefined => {
  switch (phase) {
    case "rejected":
      return "tx.reason.rejected";
    case "failed-onchain":
      return "tx.reason.failedOnchain";
    case "stalled":
      return "tx.reason.stalled";
    case "replaced":
      return "tx.reason.replaced";
    default:
      return undefined;
  }
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

/**
 * 거래 실행 상태 머신.
 * 승인 성공·본 거래 실패·반영 지연을 각각 다른 상태로 보관하고,
 * 확정 후에는 데이터 저장소를 실제로 갱신해 화면이 자동으로 다시 반영되게 합니다.
 */
export const TxProvider = ({ children }: { children: ReactNode }) => {
  const { scenario } = useScenario();
  const data = usePrototypeData();
  const [activityOpen, setActivityOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const applyEffects = useCallback(
    (request: TxRequest) => {
      switch (request.kind) {
        case "claim":
          data.applyClaim(request.claimId, request.account, request.amountRaw);
          break;
        case "buy":
          data.applyPurchase(request.claimId, request.account, request.amountRaw);
          break;
        case "list":
          data.applyListing(request.claimId, request.account, request.amountRaw);
          break;
        case "unlist":
          data.applyUnlist(request.claimId);
          break;
        case "cancel-payment":
          data.applyCancelPayment(request.claimId, request.account, request.amountRaw);
          break;
        default:
          break;
      }
    },
    [data],
  );

  const advance = useCallback(
    async (recordId: string, phases: TxPhase[], request: TxRequest): Promise<TxPhase> => {
      let last: TxPhase = phases[0] ?? "preparing";
      for (const phase of phases) {
        last = phase;
        const patch: Partial<TxRecord> = { phase };
        if (phase === "submitted") {
          const hash = genTxHash(recordId.length + phases.length * 13);
          patch.hash = hash;
          patch.explorerUrl = explorerTxUrl(hash);
        }
        const reasonKey = failureReasonKey(phase);
        if (reasonKey) patch.failureReason = reasonKey;
        data.updateRecord(recordId, patch);

        if (phase === "indexing") data.setPendingIndex(request.claimId, true);
        if (phase === "completed") {
          applyEffects(request);
          data.setPendingIndex(request.claimId, false);
        }
        await wait(PHASE_MS[phase]);
      }
      return last;
    },
    [applyEffects, data],
  );

  const runTx = useCallback(
    async (request: TxRequest): Promise<TxRunResult> => {
      const { approval, execute } = buildSequences(
        request.requiresApproval,
        scenario.txOutcome,
      );
      const startedAt = new Date().toISOString();
      const seed = Date.now().toString(36);

      let approvalRecordId: string | null = null;
      if (approval.length > 0) {
        approvalRecordId = `tx-${seed}-approve`;
        data.appendRecord({
          id: approvalRecordId,
          kind: "approve",
          claimId: request.claimId,
          token: request.token,
          amountRaw: request.amountRaw,
          role: request.role,
          requestedAt: startedAt,
          phase: "preparing",
          accountKey: request.account,
        });
        const approvalPhase = await advance(approvalRecordId, approval, {
          ...request,
          kind: "approve",
        });
        if (approvalPhase !== "completed") {
          setReceiptId(approvalRecordId);
          return { recordId: approvalRecordId, phase: approvalPhase, approvalRecordId: null };
        }
      }

      const recordId = `tx-${seed}-main`;
      data.appendRecord({
        id: recordId,
        kind: request.kind,
        claimId: request.claimId,
        token: request.token,
        amountRaw: request.amountRaw,
        role: request.role,
        requestedAt: startedAt,
        phase: "preparing",
        accountKey: request.account,
      });
      const finalPhase = await advance(recordId, execute, request);
      setReceiptId(recordId);
      return { recordId, phase: finalPhase, approvalRecordId };
    },
    [advance, data, scenario.txOutcome],
  );

  const resumeTx = useCallback(
    async (recordId: string) => {
      const record = data.records.find((item) => item.id === recordId);
      if (!record) return;
      const request: TxRequest = {
        kind: record.kind,
        claimId: record.claimId,
        account: (record.accountKey as AccountKey | undefined) ?? scenario.account,
        token: record.token,
        amountRaw: record.amountRaw,
        role: record.role,
        requiresApproval: false,
      };
      await advance(recordId, ["mining", "indexing", "completed"], request);
    },
    [advance, data.records, scenario.account],
  );

  const retryTx = useCallback(
    async (recordId: string): Promise<TxRunResult | null> => {
      const record = data.records.find((item) => item.id === recordId);
      if (!record) return null;
      return runTx({
        kind: record.kind,
        claimId: record.claimId,
        account: (record.accountKey as AccountKey | undefined) ?? scenario.account,
        token: record.token,
        amountRaw: record.amountRaw,
        role: record.role,
        requiresApproval: record.kind === "buy" || record.kind === "list",
      });
    },
    [data.records, runTx, scenario.account],
  );

  const openReceipt = useCallback((recordId: string) => setReceiptId(recordId), []);
  const closeReceipt = useCallback(() => setReceiptId(null), []);

  const value = useMemo<TxContextValue>(() => {
    const activeRecords = data.records.filter(
      (record) => !TX_PHASE[record.phase].terminal,
    );
    return {
      records: data.records,
      activeRecords,
      runTx,
      resumeTx,
      retryTx,
      activityOpen,
      setActivityOpen,
      receiptId,
      openReceipt,
      closeReceipt,
    };
  }, [
    data.records,
    runTx,
    resumeTx,
    retryTx,
    activityOpen,
    receiptId,
    openReceipt,
    closeReceipt,
  ]);

  return <TxContext.Provider value={value}>{children}</TxContext.Provider>;
};
