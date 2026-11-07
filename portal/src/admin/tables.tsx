import { fmtDate, fmtDevice, fmtDuration, fmtPlace, fmtRelative } from "../format";

export interface Visitor {
  session_id: string; grant_id: string; share_label: string; space_title: string; email: string | null;
  unlocked_at: number; last_seen_at: number; expires_at: number; view_count: number; active_seconds: number;
  ip: string | null; country: string | null; region: string | null; city: string | null; user_agent: string | null; revoked_at: number | null;
}

export interface EventRow {
  id: number; ts: number; type: string; space_title: string | null; share_label: string | null; email: string | null;
  path: string | null; country: string | null; region: string | null; city: string | null; user_agent: string | null; detail: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  link_opened: "Link loaded (not yet opened)", unlock_ok: "Opened", unlock_failed: "Wrong password",
  unlock_denied: "Refused", code_sent: "Code emailed", code_failed: "Code rejected / not on list",
  signin_ok: "Signed in by email", view: "Viewed page", denied: "Denied", admin_change: "Admin change",
};

export function VisitorsTable({ visitors, onRevoke, showSpace }: { visitors: Visitor[]; onRevoke?: (sessionId: string) => void; showSpace?: boolean }) {
  if (!visitors.length) return <p className="muted">Nobody has opened this yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>
          <th>Who</th>{showSpace && <th>Space</th>}<th>Share</th><th>Where</th><th>Device</th><th>Opened</th><th>Last seen</th><th>Views</th><th>Active</th>{onRevoke && <th />}
        </tr></thead>
        <tbody>
          {visitors.map((v) => (
            <tr key={`${v.session_id}-${v.grant_id}`}>
              <td>{v.email ?? <span className="muted">Link visitor</span>}{v.revoked_at && <div><span className="badge revoked">signed out</span></div>}</td>
              {showSpace && <td>{v.space_title}</td>}
              <td>{v.share_label}</td>
              <td>{fmtPlace(v)}</td>
              <td>{fmtDevice(v.user_agent)}</td>
              <td title={fmtDate(v.unlocked_at)}>{fmtRelative(v.unlocked_at)}</td>
              <td title={fmtDate(v.last_seen_at)}>{fmtRelative(v.last_seen_at)}</td>
              <td>{v.view_count}</td>
              <td>{fmtDuration(v.active_seconds)}</td>
              {onRevoke && <td>{!v.revoked_at && <button className="btn-sm danger" onClick={() => onRevoke(v.session_id)}>Sign out</button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityTable({ events, showSpace }: { events: EventRow[]; showSpace?: boolean }) {
  if (!events.length) return <p className="muted">No activity yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>When</th><th>What</th>{showSpace && <th>Space</th>}<th>Share</th><th>Who</th><th>Where</th><th>Device</th><th>Page</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td title={fmtDate(e.ts)}>{fmtRelative(e.ts)}</td>
              <td>{EVENT_LABELS[e.type] ?? e.type}{e.type === "unlock_ok" && e.detail?.includes('"first":true') ? <span className="badge active" style={{ marginLeft: 6 }}>first</span> : null}
                {e.type === "unlock_denied" && e.detail ? <span className="muted small"> ({JSON.parse(e.detail).reason})</span> : null}</td>
              {showSpace && <td>{e.space_title ?? "—"}</td>}
              <td>{e.share_label ?? "—"}</td>
              <td>{e.email ?? "—"}</td>
              <td>{fmtPlace(e)}</td>
              <td>{fmtDevice(e.user_agent)}</td>
              <td className="mono">{e.path ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
