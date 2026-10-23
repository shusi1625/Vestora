import {useState,type ReactNode} from "react";
import {X} from "lucide-react";
import {Button} from "@/components/ui/button";

/** Hides only this rendered notice, never its transaction or polling state. */
export function DismissibleNotice({noticeKey,dismissible=false,closeLabel,className="",children}:{noticeKey:string;dismissible?:boolean;closeLabel:string;className?:string;children:ReactNode}){
  const [dismissed,setDismissed]=useState<string|null>(null);
  if(dismissible&&dismissed===noticeKey)return null;
  return <section className={`ws-dismissible ${className}`} role="status" aria-live="polite">
    {dismissible&&<Button className="ws-notice-close" type="button" variant="ghost" size="icon" aria-label={closeLabel} title={closeLabel} onClick={()=>setDismissed(noticeKey)}><X size={16} aria-hidden="true"/></Button>}
    {children}
  </section>;
}
