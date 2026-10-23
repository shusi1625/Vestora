import { useTranslation } from "react-i18next";
import type { Claim } from "@/lib/types";
import { paymentPhase } from "@/lib/workspace-model";
import { Tag } from "./WorkspaceUI";

export function PaymentStatus({ claim, now }: { claim: Claim; now: Date }) {
  const { t } = useTranslation();
  const phase = paymentPhase(claim, now);
  return <Tag tone={phase === "cancelled" ? "negative" : phase === "streaming" ? "info" : "neutral"}>{t(`workspace.phase.${phase}`)}</Tag>;
}
