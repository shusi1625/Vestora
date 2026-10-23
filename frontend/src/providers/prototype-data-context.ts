import { createContext, useContext } from "react";

import type { AccountKey } from "@/prototype/fixtures";
import type { Amount, Claim, Listing, TxRecord } from "@/lib/types";

/**
 * 프로토타입 데이터 저장소.
 * 실제 컨트랙트가 연결되면 조회·실행 함수로 대체되고, 화면 코드는 그대로 유지됩니다.
 */
export type PrototypeDataValue = {
  claims: Claim[];
  listings: Listing[];
  /** 지갑 계정별 결제 토큰 잔액(가스용 ETH와 분리) */
  balancesByAccount: Record<AccountKey, Amount[]>;
  gas: Record<AccountKey, bigint>;
  records: TxRecord[];
  /** 거래는 확정됐지만 앱 데이터 반영이 끝나지 않은 수취권 */
  pendingIndexClaimIds: string[];
  applyClaim: (claimId: string, account: AccountKey, amountRaw: bigint) => void;
  applyPurchase: (claimId: string, account: AccountKey, priceRaw: bigint) => void;
  applyListing: (claimId: string, account: AccountKey, priceRaw: bigint) => void;
  applyUnlist: (claimId: string) => void;
  applyCancelPayment: (claimId: string, account: AccountKey, refundRaw: bigint) => void;
  setPendingIndex: (claimId: string, active: boolean) => void;
  appendRecord: (record: TxRecord) => void;
  updateRecord: (id: string, patch: Partial<TxRecord>) => void;
};

export const PrototypeDataContext = createContext<PrototypeDataValue | null>(null);

export const usePrototypeData = (): PrototypeDataValue => {
  const context = useContext(PrototypeDataContext);
  if (!context) {
    throw new Error("usePrototypeData는 PrototypeDataProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
};
