import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { PrototypeDataProvider } from "./providers/PrototypeDataProvider";
import { ScenarioProvider } from "./providers/ScenarioProvider";
import { TxProvider } from "./providers/TxProvider";
import { WalletProvider } from "./providers/WalletProvider";
import { routers } from "./router";
import { LIVE_MODE } from "./lib/live-config";
import { LiveWorkspaceProvider } from "./providers/LiveWorkspaceProvider";

const queryClient = new QueryClient();
const router = createBrowserRouter(routers);
const Routing = () => <TooltipProvider><Toaster /><Sonner /><RouterProvider router={router} /></TooltipProvider>;

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 프로토타입 상태 → 샘플 데이터 → 지갑 세션 → 거래 상태 머신 순으로 의존합니다. */}
      <ScenarioProvider>
        <PrototypeDataProvider>
          <WalletProvider>
            <TxProvider>
              {LIVE_MODE ? <LiveWorkspaceProvider><Routing /></LiveWorkspaceProvider> : <Routing />}
            </TxProvider>
          </WalletProvider>
        </PrototypeDataProvider>
      </ScenarioProvider>
    </QueryClientProvider>
  );
};

export default App;
