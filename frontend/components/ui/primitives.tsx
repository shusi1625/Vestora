"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { formatAmount } from "../../lib/receivable-value";

export type Tone = "neutral" | "success" | "warning" | "danger";
export function Button({ variant = "secondary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" }) {
  return <button type={type} className={`v-button v-button--${variant} ${className}`} {...props} />;
}
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`v-badge v-badge--${tone}`}>{children}</span>;
}
export function Notice({ tone = "neutral", title, children }: { tone?: Tone; title: string; children?: ReactNode }) {
  return <div className={`v-notice v-notice--${tone}`} role={tone === "danger" ? "alert" : undefined}><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}
export function Amount({ value, symbol = "mUSDC", decimals = 6, emphasis = false }: { value: bigint | null; symbol?: string; decimals?: number; emphasis?: boolean }) {
  return <span className={`v-amount ${emphasis ? "v-amount--large" : ""}`}><span>{formatAmount(value, decimals)}</span>{value !== null && <span className="v-unit">{symbol}</span>}</span>;
}
export function Address({ value }: { value: string | null }) {
  return value ? <span className="v-address" title={value}>{value}</span> : <span className="v-muted">소유자 확인 불가</span>;
}
export function Field({ label, hint, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return <div className="v-field"><label htmlFor={fieldId}>{label}</label><input {...props} id={fieldId} aria-invalid={!!error} aria-describedby={error || hint ? fieldId + "-help" : undefined} />{(error || hint) && <p id={fieldId + "-help"} className={error ? "v-error" : "v-muted"}>{error ?? hint}</p>}</div>;
}
export function Select({ label, children, id, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const generated = useId();
  return <div className="v-field"><label htmlFor={id ?? generated}>{label}</label><select id={id ?? generated} {...props}>{children}</select></div>;
}
export function Checkbox({ label, hint, id, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; hint?: string }) {
  const generated = useId(); const fieldId = id ?? generated;
  return <div className="v-field"><label className="v-checkbox" htmlFor={fieldId}><input {...props} id={fieldId} type="checkbox" aria-describedby={hint ? fieldId + "-hint" : undefined} />{label}</label>{hint && <p id={fieldId + "-hint"} className="v-muted">{hint}</p>}</div>;
}
export function Explanation({ label, children }: { label: string; children: ReactNode }) {
  return <details className="v-explanation"><summary>{label}</summary><div>{children}</div></details>;
}
export function Dialog({ open, title, onClose, children, footer, busy = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog className="v-dialog" ref={ref} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClose={onClose}>
    <div className="v-dialog-body"><div className="v-section-heading"><h2 id={titleId}>{title}</h2><Button variant="text" disabled={busy} onClick={onClose}>닫기</Button></div>{children}</div>
    {footer && <div className="v-dialog-footer">{footer}</div>}
  </dialog>;
}
export function DataState({ state, title, children, onRetry }: { state: "loading" | "empty" | "error"; title: string; children?: ReactNode; onRetry?: () => void }) {
  return <div className={`v-data-state v-data-state--${state}`} role={state === "error" ? "alert" : "status"} aria-busy={state === "loading"}>
    {state === "loading" && <div className="v-skeleton" aria-hidden="true" />}<h2>{title}</h2>{children && <p>{children}</p>}{onRetry && <Button onClick={onRetry}>다시 조회</Button>}
  </div>;
}
export function PageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="v-page-heading"><div><h1>{title}</h1><p className="v-muted">{description}</p></div>{action}</div>;
}
export function MetricRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="v-metric-row"><dt>{label}</dt><dd>{children}</dd></div>;
}
export function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div className="v-filters" role="group" aria-label={label}>{options.map(option => <Button key={option} aria-pressed={option === value} onClick={() => onChange(option)}>{option}</Button>)}</div>;
}
