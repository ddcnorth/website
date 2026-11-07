import { useEffect, useRef, type ReactNode } from "react";
import { fmtDate, fmtRelative, fmtStamp } from "../format";

/** Popover menu on native <details>: closes on outside click, Escape, or choosing an item. */
export function Menu({ trigger, label, children, className = "", buttonClass = "" }: {
  trigger: ReactNode; label: string; children: ReactNode; className?: string; buttonClass?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return (
    <details ref={ref} className={`menu ${className}`}>
      <summary className={`btn ${buttonClass}`} aria-label={label} title={label}>{trigger}</summary>
      <div className="menu-list" role="menu" onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, a") && ref.current) ref.current.open = false;
      }}>{children}</div>
    </details>
  );
}

/** Controlled <dialog>: open/close follow the prop; Escape and backdrop clicks call onClose. */
export function Modal({ open, onClose, children, wide, label }: {
  open: boolean; onClose: () => void; children: ReactNode; wide?: boolean; label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={wide ? "wide" : ""} aria-label={label} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && children}
    </dialog>
  );
}

/** Exact time with the relative time underneath (or vice versa when compact). */
export function When({ ms, compact }: { ms: number | null | undefined; compact?: boolean }) {
  if (!ms) return <span className="muted">—</span>;
  return compact
    ? <time dateTime={new Date(ms).toISOString()} title={fmtDate(ms)}>{fmtRelative(ms)}</time>
    : <time dateTime={new Date(ms).toISOString()} title={fmtDate(ms)}>{fmtStamp(ms)}<span className="sub">{fmtRelative(ms)}</span></time>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <strong>{value}</strong>
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

/** Location plus the network it came from, the IP on its own line. */
export function Where({ r }: { r: { city?: string | null; region?: string | null; country?: string | null; as_org?: string | null; ip?: string | null } }) {
  const place = [r.city, r.region, r.country].filter(Boolean).join(", ");
  return (
    <span>
      {place || <span className="muted">Unknown location</span>}
      {r.as_org && <span className="sub">{r.as_org}</span>}
    </span>
  );
}
