import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { portfolioForToken } from "@/lib/workspace-model";
import type { TokenSymbol } from "@/lib/types";
import { Figure } from "@/components/workspace/WorkspaceUI";

export function AssetComposition({ portfolio, token }: { portfolio: ReturnType<typeof portfolioForToken>; token: TokenSymbol }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  let offset = 0;
  const parts = (["wallet", "claimable", "future"] as const).map(key => {
    const pct = portfolio.total > 0n ? Number(portfolio[key] * 1_000_000n / portfolio.total) / 10_000 : 0;
    const part = { key, pct, offset, value: portfolio[key] }; offset += pct; return part;
  });
  const current = parts.find(p => p.key === selected);
  return <div className="ws-composition"><div className="ws-donut"><svg viewBox="0 0 120 120" role="img" aria-label={parts.map(p => `${t(`workspace.asset.${p.key}`)} ${p.pct.toFixed(1)}%`).join(", ")}><circle className="ws-donut-track" cx="60" cy="60" r="47" />{parts.filter(p => p.value > 0n).map(p => <circle key={p.key} className={`ws-donut-slice ws-stroke-${p.key}`} cx="60" cy="60" r="47" pathLength="100" strokeDasharray={`${p.pct} ${100 - p.pct}`} strokeDashoffset={-p.offset} transform="rotate(-90 60 60)" opacity={selected && selected !== p.key ? 0.25 : 1} />)}</svg><div className="ws-donut-center"><span>{t(current ? `workspace.asset.${current.key}` : "workspace.claimableFilter")}</span><strong>{current ? `${current.pct.toFixed(1)}%` : t("workspace.count", { count: portfolio.claimableCount })}</strong></div></div>
    <div className="ws-composition-legend">{parts.map(p => <button key={p.key} type="button" aria-pressed={selected === p.key} onClick={() => setSelected(selected === p.key ? null : p.key)}><span><i className={`ws-series-${p.key}`} />{t(`workspace.asset.${p.key}`)}</span><span><Figure raw={p.value} token={token} /><small>{p.pct.toFixed(1)}%</small></span></button>)}</div></div>;
}
