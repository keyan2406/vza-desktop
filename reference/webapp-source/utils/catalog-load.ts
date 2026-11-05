import { cacheLife, cacheTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { giverTiles, toLightRow, type DbRow, type LightRow, type Tile } from "./catalog";
import { fetchAll } from "./fetch-all";
import { createAdminClient } from "./supabase/admin";

export type CatalogMeta = {
  syncedAt: string | null;
  blueprintCount: number | null;
  missionCount: number | null;
  giverCount: number | null;
  version: string | null;
};
export type CatalogData = { rows: LightRow[]; tiles: Tile[]; meta: CatalogMeta };

const COLS = "uuid, name, class_name, type, type_label, grade, craft_secs, free, ingredients, missions_count, sources";

export async function loadCatalog(db: SupabaseClient): Promise<CatalogData> {
  const [rows, metaRes] = await Promise.all([
    fetchAll<DbRow>((from, to) => db.from("catalog_blueprints").select(COLS).order("name").range(from, to)),
    db.from("catalog_meta").select("synced_at, blueprint_count, mission_count, giver_count, game_version").eq("id", 1).maybeSingle(),
  ]);
  const light = rows.map(toLightRow);
  const m = (metaRes.data ?? null) as {
    synced_at: string | null;
    blueprint_count: number | null;
    mission_count: number | null;
    giver_count: number | null;
    game_version: string | null;
  } | null;
  return {
    rows: light,
    tiles: giverTiles(light),
    meta: {
      syncedAt: m?.synced_at ?? null,
      blueprintCount: m?.blueprint_count ?? null,
      missionCount: m?.mission_count ?? null,
      giverCount: m?.giver_count ?? null,
      version: m?.game_version ?? null,
    },
  };
}

// Der Katalog ist für alle Mitglieder gleich. Deshalb wird er höchstens einmal pro Stunde aus der Datenbank geholt
// und sonst aus dem Zwischenspeicher gegeben. Die Seite prüft vorher, dass die Person freigegeben ist.
export async function getCatalogCached(): Promise<CatalogData | null> {
  "use cache";
  const db = createAdminClient();
  if (!db) {
    cacheLife("seconds"); // ohne Dienst-Schlüssel nichts länger merken
    return null;
  }
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag("catalog");
  return loadCatalog(db);
}
