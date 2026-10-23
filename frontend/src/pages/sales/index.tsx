import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { sameAddress } from "@/lib/workspace-model";
import { getClaimTotals } from "@/lib/claim-math";
import { formatDate } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { ClaimReviewDialog } from "@/components/workspace/ClaimReviewDialog";
import { DetailButton, EmptyRows, Figure, FilterTabs, Metric, PageHeading, Tag, WalletGate } from "@/components/workspace/WorkspaceUI";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";

export default function SalesPage() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot();
  const [filter, setFilter] = useState("active"), [target, setTarget] = useState<Listing | null>(null);
  const { address, claims, listings, now } = snapshot;
  const own = listings.filter(l => sameAddress(l.seller, address));
  const visible = own.filter(l => filter === "all" || l.status === filter);
  const active = own.filter(l => l.status === "active");
  const needsReview = active.filter(l => { const c = claims.find(c => c.id === l.claimId); return !c || c.ownership !== "verified" || Boolean(c.cancelledAt) || !sameAddress(c.owner, address) || getClaimTotals(c, now).totalUnclaimed.raw === 0n; }).length;
  return <div className="ws-page"><PageHeading title={t("workspace.salesTitle")} description={t("workspace.salesDescription")} action={<Button asChild><Link to="/assets">{t("workspace.chooseToSell")}<ArrowUpRight size={14} /></Link></Button>} onRefresh={snapshot.refresh} />
    <WalletGate address={address} connect={snapshot.connect}><WorkspaceDataState condition={snapshot.scenario.dataCondition} onRetry={snapshot.refresh}>
      <div className="ws-metric-strip"><Metric label={t("workspace.listed")}>{t("workspace.count", { count: active.length })}</Metric><Metric label={t("workspace.askingTotal")} note={t("workspace.askingNotIncome")}>{["MockUSDC", "mWETH"].map(token => { const items = active.filter(l => claims.find(c => c.id === l.claimId)?.token === token); return items.length ? <Figure key={token} raw={items.reduce((sum, l) => sum + l.priceRaw, 0n)} token={token as "MockUSDC" | "mWETH"} /> : null; })}</Metric><Metric label={t("workspace.needsReview")}>{t("workspace.count", { count: needsReview })}</Metric></div>
      <div className="ws-page-tools"><FilterTabs label={t("workspace.saleState")} options={["active", "sold", "unlisted", "void", "all"].map(value => ({ value, label: t(`workspace.sale.${value}`) }))} value={filter} onChange={setFilter} /><span className="ws-caption" aria-live="polite">{t("workspace.count", { count: visible.length })}</span></div>
      <table className="ws-table"><thead><tr>{["claim", "price", "unclaimed", "saleState", "closedAt", ""].map((key, i) => <th key={i}>{key ? t(`workspace.${key}`) : ""}</th>)}</tr></thead><tbody>{!visible.length && <EmptyRows columns={6} />}{visible.map(l => { const c = claims.find(c => c.id === l.claimId); return <tr key={l.id}><td data-label={t("workspace.claim")}><strong>#{l.claimId}</strong><small>{c?.token}</small></td><td data-label={t("workspace.price")}>{c ? <Figure raw={l.priceRaw} token={c.token} /> : t("workspace.unknown")}</td><td data-label={t("workspace.unclaimed")}>{c && l.status === "active" ? <Figure raw={getClaimTotals(c, now).totalUnclaimed.raw} token={c.token} /> : "—"}</td><td data-label={t("workspace.saleState")}><Tag tone={l.status === "active" ? "info" : l.status === "sold" ? "positive" : l.status === "void" ? "negative" : "neutral"}>{t(`workspace.sale.${l.status}`)}</Tag></td><td data-label={t("workspace.closedAt")}>{l.closedAt ? formatDate(l.closedAt) : "—"}</td><td><DetailButton onClick={() => setTarget(l)} /></td></tr>; })}</tbody></table>
      <p className="ws-notice neutral">{t("workspace.unlistNotCancel")}</p>
      {target && <ClaimReviewDialog {...snapshot} claim={claims.find(c => c.id === target.claimId) || null} listing={target} mode={target.status === "active" ? "unlist" : "detail"} onClose={() => setTarget(null)} />}
    </WorkspaceDataState></WalletGate></div>;
}
