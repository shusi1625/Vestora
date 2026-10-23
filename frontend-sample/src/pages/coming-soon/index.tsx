import { useTranslation } from "react-i18next";
import { HardHat } from "lucide-react";

import { InlineNotice } from "@/components/common/InlineNotice";

export type ComingSoonScreen =
  | "mySales"
  | "paymentCreate"
  | "paymentIssued"
  | "transactions";

const SCREEN_CONTENT: Record<
  ComingSoonScreen,
  { titleKey: string; bodyKey: string; plansKey: string[] }
> = {
  mySales: {
    titleKey: "comingSoon.mySales.title",
    bodyKey: "comingSoon.mySales.body",
    plansKey: [
      "comingSoon.mySales.plan1",
      "comingSoon.mySales.plan2",
      "comingSoon.mySales.plan3",
      "comingSoon.mySales.plan4",
    ],
  },
  paymentCreate: {
    titleKey: "comingSoon.paymentCreate.title",
    bodyKey: "comingSoon.paymentCreate.body",
    plansKey: [
      "comingSoon.paymentCreate.plan1",
      "comingSoon.paymentCreate.plan2",
      "comingSoon.paymentCreate.plan3",
      "comingSoon.paymentCreate.plan4",
    ],
  },
  paymentIssued: {
    titleKey: "comingSoon.paymentIssued.title",
    bodyKey: "comingSoon.paymentIssued.body",
    plansKey: [
      "comingSoon.paymentIssued.plan1",
      "comingSoon.paymentIssued.plan2",
      "comingSoon.paymentIssued.plan3",
    ],
  },
  transactions: {
    titleKey: "comingSoon.transactions.title",
    bodyKey: "comingSoon.transactions.body",
    plansKey: [
      "comingSoon.transactions.plan1",
      "comingSoon.transactions.plan2",
      "comingSoon.transactions.plan3",
    ],
  },
};

/** 아직 구현하지 않은 화면. 무엇이 제공될지 미리 안내합니다. */
const ComingSoonPage = ({ screen }: { screen: ComingSoonScreen }) => {
  const { t } = useTranslation();
  const content = SCREEN_CONTENT[screen];

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-10">
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-scheduled-border bg-scheduled-bg px-2.5 py-1 text-caption font-medium text-scheduled">
          <HardHat aria-hidden className="size-3.5" />
          {t("comingSoon.badge")}
        </p>
        <h1 className="text-2xl font-bold">{t(content.titleKey)}</h1>
        <p className="text-[15px] text-muted-foreground">{t(content.bodyKey)}</p>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-4 shadow-card">
        <p className="mb-2 text-body-sm font-semibold">{t("comingSoon.plannedTitle")}</p>
        <ul className="space-y-1.5">
          {content.plansKey.map((key) => (
            <li key={key} className="flex gap-2 text-body-sm text-muted-foreground">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {t(key)}
            </li>
          ))}
        </ul>
      </div>

      <InlineNotice tone="muted">{t("comingSoon.scopeNote")}</InlineNotice>
    </div>
  );
};

export default ComingSoonPage;
