import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceSnapshot } from "@/hooks/use-workspace-snapshot";
import { getClaimTotals } from "@/lib/claim-math";
import { activeListing, acquisitionFor, portfolioForToken, sameAddress, paymentPhase } from "@/lib/workspace-model";
import type { Claim } from "@/lib/types";
import { ClaimReviewDialog } from "@/components/workspace/ClaimReviewDialog";
import { PaymentStatus } from "@/components/workspace/PaymentStatus";
import { DetailButton, EmptyRows, Figure, FilterTabs, PageHeading, Tag, WalletGate } from "@/components/workspace/WorkspaceUI";
import { WorkspaceDataState } from "@/components/workspace/WorkspaceDataState";
import { AssetComposition } from "./AssetComposition";
import { runUiAction, useUiMeasurement } from "@/lib/ui-measurement";
import { Button } from "@/components/ui/button";
import { Coins } from "lucide-react";
import { MintTokenDialog } from "@/components/workspace/MintTokenAction";

export default function WorkspaceAssets() {
  const { t } = useTranslation(), snapshot = useWorkspaceSnapshot();
  const [token, setToken] = useState<"MockUSDC" | "mWETH">("MockUSDC"), [filter, setFilter] = useState("all");
  const [target, setTarget] = useState<Claim | null>(null);
  const [mintOpen,setMintOpen]=useState(false);
  const changeToken=(value:typeof token)=>runUiAction({action:"assets.token",surface:"assets",expectedStateKey:JSON.stringify([value,filter,target?.id??null])},()=>setToken(value));
  const changeFilter=(value:string)=>runUiAction({action:"assets.filter",surface:"assets",expectedStateKey:JSON.stringify([token,value,target?.id??null])},()=>setFilter(value));
  const changeTarget=(value:Claim|null)=>runUiAction({action:`assets.detail.${value?"open":"close"}`,surface:"assets",expectedStateKey:JSON.stringify([token,filter,value?.id??null])},()=>setTarget(value));
  const { claims, records, listings, address, balances, now, accountKey, scenario } = snapshot;
  const portfolio = portfolioForToken(claims, balances, address, token, now);
  const owned = (scenario.screens.assets === "empty" ? [] : portfolio.owned).filter(c => filter === "all" || filter === "listed" && Boolean(activeListing(listings, c.id)) || filter === "claimable" && getClaimTotals(c, now).claimableNow.raw > 0n || ["scheduled", "completed"].includes(filter) && paymentPhase(c, now) === filter);
  useUiMeasurement({data:claims,surface:"assets",stateKey:JSON.stringify([token,filter,target?.id??null]),rowCount:owned.length,condition:scenario.dataCondition});
  return <div className="ws-page"><PageHeading title={t("assets.title")} description={t("workspace.assetsDescription")} action={snapshot.source==="live"?<Button variant="outline" onClick={()=>setMintOpen(true)}><Coins aria-hidden size={15}/>{t("mint.title")}</Button>:undefined} onRefresh={snapshot.refresh} /><WalletGate address={address} connect={snapshot.connect}>
    <WorkspaceDataState condition={scenario.screens.assets === "first-load" ? "loading" : scenario.dataCondition} onRetry={snapshot.refresh}>
      <FilterTabs<"MockUSDC" | "mWETH"> label={t("workspace.token")} options={snapshot.paymentTokens.map(value=>({value,label:value}))} value={token} onChange={changeToken} />
      {portfolio.unverified && <p className="ws-notice">{t(snapshot.source === "live" ? "live.ownerProjected" : "workspace.ownershipUnknown")}</p>}
      {snapshot.balancesReady ? <section className="ws-asset-summary"><div><p className="ws-label">{t("workspace.holdingsTotal")}<Tag>{t("workspace.nominal")}</Tag></p><Figure large raw={portfolio.total} token={token} /><p className="ws-caption">{t("workspace.holdingsBasis")}</p>{snapshot.source === "live" && <p className="ws-caption">{t("live.balanceAt")}</p>}</div><AssetComposition key={`${address}-${token}`} portfolio={portfolio} token={token} /></section> : <section className="ws-asset-summary"><p className="ws-caption">{t("live.balanceUnavailable")}</p></section>}
      <div className="ws-section-heading"><h2>{t("workspace.ownedClaims")} <small>{t("workspace.count", { count: owned.length })}</small></h2><FilterTabs label={t("workspace.ownedClaims")} options={[{ value: "all", label: t("workspace.all") }, { value: "claimable", label: t("workspace.claimableFilter") }, { value: "scheduled", label: t("workspace.phase.scheduled") }, { value: "completed", label: t("workspace.phase.completed") }, { value: "listed", label: t("workspace.listed") }]} value={filter} onChange={changeFilter} /></div>
      <table className="ws-table"><thead><tr>{["claimAcquisition", "myPrice", "myReceived", "claimable", "unclaimed", "paymentState", ""].map((key, i) => <th key={i}>{key ? t(`workspace.${key}`) : ""}</th>)}</tr></thead><tbody>{!owned.length && <EmptyRows columns={7} />}{owned.map(claim => {
        const totals = getClaimTotals(claim, now), acquisition = acquisitionFor(claim, records, accountKey, snapshot.historyReady), listing = activeListing(listings, claim.id);
        return <tr key={claim.id}><td data-label={t("workspace.claimAcquisition")}><strong>#{claim.id}</strong><small>{t(`workspace.${acquisition.label}`)}</small></td>
          <td data-label={t("workspace.myPrice")}>{!snapshot.historyReady ? t("workspace.unknown") : acquisition.purchase ? <Figure raw={acquisition.purchase.amountRaw} token={acquisition.purchase.token} /> : <span className="ws-caption">{t(sameAddress(claim.originalRecipient, address) ? "workspace.noPurchase" : "workspace.unknown")}</span>}</td>
          <td data-label={t("workspace.myReceived")}>{snapshot.historyReady ? <Figure raw={acquisition.received} token={claim.token} /> : t("workspace.unknown")}</td><td data-label={t("workspace.claimable")}><Figure raw={totals.claimableNow.raw} token={claim.token} /></td><td data-label={t("workspace.unclaimed")}><Figure raw={totals.totalUnclaimed.raw} token={claim.token} /></td>
          <td data-label={t("workspace.paymentState")}><div className="ws-status-stack"><PaymentStatus claim={claim} now={now} /><Tag tone={listing ? "info" : "neutral"}>{t(listing ? "workspace.listed" : "workspace.unlisted")}</Tag></div></td><td><DetailButton onClick={() => changeTarget(claim)} /></td></tr>;
      })}</tbody></table><p className="ws-caption ws-bottom-note">{t("workspace.noDoubleCount")}</p>
    </WorkspaceDataState>{target && <ClaimReviewDialog {...snapshot} claim={target} listing={activeListing(listings, target.id)} onClose={() => changeTarget(null)} />}
    </WalletGate>{snapshot.source==="live"&&<MintTokenDialog open={mintOpen} onClose={()=>setMintOpen(false)}/>}</div>;
}
