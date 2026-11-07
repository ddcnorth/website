import type { FeatureCollection } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { fitMapToPoints, Map, MapCircleLayer, MapControls, useMap } from "@pgmaps/geo-toolkit/map";
import "@pgmaps/geo-toolkit/styles.css";
import { countryName } from "../countries";
import { fmtDuration, fmtStamp } from "../format";

/** One place on the map (rows are grouped by rounded coordinates on the server). */
export interface MapPoint {
  lat: number; lon: number; city: string | null; region: string | null; country: string | null;
  visitors?: number; views?: number; active_seconds?: number; attempts?: number; last_seen_at: number; emails?: string | null;
}
export interface MapData { visitors: MapPoint[]; attempts: MapPoint[] }

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const place = (p: Record<string, unknown>) =>
  [p.city, p.region].filter(Boolean).map(esc).join(", ") + (p.country ? ` · ${esc(countryName(String(p.country)))}` : "");

function collection(points: MapPoint[], kind: "visit" | "attempt"): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: points.map((p, i) => ({
      type: "Feature",
      id: `${kind}-${i}`,
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: { ...p, kind, n: kind === "visit" ? p.visitors ?? 0 : p.attempts ?? 0 },
    })),
  };
}

const visitHtml = (p: Record<string, unknown>) => `<div style="font:13px/1.45 system-ui;min-width:180px">
  <strong>${place(p)}</strong><br>${esc(p.visitors)} visitor${p.visitors === 1 ? "" : "s"} · ${esc(p.views)} views · ${esc(fmtDuration(Number(p.active_seconds)))} active
  ${p.emails ? `<br><span style="opacity:.7">${esc(String(p.emails).split(",").slice(0, 3).join(", "))}</span>` : ""}
  <br><span style="opacity:.7">Last active ${esc(fmtStamp(Number(p.last_seen_at)))}</span></div>`;
const attemptHtml = (p: Record<string, unknown>) => `<div style="font:13px/1.45 system-ui;min-width:180px">
  <strong>${place(p)}</strong><br>${esc(p.attempts)} failed or refused attempt${p.attempts === 1 ? "" : "s"}
  <br><span style="opacity:.7">Latest ${esc(fmtStamp(Number(p.last_seen_at)))}</span></div>`;

/** Re-frame the camera whenever the set of points changes. */
function FitToPoints({ points }: { points: [number, number][] }) {
  const { map, isLoaded } = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (map && isLoaded && points.length) fitMapToPoints(map, points, { padding: 48, maxZoom: 9, duration: 600, minSpan: 0.5 });
  }, [map, isLoaded, key]);
  return null;
}

function useTheme(): "light" | "dark" {
  const q = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return dark ? "dark" : "light";
}

/** Where visitors opened shared spaces from (blue) and where failed or refused attempts came from (red). */
export default function VisitorMap({ data, showAttempts }: { data: MapData; showAttempts: boolean }) {
  const theme = useTheme();
  const visits = useMemo(() => collection(data.visitors, "visit"), [data]);
  const attempts = useMemo(() => collection(data.attempts, "attempt"), [data]);
  const points = useMemo(() => [...data.visitors, ...(showAttempts ? data.attempts : [])].map((p) => [p.lon, p.lat] as [number, number]), [data, showAttempts]);
  const radius = (prop: string) => ["interpolate", ["linear"], ["get", prop], 1, 6, 10, 12, 100, 24] as never;

  return (
    <Map center={[-122.75, 53.92]} zoom={3} theme={theme} className="visitor-map"
      controls={<MapControls position="top-right" showZoom showCompass={false} showLocate={false} showFullscreen />}>
      <FitToPoints points={points} />
      <MapCircleLayer data={attempts} visible={showAttempts} layerOrder={1} color="#c2410c" opacity={0.75}
        radius={radius("n")} strokeColor="#ffffff" strokeWidth={1.5} clickHtml={attemptHtml} hoverHtml={attemptHtml} />
      <MapCircleLayer data={visits} layerOrder={2} color={theme === "dark" ? "#7cb3ea" : "#0b2b4a"} opacity={0.85}
        radius={radius("n")} strokeColor="#ffffff" strokeWidth={1.5} clickHtml={visitHtml} hoverHtml={visitHtml} />
    </Map>
  );
}
