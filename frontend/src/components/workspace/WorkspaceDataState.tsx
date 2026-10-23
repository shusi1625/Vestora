import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DataCondition } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {useLiveWorkspace} from "@/providers/live-context";
import {DismissibleNotice} from "./DismissibleNotice";

export function WorkspaceDataState({ condition, onRetry, children }: { condition: DataCondition; onRetry: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const live=useLiveWorkspace();
  if (condition === "failure") return <div className="ws-empty" role="alert"><p>{t("workspace.loadError")}</p><Button variant="outline" onClick={onRetry}>{t("workspace.refresh")}</Button></div>;
  if (condition === "loading") return <div className="ws-loading" role="status">{t("workspace.loading")}</div>;
  return <>{condition !== "normal" && <DismissibleNotice noticeKey={`data:${live?.address||"public"}:${condition}`} dismissible={Boolean(live)&&["stale","pending-index"].includes(condition)} closeLabel={t("notice.closeData")} className="ws-notice"><p>{t(`workspace.data.${condition}`)}</p></DismissibleNotice>}{children}</>;
}
