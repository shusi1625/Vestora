import {useRef,useState} from "react";
import {useTranslation} from "react-i18next";
import {Loader2,LogOut} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogDescription} from "@/components/ui/dialog";

type Props={account:string|null;onConfirm:(account:string)=>Promise<void>;onClose:()=>void;restoreFocus:()=>void};

/** Explicit site-permission revocation, separate from clearing a watched address. */
export function DisconnectWalletDialog({account,onConfirm,onClose,restoreFocus}:Props){
  const {t}=useTranslation();
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const inFlight=useRef(false),cancel=useRef<HTMLButtonElement>(null);
  const close=()=>{if(!inFlight.current){setError("");onClose();}};
  const confirm=async()=>{
    if(!account||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError("");
    try{await onConfirm(account);onClose();}
    catch(reason){setError(reason instanceof Error&&["live.disconnectUnsupported","live.disconnectRejected","live.disconnectFailed","live.disconnectUnverified","live.disconnectAccountChanged"].includes(reason.message)?reason.message:"live.disconnectFailed");}
    finally{inFlight.current=false;setBusy(false);}
  };
  return <Dialog open={Boolean(account)} onOpenChange={open=>{if(!open)close();}}><DialogContent role="alertdialog" className="ws-modal ws-disconnect-modal" aria-busy={busy} onOpenAutoFocus={event=>{event.preventDefault();cancel.current?.focus();}} onCloseAutoFocus={event=>{event.preventDefault();restoreFocus();}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}}} onEscapeKeyDown={event=>{if(inFlight.current)event.preventDefault();}}>
    <DialogTitle>{t("wallet.disconnectTitle")}</DialogTitle>
    <DialogDescription>{t("wallet.disconnectDescription")}</DialogDescription>
    <p className="ws-address ws-disconnect-account">{account}</p>
    <p className="ws-caption">{t("wallet.disconnectScope")}</p>
    <p className="ws-caption">{t("wallet.disconnectConsequences")}</p>
    {error&&<p className="ws-form-error" role="alert">{t(error)}</p>}
    <footer className="ws-disconnect-actions"><Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={close}>{t("wallet.keepConnection")}</Button><Button type="button" variant="destructive" disabled={busy} onClick={()=>void confirm()}>{busy?<Loader2 aria-hidden size={15} className="animate-spin"/>:<LogOut aria-hidden size={15}/>} {t(busy?"wallet.disconnecting":"wallet.disconnectConfirm")}</Button></footer>
  </DialogContent></Dialog>;
}
