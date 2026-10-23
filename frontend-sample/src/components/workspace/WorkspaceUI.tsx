import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ArrowUpRight, Wallet, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatUnits, formatFullUnits, hasHiddenPrecision } from "@/lib/format";
import type { TokenSymbol } from "@/lib/types";
import { LIVE_MODE } from "@/lib/live-config";

export function Figure({ raw, token, large = false, exact = false }: { raw: bigint; token: TokenSymbol; large?: boolean; exact?: boolean }) {
  const { t } = useTranslation();
  const fullNumeric = formatFullUnits(raw, token), full = `${fullNumeric} ${token}`;
  const visible = exact ? fullNumeric : formatUnits(raw, token);
  const hidden = !exact && hasHiddenPrecision(raw, token) && visible !== fullNumeric;
  return <span className={`ws-figure ${large ? "ws-large" : ""}`}><span title={full} aria-label={full}>{visible}</span><small>{token}</small>{hidden && <Popover><PopoverTrigger asChild><button type="button" className="ws-precision-trigger" aria-label={t("amount.precisionOpen")} title={t("amount.precisionOpen")}><Info size={13} aria-hidden /></button></PopoverTrigger><PopoverContent className="w-80 max-w-[calc(100vw-32px)]" align="end"><p className="text-sm font-semibold">{t("amount.precisionTitle")}</p><p className="figure mt-2 break-all text-sm">{full}</p></PopoverContent></Popover>}</span>;
}
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "negative" | "info" }) {
  return <span className={`ws-tag ws-${tone}`}>{children}</span>;
}
export function PageHeading({ title, description, action, onRefresh }: { title: string; description?: string; action?: ReactNode; onRefresh?: () => void }) {
  const { t } = useTranslation();
  return <div className="ws-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div><div className="ws-heading-actions">{action}{onRefresh && <Button variant="outline" size="icon" onClick={onRefresh} aria-label={t("workspace.refresh")} title={t("workspace.refresh")}><RefreshCw /></Button>}</div></div>;
}
export function FilterTabs<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return <div className="ws-tabs" role="group" aria-label={label}>{options.map(o => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Metric({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return <div className="ws-metric"><span className="ws-label">{label}</span><strong>{children}</strong>{note && <p>{note}</p>}</div>;
}
export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="ws-field-row"><dt>{label}</dt><dd>{children}</dd></div>;
}
export function DetailButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return <Button variant="outline" size="sm" onClick={onClick}>{t("workspace.detail")}<ArrowUpRight size={14} /></Button>;
}
export function ReviewModal({ title, description, open, onOpenChange, children, wide = false }: { title: string; description?: string; open: boolean; onOpenChange: (value: boolean) => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const opener = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={`ws-modal ${wide ? "ws-modal-wide" : ""}`} onOpenAutoFocus={() => {
    // Controlled dialogs have no Radix Trigger to restore focus to.
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }} onCloseAutoFocus={event => {
    if (opener.current?.isConnected) {
      event.preventDefault();
      opener.current.focus({ preventScroll: true });
    }
  }}><DialogTitle>{title}</DialogTitle><DialogDescription className={description ? "ws-caption" : "sr-only"}>{description || t("workspace.reviewDescription")}</DialogDescription>{children}</DialogContent></Dialog>;
}
export function ExecutionFooter({ label }: { label: string }) {
  const { t } = useTranslation();
  return <footer className="ws-review-footer"><span>{t(LIVE_MODE ? "live.executionDisabled" : "workspace.previewOnly")}</span><Button disabled>{label}</Button></footer>;
}
export function WalletGate({ address, connect, children }: { address: string | null; connect: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  if (address) return <>{children}</>;
  return <div className="ws-empty"><Wallet /><h2>{t(LIVE_MODE ? "live.connectTitle" : "workspace.connectTitle")}</h2><p>{t(LIVE_MODE ? "live.connectBody" : "workspace.connectBody")}</p><Button onClick={connect}>{t("wallet.connect")}</Button></div>;
}
export function EmptyRows({ columns }: { columns: number }) {
  const { t } = useTranslation();
  return <tr><td colSpan={columns} className="ws-empty-cell">{t("workspace.empty")}</td></tr>;
}
