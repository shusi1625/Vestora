import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Amount } from "@/lib/types";
import { TOKENS } from "@/lib/tokens";
import { isPaymentToken } from "@/lib/workspace-model";
import { Button } from "@/components/ui/button";
import { ExecutionFooter, FieldRow, Figure, ReviewModal } from "@/components/workspace/WorkspaceUI";
import { CreatePaymentAction } from "@/components/workspace/CreatePaymentAction";
import { LIVE_MODE } from "@/lib/live-config";

export function CreatePaymentDialog({ open, onClose, balances, balanceKnown=true, paymentTokens=["MockUSDC","mWETH"] }: { open: boolean; onClose: () => void; balances: Amount[]; balanceKnown?:boolean; paymentTokens?:("MockUSDC"|"mWETH")[] }) {
  const { t } = useTranslation();
  const [review, setReview] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [recipient, setRecipient] = useState(""), [token, setToken] = useState<"MockUSDC" | "mWETH">("MockUSDC"), [amount, setAmount] = useState(""), [start, setStart] = useState(""), [end, setEnd] = useState(""), [cancelable, setCancelable] = useState(false), [raw, setRaw] = useState(0n);
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); setError("");
    if(!balanceKnown){setError("live.balanceUnavailable");return;}
    const decimals = TOKENS[token].decimals;
    if (!/^0x[\da-f]{40}$/i.test(recipient) || /^0x0{40}$/i.test(recipient)) { setError("workspace.invalidRecipient"); return; }
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(amount)) { setError("workspace.invalidAmount"); return; }
    const [whole, fraction = ""] = amount.split(".");
    const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
    if (value <= 0n) { setError("workspace.invalidAmount"); return; }
    const available = balances.filter(b => b.token === token).reduce((sum, b) => sum + b.raw, 0n);
    if (value > available) { setError("workspace.insufficientBalance"); return; }
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) { setError("workspace.invalidPeriod"); return; }
    setRaw(value); setReview(true);
  };
  return <ReviewModal wide open={open} onOpenChange={value => { if (!value) onClose(); }} title={t(review ? "workspace.createReview" : "workspace.createTitle")} description={t("workspace.createDescription")}>
    {review ? <><dl><FieldRow label={t("workspace.paymentName")}>{name.trim() || t("workspace.nameAfterCreate")}</FieldRow><FieldRow label={t("workspace.originalRecipient")}><span className="ws-address">{recipient}</span></FieldRow><FieldRow label={t("workspace.deposited")}><Figure raw={raw} token={token} exact /></FieldRow><FieldRow label={t("workspace.startsAt")}>{new Date(start).toLocaleString("ko-KR")}</FieldRow><FieldRow label={t("workspace.endsAt")}>{new Date(end).toLocaleString("ko-KR")}</FieldRow><FieldRow label={t("workspace.cancellation")}>{t(cancelable ? "workspace.cancelable" : "workspace.nonCancelable")}</FieldRow></dl><p className="ws-notice">{t("workspace.directMint")}</p><Button variant="outline" onClick={() => setReview(false)}>{t("workspace.back")}</Button>{LIVE_MODE?<CreatePaymentAction draft={{recipient,amount:raw,start:BigInt(Date.parse(start)/1000),end:BigInt(Date.parse(end)/1000),cancelable,name:name.trim()}}/>:<ExecutionFooter label={t("workspace.executeCreate")} />}</> : <div className="ws-create-grid"><form className="ws-form" onSubmit={submit}><label>{t("workspace.paymentName")}<input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder={t("workspace.namePlaceholder")} /><small>{t("workspace.namePrivacy")}</small></label><label>{t("workspace.recipientAddress")}<input value={recipient} onChange={e => setRecipient(e.target.value.trim())} required placeholder="0x…" autoComplete="off" /></label>
      <div className="ws-form-pair"><label>{t("workspace.token")}<select value={token} onChange={e => { if (isPaymentToken(e.target.value)) setToken(e.target.value); }}>{paymentTokens.map(token=><option key={token}>{token}</option>)}</select></label><label>{t("workspace.totalPayment")}<input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required maxLength={100} placeholder="0.00" /></label></div>
      <div className="ws-form-pair"><label>{t("workspace.startsAt")}<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required /></label><label>{t("workspace.endsAt")}<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required /></label></div><label className="ws-checkbox"><input type="checkbox" checked={cancelable} onChange={e => setCancelable(e.target.checked)} />{t("workspace.enableCancellation")}</label><p className="ws-caption">{t("workspace.cancelImpact")}</p>{error && <p className="ws-form-error" role="alert">{t(error)}</p>}<div><Button type="submit">{t("workspace.createReview")}</Button></div></form><aside><h3>{t("workspace.createTerms")}</h3><dl><FieldRow label={t("workspace.depositMode")}>{t("workspace.fullyFunded")}</FieldRow><FieldRow label={t("workspace.accrualMode")}>{t("workspace.linear")}</FieldRow><FieldRow label={t("workspace.network")}>Sepolia</FieldRow></dl><p className="ws-notice">{t("workspace.directMint")}</p><p className="ws-caption">{t("workspace.extraGas")}</p></aside></div>}
  </ReviewModal>;
}
