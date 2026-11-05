// Holt Beschreibungen zu Blaupausen aus der Star Citizen Wiki API und speichert sie.
// Läuft nur auf dem Server und braucht den Service-Schlüssel (schreibt am Nutzer vorbei).
import { createAdminClient } from "./supabase/admin";
import { lookupItem, paced } from "./item-info";

const RETRY_AFTER_DAYS = 7;

export type EnrichResult = {
  configured: boolean;
  checked: number; // Blaupausen, die in dieser Runde nachgeschlagen wurden
  found: number; // davon mit Beschreibung
  remaining: number; // noch offen
  withRecipe: number; // davon mit Rezept
  limited: boolean; // die API hat gebremst (zu viele Anfragen)
  unreachable: number; // Abfragen, die nicht beantwortet wurden
};

const staleBefore = () => new Date(Date.now() - RETRY_AFTER_DAYS * 24 * 3600 * 1000).toISOString();
// Wenn das Rezept nicht geklärt werden konnte, wird es nach einer Stunde noch einmal versucht
const retryUnknownBefore = () => new Date(Date.now() - 3600 * 1000).toISOString();

// Zwischen zwei Anfragen mindestens 1,2 Sekunden: höchstens etwa 50 pro Minute (erlaubt sind 60)
const GAP_MS = Number(process.env.WIKI_API_GAP_MS ?? 1200);

export async function enrichSome(limit: number, maxMs = 20000): Promise<EnrichResult> {
  const db = createAdminClient();
  const empty: EnrichResult = { configured: false, checked: 0, found: 0, withRecipe: 0, remaining: 0, limited: false, unreachable: 0 };
  if (!db) return empty;

  // Offen: noch nie nachgeschlagen, Rezept unklar (nach einer Stunde), oder nichts gefunden (nach 7 Tagen)
  const pending = () =>
    db
      .from("blueprints")
      .select("id, name, ini_key", { count: "exact" })
      .or(
        `recipe_checked_at.is.null,and(recipe_state.eq.unknown,recipe_checked_at.lt.${retryUnknownBefore()}),and(details.is.null,recipe_checked_at.lt.${staleBefore()})`
      )
      .order("created_at", { ascending: false });

  const { data, error } = await pending().limit(limit);
  if (error || !data) return { ...empty, configured: true };

  const started = Date.now();
  let checked = 0;
  let found = 0;
  let withRecipe = 0;
  let unreachable = 0;
  let limited = false;
  const slowFetch = paced(fetch as never, GAP_MS) as never;

  for (const row of data as { id: number; name: string; ini_key: string | null }[]) {
    if (Date.now() - started > maxMs) break;

    const r = await lookupItem(slowFetch, { name: row.name, ini: row.ini_key });
    if (r.status === "error") {
      if (r.limited) {
        limited = true;
        break;
      }
      unreachable++;
      continue; // nicht als geprüft markieren, damit es später noch einmal versucht wird
    }
    const now = new Date().toISOString();
    if (r.status === "found") {
      // Rezept unklar: Beschreibung speichern und vermerken. Das nächste Mal gibt es nach einer Stunde einen neuen Versuch,
      // so blockiert dieser Eintrag die übrigen nicht.
      if (r.recipeState === "unknown") {
        unreachable++;
        found++;
        await db
          .from("blueprints")
          .update({ ...(r.details ? { details: r.details, details_checked_at: now } : {}), recipe_state: "unknown", recipe_checked_at: now })
          .eq("id", row.id);
        continue;
      }
      checked++;
      found++;
      if (r.recipe) withRecipe++;
      // Bereits Vorhandenes wird nur ergänzt oder aktualisiert, nie durch "nichts" ersetzt
      await db
        .from("blueprints")
        .update({
          ...(r.details ? { details: r.details, details_checked_at: now } : {}),
          ...(r.recipe ? { recipe: r.recipe } : {}),
          recipe_state: r.recipe ? "ok" : "none",
          recipe_checked_at: now,
        })
        .eq("id", row.id);
    } else {
      checked++;
      await db.from("blueprints").update({ details_checked_at: now, recipe_checked_at: now, recipe_state: "none" }).eq("id", row.id);
    }
  }

  const { count } = await pending().limit(1);
  return { configured: true, checked, found, withRecipe, remaining: count ?? 0, limited, unreachable };
}

// Alles, was nicht geklärt werden konnte, sofort noch einmal versuchen (statt eine Stunde zu warten)
export async function retryUnknownRecipes(): Promise<number> {
  const db = createAdminClient();
  if (!db) return 0;
  const { data } = await db
    .from("blueprints")
    .update({ recipe_checked_at: null })
    .eq("recipe_state", "unknown")
    .select("id");
  return data?.length ?? 0;
}
