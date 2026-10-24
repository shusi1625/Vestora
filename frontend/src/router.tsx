import { Navigate } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import AssetsPage from "./pages/assets/WorkspaceAssets";
import ClaimDetailPage from "./pages/claim-detail";
import LiveClaimDetail from "./pages/claim-detail/LiveClaimDetail";
import MarketPage from "./pages/market/WorkspaceMarket";
import SalesPage from "./pages/sales";
import IssuedPage from "./pages/issued";
import TransactionsPage from "./pages/transactions";
import NotFound from "./pages/NotFound";
import SellPage from "./pages/sell";
import { LIVE_MODE } from "./lib/live-config";

export const routers = [
  {
    path: "/",
    name: "app",
    element: <AppShell />,
    children: [
      {
        index: true,
        name: "home",
        element: <Navigate to="/market" replace />,
      },
      {
        path: "market",
        name: "market",
        element: <MarketPage />,
      },
      {
        path: "assets",
        name: "assets",
        element: <AssetsPage />,
      },
      {
        path: "claims/:id",
        name: "claimDetail",
        element: LIVE_MODE ? <LiveClaimDetail /> : <ClaimDetailPage />,
      },
      {
        path: "claims/:id/sell",
        name: "claimSell",
        element: LIVE_MODE ? <LiveClaimDetail sell /> : <SellPage />,
      },
      {
        path: "my/sales",
        name: "mySales",
        element: <SalesPage />,
      },
      {
        path: "manage",
        name: "paymentManage",
        element: <IssuedPage />,
        children: [
          { index: true, element: <Navigate to="issued" replace /> },
          { path: "issued", name: "paymentIssued" },
          { path: "create", name: "paymentCreate" },
        ],
      },
      {
        path: "transactions",
        name: "transactions",
        element: <TransactionsPage />,
      },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
