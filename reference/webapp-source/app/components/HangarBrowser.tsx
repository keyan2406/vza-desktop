"use client";

import { useMemo, useState } from "react";

export type HangarRow = {
  id: number;
  player: string;
  ship: string;
  manufacturer: string;
  source: "ingame" | "pledge";
  value: number;
};

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export default function HangarBrowser({ rows }: { rows: HangarRow[] }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "ingame" | "pledge">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (source === "all" || r.source === source) &&
        (!q ||
          r.player.toLowerCase().includes(q) ||
          r.ship.toLowerCase().includes(q) ||
          r.manufacturer.toLowerCase().includes(q))
    );
  }, [rows, query, source]);

  // Zusammenfassung pro Spieler, sobald der Suchbegriff zu einem Spielernamen passt.
  const summaries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const byPlayer = new Map<
      string,
      { player: string; ingame: number; pledge: number; value: number }
    >();
    for (const r of rows) {
      if (!r.player.toLowerCase().includes(q)) continue;
      const s = byPlayer.get(r.player) ?? {
        player: r.player,
        ingame: 0,
        pledge: 0,
        value: 0,
      };
      if (r.source === "pledge") {
        s.pledge += 1;
        s.value += r.value;
      } else {
        s.ingame += 1;
      }
      byPlayer.set(r.player, s);
    }
    return [...byPlayer.values()].slice(0, 6);
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nach Spieler, Schiff oder Hersteller suchen"
          aria-label="Hangare durchsuchen"
          className="hud-input max-w-md"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as "all" | "ingame" | "pledge")}
          aria-label="Nach Herkunft filtern"
          className="hud-input w-auto"
        >
          <option value="all">Alle Herkünfte</option>
          <option value="ingame">Ingame gekauft</option>
          <option value="pledge">Pledge (Storecredit)</option>
        </select>
      </div>

      {summaries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((p) => (
            <div
              key={p.player}
              className="hud-panel p-4"
            >
              <p className="font-display text-xl font-semibold tracking-wide">{p.player}</p>
              <p className="mt-1 text-sm text-hud-muted">
                {p.ingame} Ingame · {p.pledge} Pledge
              </p>
              <p className="hud-label mt-3">Ausgegeben (Pledges)</p>
              <p className="font-display text-3xl font-bold tabular-nums text-hud-amber">{euro.format(p.value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto border border-hud-line bg-hud-panel/60">
        <table className="w-full text-left">
          <thead className="bg-hud-accent/5">
            <tr>
              <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted">Spieler</th>
              <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted">Schiff</th>
              <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted">Hersteller</th>
              <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted">Herkunft</th>
              <th className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted">Pledge-Wert</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-hud-line hover:bg-hud-accent/5">
                <td className="px-4 py-2 font-medium">{r.player}</td>
                <td className="px-4 py-2">{r.ship}</td>
                <td className="px-4 py-2 text-hud-muted">{r.manufacturer}</td>
                <td
                  className={`px-4 py-2 font-display font-semibold uppercase tracking-wider ${
                    r.source === "pledge" ? "text-hud-amber" : "text-hud-accent"
                  }`}
                >
                  {r.source === "pledge" ? "Pledge" : "Ingame"}
                </td>
                <td className="px-4 py-2 text-hud-muted">
                  {r.source === "pledge" && r.value > 0 ? euro.format(r.value) : "–"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-hud-muted">
                  Keine Treffer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-hud-muted">
        {filtered.length} von {rows.length} Einträgen
      </p>
    </div>
  );
}
