"use client";

import { CATEGORIES } from "../../utils/blueprint-category";

// Auswahl der Kategorie (Rüstung, Waffen, ...) mit Anzahl. Leere Kategorien werden ausgeblendet.
export default function CategoryChips({
  counts,
  total,
  active,
  onChange,
}: {
  counts: Record<string, number>;
  total: number;
  active: string;
  onChange: (id: string) => void;
}) {
  const items = [
    { id: "all", label: "Alle", n: total },
    ...CATEGORIES.map((c) => ({ id: c.id as string, label: c.label, n: counts[c.id] ?? 0 })).filter(
      (c) => c.n > 0 || c.id === active
    ),
  ];
  return (
    <div role="group" aria-label="Nach Art filtern" className="hud-scroll-x -mx-5 flex gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
      {items.map((c) => {
        const on = c.id === active;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.id)}
            className={`flex shrink-0 items-center gap-2 border px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition-colors duration-200 ${
              on
                ? "border-hud-accent bg-hud-accent/15 text-hud-accent"
                : "border-hud-line-strong text-hud-muted hover:border-hud-accent/60 hover:text-hud-text"
            }`}
          >
            {c.label}
            <span className={`tabular-nums text-xs ${on ? "text-hud-accent" : "text-hud-muted/70"}`}>{c.n}</span>
          </button>
        );
      })}
    </div>
  );
}
