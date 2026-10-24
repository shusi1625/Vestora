import {useState,type ReactNode} from "react";
import {useTranslation} from "react-i18next";
import {ExternalLink,Loader2,RefreshCw} from "lucide-react";
import {Button} from "@/components/ui/button";
import {canDismissTransactionNotice} from "@/lib/notice-policy";
import {DismissibleNotice} from "./DismissibleNotice";

type Props={title:string;account:string;phase:string;id?:string;hash?:string;hasEvidence:boolean;pending:boolean;error?:string;warning?:string;children?:ReactNode;onResume:()=>Promise<void>;onRecover:(hash:string)=>Promise<void>};

export function TransactionProgress({title,account,phase,id,hash,hasEvidence,pending,error,warning,children,onResume,onRecover}:Props){
  const {t}=useTranslation(),[recoveryHash,setRecoveryHash]=useState("");
  return <DismissibleNotice noticeKey={`${account}:${title}:${id||""}:${phase}:${hash||""}:${error||""}:${warning||""}`} dismissible={canDismissTransactionNotice(phase,hasEvidence)} closeLabel={t("actions.closeNotice")} className={`claim-progress claim-${phase}`}>
    <div className="claim-phase-heading">{["checking","wallet","submitted"].includes(phase)&&<Loader2 aria-hidden size={15} className="animate-spin"/>}<strong>{title} · {t(`actions.phase.${phase}`)}{id?` · #${id}`:""}</strong></div>
    <p>{t(`actions.body.${phase}`)}</p>
    {children}
    {error&&<p className="ws-form-error" role="alert">{t(error)}</p>}
    {warning&&<p className="ws-text-warning">{t(warning)}</p>}
    {hash&&<a className="ws-inline-action ws-address" href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden size={13}/>{hash.slice(0,12)}…{hash.slice(-8)}</a>}
    {pending&&hash&&["unknown","indexing"].includes(phase)&&<Button type="button" size="sm" variant="outline" onClick={()=>void onResume()}><RefreshCw aria-hidden size={13}/>{t("claim.resume")}</Button>}
    {pending&&!hash&&phase==="unknown"&&<form className="ws-form" onSubmit={event=>{event.preventDefault();void onRecover(recoveryHash.trim());}}><label>{t("actions.recoveryHash")}<input value={recoveryHash} onChange={event=>setRecoveryHash(event.target.value)} minLength={66} maxLength={66} placeholder="0x…" required autoComplete="off"/></label><Button type="submit" size="sm" variant="outline">{t("claim.recover")}</Button></form>}
  </DismissibleNotice>;
}
