import type { DataCondition } from "@/lib/types";

/**
 * 프로토타입 상태 정의.
 * 명세 14장의 대표 상태 시안을 화면에서 그대로 재현할 수 있도록 시나리오를 고정 열거합니다.
 */

export type WalletSimState = "disconnected" | "connecting" | "connected" | "failed";
export type NetworkSimState = "sepolia" | "unsupported" | "unknown";
export type NetworkSwitchResult = "pending" | "success" | "rejected" | "failed";

export type TxOutcome =
  | "success"
  | "approval-ok-execute-failed"
  | "user-rejected"
  | "onchain-failed"
  | "stalled"
  | "replaced";

export type ScreenId = "assets" | "claim" | "sell" | "market";

export type ScenarioOption = { value: string; key: string };

export const SCREEN_SCENARIOS: Record<ScreenId, ScenarioOption[]> = {
  assets: [
    { value: "normal", key: "proto.opt.assets.normal" },
    { value: "first-load", key: "proto.opt.assets.firstLoad" },
    { value: "partial-failure", key: "proto.opt.assets.partialFailure" },
    { value: "empty", key: "proto.opt.assets.empty" },
    { value: "pending-index", key: "proto.opt.assets.pendingIndex" },
    { value: "stale", key: "proto.opt.assets.stale" },
  ],
  market: [
    { value: "normal", key: "proto.opt.market.normal" },
    { value: "first-load", key: "proto.opt.market.firstLoad" },
    { value: "empty", key: "proto.opt.market.empty" },
    { value: "filtered-empty", key: "proto.opt.market.filteredEmpty" },
    { value: "failure", key: "proto.opt.market.failure" },
    { value: "changed", key: "proto.opt.market.changed" },
  ],
  claim: [
    { value: "as-is", key: "proto.opt.claim.asIs" },
    { value: "verifying", key: "proto.opt.claim.verifying" },
    { value: "mismatch", key: "proto.opt.claim.mismatch" },
    { value: "not-found", key: "proto.opt.claim.notFound" },
    { value: "invalid-id", key: "proto.opt.claim.invalidId" },
    { value: "force-cancelled", key: "proto.opt.claim.forceCancelled" },
    { value: "force-fully-claimed", key: "proto.opt.claim.forceFullyClaimed" },
  ],
  sell: [
    { value: "idle", key: "proto.opt.sell.idle" },
    { value: "invalid-price", key: "proto.opt.sell.invalidPrice" },
    { value: "conditions-changed", key: "proto.opt.sell.conditionsChanged" },
    { value: "approval-ok-list-failed", key: "proto.opt.sell.approvalOkListFailed" },
    { value: "already-listed", key: "proto.opt.sell.alreadyListed" },
    { value: "completed", key: "proto.opt.sell.completed" },
  ],
};

export const DEFAULT_SCREEN_SCENARIO: Record<ScreenId, string> = {
  assets: "normal",
  market: "normal",
  claim: "as-is",
  sell: "idle",
};

export const WALLET_STATE_OPTIONS: { value: WalletSimState; key: string }[] = [
  { value: "disconnected", key: "proto.wallet.disconnected" },
  { value: "connecting", key: "proto.wallet.connecting" },
  { value: "connected", key: "proto.wallet.connected" },
  { value: "failed", key: "proto.wallet.failed" },
];

export const NETWORK_STATE_OPTIONS: { value: NetworkSimState; key: string }[] = [
  { value: "sepolia", key: "proto.network.sepolia" },
  { value: "unsupported", key: "proto.network.unsupported" },
  { value: "unknown", key: "proto.network.unknown" },
];

export const NETWORK_SWITCH_OPTIONS: { value: NetworkSwitchResult; key: string }[] = [
  { value: "success", key: "proto.networkSwitch.success" },
  { value: "rejected", key: "proto.networkSwitch.rejected" },
  { value: "failed", key: "proto.networkSwitch.failed" },
];

export const DATA_CONDITION_OPTIONS: { value: DataCondition; key: string }[] = [
  { value: "normal", key: "proto.data.normal" },
  { value: "refreshing", key: "proto.data.refreshing" },
  { value: "stale", key: "proto.data.stale" },
  { value: "pending-index", key: "proto.data.pendingIndex" },
  { value: "partial-failure", key: "proto.data.partialFailure" },
  { value: "failure", key: "proto.data.failure" },
];

export const TX_OUTCOME_OPTIONS: { value: TxOutcome; key: string }[] = [
  { value: "success", key: "proto.txOutcome.success" },
  { value: "approval-ok-execute-failed", key: "proto.txOutcome.approvalOkExecuteFailed" },
  { value: "user-rejected", key: "proto.txOutcome.userRejected" },
  { value: "onchain-failed", key: "proto.txOutcome.onchainFailed" },
  { value: "stalled", key: "proto.txOutcome.stalled" },
  { value: "replaced", key: "proto.txOutcome.replaced" },
];

export const getScreenId = (pathname: string): ScreenId | null => {
  if (pathname.startsWith("/assets")) return "assets";
  if (pathname.startsWith("/market")) return "market";
  if (/^\/claims\/[^/]+\/sell/.test(pathname)) return "sell";
  if (pathname.startsWith("/claims/")) return "claim";
  return null;
};
