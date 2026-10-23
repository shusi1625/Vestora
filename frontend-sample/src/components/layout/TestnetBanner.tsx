import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";

/**
 * 테스트 환경 고지. 테스트 토큰과 실제 자산을 혼동하지 않도록 상시 노출합니다.
 */
export const TestnetBanner = () => {
  const { t } = useTranslation();

  return (
    <div className="border-b border-testnet-border bg-testnet-bg">
      <div className="page-container flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-testnet">
        <FlaskConical aria-hidden className="size-3.5 shrink-0" />
        <span className="text-caption font-semibold">{t("testnet.badge")}</span>
        <span className="text-caption">{t("testnet.body")}</span>
        <span className="text-caption text-testnet/80">{t("testnet.sampleData")}</span>
      </div>
    </div>
  );
};
