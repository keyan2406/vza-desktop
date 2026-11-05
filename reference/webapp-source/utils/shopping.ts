// Einkaufsliste: aus mehreren Blaupausen (mit Stückzahl) die Zutaten zusammenzählen.
import { formatAmount, type Ingredient, type Recipe } from "./item-info";

export type ShopRow = { blueprintId: number; name: string; qty: number; recipe: Recipe | null };
export type Total = { name: string; scu?: number; qty?: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totals(rows: ShopRow[]): { totals: Total[]; withoutRecipe: string[] } {
  const map = new Map<string, Total>();
  const withoutRecipe: string[] = [];
  for (const row of rows) {
    const items = row.recipe?.items ?? [];
    if (items.length === 0) {
      withoutRecipe.push(row.name);
      continue;
    }
    for (const i of items) {
      const key = i.name.trim().toLowerCase();
      const cur = map.get(key) ?? { name: i.name };
      if (i.scu !== undefined) cur.scu = round2((cur.scu ?? 0) + i.scu * row.qty);
      if (i.qty !== undefined) cur.qty = round2((cur.qty ?? 0) + i.qty * row.qty);
      map.set(key, cur);
    }
  }
  const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  return { totals: list, withoutRecipe };
}

export const amountOf = (t: Total) => formatAmount({ name: t.name, scu: t.scu, qty: t.qty } as Ingredient);

// Als Text zum Einfügen, z. B. in Discord
export function toText(rows: ShopRow[]): string {
  const { totals: sums, withoutRecipe } = totals(rows);
  const lines = ["Einkaufsliste", ""];
  if (rows.length > 0) {
    lines.push("Herzustellen:");
    for (const r of rows) lines.push(`- ${r.qty}× ${r.name}`);
    lines.push("");
  }
  if (sums.length > 0) {
    lines.push("Zutaten gesamt:");
    for (const t of sums) lines.push(`- ${t.name}: ${amountOf(t) || "–"}`);
  }
  if (withoutRecipe.length > 0) {
    lines.push("", `Ohne bekanntes Rezept: ${withoutRecipe.join(", ")}`);
  }
  return lines.join("\n");
}
