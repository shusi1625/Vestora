import { useEffect, useState, useSyncExternalStore } from "react";
import type { useInjectedWallet as useLiveInjectedWallet } from "../../src/hooks/use-injected-wallet";
import { createWalletSession } from "../../src/lib/wallet-session";

export function useInjectedWallet(): ReturnType<typeof useLiveInjectedWallet> {
  // Watched addresses belong to the measurement port, never to this session.
  const [session] = useState(() => createWalletSession(() => undefined));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  return {
    ...state,
    connect: session.connect,
    disconnect: session.disconnect,
    switchChain: session.switchChain,
    session,
  };
}
