import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { countryName, flag } from "../countries";
import { fmtDuration, fmtRelative } from "../format";
import { useAdminApi } from "./context";
import { ActivityTable, EVENT_FILTERS, VisitorsTable, type EventRow, type Visitor } from "./tables";
import { Stat } from "./ui";
import { VisitorDialog } from "./VisitorDialog";
import type { MapData, MapPoint } from "./VisitorMap";

// MapLibre is large; load it only when the map is on screen.
const VisitorMap = lazy(() => import("./VisitorMap"));

interface Stats { days: number; opens: number; failed: number; refused: number; link_loads: number; visitors: number; views: number; active_seconds: number }

export const PERIODS: [number, string][] = [[1, "24 h"], [7, "7 days"], [30, "30 days"], [365, "Year"]];

export function PeriodChips({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="chips" role="group" aria-label="Period">
      {PERIODS.map(([d, l]) => <button key={d} aria-pressed={days === d} onClick={() => onChange(d)}>{l}</button>)}
    </div>
  );
}

/** Stat tiles for a period, optionally limited to one space. Controlled when `days` is given. */
export function StatsPanel({ spaceId, days: controlled }: { spaceId?: string; days?: number }) {
  const call = useAdminApi();
  const [own, setOwn] = useState(7);
  const days = controlled ?? own;
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    setStats(null);
    call<Stats>(`/api/admin/stats?days=${days}${spaceId ? `&space_id=${spaceId}` : ""}`).then(setStats).catch(() => setStats(null));
  }, [days, spaceId]);
  const v = (n: number | undefined) => (stats ? n : "…");
  return (
    <section className="stack" aria-label="Summary">
      {controlled === undefined && <PeriodChips days={own} onChange={setOwn} />}
      <div className="stats">
        <Stat label="Visitors" value={v(stats?.visitors)} hint="People or browsers" />
        <Stat label="Opens" value={v(stats?.opens)} hint={stats ? `${stats.link_loads} link loads` : undefined} />
        <Stat label="Page views" value={v(stats?.views)} />
        <Stat label="Active time" value={stats ? fmtDuration(stats.active_seconds) : "…"} />
        <Stat label="Failed or refused" value={stats ? stats.failed + stats.refused : "…"} hint={stats ? `${stats.failed} wrong passwords` : undefined} />
      </div>
    </section>
  );
}

/** Event log with type filters, search and "load more"; `spaceId` limits it to one space. */
export function EventLog({ spaceId, showSpace, onSelect, search = "", heading = true }: {
  spaceId?: string; showSpace?: boolean; onSelect: (sid: string) => void; search?: string; heading?: boolean;
}) {
  const call = useAdminApi();
  const [type, setType] = useState("");
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [more, setMore] = useState(false);
  const query = (before?: number) => {
    const q = new URLSearchParams({ limit: "100" });
    if (spaceId) q.set("space_id", spaceId);
    if (type) q.set("type", type);
    if (search.trim()) q.set("q", search.trim());
    if (before) q.set("before", String(before));
    return call<{ events: EventRow[]; has_more: boolean }>(`/api/admin/activity?${q}`);
  };
  useEffect(() => {
    setEvents(null);
    const t = setTimeout(() => query().then((r) => { setEvents(r.events); setMore(r.has_more); }), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [type, spaceId, search]);
  return (
    <section className="stack">
      <div className="section-head">
        {heading && <h2>Log</h2>}
        <div className="chips" role="group" aria-label="Filter events">
          {EVENT_FILTERS.map(([v, l]) => <button key={v} aria-pressed={type === v} onClick={() => setType(v)}>{l}</button>)}
        </div>
      </div>
      {events ? <ActivityTable events={events} showSpace={showSpace} onSelect={onSelect} /> : <p className="muted">Loading…</p>}
      {more && events && (
        <button onClick={() => query(events[events.length - 1].id).then((r) => { setEvents([...events, ...r.events]); setMore(r.has_more); })}>
          Load older events
        </button>
      )}
    </section>
  );
}

/** Map plus a ranked list of places, for a period and optionally one space. */
export function MapPanel({ days, spaceId }: { days: number; spaceId?: string }) {
  const call = useAdminApi();
  const [data, setData] = useState<MapData | null>(null);
  const [attempts, setAttempts] = useState(true);
  useEffect(() => {
    setData(null);
    call<MapData>(`/api/admin/map?days=${days}${spaceId ? `&space_id=${spaceId}` : ""}`).then(setData).catch(() => setData({ visitors: [], attempts: [] }));
  }, [days, spaceId]);
  const places = useMemo(() => byCountry(data?.visitors ?? []), [data]);
  const empty = data && !data.visitors.length && !data.attempts.length;

  return (
    <section className="map-panel" aria-label="Where visitors are">
      <div className="map-frame">
        {!data ? <div className="map-placeholder muted">Loading map…</div>
          : empty ? <div className="map-placeholder muted">No located visits in this period.</div>
          : <Suspense fallback={<div className="map-placeholder muted">Loading map…</div>}><VisitorMap data={data} showAttempts={attempts} /></Suspense>}
        <div className="map-legend small">
          <span><i className="swatch visit" /> Visitors</span>
          <label className="check"><input type="checkbox" checked={attempts} onChange={(e) => setAttempts(e.target.checked)} />
            <span><i className="swatch attempt" /> Failed or refused ({data?.attempts.reduce((n, p) => n + (p.attempts ?? 0), 0) ?? 0})</span></label>
        </div>
      </div>
      <div className="places">
        <h3>Top places</h3>
        {!data ? <p className="muted small">Loading…</p> : !places.length ? <p className="muted small">Nothing yet.</p> : (
          <ol className="place-list">
            {places.slice(0, 8).map((c) => (
              <li key={c.country}>
                <div className="row spread">
                  <span><span aria-hidden="true">{flag(c.country)}</span> <strong>{countryName(c.country)}</strong></span>
                  <span className="mono">{c.visitors}</span>
                </div>
                <div className="bar"><span style={{ width: `${Math.round((c.visitors / places[0].visitors) * 100)}%` }} /></div>
                <div className="small muted">{c.cities.slice(0, 3).join(", ")}{c.cities.length > 3 ? ` +${c.cities.length - 3}` : ""} · {fmtRelative(c.last)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function byCountry(points: MapPoint[]) {
  const m = new Map<string, { country: string; visitors: number; cities: string[]; last: number }>();
  for (const p of points) {
    const k = p.country ?? "??";
    const e = m.get(k) ?? { country: k, visitors: 0, cities: [], last: 0 };
    e.visitors += p.visitors ?? 0;
    if (p.city && !e.cities.includes(p.city)) e.cities.push(p.city);
    e.last = Math.max(e.last, p.last_seen_at);
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.visitors - a.visitors);
}

type Tab = "visitors" | "log";

export function ActivityPage() {
  const call = useAdminApi();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>("visitors");
  const [search, setSearch] = useState("");
  const [visitors, setVisitors] = useState<Visitor[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const load = () => call<{ visitors: Visitor[] }>("/api/admin/visitors").then((r) => setVisitors(r.visitors));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!visitors || !q) return visitors;
    return visitors.filter((v) => [v.email, v.ip, v.last_ip, v.city, v.region, v.country, v.country && countryName(v.country), v.as_org, v.share_label, v.space_title]
      .some((x) => x?.toLowerCase().includes(q)));
  }, [visitors, search]);

  return (
    <div className="page stack">
      <div className="page-head">
        <div>
          <div className="label">All spaces</div>
          <h1>Activity</h1>
          <p className="muted small" style={{ margin: 0 }}>Locations are approximate (from the network, city level at best). “Active” counts time the page was visible and in use.</p>
        </div>
        <PeriodChips days={days} onChange={setDays} />
      </div>
      <StatsPanel days={days} />
      <MapPanel days={days} />

      <section className="stack">
        <div className="section-head">
          <div className="tabs" role="tablist" style={{ margin: 0, borderBottom: 0 }}>
            <button role="tab" aria-selected={tab === "visitors"} onClick={() => setTab("visitors")}>Visitors{visitors ? <span className="muted"> {visitors.length}</span> : null}</button>
            <button role="tab" aria-selected={tab === "log"} onClick={() => setTab("log")}>Log</button>
          </div>
          <input type="search" className="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search email, IP, city, network…" aria-label="Search activity" />
        </div>
        {tab === "visitors"
          ? (shown ? <VisitorsTable visitors={shown} showSpace onSelect={setSelected} /> : <p className="muted">Loading…</p>)
          : <EventLog showSpace onSelect={setSelected} search={search} heading={false} />}
      </section>
      <VisitorDialog sessionId={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}
