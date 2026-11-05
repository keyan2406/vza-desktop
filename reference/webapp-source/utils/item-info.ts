// Beschreibung zu einer Blaupause: "Military · Size 3 · Grade A · Shield Generator · Behring".
// Quelle ist die Star Citizen Wiki API (api.star-citizen.wiki, Community, inoffiziell, nicht kommerziell nutzbar,
// Nennung der Quelle erwünscht). Ohne Antwort der API leiten wir wenigstens Typ und Größe aus dem internen
// Schlüssel der Blaupause ab.

export type Details = {
  cls?: string; // Civilian, Military, Industrial, Stealth, Competition
  grade?: string; // A bis G
  size?: number;
  type?: string; // z. B. Shield Generator
  maker?: string;
};

const BASE = "https://api.star-citizen.wiki/api";
const GRADES = "ABCDEFG";

const str = (v: unknown, max = 60) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

// ---------- Antwort der API lesen ----------

type RawItem = Record<string, unknown>;

function descValue(item: RawItem, key: string) {
  const list = item.description_data;
  if (!Array.isArray(list)) return undefined;
  const hit = list.find((e) => e && typeof e === "object" && String((e as RawItem).name).toLowerCase() === key);
  return hit ? str((hit as RawItem).value) : undefined;
}

export function parseItem(raw: unknown): Details | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as RawItem;

  let grade = str(item.grade, 3);
  if (typeof item.grade === "number" && item.grade >= 1 && item.grade <= 7) grade = GRADES[item.grade - 1];
  grade ??= descValue(item, "grade");
  if (grade && !/^[A-G]$/i.test(grade)) grade = undefined;

  let size: number | undefined;
  const rawSize = item.size ?? descValue(item, "size");
  const n = typeof rawSize === "number" ? rawSize : Number(rawSize);
  if (Number.isFinite(n) && n >= 0 && n <= 12) size = n;

  const sub = str(item.sub_type_label);
  const typeLabel = str(item.type_label) ?? descValue(item, "item type");
  const subUseful = sub && !/^(undefined|default|unknown)$/i.test(sub) && sub !== typeLabel;
  const type = typeLabel && !/^(undefined|unknown)$/i.test(typeLabel) ? (subUseful ? `${typeLabel} (${sub})` : typeLabel) : undefined;

  const manu = item.manufacturer && typeof item.manufacturer === "object" ? str((item.manufacturer as RawItem).name) : undefined;

  const d: Details = {
    cls: str(item.class) ?? descValue(item, "class"),
    grade: grade?.toUpperCase(),
    size,
    type,
    maker: manu && !/^unknown/i.test(manu) ? manu : undefined,
  };
  return d.cls || d.grade || d.size !== undefined || d.type ? d : null;
}

export function detailsLabel(d: Details | null | undefined): string | null {
  if (!d) return null;
  const parts = [
    d.cls,
    d.size !== undefined && d.size > 0 ? `Size ${d.size}` : undefined,
    d.grade ? `Grade ${d.grade}` : undefined,
    d.type,
    d.maker,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// Nur Zeichenketten und Zahlen in erwarteter Form aus der Datenbank übernehmen
export function cleanDetails(v: unknown): Details | null {
  if (!v || typeof v !== "object") return null;
  const o = v as RawItem;
  const d: Details = {
    cls: str(o.cls),
    grade: typeof o.grade === "string" && /^[A-G]$/.test(o.grade) ? o.grade : undefined,
    size: typeof o.size === "number" && o.size >= 0 && o.size <= 12 ? o.size : undefined,
    type: str(o.type),
    maker: str(o.maker),
  };
  return d.cls || d.grade || d.size !== undefined || d.type ? d : null;
}

// ---------- Ableitung aus dem internen Schlüssel (ohne Netz) ----------

const COMPONENT: Record<string, string> = {
  SHLD: "Shield Generator",
  RADR: "Radar",
  POWR: "Power Plant",
  COOL: "Cooler",
  QDRV: "Quantum Drive",
  JDRV: "Jump Drive",
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function decodeKey(ini: string | null | undefined): string | null {
  const key = (ini ?? "").trim().replace(/^@/, "");
  if (!key) return null;

  let m = /^item_Name_?(SHLD|RADR|POWR|COOL|QDRV|JDRV)_[A-Za-z0-9]+_S(\d+)_/i.exec(key);
  if (m) return `${COMPONENT[m[1].toUpperCase()]} · Size ${Number(m[2])}`;

  m = /^item_Name_?[A-Za-z0-9]{3,6}_(Laser|Ballistic|Plasma|Distortion)?(Cannon|Repeater|Scattergun|Gatling|Railgun)_S(\d+)$/i.exec(key);
  if (m) return `${m[1] ? `${cap(m[1])} ` : ""}${cap(m[2])} · Size ${Number(m[3])}`;

  m = /^item_Name_?[a-z0-9]+_(?:[a-z]+)_(light|medium|heavy|superheavy)_(helmet|core|arms|legs|backpack|suit|undersuit)/i.exec(key);
  if (m) return `${cap(m[1])} armor · ${cap(m[2])}`;
  m = /^item_Name_?[a-z0-9]+_flightsuit/i.exec(key);
  if (m) return "Flight suit";

  m = /^item_Name_?[a-z0-9]+_(rifle|pistol|smg|shotgun|sniper|lmg|crossbow)_(energy|ballistic)_\d+(_mag)?/i.exec(key);
  if (m) return `${cap(m[2])} ${m[1].toLowerCase() === "smg" ? "SMG" : m[1].toLowerCase()}${m[3] ? " magazine" : ""}`;

  if (/fuelnozzle|^Nozzle_/i.test(key)) return "Fuel nozzle";
  return null;
}

// ---------- Abfrage der API ----------

// "item_Name_SHLD_BEHR_S03_7CA" -> "SHLD_BEHR_S03_7CA"
export function classNameFromIni(ini: string | null | undefined): string | null {
  const m = /^@?item_Name_?([A-Za-z0-9_]+)$/.exec((ini ?? "").trim());
  return m && m[1].length >= 5 ? m[1] : null;
}

type FetchLike = (url: string, init?: object) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// recipeState: ok = Rezept gefunden, none = es gibt sicher keines, unknown = konnte nicht geklärt werden (später erneut)
export type Lookup =
  | { status: "found"; details: Details | null; recipe: Recipe | null; recipeState: "ok" | "none" | "unknown" }
  | { status: "none" } // API hat geantwortet, aber nichts Passendes gefunden
  | { status: "error"; limited: boolean }; // nicht erreichbar oder zu viele Anfragen

type Json = { kind: "ok"; body: unknown } | { kind: "limited" } | { kind: "failed" };

async function getJson(fetchImpl: FetchLike, url: string): Promise<Json> {
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json", "User-Agent": "vza-org-manager (private, non-commercial clan tool)" },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 429) return { kind: "limited" };
  if (res.status === 404) return { kind: "ok", body: null }; // gibt es nicht: eindeutige Antwort
  if (!res.ok) return { kind: "failed" };
  return { kind: "ok", body: await res.json() };
}

const dataOf = (body: unknown): unknown[] | null => {
  const d = body && typeof body === "object" ? (body as RawItem).data : undefined;
  return Array.isArray(d) ? d : null;
};

const itemUrl = (param: string, value: string) =>
  `${BASE}/items?filter[${param}]=${encodeURIComponent(value)}&include=blueprints&page[size]=15`;
const blueprintsUrl = (param: string, value: string) =>
  `${BASE}/blueprints?filter[${param}]=${encodeURIComponent(value)}&page[size]=5`;

// Holt zu einem gefundenen Item das Rezept. Liefert die API es nicht direkt mit, wird es über den Link zur
// Blaupause und zuletzt über die Item-Kennung nachgefragt.
async function resolveRecipe(
  fetchImpl: FetchLike,
  item: RawItem
): Promise<{ recipe: Recipe | null; state: "ok" | "none" | "unknown"; limited: boolean }> {
  const direct = parseRecipe(item.blueprint);
  if (direct) return { recipe: direct, state: "ok", limited: false };
  if (item.is_craftable === false) return { recipe: null, state: "none", limited: false };

  const links = (Array.isArray(item.blueprint) ? item.blueprint : []).filter(
    (b): b is RawItem => !!b && typeof b === "object" && typeof (b as RawItem).uuid === "string" && UUID.test((b as RawItem).uuid as string)
  );
  if (links.length > 0) {
    const r = await getJson(fetchImpl, `${BASE}/blueprints/${links[0].uuid as string}`);
    if (r.kind === "limited") return { recipe: null, state: "unknown", limited: true };
    if (r.kind === "ok" && r.body) {
      const body = r.body as RawItem;
      const rec = parseRecipe([body.data && typeof body.data === "object" ? body.data : body]);
      if (rec) return { recipe: rec, state: "ok", limited: false };
    }
  }

  const uuid = typeof item.uuid === "string" && UUID.test(item.uuid) ? item.uuid : null;
  if (uuid) {
    const r = await getJson(fetchImpl, blueprintsUrl("output.uuid", uuid));
    if (r.kind === "limited") return { recipe: null, state: "unknown", limited: true };
    if (r.kind === "ok") {
      const list = dataOf(r.body);
      const rec = list ? parseRecipe(list) : null;
      if (rec) return { recipe: rec, state: "ok", limited: false };
      if (list && list.length === 0) return { recipe: null, state: "none", limited: false };
    }
    return { recipe: null, state: "unknown", limited: false };
  }
  return { recipe: null, state: item.is_craftable === true ? "unknown" : "none", limited: false };
}

export async function lookupItem(
  fetchImpl: FetchLike,
  input: { name: string; ini: string | null }
): Promise<Lookup> {
  try {
    const cls = classNameFromIni(input.ini);
    const wanted = input.name.replace(/^@/, "").trim().toLowerCase();
    let hit: RawItem | null = null;

    if (cls) {
      const r = await getJson(fetchImpl, itemUrl("class_name", cls));
      if (r.kind === "limited") return { status: "error", limited: true };
      const list = r.kind === "ok" ? dataOf(r.body) : null;
      if (list) {
        const low = cls.toLowerCase();
        // Der Schlüssel aus dem Launcher endet oft ohne "_SCItem": nimm den kürzesten passenden Klassennamen
        const hits = (list as RawItem[])
          .filter((i) => i && typeof i.class_name === "string" && (i.class_name as string).toLowerCase().startsWith(low))
          .sort((a, b) => String(a.class_name).length - String(b.class_name).length);
        hit = hits[0] ?? null;
      }
    }
    if (!hit && wanted && !input.name.startsWith("@")) {
      const r = await getJson(fetchImpl, itemUrl("name", input.name.trim()));
      if (r.kind === "limited") return { status: "error", limited: true };
      if (r.kind === "failed") return { status: "error", limited: false };
      const list = r.kind === "ok" ? dataOf(r.body) : null;
      hit = ((list ?? []) as RawItem[]).find((i) => i && typeof i.name === "string" && (i.name as string).trim().toLowerCase() === wanted) ?? null;
    }

    if (hit) {
      const details = parseItem(hit);
      const rr = await resolveRecipe(fetchImpl, hit);
      if (rr.limited) return { status: "error", limited: true };
      if (details || rr.recipe) return { status: "found", details, recipe: rr.recipe, recipeState: rr.state };
    }

    // Item nicht gefunden: vielleicht kennt die Datenbank die Blaupause unter dem Namen oder der Klasse
    const tries: [string, string][] = [];
    if (cls) tries.push(["output.class", cls]);
    if (wanted && !input.name.startsWith("@")) tries.push(["output.name", input.name.trim()]);
    for (const [param, value] of tries) {
      const r = await getJson(fetchImpl, blueprintsUrl(param, value));
      if (r.kind === "limited") return { status: "error", limited: true };
      if (r.kind !== "ok") continue;
      const list = (dataOf(r.body) ?? []) as RawItem[];
      const match = list.find((b) => {
        const out = b && typeof b === "object" ? (b.output as RawItem | undefined) : undefined;
        const n = typeof b?.output_name === "string" ? b.output_name : typeof out?.name === "string" ? out.name : "";
        const c = typeof b?.output_class === "string" ? b.output_class : typeof out?.class === "string" ? out.class : "";
        return n.trim().toLowerCase() === wanted || (!!cls && c.toLowerCase() === cls.toLowerCase());
      });
      const rec = match ? parseRecipe([match]) : null;
      if (match && rec) {
        const out = (match.output as RawItem | undefined) ?? null;
        return { status: "found", details: out ? parseItem(out) : null, recipe: rec, recipeState: "ok" };
      }
    }
    return { status: "none" };
  } catch {
    return { status: "error", limited: false };
  }
}

// Für Officer: protokolliert jeden Schritt der Abfrage, damit sichtbar wird, woran es hakt.
export async function diagnoseItem(
  fetchImpl: FetchLike,
  input: { name: string; ini: string | null }
): Promise<string[]> {
  const log: string[] = [];
  log.push(`Name: ${input.name}`);
  log.push(`Interner Schlüssel: ${input.ini ?? "(keiner)"}`);
  log.push(`Klassenname für die Suche: ${classNameFromIni(input.ini) ?? "(keiner ableitbar)"}`);
  const traced: FetchLike = async (url, init) => {
    try {
      const res = await fetchImpl(url, init);
      let note = "";
      if (res.ok) {
        try {
          const body = (await (res as unknown as { clone?: () => typeof res }).clone?.()?.json?.()) as unknown;
          const list = dataOf(body);
          if (list) note = `, ${list.length} Treffer`;
        } catch {
          // Anzahl nur wenn lesbar
        }
      }
      log.push(`Abfrage ${url.replace(BASE, "")} → HTTP ${res.status}${note}`);
      return res;
    } catch (e) {
      log.push(`Abfrage ${url.replace(BASE, "")} → keine Antwort (${(e as Error)?.name ?? "Fehler"})`);
      throw e;
    }
  };
  const r = await lookupItem(traced, input);
  if (r.status === "found") {
    log.push(`Ergebnis: gefunden. Beschreibung: ${detailsLabel(r.details) ?? "keine"}.`);
    log.push(
      r.recipe
        ? `Rezept: ${r.recipe.items.length} Zutaten, Herstellzeit ${r.recipe.secs !== undefined ? formatDuration(r.recipe.secs) : "unbekannt"}.`
        : `Rezept: ${r.recipeState === "none" ? "die Datenbank kennt keines (nicht herstellbar oder nicht erfasst)" : "konnte nicht geklärt werden"}.`
    );
  } else if (r.status === "none") {
    log.push("Ergebnis: nichts Passendes in der Datenbank gefunden (Name oder Klassenname weicht ab).");
  } else {
    log.push(r.limited ? "Ergebnis: die Datenbank bremst (zu viele Anfragen)." : "Ergebnis: die Datenbank war nicht erreichbar.");
  }
  return log;
}

// ---------- Sortieren ----------

export type SortMode = "newest" | "oldest" | "az" | "za" | "most" | "least";

export function sortRows<T>(
  rows: T[],
  mode: SortMode,
  get: { name: (r: T) => string; time: (r: T) => string | null; owners?: (r: T) => number }
): T[] {
  const t = (r: T) => {
    const v = get.time(r);
    const n = v ? Date.parse(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const byName = (a: T, b: T) => get.name(a).localeCompare(get.name(b), "de", { sensitivity: "base", numeric: true });
  const out = [...rows];
  switch (mode) {
    case "az":
      return out.sort(byName);
    case "za":
      return out.sort((a, b) => byName(b, a));
    case "most":
      return out.sort((a, b) => (get.owners?.(b) ?? 0) - (get.owners?.(a) ?? 0) || byName(a, b));
    case "least":
      return out.sort((a, b) => (get.owners?.(a) ?? 0) - (get.owners?.(b) ?? 0) || byName(a, b));
    case "oldest":
    case "newest": {
      const dir = mode === "newest" ? -1 : 1;
      // Einträge ohne Zeit stehen immer am Ende
      return out.sort((a, b) => {
        const x = t(a), y = t(b);
        if (x === null && y === null) return byName(a, b);
        if (x === null) return 1;
        if (y === null) return -1;
        return (x - y) * dir || byName(a, b);
      });
    }
  }
}

// ---------- Abstand zwischen Anfragen ----------

// Verpackt fetch so, dass zwischen zwei Anfragen mindestens minGapMs vergehen (die API erlaubt 60 pro Minute).
export function paced<F extends (...a: never[]) => Promise<unknown>>(
  fetchImpl: F,
  minGapMs: number,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  }
): F {
  let last = Number.NEGATIVE_INFINITY; // die erste Anfrage geht sofort raus
  const wrapped = async (...args: never[]) => {
    const wait = last + minGapMs - clock.now();
    if (wait > 0) await clock.sleep(wait);
    last = clock.now();
    return fetchImpl(...args);
  };
  return wrapped as unknown as F;
}

// ---------- Schleife "alle nachladen" ----------

export type RoundResult = { checked: number; remaining: number; limited: boolean; unreachable: number };

// Entscheidet nach jeder Runde, wie es weitergeht. Ohne Fortschritt in mehreren Runden wird abgebrochen.
export function nextStep(r: RoundResult, stuckRounds: number): { action: "done" | "wait" | "next" | "stuck"; stuckRounds: number } {
  if (r.remaining === 0) return { action: "done", stuckRounds: 0 };
  const stuck = r.checked > 0 ? 0 : stuckRounds + 1;
  if (stuck >= 4) return { action: "stuck", stuckRounds: stuck };
  return { action: r.limited ? "wait" : "next", stuckRounds: stuck };
}

// ---------- Rezept (Zutaten, Herstellzeit) ----------

export type Ingredient = { name: string; scu?: number; qty?: number };
export type Recipe = {
  id?: string; // Kennung der Blaupause in der Wiki-Datenbank (für den Link)
  secs?: number; // Herstellzeit in Sekunden
  free?: boolean; // true = ohne Blaupause verfügbar
  missions?: number; // Zahl der Missionen, die diese Blaupause vergeben
  items: Ingredient[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7 ? v : undefined);

function cleanIngredients(list: unknown): Ingredient[] {
  if (!Array.isArray(list)) return [];
  const out: Ingredient[] = [];
  for (const i of list.slice(0, 30)) {
    if (!i || typeof i !== "object") continue;
    const o = i as RawItem;
    const name = str(o.name, 60);
    if (!name) continue;
    const scu = num(o.quantity_scu ?? o.scu);
    const qty = num(o.quantity ?? o.qty);
    out.push({ name, ...(scu !== undefined ? { scu } : {}), ...(qty !== undefined ? { qty } : {}) });
  }
  return out;
}

// Liest das Feld "blueprint" eines Items. Es enthält mit include=blueprints die ganzen Rezepte, sonst nur Links.
export function parseRecipe(raw: unknown): Recipe | null {
  const list = Array.isArray(raw) ? raw : [];
  const bp = list.find((b) => b && typeof b === "object" && Array.isArray((b as RawItem).ingredients)) as RawItem | undefined;
  if (!bp) return null;
  const items = cleanIngredients(bp.ingredients);
  const secs = num(bp.craft_time_seconds);
  const r: Recipe = {
    id: typeof bp.uuid === "string" && UUID.test(bp.uuid) ? bp.uuid.toLowerCase() : undefined,
    secs: secs !== undefined ? Math.round(secs) : undefined,
    free: typeof bp.is_available_by_default === "boolean" ? bp.is_available_by_default : undefined,
    missions: num(bp.unlocking_missions_count),
    items,
  };
  return items.length > 0 || r.secs !== undefined ? r : null;
}

// Nur Erwartetes aus der Datenbank übernehmen
export function cleanRecipe(v: unknown): Recipe | null {
  if (!v || typeof v !== "object") return null;
  const o = v as RawItem;
  const items = cleanIngredients(o.items);
  const r: Recipe = {
    id: typeof o.id === "string" && UUID.test(o.id) ? o.id.toLowerCase() : undefined,
    secs: num(o.secs) !== undefined ? Math.round(num(o.secs) as number) : undefined,
    free: typeof o.free === "boolean" ? o.free : undefined,
    missions: num(o.missions),
    items,
  };
  return items.length > 0 || r.secs !== undefined ? r : null;
}

export function formatDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts = [h ? `${h} Std` : "", m ? `${m} Min` : "", r || (!h && !m) ? `${r} Sek` : ""].filter(Boolean);
  return parts.join(" ");
}

const NF = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

// "1,2 SCU", "170×" oder beides; mit factor für mehrere Stück
export function formatAmount(i: Ingredient, factor = 1): string {
  const parts = [
    i.scu !== undefined ? `${NF.format(Math.round(i.scu * factor * 100) / 100)} SCU` : "",
    i.qty !== undefined ? `${NF.format(i.qty * factor)}×` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export const wikiBlueprintUrl = (id: string | undefined) =>
  id && UUID.test(id) ? `https://api.star-citizen.wiki/blueprints/${id.toLowerCase()}` : null;
