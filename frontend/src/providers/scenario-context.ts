import { createContext, useContext } from "react";

import type { DataCondition } from "@/lib/types";
import type { AccountKey } from "@/prototype/fixtures";
import { DEFAULT_SCREEN_SCENARIO } from "@/prototype/scenarios";
import type {
  NetworkSimState,
  NetworkSwitchResult,
  ScreenId,
  TxOutcome,
  WalletSimState,
} from "@/prototype/scenarios";

/** 프로토타입 시나리오 상태. 실제 연동 시 이 컨텍스트는 사라집니다. */
export type ScenarioState = {
  wallet: WalletSimState;
  account: AccountKey;
  network: NetworkSimState;
  networkSwitchResult: NetworkSwitchResult;
  dataCondition: DataCondition;
  txOutcome: TxOutcome;
  screens: Record<ScreenId, string>;
};

export const initialScenario: ScenarioState = {
  wallet: "disconnected",
  account: "A",
  network: "sepolia",
  networkSwitchResult: "success",
  dataCondition: "normal",
  txOutcome: "success",
  screens: { ...DEFAULT_SCREEN_SCENARIO },
};

export type ScenarioContextValue = {
  scenario: ScenarioState;
  setScenario: (patch: Partial<ScenarioState>) => void;
  setScreenScenario: (screen: ScreenId, value: string) => void;
  resetScenario: () => void;
};

export const ScenarioContext = createContext<ScenarioContextValue | null>(null);

const WALLET_STATES: WalletSimState[] = ["disconnected", "connecting", "connected", "failed"];
const NETWORK_STATES: NetworkSimState[] = ["sepolia", "unsupported", "unknown"];
const DATA_STATES: DataCondition[] = [
  "normal",
  "refreshing",
  "stale",
  "pending-index",
  "partial-failure",
  "failure",
];
const TX_OUTCOMES: TxOutcome[] = [
  "success",
  "approval-ok-execute-failed",
  "user-rejected",
  "onchain-failed",
  "stalled",
  "replaced",
];

const pick = <T,>(value: string | null, allowed: T[], fallback: T): T =>
  value && (allowed as string[]).includes(value) ? (value as T) : fallback;

/**
 * 화면 검토용: URL 쿼리로 초기 시나리오를 지정할 수 있습니다.
 * 예) /assets?wallet=connected&account=A&data=partial-failure
 */
export const readInitialScenario = (search: string): ScenarioState => {
  const params = new URLSearchParams(search);
  return {
    ...initialScenario,
    wallet: pick(params.get("wallet"), WALLET_STATES, initialScenario.wallet),
    account: pick(params.get("account"), ["A", "B", "C"], initialScenario.account),
    network: pick(params.get("network"), NETWORK_STATES, initialScenario.network),
    dataCondition: pick(params.get("data"), DATA_STATES, initialScenario.dataCondition),
    txOutcome: pick(params.get("tx"), TX_OUTCOMES, initialScenario.txOutcome),
  };
};

export const useScenario = (): ScenarioContextValue => {
  const context = useContext(ScenarioContext);
  if (!context) {
    throw new Error("useScenario는 ScenarioProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
};
