import { createContext, useContext } from "react";
import type { useLiveSnapshot } from "@/hooks/use-live-snapshot";
export const LiveWorkspaceContext=createContext<ReturnType<typeof useLiveSnapshot>|null>(null);
export const useLiveWorkspace=()=>useContext(LiveWorkspaceContext);
