import { fmtDevice, fmtDuration, fmtSpan } from "../format";
import { When, Where } from "./ui";

export interface Visitor {
  session_id: string; grant_id: string; share_label: string; space_id: string; space_title: string; email: string | null;
  unlocked_at: number; last_seen_at: number; expires_at: number; view_count: number; active_seconds: number;
  ip: string | null; last_ip: string | null; country: string | null; region: string | null; city: string | null;
  as_org: string | null; timezone: string | null; latitude: number | null; longitude: number | null;
  user_agent: string | null; revoked_at: number | null;
}

export interface EventRow {
  id: number; ts: number; type: string; space_title: string | null; share_label: string | null; email: string | null;
  session_id: string | null; path: string | null; ip: string | null; country: string | null; region: string | null; city: string | null;
  as_org: string | null; user_agent: string | null; detail: string | null;
}

export const EVENT_LABELS: Record<string, string> = {
  link_opened: "Link loaded", unlock_ok: "Opened", unlock_failed: "Wrong password",
  unlock_denied: "Refused", code_sent: "Code emailed", code_failed: "Code rejected",
  signin_ok: "Signed in by email", signout: "Signed out", view: "Viewed page", denied: "Denied",
  admin_change: "Admin change", admin_signin: "Admin signed in", admin_signout: "Admin signed out",
};

/** Event kinds worth filtering on, in the order shown as chips. */
export const EVENT_FILTERS: [string, string][] = [
  ["", "All"], ["unlock_ok", "Opened"], ["view", "Views"], ["link_opened", "Link loads"],
  ["unlock_failed,code_failed,unlock_denied", "Failed or refused"],
  ["signin_ok,signout,admin_signin,admin_signout", "Sign-ins & sign-outs"], ["admin_change", "Admin changes"],
];

const REASONS: Record<string, string> = {
  country_blocked: "outside the allowed countries", not_on_list: "email not on the list", no_grants: "nothing shared with this email",
  expired: "expired", revoked: "turned off", not_started: "not available yet", activation_window_closed: "not opened in time",
  unlock_limit: "no opens left",
};

export function eventDetail(e: Pick<EventRow, "type" | "detail">): string | null {
  if (!e.detail) return null;
  try {
    const d = JSON.parse(e.detail);
    if (e.type === "unlock_denied" || e.type === "code_failed") return d.reason ? REASONS[d.reason] ?? String(d.reason).replace(/_/g, " ") : null;
    if (e.type === "admin_change") return d.action ? String(d.action).replace(/_/g, " ") : null;
  } catch { /* ignore */ }
  return null;
}

const isFirst = (e: EventRow) => e.type === "unlock_ok" && !!e.detail?.includes('"first":true');

export function VisitorsTable({ visitors, onSelect, showSpace }: {
  visitors: Visitor[]; onSelect?: (sessionId: string) => void; showSpace?: boolean;
}) {
  if (!visitors.length) return <p className="muted">Nobody has opened this yet.</p>;
  return (
    <div className="table-wrap">
      <table className="responsive">
        <thead><tr>
          <th>Who</th><th>{showSpace ? "Space / share" : "Share"}</th><th>Where</th><th>IP address</th>
          <th>First opened</th><th>Last active</th><th>Time spent</th><th>Views</th>
        </tr></thead>
        <tbody>
          {visitors.map((v) => (
            <tr key={`${v.session_id}-${v.grant_id}`} className={onSelect ? "clickable" : ""} tabIndex={onSelect ? 0 : undefined}
              onClick={() => onSelect?.(v.session_id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect?.(v.session_id); }}>
              <td className="lead">
                {v.email ? <strong>{v.email}</strong> : <span>Link visitor</span>}
                {v.revoked_at && <span className="badge revoked" style={{ marginLeft: 6 }}>signed out</span>}
                <span className="sub">{fmtDevice(v.user_agent)}</span>
              </td>
              <td data-label={showSpace ? "Space / share" : "Share"}>
                {showSpace ? <>{v.space_title}<span className="sub">{v.share_label}</span></> : v.share_label}
              </td>
              <td data-label="Where"><Where r={v} /></td>
              <td data-label="IP address" className="mono">
                {v.ip ?? "—"}
                {v.last_ip && v.last_ip !== v.ip && <span className="sub" title="Most recent IP for this browser">now {v.last_ip}</span>}
              </td>
              <td data-label="First opened"><When ms={v.unlocked_at} /></td>
              <td data-label="Last active"><When ms={v.last_seen_at} /></td>
              <td data-label="Time spent" className="nowrap" title="Active: page visible and in use. Over: first open to last activity.">
                {fmtDuration(v.active_seconds)} active<span className="sub">over {fmtSpan(v.unlocked_at, v.last_seen_at)} · {v.view_count} views</span>
              </td>
              <td data-label="Views" className="hide-sm">{v.view_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityTable({ events, showSpace, onSelect }: {
  events: EventRow[]; showSpace?: boolean; onSelect?: (sessionId: string) => void;
}) {
  if (!events.length) return <p className="muted">No activity yet.</p>;
  return (
    <div className="table-wrap">
      <table className="responsive">
        <thead><tr>
          <th>What</th><th>When</th><th>{showSpace ? "Space / share" : "Share"}</th><th>Who</th><th>Where</th><th>IP address</th><th>Device</th>
        </tr></thead>
        <tbody>
          {events.map((e) => {
            const detail = eventDetail(e);
            const select = e.session_id && onSelect ? () => onSelect(e.session_id!) : undefined;
            return (
              <tr key={e.id} className={select ? "clickable" : ""} onClick={select} tabIndex={select ? 0 : undefined}
                onKeyDown={(k) => { if (k.key === "Enter") select?.(); }}>
                <td className="lead">
                  <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                  {isFirst(e) && <span className="badge active" style={{ marginLeft: 6 }}>first</span>}
                  {detail && <span className="sub">{detail}</span>}
                  {e.path && <span className="sub mono">{e.path}</span>}
                </td>
                <td data-label="When"><When ms={e.ts} /></td>
                <td data-label={showSpace ? "Space / share" : "Share"}>
                  {showSpace ? <>{e.space_title ?? "—"}<span className="sub">{e.share_label}</span></> : e.share_label ?? "—"}
                </td>
                <td data-label="Who" className={e.email ? "" : "blank"}>{e.email ?? <span className="muted">—</span>}</td>
                <td data-label="Where"><Where r={e} /></td>
                <td data-label="IP address" className="mono">{e.ip ?? "—"}</td>
                <td data-label="Device" className="hide-sm">{fmtDevice(e.user_agent)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
