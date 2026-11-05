import { CATEGORIES } from "./blueprint-category";

export type SortKey = "newest" | "oldest" | "az" | "za" | "owners_desc" | "owners_asc" | "category";

export const MINE_SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Zuletzt erhalten" },
  { id: "oldest", label: "Zuerst erhalten" },
  { id: "az", label: "Name A bis Z" },
  { id: "za", label: "Name Z bis A" },
  { id: "category", label: "Nach Kategorie" },
];

export const ORG_SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Zuletzt erhalten" },
  { id: "oldest", label: "Zuerst erhalten" },
  { id: "az", label: "Name A bis Z" },
  { id: "za", label: "Name Z bis A" },
  { id: "owners_desc", label: "Meiste Besitzer" },
  { id: "owners_asc", label: "Wenigste Besitzer" },
  { id: "category", label: "Nach Kategorie" },
];

export const toTime = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

const byName = (a: string, b: string) => a.localeCompare(b, "de", { sensitivity: "base" });

// Sortiert eine Kopie der Liste. Einträge ohne Zeitangabe stehen bei beiden Zeit-Sortierungen am Ende.
export function sortRows<T>(
  rows: T[],
  key: SortKey,
  get: {
    name: (r: T) => string;
    time: (r: T) => number | null;
    owners?: (r: T) => number;
    category?: (r: T) => string;
  }
): T[] {
  const catIndex = (r: T) => {
    const i = CATEGORIES.findIndex((c) => c.id === get.category?.(r));
    return i < 0 ? CATEGORIES.length : i;
  };
  const out = [...rows];
  out.sort((a, b) => {
    const tie = byName(get.name(a), get.name(b));
    switch (key) {
      case "newest":
      case "oldest": {
        const ta = get.time(a);
        const tb = get.time(b);
        if (ta === null && tb === null) return tie;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return (key === "newest" ? tb - ta : ta - tb) || tie;
      }
      case "az":
        return tie;
      case "za":
        return -tie;
      case "owners_desc":
        return ((get.owners?.(b) ?? 0) - (get.owners?.(a) ?? 0)) || tie;
      case "owners_asc":
        return ((get.owners?.(a) ?? 0) - (get.owners?.(b) ?? 0)) || tie;
      case "category":
        return (catIndex(a) - catIndex(b)) || tie;
    }
  });
  return out;
}
