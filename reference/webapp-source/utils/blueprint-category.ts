// Ordnet Blaupausen einer Kategorie zu. Grundlage sind der interne Schlüssel aus dem Launcher
// (z. B. item_Name_qrt_combat_medium_helmet_01_01_02) und, wenn der fehlt, der Name.
// Ein Officer kann die Zuordnung pro Blaupause von Hand überschreiben.

export const CATEGORIES = [
  { id: "ruestung", label: "Rüstung" },
  { id: "waffen", label: "Waffen" },
  { id: "schiffswaffen", label: "Schiffswaffen" },
  { id: "munition", label: "Magazine & Batterien" },
  { id: "komponenten", label: "Komponenten" },
  { id: "sonstiges", label: "Sonstiges" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? "Sonstiges";
export const isCategory = (v: unknown): v is CategoryId => CATEGORIES.some((c) => c.id === v);

// Reihenfolge ist wichtig: Magazine zuerst (ein "Rifle Battery" ist keine Waffe), dann Rüstung usw.
const BY_INI: [CategoryId, RegExp][] = [
  ["munition", /_mag(?:$|_)|_battery|_magazine/i],
  ["ruestung", /_(?:helmet|core|arms|legs|backpack|suit|undersuit|flightsuit|armor)(?:_|$)/i],
  ["schiffswaffen", /(?:lasercannon|laserrepeater|laserscattergun|ballisticcannon|ballisticrepeater|ballisticgatling|gatling|missile|torpedo|_cannon_|_repeater_|_scattergun_)/i],
  ["waffen", /_(?:rifle|pistol|smg|shotgun|sniper|lmg|crossbow|launcher|knife|melee)(?:_|$)/i],
  ["komponenten", /(?:^|_)(?:shld|radr|powr|cool|qdrv|jdrv|sct|mfd)_|fuelnozzle|nozzle_/i],
];

const BY_NAME: [CategoryId, RegExp][] = [
  ["munition", /\b(?:magazine|battery|mag)\b/i],
  ["ruestung", /\b(?:helmet|core|arms|legs|backpack|undersuit|flight\s*suit|suit|armor|armour|torso)\b/i],
  ["schiffswaffen", /\b(?:cannon|repeater|scattergun|gatling|missile|torpedo)\b/i],
  ["waffen", /\b(?:rifle|pistol|smg|shotgun|sniper|lmg|crossbow|launcher|knife|carbine)\b/i],
  ["komponenten", /\b(?:shield|radar|cooler|power\s*plant|quantum\s*drive|jump\s*drive|nozzle|scanner)\b/i],
];

export function classify(name: string, ini?: string | null): CategoryId {
  const key = (ini ?? "").trim();
  if (key) {
    for (const [id, re] of BY_INI) if (re.test(key)) return id;
  }
  // Der Name kann bei nicht übersetzten Einträgen selbst der interne Schlüssel sein (beginnt mit "@")
  const text = name.replace(/^@/, "").replace(/_/g, " ");
  for (const [id, re] of BY_NAME) if (re.test(text)) return id;
  return "sonstiges";
}

// Von Hand gesetzte Kategorie geht vor.
export function effectiveCategory(row: { name: string; ini_key?: string | null; category?: string | null }): CategoryId {
  return isCategory(row.category) ? row.category : classify(row.name, row.ini_key);
}
