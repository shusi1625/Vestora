import { createContext, useContext } from "react";

import type { Amount, TokenSymbol, WalletAccount } from "@/lib/types";
import type { AccountKey } from "@/prototype/fixtures";
import type {
  NetworkSimState,
  NetworkSwitchResult,
  WalletSimState,
} from "@/prototype/scenarios";

export type CopyState = "idle" | "copied" | "failed";

export type WalletContextValue = {
  /** 미연결 / 연결 중 / 연결됨 / 연결 실패 */
  state: WalletSimState;
  /** 연결된 계정의 주소. 계정이 바뀌면 개인 데이터 조회 키도 함께 바뀝니다. */
  address: string | null;
  account: WalletAccount | null;
  accountKey: AccountKey;
  network: NetworkSimState;
  isSupportedNetwork: boolean;
  /** 연결됨 + 지원 네트워크일 때만 거래 실행이 가능합니다. */
  canTransact: boolean;
  switchingNetwork: boolean;
  networkSwitchResult: NetworkSwitchResult;
  copyState: CopyState;
  balances: Amount[];
  gasRaw: bigint;
  connect: () => void;
  disconnect: () => void;
  switchAccount: (key: AccountKey) => void;
  requestNetworkSwitch: () => Promise<NetworkSwitchResult>;
  copyAddress: () => void;
};

export const WalletContext = createContext<WalletContextValue | null>(null);

export const useWallet = (): WalletContextValue => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet은 WalletProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
};
