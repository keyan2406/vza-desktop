// Katalog aller herstellbaren Blaupausen im Spiel (Daten aus der Star Citizen Wiki API).
// Reine Logik ohne Server-Abhängigkeiten, damit sie sich testen lässt.
import { classify } from "./blueprint-category";
import { parseRecipe, type Ingredient } from "./item-info";

export const GROUPS = [
  { id: "qdrive", label: "Quantenantriebe" },
  { id: "shield", label: "Schildgeneratoren" },
  { id: "cooler", label: "Kühler" },
  { id: "power", label: "Power Plants" },
  { id: "radar", label: "Radare" },
  { id: "jdrive", label: "Sprungantriebe" },
  { id: "shipweapon", label: "Schiffswaffen" },
  { id: "weapon", label: "Waffen (zu Fuß)" },
  { id: "magazine", label: "Magazine & Batterien" },
  { id: "armor", label: "Rüstung" },
  { id: "other", label: "Sonstiges" },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];
export const groupLabel = (id: string) => GROUPS.find((g) => g.id === id)?.label ?? "Sonstiges";
const SHIP_GROUPS = new Set<GroupId>(["qdrive", "shield", "cooler", "power", "radar", "jdrive", "shipweapon"]);

const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const normName = (s: string) => s.trim().toLowerCase();

// ---------- Gruppe und Größe ----------

export function groupOf(name: string, className: string | null, type: string | null): GroupId {
  const t = (type ?? "").toLowerCase();
  const c = className ?? "";
  if (/^SHLD_/i.test(c) || /shield/.test(t)) return "shield";
  if (/^COOL_/i.test(c) || /cooler/.test(t)) return "cooler";
  if (/^POWR_/i.test(c) || /power/.test(t)) return "power";
  if (/^QDRV_/i.test(c) || /quantum/.test(t)) return "qdrive";
  if (/^RADR_/i.test(c) || /radar/.test(t)) return "radar";
  if (/^JDRV_/i.test(c) || /jump/.test(t)) return "jdrive";
  if (/^char_armor|^armor/.test(t)) return "armor";
  if (/weaponpersonal/.test(t)) return "weapon";
  if (/weapongun|turret|missile|ordnance/.test(t)) return "shipweapon";
  const cat = classify(name, c || null);
  if (cat === "ruestung") return "armor";
  if (cat === "waffen") return "weapon";
  if (cat === "schiffswaffen") return "shipweapon";
  if (cat === "munition") return "magazine";
  if (/magazine|battery|\bmag\b/i.test(name)) return "magazine";
  return "other";
}

// Größe steckt bei Schiffsteilen im Klassennamen: SHLD_BEHR_S03_7CA -> 3
export function sizeOf(className: string | null, group: GroupId): number | null {
  if (!className || !SHIP_GROUPS.has(group)) return null;
  const m = /_S(\d{1,2})(?:_|$)/i.exec(className);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 0 && n <= 12 ? n : null;
}

// ---------- Blaupausen aus der API lesen ----------

export type CatalogBlueprint = {
  uuid: string;
  name: string;
  class_name: string | null;
  type: string | null;
  type_label: string | null;
  grade: string | null;
  craft_secs: number | null;
  free: boolean;
  ingredient_count: number;
  ingredients: Ingredient[];
  missions_count: number;
  output_uuid: string | null;
  game_version: string | null;
};

export function parseBlueprint(raw: unknown): CatalogBlueprint | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const out = b.output && typeof b.output === "object" ? (b.output as Record<string, unknown>) : {};
  const uuid = typeof b.uuid === "string" && UUID.test(b.uuid) ? b.uuid.toLowerCase() : null;
  const name = str(b.output_name) ?? str(out.name);
  if (!uuid || !name) return null;
  const recipe = parseRecipe([{ ingredients: b.ingredients, craft_time_seconds: b.craft_time_seconds }]);
  const g = str(out.grade, 3);
  return {
    uuid,
    name,
    class_name: str(b.output_class, 150) ?? str(out.class, 150),
    type: str(out.type, 60),
    type_label: str(out.type_label, 60),
    grade: g && /^[A-G]$/i.test(g) ? g.toUpperCase() : null,
    craft_secs: num(b.craft_time_seconds) !== null ? Math.round(num(b.craft_time_seconds) as number) : null,
    free: b.is_available_by_default === true,
    ingredient_count: num(b.ingredient_count) ?? recipe?.items.length ?? 0,
    ingredients: recipe?.items ?? [],
    missions_count: num(b.unlocking_missions_count) ?? 0,
    output_uuid: typeof out.uuid === "string" && UUID.test(out.uuid) ? out.uuid.toLowerCase() : typeof b.output_item_uuid === "string" && UUID.test(b.output_item_uuid) ? b.output_item_uuid.toLowerCase() : null,
    game_version: str(b.game_version, 40),
  };
}

// ---------- Missionen lesen und den Blaupausen zuordnen ----------

export type Source = { g: string; t: string; r: string | null; s: string[] };
export type MissionRef = { giver: string; title: string; rank: string | null; systems: string[]; blueprints: { uuid: string | null; name: string | null }[] };

export function parseMission(raw: unknown): MissionRef | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  const title = str(m.title, 160);
  if (!title) return null;
  const faction = m.faction && typeof m.faction === "object" ? str((m.faction as Record<string, unknown>).name, 80) : null;
  const giver = faction ?? str(m.mission_giver, 80) ?? "Unbekannt";
  const standing = m.min_standing && typeof m.min_standing === "object" ? str((m.min_standing as Record<string, unknown>).name, 60) : null;
  const rankIdx = typeof m.rank_index === "number" && Number.isFinite(m.rank_index) ? m.rank_index : null;
  const rank = standing ?? str(m.min_standing_name, 60) ?? (rankIdx !== null ? `Rang ${rankIdx}` : null);
  const systems = (Array.isArray(m.star_systems) ? m.star_systems : []).map((s) => str(s, 40)).filter((s): s is string => !!s).slice(0, 5);
  const blueprints = (Array.isArray(m.blueprints) ? m.blueprints : [])
    .map((b) => {
      if (!b || typeof b !== "object") return null;
      const o = b as Record<string, unknown>;
      return { uuid: typeof o.uuid === "string" && UUID.test(o.uuid) ? o.uuid.toLowerCase() : null, name: str(o.name, 120) };
    })
    .filter((b): b is { uuid: string | null; name: string | null } => !!b && (!!b.uuid || !!b.name));
  return { giver, title, rank, systems, blueprints };
}

const MAX_SOURCES = 40;

// Ergebnis: uuid der Blaupause -> Quellen. Zuordnung über die Kennung der Blaupause, des Items oder den Namen.
export function buildSources(bps: CatalogBlueprint[], missions: MissionRef[]): Map<string, Source[]> {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const b of bps) {
    byId.set(b.uuid, b.uuid);
    if (b.output_uuid) byId.set(b.output_uuid, b.uuid);
    if (!byName.has(normName(b.name))) byName.set(normName(b.name), b.uuid);
  }
  const out = new Map<string, Source[]>();
  const seen = new Set<string>();
  for (const m of missions) {
    for (const ref of m.blueprints) {
      const target = (ref.uuid && byId.get(ref.uuid)) || (ref.name ? byName.get(normName(ref.name)) : undefined);
      if (!target) continue;
      const key = `${target}|${m.giver}|${m.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const list = out.get(target) ?? [];
      if (list.length < MAX_SOURCES) list.push({ g: m.giver, t: m.title, r: m.rank, s: m.systems });
      out.set(target, list);
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.g.localeCompare(b.g, "de") || a.t.localeCompare(b.t, "de"));
  return out;
}

// ---------- Leichte Zeilen für die Anzeige ----------

export type LightRow = {
  id: string;
  n: string; // Name
  nn: string; // Name klein (zum Abgleich mit der Org)
  g: GroupId;
  sub: string | null; // z. B. "Shield Generator"
  sz: number | null;
  gr: string | null;
  t: number | null; // Craftzeit in Sekunden
  f: boolean; // ohne Blaupause verfügbar
  m: { n: string; s?: number; q?: number }[]; // Zutaten
  mc: number; // Zahl der Missionen
  gv: string[]; // Missionsgeber (eindeutig)
};

export type DbRow = {
  uuid: string;
  name: string;
  class_name: string | null;
  type: string | null;
  type_label: string | null;
  grade: string | null;
  craft_secs: number | null;
  free: boolean;
  ingredients: unknown;
  missions_count: number;
  sources: unknown;
};

const cleanSources = (v: unknown): Source[] =>
  (Array.isArray(v) ? v : [])
    .map((s) => {
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const g = str(o.g, 80);
      const t = str(o.t, 160);
      if (!g || !t) return null;
      return { g, t, r: str(o.r, 60), s: (Array.isArray(o.s) ? o.s : []).map((x) => str(x, 40)).filter((x): x is string => !!x).slice(0, 5) };
    })
    .filter((s): s is Source => !!s)
    .slice(0, MAX_SOURCES);

export const sourcesOf = cleanSources;

export function toLightRow(r: DbRow): LightRow {
  const group = groupOf(r.name, r.class_name, r.type);
  const items = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .map((i) => {
      if (!i || typeof i !== "object") return null;
      const o = i as Record<string, unknown>;
      const name = str(o.name, 60);
      if (!name) return null;
      const s = num(o.scu);
      const q = num(o.qty);
      return { n: name, ...(s !== null ? { s } : {}), ...(q !== null ? { q } : {}) };
    })
    .filter((i): i is { n: string; s?: number; q?: number } => !!i)
    .slice(0, 12);
  const sources = cleanSources(r.sources);
  const gv = [...new Set(sources.map((s) => s.g))];
  const sub = r.type_label && !/^(undefined|unknown)$/i.test(r.type_label) ? r.type_label : null;
  return {
    id: r.uuid,
    n: r.name,
    nn: normName(r.name),
    g: group,
    sub,
    sz: sizeOf(r.class_name, group),
    gr: r.grade,
    t: r.craft_secs,
    f: r.free,
    m: items,
    mc: Math.max(r.missions_count ?? 0, sources.length),
    gv,
  };
}

export type Tile = { name: string; count: number };

export function giverTiles(rows: LightRow[]): Tile[] {
  const map = new Map<string, number>();
  for (const r of rows) for (const g of r.gv) map.set(g, (map.get(g) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));
}

// ---------- Filtern und Sortieren (läuft im Browser) ----------

export type OrgInfo = { id: number; owners: number; mine: boolean };
export type Filters = {
  q: string;
  group: GroupId | "all";
  size: number | "all";
  giver: string | null;
  onlyOrg: boolean;
  onlyMissing: boolean;
};
export type SortKey = "name" | "time" | "size" | "missions";

export const haystack = (r: LightRow) => [r.n, r.sub ?? "", groupLabel(r.g), ...r.m.map((m) => m.n), ...r.gv].join(" ").toLowerCase();

export function applyFilters(rows: LightRow[], f: Filters, org: Map<string, OrgInfo>, hay: Map<string, string>): LightRow[] {
  const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.group !== "all" && r.g !== f.group) return false;
    if (f.size !== "all" && r.sz !== f.size) return false;
    if (f.giver && !r.gv.includes(f.giver)) return false;
    const o = org.get(r.nn);
    if (f.onlyOrg && !(o && o.owners > 0)) return false;
    if (f.onlyMissing && o?.mine) return false;
    if (words.length) {
      const h = hay.get(r.id) ?? haystack(r);
      if (!words.every((w) => h.includes(w))) return false;
    }
    return true;
  });
}

export function sortRows(rows: LightRow[], key: SortKey): LightRow[] {
  const byName = (a: LightRow, b: LightRow) => a.n.localeCompare(b.n, "de", { sensitivity: "base", numeric: true });
  const out = [...rows];
  switch (key) {
    case "time":
      return out.sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity) || byName(a, b));
    case "size":
      return out.sort((a, b) => (a.sz ?? Infinity) - (b.sz ?? Infinity) || byName(a, b));
    case "missions":
      return out.sort((a, b) => b.mc - a.mc || byName(a, b));
    default:
      return out.sort(byName);
  }
}

export function groupCounts(rows: LightRow[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.g] = (c[r.g] ?? 0) + 1;
  return c;
}
