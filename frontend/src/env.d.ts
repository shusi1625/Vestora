/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: "live" | "sample";
  readonly VITE_VESTORA_API_URL?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_ENTER_ANALYTICS_ENABLED?: string;
  readonly VITE_ENTER_ANALYTICS_TOKEN?: string;
  readonly VITE_ENTER_PROJECT_ID?: string;
  readonly VITE_ENTER_ANALYTICS_ENDPOINT?: string;
  readonly VITE_ENTER_ANALYTICS_DEFINITIONS_ENDPOINT?: string;
  readonly VITE_ENTER_ANALYTICS_DEBUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
