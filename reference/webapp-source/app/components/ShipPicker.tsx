"use client";

import { useId, useMemo, useState } from "react";

export type Ship = { id: number; name: string; manufacturer: string };

// Suchfeld mit Vorschlägen. query ist der Text im Feld, value das gewählte Schiff.
export default function ShipPicker({
  ships,
  query,
  value,
  onChange,
  label,
}: {
  ships: Ship[];
  query: string;
  value: Ship | null;
  onChange: (query: string, ship: Ship | null) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ships.slice(0, 8);
    return ships
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.manufacturer.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, ships]);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={query}
        placeholder="Schiff suchen, z. B. Prospector"
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        aria-invalid={query.trim() !== "" && !value}
        className="hud-input"
      />
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="hud-panel absolute z-10 mt-1 max-h-64 w-full overflow-auto"
        >
          {matches.map((s) => (
            <li key={s.id} role="option" aria-selected={value?.id === s.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(`${s.name} (${s.manufacturer})`, s);
                  setOpen(false);
                }}
                className="flex w-full justify-between gap-4 px-3 py-2 text-left hover:bg-hud-accent/10"
              >
                <span>{s.name}</span>
                <span className="text-sm text-hud-muted">{s.manufacturer}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
