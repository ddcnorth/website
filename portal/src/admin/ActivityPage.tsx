import { useEffect, useState } from "react";
import { ActivityTable, VisitorsTable, type EventRow, type Visitor } from "./tables";
import { useAdminApi } from "./context";

export function ActivityPage() {
  const call = useAdminApi();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [visitors, setVisitors] = useState<Visitor[] | null>(null);
  useEffect(() => {
    call<{ events: EventRow[] }>("/api/admin/activity?limit=200").then((r) => setEvents(r.events));
    call<{ visitors: Visitor[] }>("/api/admin/visitors").then((r) => setVisitors(r.visitors));
  }, []);
  return (
    <div className="page stack">
      <div><div className="label">All spaces</div><h1>Activity</h1>
        <p className="muted small">Locations are approximate (from the network, city level at best). “Active” counts time the page was visible and in use.</p></div>
      <h2>Who opened what</h2>
      {visitors ? <VisitorsTable visitors={visitors} showSpace /> : <p className="muted">Loading…</p>}
      <h2>Log</h2>
      {events ? <ActivityTable events={events} showSpace /> : <p className="muted">Loading…</p>}
    </div>
  );
}
