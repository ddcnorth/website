import { useId, useMemo, useState } from "react";
import { COUNTRY_PRESETS, countries, countryName, flag } from "../countries";

/** Pick the countries a share may be opened from. Empty = anywhere. */
export function CountryPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return countries().filter((c) => !value.includes(c.code) && (c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t)).slice(0, 8);
  }, [q, value]);
  const add = (code: string) => { onChange([...value, code].sort()); setQ(""); setActive(0); };
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  return (
    <div className="country-picker">
      <div className="chips" role="group" aria-label="Quick choices">
        <button type="button" aria-pressed={value.length === 0} onClick={() => onChange([])}>Anywhere</button>
        {COUNTRY_PRESETS.map(([label, codes]) => (
          <button type="button" key={label} aria-pressed={same(value, codes)} onClick={() => onChange(codes)}>{label}</button>
        ))}
      </div>
      {value.length > 0 && (
        <ul className="tokens" aria-label="Allowed countries">
          {value.map((c) => (
            <li key={c} className="token">
              <span aria-hidden="true">{flag(c)}</span> {countryName(c)}
              <button type="button" aria-label={`Remove ${countryName(c)}`} onClick={() => onChange(value.filter((x) => x !== c))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="combo">
        <input value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Add a country…"
          role="combobox" aria-expanded={matches.length > 0} aria-controls={listId} aria-autocomplete="list"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && matches[active]) { e.preventDefault(); add(matches[active].code); }
            if (e.key === "Escape") setQ("");
          }} />
        {matches.length > 0 && (
          <ul id={listId} role="listbox" className="combo-list">
            {matches.map((c, i) => (
              <li key={c.code} role="option" aria-selected={i === active} onPointerDown={(e) => { e.preventDefault(); add(c.code); }}
                onPointerEnter={() => setActive(i)}>
                <span aria-hidden="true">{flag(c.code)}</span> {c.name} <span className="muted mono">{c.code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
