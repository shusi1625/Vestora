import { useEffect, useState } from "react";
import { LIVE_MODE } from "@/lib/live-config";

type Names = Record<string, Record<string, string>>;
const STORAGE_KEY = LIVE_MODE ? "vestora:sepolia-v4:payment-names:v1" : "vestora-sample:payment-names:v1";
const seeds: Record<string, string> = { "1061": "10월 개발팀 급여", "1058": "프리랜서 보수", "1046": "프로젝트 보조금", "1062": "11월 용역비" };
const readNames = (): Names => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: Names = {};
    for (const [account, values] of Object.entries(parsed)) {
      if (!/^0x[\da-f]{40}$/i.test(account) || !values || typeof values !== "object" || Array.isArray(values)) continue;
      const names: Record<string, string> = {};
      for (const [id, value] of Object.entries(values)) {
        if (/^\d+$/.test(id) && typeof value === "string") names[id] = value.slice(0, 60);
      }
      result[account.toLowerCase()] = names;
    }
    return result;
  } catch { return {}; }
};

/** Local, account-scoped display metadata only; never sent to a recipient or a contract. */
export function usePaymentNames(address: string | null) {
  const [allNames, setNames] = useState<Names>(readNames);
  const [persisted, setPersisted] = useState(true);
  useEffect(()=>{const update=()=>setNames(readNames());window.addEventListener("vestora-payment-names",update);window.addEventListener("storage",update);return()=>{window.removeEventListener("vestora-payment-names",update);window.removeEventListener("storage",update);};},[]);
  const key = address?.toLowerCase() || "";
  const nameFor = (id: string) => {
    const value = allNames[key]?.[id];
    return typeof value === "string" ? value.slice(0, 60) : LIVE_MODE ? "" : seeds[id] || "";
  };
  const save = (id: string, name: string) => {
    if (!key || !/^\d+$/.test(id)) return;
    const current=readNames();
    const next = { ...current, [key]: { ...current[key], [id]: name.trim().slice(0, 60) } };
    setNames(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setPersisted(true); window.dispatchEvent(new Event("vestora-payment-names")); }
    catch { setPersisted(false); }
  };
  return { nameFor, save, persisted };
}
