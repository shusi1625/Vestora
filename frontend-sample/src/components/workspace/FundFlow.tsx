import { useTranslation } from "react-i18next";
import type { Claim } from "@/lib/types";
import { issuedAmounts } from "@/lib/workspace-model";
import { formatUnits } from "@/lib/format";

export function FundFlow({ claim, now }: { claim: Claim; now: Date }) {
  const { t } = useTranslation();
  const values = issuedAmounts(claim, now);
  const parts = (["claimed", "claimable", "future", "returned"] as const).map(key => ({ key, value: values[key] }));
  return <div className="ws-fund-composition"><div className="ws-fund-bar" role="img" aria-label={parts.map(p => `${t(`workspace.fund.${p.key}`)} ${formatUnits(p.value, claim.token)} ${claim.token}`).join(", ")}>
    {parts.map(p => <span key={p.key} className={`ws-series-${p.key}`} style={{ width: `${values.deposited > 0n ? Number(p.value * 10000n / values.deposited) / 100 : 0}%` }} />)}
  </div><dl className="ws-fund-legend">{parts.map(p => <div key={p.key}><dt><i className={`ws-series-${p.key}`} />{t(`workspace.fund.${p.key}`)}</dt><dd>{formatUnits(p.value, claim.token)}</dd></div>)}</dl></div>;
}
