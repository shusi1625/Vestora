import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { LayoutGrid, List, CalendarDays, ShieldCheck, TriangleAlert, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getClaimTotals, getListingMetrics } from "@/lib/claim-math";
import { formatDate, formatPercent } from "@/lib/format";
import { sameAddress } from "@/lib/workspace-model";
import { ClaimReviewDialog } from "@/components/workspace/ClaimReviewDialog";
import { PaymentStatus } from "@/components/workspace/PaymentStatus";
import { DetailButton, Figure, PageHeading, Tag } from "@/components/workspace/WorkspaceUI";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";
import { runUiAction, useUiMeasurement } from "@/lib/ui-measurement";
import { ClaimLookup } from "@/components/workspace/ClaimLookup";

const PAGE_SIZE = 40;

export default function WorkspaceMarket() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot();
  const [params, setParams] = useSearchParams(), location = useLocation(), navigate = useNavigate();
  const read = (key: string, allowed: string[], fallback: string) => { const value = params.get(key); return value && allowed.includes(value) ? value : fallback; };
  const token = read("token", ["all", ...snapshot.paymentTokens], "all"), cancel = read("cancel", ["all", "yes", "no"], "all"), phase = read("phase", ["all", "streaming", "completed", "cancelled"], "all"), view = read("view", ["cards", "table"], "cards");
  const requestedSort = read("sort", ["review", "end", "price", "unclaimed"], "review"), sort = token === "all" && ["price", "unclaimed"].includes(requestedSort) ? "review" : requestedSort;
  const update = (patch: Record<string, string>) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([key, value]) => next.set(key, value)); if (!("view" in patch)) next.delete("page"); runUiAction({action:`market.${Object.keys(patch)[0]}`,surface:"market",expectedStateKey:next.toString()},()=>setParams(next, { replace: true })); };
  const hasFilters = token !== "all" || cancel !== "all" || phase !== "all" || sort !== "review";
  const resetFilters = () => { const next = new URLSearchParams(params); ["token", "cancel", "phase", "sort", "page"].forEach(key => next.delete(key)); runUiAction({action:"market.reset",surface:"market",expectedStateKey:next.toString()},()=>setParams(next, { replace: true })); };
  const { claims, listings, now, address, canTransact, scenario, refresh } = snapshot;
  const source = snapshot.source, empty = scenario.screens.market === "empty";
  const claimsById = useMemo(() => {
    const index = new Map<string, typeof claims[number]>();
    // Preserve Array.find's first-match behavior even for a duplicate ID.
    for (const claim of claims) if (!index.has(claim.id)) index.set(claim.id, claim);
    return index;
  }, [claims]);
  const allRows = useMemo(() => (empty ? [] : listings).filter(l => l.status === "active").flatMap(listing => {
    const claim = claimsById.get(listing.claimId);
    if (!claim) return [];
    const totals = getClaimTotals(claim, now), metrics = getListingMetrics(claim, listing, now, totals);
    const blocked = sameAddress(listing.seller, address) ? "workspace.ownListing" : totals.totalUnclaimed.raw === 0n ? "workspace.noRemaining" : !sameAddress(listing.seller, claim.owner) || source!=="live"&&claim.ownership !== "verified" ? "workspace.ownershipBlocked" : source!=="live"&&claim.cancelledAt ? "market.card.blocked.cancelled" : !canTransact ? "workspace.connectToExecute" : "";
    return [{ listing, claim, totals, metrics, blocked }];
  }), [empty, listings, claimsById, now, address, source, canTransact]);
  const rows = useMemo(() => {
    const filtered = allRows.filter(r => (token === "all" || r.claim.token === token) && (cancel === "all" || r.claim.cancellable === (cancel === "yes")) && (phase === "all" || r.totals.paymentStatus === phase));
    return filtered.sort((a, b) => sort === "end" ? Date.parse(a.claim.endAt) - Date.parse(b.claim.endAt) : sort === "unclaimed" && token !== "all" ? (a.totals.totalUnclaimed.raw > b.totals.totalUnclaimed.raw ? -1 : a.totals.totalUnclaimed.raw < b.totals.totalUnclaimed.raw ? 1 : 0) : sort === "price" && token !== "all" ? (a.listing.priceRaw < b.listing.priceRaw ? -1 : a.listing.priceRaw > b.listing.priceRaw ? 1 : 0) : Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)));
  }, [allRows, token, cancel, phase, sort]);
  const pageParam = params.get("page"), parsedPage = Number(pageParam);
  const requestedPage = pageParam && /^\d+$/.test(pageParam) && Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), page = Math.min(requestedPage, pageCount);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const resultsRef = useRef<HTMLDivElement>(null), focusResults = useRef(false);
  const condition=scenario.screens.market==="first-load"?"loading":scenario.dataCondition;
  useEffect(() => {
    // Do not discard a deep-linked page while its data is still unavailable.
    if (pageParam !== null && condition !== "loading" && condition !== "failure" && pageParam !== String(page)) {
      const next = new URLSearchParams(params); next.set("page", String(page));
      setParams(next, { replace: true, state: location.state });
    }
  }, [pageParam, page, condition, params, setParams, location.state]);
  useEffect(() => {
    if (focusResults.current) { focusResults.current = false; resultsRef.current?.focus(); }
  }, [page]);
  const changePage = (nextPage: number) => {
    if (nextPage < 1 || nextPage > pageCount || nextPage === page) return;
    const next = new URLSearchParams(params); next.set("page", String(nextPage));
    runUiAction({ action: "market.page", surface: "market", expectedStateKey: next.toString() }, () => {
      focusResults.current = true; setParams(next);
    });
  };
  const selected = rows.find(row => row.claim.id === params.get("claim"));
  const target = selected ? { claim: selected.claim, listing: selected.listing, mode: params.get("intent") === "buy" && !selected.blocked ? "buy" as const : "detail" as const } : null;
  const open = (row: typeof rows[number], mode: "detail" | "buy") => {
    const next = new URLSearchParams(params); next.set("claim", row.claim.id);
    if (mode === "buy") next.set("intent", mode); else next.delete("intent");
    runUiAction({action:`market.${mode}.open`,surface:"market",expectedStateKey:next.toString()},()=>setParams(next, { state: { vestoraMarketModal: true } }));
  };
  const close = () => {
    const next = new URLSearchParams(params); next.delete("claim"); next.delete("intent");
    runUiAction({action:"market.detail.close",surface:"market",expectedStateKey:next.toString()},()=>{
      if (location.state?.vestoraMarketModal === true) { navigate(-1); return; }
      setParams(next, { replace: true });
    });
  };
  useUiMeasurement({data:claims,surface:"market",stateKey:params.toString(),rowCount:rows.length,condition});
  return <div className="ws-page"><PageHeading title={t("market.title")} description={t("market.description")} action={source==="live"?<ClaimLookup/>:undefined} onRefresh={refresh} />
    <div className="ws-toolbar"><label>{t("workspace.token")}<select value={token} onChange={e => update({ token: e.target.value, ...(e.target.value === "all" && ["price", "unclaimed"].includes(sort) ? { sort: "review" } : {}) })}><option value="all">{t("workspace.allTokens")}</option>{snapshot.paymentTokens.map(token=><option key={token}>{token}</option>)}</select></label>
      <label>{t("workspace.cancellation")}<select value={cancel} onChange={e => update({ cancel: e.target.value })}><option value="all">{t("workspace.all")}</option><option value="yes">{t("workspace.cancelable")}</option><option value="no">{t("workspace.nonCancelable")}</option></select></label>
      <label>{t("workspace.paymentState")}<select value={phase} onChange={e => update({ phase: e.target.value })}><option value="all">{t("workspace.all")}</option><option value="streaming">{t("workspace.phase.streaming")}</option><option value="completed">{t("workspace.phase.completed")}</option><option value="cancelled">{t("workspace.phase.cancelled")}</option></select></label>
      <div className="ws-toolbar-end"><label>{t("workspace.sort")}<select value={sort} onChange={e => update({ sort: e.target.value })}><option value="review">{t("workspace.reviewFirst")}</option><option value="end">{t("workspace.endFirst")}</option><option value="price" disabled={token === "all"}>{t(token === "all" ? "workspace.selectTokenForPrice" : "workspace.priceFirst")}</option><option value="unclaimed" disabled={token === "all"}>{t(token === "all" ? "workspace.selectTokenForUnclaimed" : "market.sort.unclaimedDesc")}</option></select></label><Button variant="outline" size="icon" aria-label={t("market.resetFilters")} title={t("market.resetFilters")} disabled={!hasFilters} onClick={resetFilters}><RotateCcw size={15}/></Button><div className="ws-view-toggle">{["cards", "table"].map(v => <button key={v} aria-pressed={v === view} aria-label={t(`workspace.view.${v}`)} title={t(`workspace.view.${v}`)} onClick={() => update({ view: v })}>{v === "cards" ? <LayoutGrid /> : <List />}</button>)}</div></div>
    </div><div className="ws-list-meta"><span aria-live="polite">{condition==="failure"?t("workspace.countUnavailable"):condition==="loading"?t("workspace.countLoading"):t("workspace.count", { count: rows.length })}</span><span>{t("workspace.includedClaimable")}</span></div>
    <WorkspaceDataState condition={condition} onRetry={refresh}>
      <div ref={resultsRef} tabIndex={-1} aria-label={t("workspace.marketResults")}>
      {!rows.length ? <div className="ws-empty">{t(allRows.length ? "workspace.marketFilteredEmpty" : "workspace.marketEmpty")}</div> : view === "cards" ? <div className="ws-market-grid">{pageRows.map(row => <article className="ws-listing" key={row.listing.id} data-claim-id={row.claim.id}>
        <header><h2>{t("common.claimId", { id: row.claim.id })}<small>{row.claim.token}</small></h2><PaymentStatus claim={row.claim} now={now} /></header>
        <div className="ws-listing-price"><div><p className="ws-label">{t("workspace.price")}</p><Figure large raw={row.listing.priceRaw} token={row.claim.token} /></div>{row.metrics.discountRate !== null && row.metrics.discountRate > 0 ? <Tag tone="positive">{t("workspace.discount", { rate: formatPercent(row.metrics.discountRate) })}</Tag> : <Tag tone="warning">{t(row.totals.totalUnclaimed.raw === 0n ? "workspace.zeroRights" : "workspace.overprice")}</Tag>}</div>
        <dl className="ws-listing-metrics"><div><dt>{t("workspace.unclaimed")}</dt><dd><Figure raw={row.totals.totalUnclaimed.raw} token={row.claim.token} /></dd></div><div><dt>{t("workspace.claimable")}</dt><dd><Figure raw={row.totals.claimableNow.raw} token={row.claim.token} /></dd></div></dl>
        <dl className="ws-listing-difference"><div><dt>{t("workspace.difference")}</dt><dd><Figure raw={row.metrics.expectedProfit.raw} token={row.claim.token} /></dd></div></dl><p className="ws-caption ws-listing-basis">{t("workspace.profitBasis")}</p>
        <div className="ws-listing-conditions"><p><CalendarDays />{t("workspace.endsAt")} {formatDate(row.claim.endAt)}</p><p className={row.claim.cancellable ? "ws-text-warning" : ""}>{row.claim.cancellable ? <TriangleAlert /> : <ShieldCheck />}{t(row.claim.cancellable ? "workspace.cancelable" : "workspace.nonCancelable")}</p></div>
        <div className="ws-listing-actions"><DetailButton onClick={() => open(row, "detail")} /><Button disabled={Boolean(row.blocked)} onClick={() => open(row, "buy")}>{t("workspace.buyReview")}</Button></div><p className="ws-blocked">{row.blocked ? t(row.blocked) : row.claim.cancellable ? t("workspace.cancelRisk") : ""}</p>
      </article>)}</div> : <table className="ws-table"><thead><tr>{["claim", "price", "unclaimed", "claimable", "paymentState", ""].map((h, i) => <th key={i}>{h ? t(`workspace.${h}`) : ""}</th>)}</tr></thead><tbody>{pageRows.map(row => <tr key={row.listing.id} data-claim-id={row.claim.id}><td data-label={t("workspace.claim")}>#{row.claim.id}<small>{row.claim.token}</small></td><td data-label={t("workspace.price")}><Figure raw={row.listing.priceRaw} token={row.claim.token} /></td><td data-label={t("workspace.unclaimed")}><Figure raw={row.totals.totalUnclaimed.raw} token={row.claim.token} /></td><td data-label={t("workspace.claimable")}><Figure raw={row.totals.claimableNow.raw} token={row.claim.token} /></td><td data-label={t("workspace.paymentState")}><PaymentStatus claim={row.claim} now={now} /></td><td><DetailButton onClick={() => open(row, "detail")} /></td></tr>)}</tbody></table>}
      </div>
      {rows.length > PAGE_SIZE && <nav className="ws-pagination" aria-label={t("workspace.pagination")}>
        <span>{t("workspace.pageRange", { start: (page - 1) * PAGE_SIZE + 1, end: Math.min(page * PAGE_SIZE, rows.length), count: rows.length })}</span>
        <div><Button type="button" variant="outline" size="icon" aria-label={t("workspace.previousPage")} title={t("workspace.previousPage")} disabled={page === 1} onClick={() => changePage(page - 1)}><ChevronLeft size={16} aria-hidden /></Button>
          <span aria-current="page" aria-live="polite">{t("workspace.pageNumber", { page, count: pageCount })}</span>
          <Button type="button" variant="outline" size="icon" aria-label={t("workspace.nextPage")} title={t("workspace.nextPage")} disabled={page === pageCount} onClick={() => changePage(page + 1)}><ChevronRight size={16} aria-hidden /></Button></div>
      </nav>}
    </WorkspaceDataState>{target && <ClaimReviewDialog {...snapshot} {...target} onClose={close} />}
  </div>;
}
