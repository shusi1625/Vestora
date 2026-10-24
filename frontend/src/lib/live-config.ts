export const LIVE_MODE = import.meta.env.VITE_DATA_MODE !== "sample";
export const LIVE_API_BASE = (import.meta.env.VITE_VESTORA_API_URL || "/vestora-api").replace(/\/$/, "");
export const LIVE_RPC_URL = import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const LIVE_SYNC_ID = "sepolia-v4";
export const LIVE_USDC = "0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9" as const;
export const LIVE_STREAM = "0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a" as const;
export const LIVE_MARKET = "0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7" as const;
