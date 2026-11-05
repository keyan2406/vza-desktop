// Holt alle herstellbaren Blaupausen und die Missionen, die sie freischalten, aus der Star Citizen Wiki API
// und speichert sie in der Tabelle catalog_blueprints. Frei von Next.js-Abhängigkeiten, damit es sich testen lässt.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSources, parseBlueprint, parseMission, type CatalogBlueprint, type MissionRef } from "./catalog";

const BASE = "https://api.star-citizen.wiki/api";
const PAGE_SIZE = 200;
const MAX_PAGES = 30;
const CHUNK = 150;

type FetchLike = (url: string, init?: object) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

type Pages = { items: unknown[]; pages: number; complete: boolean; limited: boolean; error: string | null };

async function fetchPages(fetchImpl: FetchLike, urlFor: (page: number) => string): Promise<Pages> {
  const items: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await fetchImpl(urlFor(page), {
        headers: { Accept: "application/json", "User-Agent": "vza-org-manager (private, non-commercial clan tool)" },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return { items, pages: page - 1, complete: false, limited: false, error: "Die Datenbank war nicht erreichbar." };
    }
    if (res.status === 429) return { items, pages: page - 1, complete: false, limited: true, error: "Die Datenbank bremst (zu viele Anfragen)." };
    if (!res.ok) return { items, pages: page - 1, complete: false, limited: false, error: `Die Datenbank antwortete mit Fehler ${res.status}.` };

    let body: { data?: unknown; meta?: { last_page?: unknown }; links?: { next?: unknown } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return { items, pages: page - 1, complete: false, limited: false, error: "Die Antwort der Datenbank war nicht lesbar." };
    }
    const data = Array.isArray(body?.data) ? body.data : [];
    items.push(...data);
    const last = typeof body?.meta?.last_page === "number" ? body.meta.last_page : null;
    const noNext = body?.links && "next" in body.links && !body.links.next;
    if (data.length < PAGE_SIZE || (last !== null && page >= last) || noNext) {
      return { items, pages: page, complete: true, limited: false, error: null };
    }
  }
  return { items, pages: MAX_PAGES, complete: false, limited: false, error: "Mehr Seiten als erwartet." };
}

export type SyncResult = {
  ok: boolean;
  blueprints: number;
  missions: number;
  withSources: number;
  givers: number;
  limited: boolean;
  warnings: string[];
};

export async function syncCatalog(opts: { fetchImpl: FetchLike; db: SupabaseClient; now?: Date }): Promise<SyncResult> {
  const { fetchImpl, db } = opts;
  const nowIso = (opts.now ?? new Date()).toISOString();
  const result: SyncResult = { ok: false, blueprints: 0, missions: 0, withSources: 0, givers: 0, limited: false, warnings: [] };

  // 1) Blaupausen
  const bpPages = await fetchPages(fetchImpl, (p) => `${BASE}/blueprints?page[size]=${PAGE_SIZE}&page[number]=${p}`);
  if (!bpPages.complete) {
    result.limited = bpPages.limited;
    result.warnings.push(`Blaupausen konnten nicht vollständig geladen werden: ${bpPages.error}`, "Es wurde nichts geändert.");
    return result;
  }
  const byUuid = new Map<string, CatalogBlueprint>();
  for (const raw of bpPages.items) {
    const b = parseBlueprint(raw);
    if (b) byUuid.set(b.uuid, b);
  }
  const bps = [...byUuid.values()];
  if (bps.length === 0) {
    result.warnings.push("Die Datenbank hat keine Blaupausen geliefert. Es wurde nichts geändert.");
    return result;
  }

  // 2) Missionen, die Blaupausen vergeben
  const mPages = await fetchPages(fetchImpl, (p) => `${BASE}/missions?filter[has_blueprints]=true&filter[grouped]=true&page[size]=${PAGE_SIZE}&page[number]=${p}`);
  const missions = mPages.items.map(parseMission).filter((m): m is MissionRef => !!m);
  const sourcesKnown = mPages.complete;
  if (!sourcesKnown) {
    result.limited = mPages.limited;
    result.warnings.push(`Missionen konnten nicht vollständig geladen werden: ${mPages.error} Die bisherigen Angaben zu Missionsgebern bleiben unverändert.`);
  }
  const sources = sourcesKnown ? buildSources(bps, missions) : new Map();

  // 3) Speichern (bestehende Angaben wie "detail" bleiben erhalten)
  const rows = bps.map((b) => ({
    uuid: b.uuid,
    name: b.name,
    class_name: b.class_name,
    type: b.type,
    type_label: b.type_label,
    grade: b.grade,
    craft_secs: b.craft_secs,
    free: b.free,
    ingredient_count: b.ingredient_count,
    ingredients: b.ingredients,
    game_version: b.game_version,
    synced_at: nowIso,
    ...(sourcesKnown
      ? { sources: sources.get(b.uuid) ?? [], missions_count: Math.max(b.missions_count, sources.get(b.uuid)?.length ?? 0) }
      : {}),
  }));

  const before = await db.from("catalog_blueprints").select("uuid", { count: "exact", head: true });
  const previous = before.count ?? 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("catalog_blueprints").upsert(rows.slice(i, i + CHUNK), { onConflict: "uuid" });
    if (error) {
      result.warnings.push("Das Speichern ist fehlgeschlagen. Der Katalog ist dadurch möglicherweise nur teilweise aktualisiert, versuche es noch einmal.");
      return result;
    }
  }

  // 4) Veraltetes entfernen, aber nur, wenn die neue Liste plausibel ist (Schutz vor leeren oder halben Antworten)
  if (previous > 20 && bps.length < previous * 0.5) {
    result.warnings.push(`Die Liste ist viel kürzer als vorher (${bps.length} statt ${previous}). Veraltete Einträge wurden nicht entfernt.`);
  } else {
    const { error } = await db.from("catalog_blueprints").delete().lt("synced_at", nowIso);
    if (error) result.warnings.push("Veraltete Einträge konnten nicht entfernt werden.");
  }

  const withSources = [...sources.values()].filter((l) => l.length > 0).length;
  const givers = new Set([...sources.values()].flat().map((s) => s.g)).size;
  await db.from("catalog_meta").upsert(
    {
      id: 1,
      synced_at: nowIso,
      blueprint_count: bps.length,
      mission_count: sourcesKnown ? missions.length : null,
      giver_count: sourcesKnown ? givers : null,
      game_version: bps.find((b) => b.game_version)?.game_version ?? null,
    },
    { onConflict: "id" }
  );

  result.ok = true;
  result.blueprints = bps.length;
  result.missions = missions.length;
  result.withSources = withSources;
  result.givers = givers;
  return result;
}
