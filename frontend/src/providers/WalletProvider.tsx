import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ACCOUNTS, type AccountKey } from "@/prototype/fixtures";
import type { NetworkSwitchResult } from "@/prototype/scenarios";

import { usePrototypeData } from "./prototype-data-context";
import { useScenario } from "./scenario-context";
import { WalletContext, type CopyState, type WalletContextValue } from "./wallet-context";

const CONNECT_MS = 1000;
const NETWORK_SWITCH_MS = 1100;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

/**
 * 지갑 세션. 프로토타입이므로 실제 지갑 확장 프로그램 대신 시나리오로 상태를 재현합니다.
 * 연결 해제는 이미 제출된 거래를 취소하지 않습니다(거래 상태는 TxProvider가 별도로 보관).
 */
export const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { scenario, setScenario } = useScenario();
  const { balancesByAccount, gas } = usePrototypeData();
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const connectTimer = useRef<number | null>(null);
  const copyTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (connectTimer.current) window.clearTimeout(connectTimer.current);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const connect = useCallback(() => {
    const willFail = scenario.wallet === "failed";
    setScenario({ wallet: "connecting" });
    if (connectTimer.current) window.clearTimeout(connectTimer.current);
    connectTimer.current = window.setTimeout(
      () => setScenario({ wallet: willFail ? "failed" : "connected" }),
      CONNECT_MS,
    );
  }, [scenario.wallet, setScenario]);

  const disconnect = useCallback(() => {
    if (connectTimer.current) window.clearTimeout(connectTimer.current);
    setScenario({ wallet: "disconnected" });
  }, [setScenario]);

  const switchAccount = useCallback(
    (key: AccountKey) => setScenario({ account: key }),
    [setScenario],
  );

  const requestNetworkSwitch = useCallback(async (): Promise<NetworkSwitchResult> => {
    setSwitchingNetwork(true);
    await wait(NETWORK_SWITCH_MS);
    const result = scenario.networkSwitchResult;
    if (result === "success") setScenario({ network: "sepolia" });
    setSwitchingNetwork(false);
    return result;
  }, [scenario.networkSwitchResult, setScenario]);

  const account = ACCOUNTS[scenario.account];

  const copyAddress = useCallback(() => {
    const address = ACCOUNTS[scenario.account].address;
    const markResult = (state: CopyState) => {
      setCopyState(state);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopyState("idle"), 1600);
    };
    if (!navigator.clipboard) {
      markResult("failed");
      return;
    }
    navigator.clipboard
      .writeText(address)
      .then(() => markResult("copied"))
      .catch(() => markResult("failed"));
  }, [scenario.account]);

  const value = useMemo<WalletContextValue>(() => {
    const isConnected = scenario.wallet === "connected";
    return {
      state: scenario.wallet,
      address: isConnected ? account.address : null,
      account: isConnected ? account : null,
      accountKey: scenario.account,
      network: scenario.network,
      isSupportedNetwork: scenario.network === "sepolia",
      canTransact: isConnected && scenario.network === "sepolia",
      switchingNetwork,
      networkSwitchResult: scenario.networkSwitchResult,
      copyState,
      balances: balancesByAccount[scenario.account],
      gasRaw: gas[scenario.account],
      connect,
      disconnect,
      switchAccount,
      requestNetworkSwitch,
      copyAddress,
    };
  }, [
    scenario.wallet,
    scenario.network,
    scenario.networkSwitchResult,
    scenario.account,
    account,
    switchingNetwork,
    copyState,
    balancesByAccount,
    gas,
    connect,
    disconnect,
    switchAccount,
    requestNetworkSwitch,
    copyAddress,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};
