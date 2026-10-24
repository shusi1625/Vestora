import {useNavigate,useParams} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {useWorkspaceSnapshot} from "@/hooks/use-workspace-snapshot";
import {sameAddress} from "@/lib/workspace-model";
import {ClaimReviewDialog} from "@/components/workspace/ClaimReviewDialog";
import {WorkspaceDataState} from "@/components/workspace/WorkspaceDataState";
import {PageHeading} from "@/components/workspace/WorkspaceUI";
import {Button} from "@/components/ui/button";

export default function LiveClaimDetail({sell=false}:{sell?:boolean}){
  const {id}=useParams(),snapshot=useWorkspaceSnapshot(),navigate=useNavigate(),{t}=useTranslation();
  const claim=snapshot.claims.find(item=>item.id===id),listing=snapshot.listings.find(item=>item.claimId===id&&item.status==="active");
  const back=()=>navigate(claim&&sameAddress(claim.owner,snapshot.address)?"/assets":"/market",{replace:true});
  return <div className="ws-page"><PageHeading title={t(sell?"actions.market.list":"workspace.claimDetails")} action={<Button variant="outline" onClick={back}>{t("workspace.back")}</Button>}/><WorkspaceDataState condition={snapshot.scenario.dataCondition} onRetry={snapshot.refresh}>
    {claim?<ClaimReviewDialog key={`${id}:${sell}`} {...snapshot} claim={claim} listing={listing} mode={sell?"list":"detail"} onClose={back}/>:<p className="ws-empty" role="status">{t("actions.claimNotFound")}</p>}
  </WorkspaceDataState></div>;
}
