import { createContext, useContext } from "react";

import type { TokenSymbol, TxKind, TxPhase, TxRecord } from "@/lib/types";
import type { AccountKey } from "@/prototype/fixtures";

export type TxRequest = {
  kind: TxKind;
  claimId: string;
  account: AccountKey;
  token: TokenSymbol;
  /** 이 거래로 이동하는 수량(청구액·구매가·판매가 등) */
  amountRaw: bigint;
  role: TxRecord["role"];
  /** 토큰 지출 승인 또는 NFT 전송 승인이 선행되는 거래인지 */
  requiresApproval: boolean;
};

export type TxRunResult = {
  recordId: string;
  phase: TxPhase;
  /** 승인이 선행된 거래에서 승인 트랜잭션 기록 ID */
  approvalRecordId: string | null;
};

export type TxContextValue = {
  records: TxRecord[];
  /** 아직 결과가 확정되지 않은 거래 */
  activeRecords: TxRecord[];
  runTx: (request: TxRequest) => Promise<TxRunResult>;
  /** 확인 지연·확정 대기 거래를 다시 추적합니다(실패로 바꾸지 않음) */
  resumeTx: (recordId: string) => Promise<void>;
  /** 실패·거절된 거래를 같은 조건으로 다시 시도합니다 */
  retryTx: (recordId: string) => Promise<TxRunResult | null>;
  activityOpen: boolean;
  setActivityOpen: (open: boolean) => void;
  receiptId: string | null;
  openReceipt: (recordId: string) => void;
  closeReceipt: () => void;
};

export const TxContext = createContext<TxContextValue | null>(null);

export const useTx = (): TxContextValue => {
  const context = useContext(TxContext);
  if (!context) {
    throw new Error("useTx는 TxProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
};
