import * as s from "../utils/shopping.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };
const R = (items, secs = 60) => ({ secs, items });
const rows = [
  { blueprintId: 1, name: "Antium Core", qty: 2, recipe: R([{ name: "Torite", scu: 1.2 }, { name: "Laranite", scu: 1.9 }, { name: "Glacosite", qty: 170 }]) },
  { blueprintId: 2, name: "Monde Arms", qty: 1, recipe: R([{ name: "torite", scu: 0.7 }, { name: "Iron", scu: 3 }]) },
  { blueprintId: 3, name: "Unbekannt Teil", qty: 4, recipe: null },
  { blueprintId: 4, name: "Leeres Rezept", qty: 1, recipe: R([]) },
];
const r = s.totals(rows);
ok("Mengen werden mit der Stückzahl multipliziert und zusammengezählt (Groß-/Kleinschreibung egal)", r.totals.find((t) => t.name === "Torite").scu === 3.1);
ok("einzelne Zutaten", r.totals.find((t) => t.name === "Laranite").scu === 3.8 && r.totals.find((t) => t.name === "Glacosite").qty === 340 && r.totals.find((t) => t.name === "Iron").scu === 3);
ok("alphabetisch sortiert", r.totals.map((t) => t.name).join(",") === "Glacosite,Iron,Laranite,Torite");
ok("ohne Rezept werden gemeldet, nicht verschwiegen", r.withoutRecipe.join("|") === "Unbekannt Teil|Leeres Rezept");
ok("keine Fließkomma-Reste", s.totals([{ blueprintId: 1, name: "x", qty: 3, recipe: R([{ name: "A", scu: 0.1 }]) }, { blueprintId: 2, name: "y", qty: 1, recipe: R([{ name: "A", scu: 0.2 }]) }]).totals[0].scu === 0.5);
ok("leere Liste", s.totals([]).totals.length === 0 && s.totals([]).withoutRecipe.length === 0);
ok("Anzeige der Summen", s.amountOf({ name: "Torite", scu: 3.1 }) === "3,1 SCU" && s.amountOf({ name: "Glacosite", qty: 340 }) === "340×");
const txt = s.toText(rows);
ok("Text enthält Blaupausen, Zutaten und Hinweis", txt.includes("- 2× Antium Core") && txt.includes("- Torite: 3,1 SCU") && txt.includes("- Glacosite: 340×") && txt.includes("Ohne bekanntes Rezept: Unbekannt Teil, Leeres Rezept"));
ok("Text einer leeren Liste ist kurz", s.toText([]) === "Einkaufsliste\n");
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
