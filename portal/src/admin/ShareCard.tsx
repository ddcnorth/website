import type { ReactNode } from "react";
import { describeCountries, flag } from "../countries";
import { fmtDate, fmtDuration, fmtMinutes, fmtRelative, fmtStamp } from "../format";
import { useAdmin } from "./context";
import { Icon, type IconName } from "./icons";
import type { Share } from "./ShareDialog";

const STATUS_LABEL: Record<string, string> = {
  active: "Active", not_opened: "Not opened", scheduled: "Scheduled", expired: "Expired", revoked: "Turned off",
};

function accessSummary(s: Share): { icon: IconName; title: string; detail: ReactNode } {
  if (s.method === "link") return { icon: "link", title: "Link only", detail: "Anyone with the link" };
  if (s.method === "password") return { icon: "lock", title: "Link + password", detail: "Password sent separately" };
  const people = s.emails.filter((e) => !e.startsWith("@"));
  const domains = s.emails.filter((e) => e.startsWith("@"));
  const shown = [...domains.map((d) => `anyone ${d}`), ...people];
  return {
    icon: domains.length && !people.length ? "domain" : "mail",
    title: domains.length && !people.length ? "Anyone at a domain" : "Verified email",
    detail: (
      <span className="recipients">
        {shown.slice(0, 3).map((r) => <span key={r} className="recipient">{r}</span>)}
        {shown.length > 3 && <span className="recipient more" title={shown.slice(3).join(", ")}>+{shown.length - 3} more</span>}
      </span>
    ),
  };
}

function Fact({ icon, children, title, tone }: { icon: IconName; children: ReactNode; title?: string; tone?: "warn" | "muted" }) {
  return <li className={`fact ${tone ?? ""}`} title={title}><Icon name={icon} />{children}</li>;
}

/** One share: who can get in, the rules, where it stands, and how it has been used. */
export function ShareCard({ share: s, actions }: { share: Share; actions: ReactNode }) {
  const { integrations } = useAdmin();
  const access = accessSummary(s);
  const now = Date.now();
  const running = s.activations
    .filter((a) => a.expires_at && a.expires_at > now)
    .sort((a, b) => (a.expires_at ?? 0) - (b.expires_at ?? 0))[0];
  const progress = running?.expires_at ? Math.min(1, Math.max(0, (now - running.first_unlocked_at) / (running.expires_at - running.first_unlocked_at))) : null;
  const perPerson = s.method === "email" && s.timer_scope === "recipient";

  return (
    <article className={`share-card status-${s.status}`} aria-label={s.label}>
      <header className="share-head">
        <span className="share-icon" title={access.title}><Icon name={access.icon} /></span>
        <div className="share-title">
          <h3>{s.label}</h3>
          <div className="share-access"><span className="muted">{access.title}</span><span className="dot" aria-hidden="true">·</span>{access.detail}</div>
        </div>
        <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status] ?? s.status.replace("_", " ")}</span>
        <div className="share-actions">{actions}</div>
      </header>

      <ul className="facts" aria-label="Rules">
        {s.duration_minutes
          ? <Fact icon="clock">{fmtMinutes(s.duration_minutes)} after first open{perPerson ? ", per person" : ""}</Fact>
          : <Fact icon="clock" tone="muted">No countdown</Fact>}
        {s.expires_at && <Fact icon="calendar" title={fmtDate(s.expires_at)}>Ends {fmtStamp(s.expires_at)}</Fact>}
        {s.activate_by && <Fact icon="calendar" title={fmtDate(s.activate_by)}>Open by {fmtStamp(s.activate_by)}</Fact>}
        {s.starts_at && s.starts_at > now && <Fact icon="calendar" tone="warn">From {fmtStamp(s.starts_at)}</Fact>}
        {s.max_unlocks && <Fact icon="key" tone={s.unlock_count >= s.max_unlocks ? "warn" : undefined}>{s.unlock_count}/{s.max_unlocks} opens used</Fact>}
        <Fact icon="refresh">Re-enter after {fmtMinutes(s.session_minutes)}</Fact>
        <Fact icon="globe" title={s.allowed_countries.join(", ") || "Any country"}>
          {s.allowed_countries.length ? <>{s.allowed_countries.slice(0, 3).map(flag).join(" ")} {describeCountries(s.allowed_countries, 2)}</> : "Any country"}
        </Fact>
        {integrations.posthog.enabled && <Fact icon="chart" tone={s.posthog ? undefined : "muted"}>{s.posthog ? "PostHog on" : "PostHog off"}</Fact>}
        {!!s.notify_on_open && <Fact icon="bell" tone="muted">Email on first open</Fact>}
      </ul>

      {progress !== null && running?.expires_at && (
        <div className="countdown" aria-label={`Ends ${fmtRelative(running.expires_at)}`}>
          <div className="countdown-bar"><span style={{ width: `${Math.round((1 - progress) * 100)}%` }} /></div>
          <span className="small muted">{s.activations.length > 1 ? "Next to end " : "Ends "}{fmtRelative(running.expires_at)} · {fmtStamp(running.expires_at)}</span>
        </div>
      )}

      <dl className="share-stats">
        <div><dt>First opened</dt><dd>{s.first_opened_at ? <span title={fmtDate(s.first_opened_at)}>{fmtRelative(s.first_opened_at)}</span> : <span className="muted">Not yet</span>}</dd></div>
        <div><dt>{perPerson ? "People" : "Browsers"}</dt><dd>{perPerson ? s.activations.length : s.stats.sessions}</dd></div>
        <div><dt>Views</dt><dd>{s.stats.views}</dd></div>
        <div><dt>Active time</dt><dd>{fmtDuration(s.stats.active_seconds)}</dd></div>
        <div><dt>Last seen</dt><dd>{s.stats.last_seen_at ? fmtRelative(s.stats.last_seen_at) : <span className="muted">—</span>}</dd></div>
      </dl>
      {s.note && <p className="share-note"><span className="label">Note</span> {s.note}</p>}
    </article>
  );
}
