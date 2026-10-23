import type { ReactNode } from "react";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { LiveWorkspaceContext } from "./live-context";
export function LiveWorkspaceProvider({children}:{children:ReactNode}) {
  return <LiveWorkspaceContext.Provider value={useLiveSnapshot()}>{children}</LiveWorkspaceContext.Provider>;
}
