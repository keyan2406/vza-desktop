// Datensicherung: alle wichtigen Tabellen als eine JSON-Datei. Wird Stück für Stück geschrieben (Streaming),
// damit auch große Datenmengen weder den Speicher noch die Antwortgröße von Vercel sprengen.
import type { SupabaseClient } from "@supabase/supabase-js";

export type ExportTable = { name: string; order: string[] };

// Nicht dabei: Schlüssel, Einladungs- und Zurücksetz-Codes (geheim und kurzlebig) sowie der Blaupausen-Katalog (lässt sich neu abgleichen)
export const EXPORT_TABLES: ExportTable[] = [
  { name: "profiles", order: ["id"] },
  { name: "level_thresholds", order: ["level"] },
  { name: "ships", order: ["id"] },
  { name: "hangar_ships", order: ["id"] },
  { name: "events", order: ["id"] },
  { name: "event_role_requirements", order: ["id"] },
  { name: "event_ship_requirements", order: ["id"] },
  { name: "event_signups", order: ["event_id", "user_id"] },
  { name: "points_log", order: ["id"] },
  { name: "loot_items", order: ["id"] },
  { name: "loot_claims", order: ["id"] },
  { name: "loot_log", order: ["id"] },
  { name: "cash_ledger", order: ["id"] },
  { name: "blueprints", order: ["id"] },
  { name: "player_blueprints", order: ["user_id", "blueprint_id"] },
  { name: "craft_requests", order: ["id"] },
  { name: "shopping_list", order: ["user_id", "blueprint_id"] },
  { name: "maintenance_runs", order: ["name"] },
];

export const EXCLUDED_TABLES = [
  "catalog_blueprints",
  "catalog_meta",
  "discord_link_codes",
  "import_tokens",
  "invite_codes",
  "login_attempts",
  "password_reset_codes",
];

const PAGE = 1000;

export async function* exportChunks(db: SupabaseClient, now: Date = new Date()): AsyncGenerator<string> {
  yield `{"app":"vza-org-manager","exported_at":${JSON.stringify(now.toISOString())},"tables":{`;
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  let firstTable = true;
  for (const t of EXPORT_TABLES) {
    yield `${firstTable ? "" : ","}${JSON.stringify(t.name)}:[`;
    firstTable = false;
    let n = 0;
    for (let offset = 0; ; offset += PAGE) {
      let q = db.from(t.name).select("*");
      for (const col of t.order) q = q.order(col, { ascending: true });
      const { data, error } = await q.range(offset, offset + PAGE - 1);
      if (error) {
        errors.push(`${t.name}: ${error.message}`);
        break;
      }
      const rows = (data ?? []) as unknown[];
      for (const r of rows) {
        yield `${n > 0 ? "," : ""}${JSON.stringify(r)}`;
        n++;
      }
      if (rows.length < PAGE) break;
    }
    counts[t.name] = n;
    yield "]";
  }
  yield `},"counts":${JSON.stringify(counts)},"errors":${JSON.stringify(errors)}}`;
}

// Dateiname mit dem Datum in deutscher Zeit
export function exportFilename(now: Date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `vza-sicherung-${day}.json`;
}
