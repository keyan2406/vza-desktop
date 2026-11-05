"use client";

import { useMemo, useState } from "react";
import { removeBlueprint } from "../(app)/blueprints/actions";
import { categoryLabel } from "../../utils/blueprint-category";
import { sortRows, type Recipe, type SortMode } from "../../utils/item-info";
import CategoryChips from "./CategoryChips";
import ConfirmSubmit from "./ConfirmSubmit";
import BlueprintTools from "./BlueprintTools";
import type { RecipeState } from "./RecipePanel";
import SortSelect from "./SortSelect";

export type MineRow = {
  id: number;
  name: string;
  at: string | null; // echte Erhaltszeit (falls bekannt)
  sortAt: string | null; // Erhaltszeit, sonst der Tag des Eintragens
  category: string;
  info: string | null;
  recipe: Recipe | null;
  recipeState: RecipeState;
};

const PAGE = 40;
const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

const SORTS: { id: SortMode; label: string }[] = [
  { id: "newest", label: "Zuletzt erhalten" },
  { id: "oldest", label: "Zuerst erhalten" },
  { id: "az", label: "Name A bis Z" },
  { id: "za", label: "Name Z bis A" },
];

export default function MyBlueprints({ rows, shopping }: { rows: MineRow[]; shopping: Record<number, number> }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [limit, setLimit] = useState(PAGE);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            (r.info ?? "").toLowerCase().includes(q) ||
            (r.recipe?.items ?? []).some((i) => i.name.toLowerCase().includes(q))
        )
      : rows;
  }, [rows, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of base) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [base]);

  const filtered = useMemo(() => {
    const list = cat === "all" ? base : base.filter((r) => r.category === cat);
    return sortRows(list, sort, { name: (r) => r.name, time: (r) => r.sortAt });
  }, [base, cat, sort]);

  if (rows.length === 0) {
    return (
      <p className="text-hud-muted">
        Du hast noch keine Blaupausen. Lies sie direkt aus dem Spiel aus, importiere sie aus dem Launcher oder
        trage sie von Hand ein.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="In deiner Sammlung suchen (auch nach Zutaten)"
          aria-label="In deiner Sammlung suchen"
          className="hud-input max-w-md"
        />
        <SortSelect id="sort-mine" value={sort} onChange={(v) => { setSort(v); setLimit(PAGE); }} options={SORTS} />
      </div>

      <CategoryChips
        counts={counts}
        total={base.length}
        active={cat}
        onChange={(id) => {
          setCat(id);
          setLimit(PAGE);
        }}
      />

      <ul className="hud-panel max-w-2xl divide-y divide-hud-line">
        {filtered.slice(0, limit).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-2">
            <div className="min-w-0">
              <p className="font-medium">{m.name}</p>
              <p className="text-sm text-hud-muted">
                {categoryLabel(m.category)}
                {m.info ? <span className="text-hud-text"> · {m.info}</span> : null}
              </p>
              <p className="text-xs text-hud-muted">
                {m.at
                  ? `Erhalten am ${day.format(new Date(m.at))}`
                  : m.sortAt
                    ? `Eingetragen am ${day.format(new Date(m.sortAt))}`
                    : "Zeitpunkt unbekannt"}
              </p>
              <BlueprintTools
                id={m.id}
                recipe={m.recipe}
                recipeState={m.recipeState}
                ownerCount={0}
                canRequest={false}
                inList={shopping[m.id] ?? 0}
              />
            </div>
            <form action={removeBlueprint}>
              <input type="hidden" name="blueprint_id" value={m.id} />
              <ConfirmSubmit
                message={`„${m.name}“ aus deiner Sammlung entfernen?`}
                className="hud-btn-ghost hud-btn-sm"
              >
                Entfernen
              </ConfirmSubmit>
            </form>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-4 py-6 text-center text-hud-muted">Keine Treffer.</li>}
      </ul>

      <div className="flex items-center gap-4">
        <p className="text-sm text-hud-muted">
          {Math.min(limit, filtered.length)} von {filtered.length}
        </p>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + PAGE)} className="hud-btn-ghost hud-btn-sm">
            Mehr anzeigen
          </button>
        )}
      </div>
    </div>
  );
}
