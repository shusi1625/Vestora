import { useState } from "react";
import { usePrototypeData } from "@/providers/prototype-data-context";
import { useWallet } from "@/providers/wallet-context";
import { useScenario } from "@/providers/scenario-context";
import { useLiveWorkspace } from "@/providers/live-context";

/** Replace this read adapter with a verified API/on-chain snapshot, not the view components. */
export function useWorkspaceSnapshot() {
  const data = usePrototypeData();
  const wallet = useWallet();
  const { scenario } = useScenario();
  const live=useLiveWorkspace();
  const [now, setNow] = useState(() => new Date());
  const empty = scenario.dataCondition === "empty";
  return live || { ...data, ...wallet, claims: empty ? [] : data.claims, listings: empty ? [] : data.listings,
    records: empty ? [] : data.records, scenario, now, refresh: () => setNow(new Date()),
    executionMode: "preview" as const, source: "prototype" as const, balancesReady:true,historyReady:true,paymentTokens:["MockUSDC","mWETH"] as ("MockUSDC"|"mWETH")[] };
}
