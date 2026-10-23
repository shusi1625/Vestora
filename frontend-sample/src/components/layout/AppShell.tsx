import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router-dom";
import { NavLink } from "react-router-dom";
import "@/styles/workspace.css";
import { LIVE_MODE } from "@/lib/live-config";
import { useLiveWorkspace } from "@/providers/live-context";
import { LiveConnection, LiveDataStatus } from "@/components/workspace/LiveConnection";
import { ClaimActivity } from "@/components/workspace/ClaimAction";
import { CreatePaymentActivity } from "@/components/workspace/CreatePaymentAction";

import { ScenarioPanel } from "@/components/prototype/ScenarioPanel";
import { TxActivityDialog } from "@/components/tx/TxActivityDialog";
import { TxReceiptDialog } from "@/components/tx/TxReceiptDialog";

import { ActiveTxIndicator } from "./ActiveTxIndicator";
import { NetworkBadge } from "./NetworkBadge";
import { TestnetBanner } from "./TestnetBanner";
import { WalletButton } from "./WalletButton";

/**
 * 모든 화면에 적용되는 공통 셸.
 * 테스트넷 고지·내비게이션·네트워크·지갑·진행 중 거래 표시를 한 곳에서 관리합니다.
 */
export const AppShell = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const live = useLiveWorkspace();

  return (
    <div className="ws-shell">
      {LIVE_MODE ? <div className="live-banner">{t("live.banner")}</div> : <TestnetBanner />}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="page-container ws-header">
          <Link to="/market" className="ws-brand">
            <svg width="30" height="32" viewBox="0 0 30 32" aria-hidden="true"><path d="M3 4h8l7 24h-8z" fill="currentColor" /><path d="M18 4h9l-9 24-4-13z" fill="#8dac79" /></svg>
            <span>Vestora</span>
          </Link>

          <nav className="ws-nav" aria-label={t("nav.main")}>
            {[["/market", "market.title"], ["/assets", "assets.title"], ["/my/sales", "workspace.salesTitle"], ["/manage", "workspace.issuedTitle"], ["/transactions", "workspace.transactionsTitle"]].map(([to, key]) => <NavLink key={to} to={to === "/manage" ? "/manage/issued" : to} className={({ isActive }) => isActive || (to === "/manage" && location.pathname.startsWith("/manage")) ? "active" : ""}>{t(key)}</NavLink>)}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {LIVE_MODE ? <LiveConnection /> : <><ActiveTxIndicator /><NetworkBadge className="hidden lg:inline-flex" /><WalletButton /></>}
          </div>
        </div>
      </header>

      <main className="page-container ws-main">
        {LIVE_MODE && <LiveDataStatus />}
        {LIVE_MODE && <ClaimActivity />}
        {LIVE_MODE && <CreatePaymentActivity />}
        <Outlet key={live?.address || "public"} />
      </main>

      <footer className="border-t border-border bg-card py-4">
        <div className="page-container text-caption text-muted-foreground">
          {t(LIVE_MODE ? "live.footer" : "app.footer")}
        </div>
      </footer>

      {!LIVE_MODE && <><ScenarioPanel /><TxActivityDialog /><TxReceiptDialog /></>}
    </div>
  );
};
