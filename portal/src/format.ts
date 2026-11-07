const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export const fmtDate = (ms: number | null | undefined) => (ms ? dtf.format(new Date(ms)) : "—");

export function fmtRelative(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [unit, size] of units) if (abs >= size) return rtf.format(Math.round(diff / size), unit);
  return diff >= 0 ? "in under a minute" : "just now";
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return "0 min";
  if (seconds < 60) return `${seconds} s`;
  if (seconds >= 86_400) return `${Math.floor(seconds / 86_400)} d ${Math.floor((seconds % 86_400) / 3600)} h`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtMinutes(min: number | null | undefined): string {
  if (!min) return "—";
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? "" : "s"}`;
  if (min % 60 === 0) return `${min / 60} hour${min === 60 ? "" : "s"}`;
  return `${min} min`;
}

/** <input type="datetime-local"> value <-> epoch ms (local time). */
export function toLocalInput(ms: number | null | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromLocalInput = (v: string): number | null => (v ? new Date(v).getTime() : null);

export function fmtPlace(r: { city?: string | null; region?: string | null; country?: string | null }): string {
  return [r.city, r.region, r.country].filter(Boolean).join(", ") || "—";
}

/** "Prince George, CA" for tight spaces. */
export function fmtPlaceShort(r: { city?: string | null; region?: string | null; country?: string | null }): string {
  return [r.city ?? r.region, r.country].filter(Boolean).join(", ") || "Unknown";
}

export function fmtDevice(ua: string | null | undefined): string {
  if (!ua) return "—";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : /curl|bot|spider|preview/i.test(ua) ? "Bot/tool" : "Browser";
  return [br, os].filter(Boolean).join(" · ");
}

const stamp = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const stampYear = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** Compact absolute timestamp ("Nov 7, 2:34 PM"); adds the year when it is not this year. */
export function fmtStamp(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return (d.getFullYear() === new Date().getFullYear() ? stamp : stampYear).format(d);
}

/** Wall-clock length between two times, e.g. a visit from first open to last activity. */
export function fmtSpan(from: number | null | undefined, to: number | null | undefined): string {
  if (!from || !to || to < from) return "—";
  return fmtDuration(Math.round((to - from) / 1000));
}

export function initials(email: string): string {
  return email.replace(/@.*/, "").split(/[._-]/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || email[0];
}
