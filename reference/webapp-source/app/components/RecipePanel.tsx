"use client";

import { useState } from "react";
import { formatAmount, formatDuration, wikiBlueprintUrl, type Recipe } from "../../utils/item-info";

export type RecipeState = "ok" | "none" | "unknown" | null;

// Inhalt des Rezept-Bereichs: Herstellzeit, Zutaten (auf Wunsch für mehrere Stück), Verfügbarkeit.
// Fehlt das Rezept, steht hier der Grund, damit man nicht rätseln muss.
export default function RecipeBody({ recipe, state }: { recipe: Recipe | null; state: RecipeState }) {
  const [count, setCount] = useState(1);

  if (!recipe) {
    const text =
      state === "none"
        ? "Für diese Blaupause kennt die Wiki-Datenbank kein Rezept."
        : state === "unknown"
          ? "Das Rezept konnte noch nicht geladen werden. Ein Officer kann es in der Org-Suche erneut versuchen."
          : "Das Rezept ist noch nicht geladen. Ein Officer kann es in der Org-Suche nachladen.";
    return <p className="text-hud-muted">{text}</p>;
  }

  const link = wikiBlueprintUrl(recipe.id);
  const facts: string[] = [];
  if (recipe.secs !== undefined) facts.push(`Herstellzeit ${formatDuration(recipe.secs)}`);
  if (recipe.free === true) facts.push("ohne Blaupause verfügbar");
  if (recipe.free === false) facts.push("nur mit Blaupause");
  if (recipe.free === false && recipe.missions) {
    facts.push(`wird von ${recipe.missions} ${recipe.missions === 1 ? "Mission" : "Missionen"} vergeben`);
  }

  return (
    <div className="space-y-3">
      {facts.length > 0 && <p className="text-hud-muted">{facts.join(" · ")}</p>}

      {recipe.items.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <p className="hud-label">Zutaten</p>
            <label className="flex items-center gap-2 text-hud-muted">
              für
              <input
                type="number"
                min={1}
                max={99}
                value={count}
                aria-label="Anzahl der Stücke"
                onChange={(e) => setCount(Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 1))))}
                className="hud-input w-20 py-1"
              />
              Stück
            </label>
          </div>
          <ul className="max-w-md divide-y divide-hud-line border border-hud-line">
            {recipe.items.map((i) => (
              <li key={i.name} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
                <span>{i.name}</span>
                <span className="tabular-nums text-hud-amber">{formatAmount(i, count) || "–"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {link && (
        <p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-hud-accent underline">
            Mehr dazu in der Wiki-Datenbank
          </a>
        </p>
      )}
    </div>
  );
}
