"use client";

import { useMemo, useState } from "react";
import { categoryLabel } from "../../utils/blueprint-category";
import { sortRows, type Recipe, type SortMode } from "../../utils/item-info";
import BlueprintAdminActions from "./BlueprintAdminActions";
import CategoryChips from "./CategoryChips";
import BlueprintTools from "./BlueprintTools";
import type { RecipeState } from "./RecipePanel";
import SortSelect from "./SortSelect";

export type OrgBlueprint = {
  id: number;
  name: string;
  owners: string[];
  mine: boolean;
  category: string; // wirksame Kategorie (automatisch oder von Hand gesetzt)
  auto: string; // die automatisch erkannte
  override: string | null; // nur die von Hand gesetzte
  info: string | null; // Beschreibung, z. B. "Military · Size 3 · Grade A · Shield Generator"
  recipe: Recipe | null; // Zutaten und Herstellzeit
  recipeState: RecipeState; // warum ein Rezept fehlt (nicht geladen, gibt es nicht, nicht geklärt)
  lastAt: string | null; // wann zuletzt jemand sie bekam (für die Sortierung)
  lastReal: string | null; // dasselbe, aber nur echte Erhaltszeiten (für die Anzeige)
};

const PAGE = 50;
const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

const SORTS: { id: SortMode; label: string }[] = [
  { id: "newest", label: "Zuletzt erhalten" },
  { id: "oldest", label: "Zuerst erhalten" },
  { id: "az", label: "Name A bis Z" },
  { id: "za", label: "Name Z bis A" },
  { id: "most", label: "Meiste Besitzer" },
  { id: "least", label: "Wenigste Besitzer" },
];

export default function BlueprintSearch({
  rows,
  canEdit,
  shopping,
}: {
  rows: OrgBlueprint[];
  canEdit: boolean;
  shopping: Record<number, number>; // Blaupause -> Stückzahl auf deiner Einkaufsliste
}) {
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyCraftable, setOnlyCraftable] = useState(false);
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [limit, setLimit] = useState(PAGE);

  // Erst Suche und "nur fehlende", danach die Kategorie. So zeigen die Zahlen an den Knöpfen,
  // wie viele Treffer es in der jeweiligen Kategorie gäbe.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!onlyMissing || !r.mine) &&
        (!onlyCraftable || r.owners.length > 0) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          (r.info ?? "").toLowerCase().includes(q) ||
          r.owners.some((o) => o.toLowerCase().includes(q)) ||
          (r.recipe?.items ?? []).some((i) => i.name.toLowerCase().includes(q)))
    );
  }, [rows, query, onlyMissing, onlyCraftable]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of base) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [base]);

  const filtered = useMemo(() => {
    const list = cat === "all" ? base : base.filter((r) => r.category === cat);
    return sortRows(list, sort, { name: (r) => r.name, time: (r) => r.lastAt, owners: (r) => r.owners.length });
  }, [base, cat, sort]);

  const reset = () => setLimit(PAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            reset();
          }}
          placeholder="Blaupause, Zutat oder Mitglied suchen"
          aria-label="Blaupausen durchsuchen"
          className="hud-input max-w-md"
        />
        <SortSelect id="sort-org" value={sort} onChange={(v) => { setSort(v); reset(); }} options={SORTS} />
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-hud-accent"
            checked={onlyMissing}
            onChange={(e) => {
              setOnlyMissing(e.target.checked);
              reset();
            }}
          />
          Nur welche, die ich noch nicht habe
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-hud-accent"
            checked={onlyCraftable}
            onChange={(e) => {
              setOnlyCraftable(e.target.checked);
              reset();
            }}
          />
          Nur welche, die jemand in der Org besitzt
        </label>
      </div>

      <CategoryChips
        counts={counts}
        total={base.length}
        active={cat}
        onChange={(id) => {
          setCat(id);
          reset();
        }}
      />

      <ul className="hud-stagger grid max-w-3xl gap-3">
        {filtered.slice(0, limit).map((r) => (
          <li key={r.id} className="hud-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold tracking-wide">
                  {r.name}
                  {r.mine && (
                    <span className="ml-3 border border-hud-accent/60 px-2 py-0.5 align-middle font-display text-xs font-semibold uppercase tracking-widest text-hud-accent">
                      Hast du
                    </span>
                  )}
                </p>
                <p className="text-sm text-hud-muted">
                  {categoryLabel(r.category)}
                  {r.info ? <span className="text-hud-text"> · {r.info}</span> : null}
                </p>
                {r.lastReal && (
                  <p className="text-xs text-hud-muted">Zuletzt erhalten am {day.format(new Date(r.lastReal))}</p>
                )}
              </div>
              <span className="font-display text-lg font-bold tabular-nums text-hud-amber">
                {r.owners.length} Besitzer
              </span>
            </div>
            {r.owners.length === 0 ? (
              <p className="mt-2 text-sm text-hud-muted">Niemand in der Org besitzt sie zurzeit.</p>
            ) : (
              <div className="mt-3">
                <p className="hud-label mb-1">Besitzer</p>
                <ul className="flex flex-wrap gap-2">
                  {r.owners.map((o) => (
                    <li key={o} className="border border-hud-line-strong px-2.5 py-1 text-sm">
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <BlueprintTools
              id={r.id}
              recipe={r.recipe}
              recipeState={r.recipeState}
              ownerCount={r.owners.length}
              canRequest={!r.mine && r.owners.length > 0}
              inList={shopping[r.id] ?? 0}
            />
            {canEdit && (
              <BlueprintAdminActions
                id={r.id}
                name={r.name}
                owners={r.owners.length}
                auto={r.auto}
                override={r.override}
              />
            )}
          </li>
        ))}
        {filtered.length === 0 && <li className="text-hud-muted">Keine Treffer.</li>}
      </ul>

      <div className="flex items-center gap-4">
        <p className="text-sm text-hud-muted">
          {Math.min(limit, filtered.length)} von {filtered.length} Blaupausen
        </p>
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + PAGE)} className="hud-btn-ghost hud-btn-sm">
            Mehr anzeigen
          </button>
        )}
      </div>

      <p className="max-w-3xl text-xs text-hud-muted">
        Eigenschaften und Rezepte (Klasse, Grade, Größe, Zutaten, Herstellzeit) stammen aus der Star Citizen Wiki API
        (api.star-citizen.wiki, Community-Projekt, inoffiziell). Bei Blaupausen ohne Eintrag dort wird nur abgeleitet,
        was der interne Name hergibt.
      </p>
    </div>
  );
}
