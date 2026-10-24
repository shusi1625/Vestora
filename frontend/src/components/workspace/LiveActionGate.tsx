import type {ReactNode} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/ui/button";
import {useLiveWorkspace} from "@/providers/live-context";

export function LiveActionGate({children}:{children:ReactNode}){
  const live=useLiveWorkspace(),{t}=useTranslation();if(!live)return null;
  if(!live.connectedAddress)return <footer className="ws-review-footer"><span>{t("claim.walletRequired")}</span><Button onClick={live.connect}>{t("wallet.connect")}</Button></footer>;
  if(live.chainId!=="0xaa36a7")return <footer className="ws-review-footer"><span>{t("claim.network")}</span><Button disabled={live.switchingChain} onClick={()=>void live.switchChain()}>{t("claim.switchNetwork")}</Button></footer>;
  return <>{children}</>;
}
