import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, LogOut, UsersRound } from "lucide-react";
import { useLiveWorkspace } from "@/providers/live-context";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortenAddress } from "@/lib/format";
import { DisconnectWalletDialog } from "./DisconnectWalletDialog";

export function LiveConnection() {
  const live=useLiveWorkspace(), {t}=useTranslation();
  const [open,setOpen]=useState(false),[value,setValue]=useState(""),[invalid,setInvalid]=useState(false);
  const [disconnectTarget,setDisconnectTarget]=useState<string|null>(null);
  const lookup=useRef<HTMLButtonElement>(null);
  if(!live)return null;
  return <><span className={`ws-tag ${live.connectedAddress && live.chainId!=="0xaa36a7"?"ws-warning":"ws-info"}`}>{t(live.connectedAddress && live.chainId!=="0xaa36a7"?"live.wrongChain":"network.sepolia")}</span>
    {(!live.connectedAddress||live.walletState==="connecting") && <Button size="sm" onClick={live.connect} disabled={live.walletState==="connecting"}>{t(live.walletState==="connecting"?"wallet.connecting":"wallet.connect")}</Button>}
    {live.connectedAddress&&live.walletState!=="connecting"&&<Button size="sm" variant="outline" onClick={live.connect} title={t("live.selectWalletAccount")}><UsersRound aria-hidden size={14}/>{t("live.changeWalletAccount")}</Button>}
    {live.connectedAddress&&live.chainId!=="0xaa36a7"&&<Button size="sm" variant="outline" disabled={live.switchingChain} onClick={()=>void live.switchChain()}>{t("claim.switchNetwork")}</Button>}
    <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button ref={lookup} size="sm" variant="outline" aria-label={t("live.addressLookup")} title={t("live.addressLookup")}><Search size={14}/>{live.address?shortenAddress(live.address):t("live.addressLookup")}</Button></PopoverTrigger><PopoverContent align="end" className="live-connection" onCloseAutoFocus={event=>{if(disconnectTarget)event.preventDefault();}}><h3>{t("live.addressLookup")}</h3><form className="ws-form" onSubmit={event=>{event.preventDefault();const valid=live.watchAddress(value.trim());setInvalid(!valid);if(valid)setOpen(false);}}><label>{t("live.lookupAddress")}<input value={value} onChange={e=>setValue(e.target.value)} autoComplete="off" placeholder="0x…" required/></label>{invalid&&<p className="ws-form-error" role="alert">{t("live.invalidAddress")}</p>}<Button type="submit">{t("live.lookup")}</Button></form>{live.address&&<div className="ws-detail-section"><p className="ws-caption ws-address">{live.address}</p><p className="ws-caption">{t(live.connectedAddress?"live.connected":"live.watching")}</p><Button variant="ghost" size="sm" onClick={()=>{if(live.connectedAddress){setDisconnectTarget(live.connectedAddress);setOpen(false);}else{live.disconnect();setOpen(false);}}}><LogOut size={14}/>{t(live.connectedAddress?"wallet.disconnect":"live.endLookup")}</Button></div>}</PopoverContent></Popover>
    <DisconnectWalletDialog account={disconnectTarget} onConfirm={live.revokeConnection} onClose={()=>setDisconnectTarget(null)} restoreFocus={()=>lookup.current?.focus({preventScroll:true})}/>
  </>;
}

export function LiveDataStatus() {
  const live=useLiveWorkspace(),{t}=useTranslation();
  if(!live)return null;
  const condition=live.scenario.dataCondition;
  return <div className="live-data-status" aria-live="polite"><div><strong>{t("live.readOnly")}</strong><span>{live.projection?t("live.projectionAt",{time:live.now.toLocaleString("ko-KR"),block:live.projection.latestProjectedBlock}):t(condition==="failure"?"workspace.loadError":"live.loading")}</span>{["stale","pending-index"].includes(condition)&&<span className="ws-tag ws-warning">{t(condition==="stale"?"notice.staleBadge":"notice.syncBadge")}</span>}</div>
    {live.walletError&&<p className="ws-form-error">{t(live.walletError)}</p>}
    {live.address&&!live.connectedAddress&&<p>{t("live.watching")}</p>}
    {live.unsupported>0&&<p className="ws-text-warning">{t("live.unsupportedTokens",{count:live.unsupported})}</p>}
    {live.address&&live.projection&&!live.balancesReady&&<p className="ws-text-warning">{t("live.balanceUnavailable")}</p>}
    {live.address&&live.projection&&!live.historyReady&&<p className="ws-text-warning">{t("live.historyUnavailable")}</p>}
  </div>;
}
