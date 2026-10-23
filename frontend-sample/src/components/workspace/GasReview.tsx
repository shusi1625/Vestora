import {useTranslation} from "react-i18next";
import {formatEther,formatGwei} from "viem";
import type {GasEstimate} from "@/lib/transaction-safety";

export function GasReview({estimate}:{estimate?:GasEstimate}){
  const {t}=useTranslation();
  return <div className="space-y-2">
    {estimate&&<dl>
      <div className="ws-field-row"><dt>{t("claim.gasEstimateLabel")}</dt><dd className="figure break-all">{formatEther(estimate.maximumCost)} Sepolia ETH</dd></div>
      <div className="ws-field-row"><dt>{t("claim.gasLimitLabel")}</dt><dd className="figure break-all">{estimate.gasLimit.toLocaleString("ko-KR")} gas</dd></div>
      <div className="ws-field-row"><dt>{t("claim.gasFeeLabel")}</dt><dd className="figure break-all">{formatGwei(estimate.maxFeePerGas)} Gwei</dd></div>
      <div className="ws-field-row"><dt>{t("wallet.gasBalance")}</dt><dd className="figure break-all">{formatEther(estimate.balance)} Sepolia ETH</dd></div>
    </dl>}
    <p role="status" className="ws-caption text-warning">{t("claim.walletGasUnquoted")}</p>
    <p className="ws-caption">{t("claim.gasEstimateNotice")}</p>
  </div>;
}
