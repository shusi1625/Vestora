import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {Search} from "lucide-react";
import {Button} from "@/components/ui/button";

export function ClaimLookup(){
  const [id,setId]=useState(""),navigate=useNavigate(),{t}=useTranslation();
  return <form className="flex items-center gap-2" onSubmit={event=>{event.preventDefault();if(/^[1-9]\d*$/.test(id))navigate(`/claims/${id}`);}}><label className="sr-only" htmlFor="claim-lookup-id">{t("actions.lookupId")}</label><input id="claim-lookup-id" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" value={id} onChange={event=>setId(event.target.value)} inputMode="numeric" pattern="[1-9][0-9]*" maxLength={78} required placeholder={t("actions.lookupId")}/><Button type="submit" size="icon" variant="outline" aria-label={t("actions.lookup")} title={t("actions.lookup")}><Search aria-hidden size={16}/></Button></form>;
}
