import { fileURLToPath } from "node:url";
import fs from "node:fs";
import * as i from "../utils/item-info.ts";
let fails = 0; const ok = (n, c) => { if (!c) fails++; console.log(c ? "OK   " : "FEHLER", n); };

// ---- Antwort der API lesen (Form nach den echten Beispielseiten der API) ----
const shield = { name: "7CA 'Nargun'", class_name: "SHLD_BEHR_S03_7CA_SCItem", size: 3, grade: "A", class: "Civilian", is_craftable: true,
  type: "Shield", type_label: "Shield Generator", sub_type: "UNDEFINED", sub_type_label: "Undefined",
  manufacturer: { name: "Behring", code: "BEH" },
  description_data: [{ name: "Class", value: "Civilian" }, { name: "Grade", value: "A" }, { name: "Item Type", value: "Shield Generator" }, { name: "Manufacturer", value: "Behring" }, { name: "Size", value: "3" }] };
let d = i.parseItem(shield);
ok("Schild: Klasse, Größe, Grade, Typ, Hersteller", d.cls === "Civilian" && d.size === 3 && d.grade === "A" && d.type === "Shield Generator" && d.maker === "Behring");
ok("Anzeige wie gewünscht", i.detailsLabel(d) === "Civilian · Size 3 · Grade A · Shield Generator · Behring");
d = i.parseItem({ ...shield, class: "Military", grade: 3, size: "3" });
ok("Grade als Zahl (3 = C), Größe als Text, Militär", d.grade === "C" && d.size === 3 && d.cls === "Military");
d = i.parseItem({ name: "x", description_data: [{ name: "Class", value: "Military" }, { name: "Grade", value: "B" }, { name: "Size", value: "2" }, { name: "Item Type", value: "Cooler" }] });
ok("Nur description_data vorhanden", d.cls === "Military" && d.grade === "B" && d.size === 2 && d.type === "Cooler");
d = i.parseItem({ type_label: "Armor", sub_type_label: "Torso", manufacturer: { name: "Quirinus Tech" } });
ok("Rüstung ohne Größe/Grade: Typ (Untertyp)", i.detailsLabel(d) === "Armor (Torso) · Quirinus Tech");
d = i.parseItem({ type_label: "Usable", sub_type_label: "Undefined", size: 1, manufacturer: { name: "Unknown Manufacturer" } });
ok("'Undefined' und 'Unknown' werden nicht angezeigt", d.type === "Usable" && d.maker === undefined);
ok("Größe 0 wird nicht als 'Size 0' angezeigt", i.detailsLabel({ cls: "Civilian", size: 0, grade: "C", type: "Radar" }) === "Civilian · Grade C · Radar");
ok("leere/kaputte Antwort", i.parseItem(null) === null && i.parseItem("x") === null && i.parseItem({}) === null && i.parseItem({ grade: "Z", size: 99 }) === null);
ok("riesige Texte werden gekürzt", i.parseItem({ class: "X".repeat(500), size: 1 }).cls.length === 60);
ok("cleanDetails übernimmt nur Erwartetes", JSON.stringify(i.cleanDetails({ cls: "Military", grade: "A", size: 3, type: "Shield", evil: "<script>" })) === '{"cls":"Military","grade":"A","size":3,"type":"Shield"}' && i.cleanDetails({ grade: "Q", size: 50 }) === null && i.cleanDetails("x") === null);

// ---- Ableitung aus dem Schlüssel: alle echten Schlüssel aus deiner Datei ----
const real = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./fixtures/real_items.json", import.meta.url)), "utf8"));
const dec = (ini) => i.decodeKey(ini);
ok("Schild-Schlüssel", dec("item_Name_SHLD_BEHR_S03_7CA") === "Shield Generator · Size 3");
ok("Radar-Schlüssel", dec("item_Name_RADR_GRNP_S00_Sens") === "Radar · Size 0");
ok("Laserkanone", dec("item_NameAMRS_LaserCannon_S2") === "Laser Cannon · Size 2");
ok("Repeater / Scattergun", dec("item_NameHRST_LaserRepeater_S3") === "Laser Repeater · Size 3" && dec("item_NameHRST_LaserScattergun_S1") === "Laser Scattergun · Size 1");
ok("Rüstung Kern/Helm/Rucksack", dec("item_Name_qrt_specialist_heavy_core_01_01_10") === "Heavy armor · Core" && dec("item_Name_kap_combat_heavy_helmet_02_07_01") === "Heavy armor · Helmet" && dec("item_Name_qrt_combat_medium_backpack_01_01_02") === "Medium armor · Backpack");
ok("Rüstung superheavy (nicht übersetzt, mit @)", dec("@item_Name_cds_combat_superheavy_backpack_01_01_01") === "Superheavy armor · Backpack");
ok("Fluganzug", dec("item_Name_mrai_flightsuit_01_07_12") === "Flight suit");
ok("Gewehr / Pistole / Schrotflinte / Armbrust", dec("item_Namevolt_rifle_energy_01_tint01") === "Energy rifle" && dec("item_Namevolt_pistol_energy_01_tint02") === "Energy pistol" && dec("item_Namegmni_shotgun_ballistic_01") === "Ballistic shotgun" && dec("item_Nameutfl_crossbow_ballistic_01_tint01") === "Ballistic crossbow");
ok("Magazine", dec("item_Namevolt_rifle_energy_01_mag") === "Energy rifle magazine" && dec("item_Namevolt_smg_energy_01_mag") === "Energy SMG magazine");
ok("Tankdüse", dec("item_fuelnozzle_GRIN_Safe_Name") === "Fuel nozzle" && dec("Nozzle_FuelGiver_SHIN_NozzleExpensiveFast_Name") === "Fuel nozzle");
ok("unbekannt/leer", dec("") === null && dec(null) === null && dec("irgendwas_anderes") === null);
const withLabel = real.filter((x) => x.ini && !/^Human_/.test(x.ini)); const labelled = withLabel.filter((x) => dec(x.ini));
console.log(`  Ableitung für ${labelled.length} von ${withLabel.length} echten Einträgen; ohne Beschreibung: ${withLabel.filter((x) => !dec(x.ini)).map((x) => x.name).join(" | ") || "keine"}`);
ok("alle echten Schlüssel (ohne Personennamen) bekommen eine Beschreibung", labelled.length === withLabel.length);

// ---- Klassenname ----
ok("Klassenname aus Schlüssel", i.classNameFromIni("item_Name_SHLD_BEHR_S03_7CA") === "SHLD_BEHR_S03_7CA" && i.classNameFromIni("item_Namevolt_rifle_energy_01_mag") === "volt_rifle_energy_01_mag" && i.classNameFromIni("item_NameAMRS_LaserCannon_S2") === "AMRS_LaserCannon_S2" && i.classNameFromIni("item_fuelnozzle_GRIN_Safe_Name") === null && i.classNameFromIni(null) === null && i.classNameFromIni("item_Name_ab") === null);

// ---- Abfrage mit Test-Antworten ----
const calls = [];
const mk = (handler) => async (url, init) => { calls.push(url); return handler(url, init); };
const reply = (data, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) });
let r = await i.lookupItem(mk(() => reply([{ ...shield, class_name: "SHLD_BEHR_S03_7CA_SCItem" }, { ...shield, name: "Andere", class_name: "SHLD_BEHR_S03_7CA_SCItem_Special", grade: "B" }])), { name: "7CA 'Nargun'", ini: "item_Name_SHLD_BEHR_S03_7CA" });
ok("Treffer über Klassenname, kürzester Name gewinnt", r.status === "found" && r.details.grade === "A" && calls.length === 1 && calls[0].includes("filter[class_name]=SHLD_BEHR_S03_7CA"));
calls.length = 0;
r = await i.lookupItem(mk((u) => u.includes("class_name") ? reply([]) : reply([{ ...shield, name: "7ca 'nargun'" }])), { name: "7CA 'Nargun'", ini: "item_Name_SHLD_BEHR_S03_7CA" });
ok("Rückfall auf den Namen (Groß-/Kleinschreibung egal)", r.status === "found" && calls.length === 2 && calls[1].includes("filter[name]=7CA"));
r = await i.lookupItem(mk(() => reply([{ ...shield, name: "7CA 'Nargun' Special" }])), { name: "7CA 'Nargun'", ini: null });
ok("Nur ähnlicher Name = kein Treffer (kein falscher Eintrag)", r.status === "none");
r = await i.lookupItem(mk(() => reply([], 429)), { name: "X Y", ini: "item_Name_SHLD_BEHR_S03_7CA" });
ok("Zu viele Anfragen (429) wird gemeldet", r.status === "error" && r.limited === true);
r = await i.lookupItem(mk(() => { throw new Error("netz"); }), { name: "X Y", ini: "item_Name_SHLD_BEHR_S03_7CA" });
ok("Netzwerkfehler wird abgefangen", r.status === "error" && r.limited === false);
r = await i.lookupItem(mk(() => reply([], 500)), { name: "X Y", ini: null });
ok("Serverfehler der API", r.status === "error");
calls.length = 0; r = await i.lookupItem(mk(() => reply([])), { name: "@item_Name_cds_combat_superheavy_suit_01_01_01", ini: null });
ok("nicht übersetzter Name wird nicht gesucht", r.status === "none" && calls.length === 0);
calls.length = 0; await i.lookupItem(mk(() => reply([])), { name: 'Parallax "Sunstone" Rifle & Co', ini: null });
ok("Sonderzeichen im Namen werden kodiert", calls[0].includes(encodeURIComponent('Parallax "Sunstone" Rifle & Co')) && !calls[0].includes(" "));

// ---- Sortieren ----
const rows = [{ n: "Bravo", t: "2026-03-26T12:00:00Z", o: 3 }, { n: "alpha", t: "2026-03-27T09:00:00Z", o: 1 }, { n: "Charlie", t: null, o: 5 }, { n: "Delta", t: "2026-03-20T09:00:00Z", o: 1 }, { n: "Echo", t: "kaputt", o: 0 }];
const get = { name: (x) => x.n, time: (x) => x.t, owners: (x) => x.o };
const names = (m) => i.sortRows(rows, m, get).map((x) => x.n).join(",");
ok("neueste zuerst, ohne Zeit am Ende (alphabetisch)", names("newest") === "alpha,Bravo,Delta,Charlie,Echo");
ok("älteste zuerst, ohne Zeit am Ende", names("oldest") === "Delta,Bravo,alpha,Charlie,Echo");
ok("A bis Z (Groß-/Kleinschreibung egal)", names("az") === "alpha,Bravo,Charlie,Delta,Echo");
ok("Z bis A", names("za") === "Echo,Delta,Charlie,Bravo,alpha");
ok("meiste Besitzer, dann Name", names("most") === "Charlie,Bravo,alpha,Delta,Echo");
ok("wenigste Besitzer, dann Name", names("least") === "Echo,alpha,Delta,Bravo,Charlie");
ok("Zahlen im Namen natürlich sortiert", i.sortRows([{ n: "Teil 10" }, { n: "Teil 2" }], "az", { name: (x) => x.n, time: () => null }).map((x) => x.n).join() === "Teil 2,Teil 10");
ok("Original bleibt unverändert", rows[0].n === "Bravo");
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);

// ---- Abstand zwischen Anfragen ----
{
  let fake = 1000; const slept = []; const clock = { now: () => fake, sleep: async (ms) => { slept.push(ms); fake += ms; } };
  const at = []; const base = async (u) => { at.push(fake); return u; };
  const f = i.paced(base, 1200, clock);
  await f("a");
  ok("Abstand: erste Anfrage geht sofort raus", slept.length === 0 && at[0] === 1000);
  await f("b");
  ok("Abstand: zweite wartet die vollen 1,2 s", slept[0] === 1200 && at[1] - at[0] === 1200);
  fake += 500; await f("c");
  ok("Abstand: nach 0,5 s Pause nur noch 0,7 s warten", slept[1] === 700 && at[2] - at[1] === 1200);
  fake += 5000; await f("d");
  ok("Abstand: nach langer Pause kein Warten", slept.length === 2 && at[3] - at[2] === 5000);
  ok("Abstand: Ergebnis wird durchgereicht", (await f("x")) === "x");
}
// ---- Schleife "alle nachladen" ----
{
  const R = (o) => ({ checked: 0, remaining: 10, limited: false, unreachable: 0, ...o });
  ok("alles erledigt: fertig", i.nextStep(R({ checked: 5, remaining: 0 }), 0).action === "done");
  ok("Fortschritt: nächste Runde", i.nextStep(R({ checked: 12 }), 0).action === "next");
  ok("Datenbank bremst, aber Fortschritt: warten", i.nextStep(R({ checked: 6, limited: true }), 0).action === "wait");
  let s = i.nextStep(R({ checked: 0, unreachable: 5 }), 0); ok("keine Antwort: erste Runde ohne Fortschritt geht weiter", s.action === "next" && s.stuckRounds === 1);
  s = i.nextStep(R({ checked: 0, unreachable: 5 }), s.stuckRounds); s = i.nextStep(R({ checked: 0, unreachable: 5 }), s.stuckRounds);
  ok("nach drei Runden ohne Fortschritt noch einmal", s.action === "next" && s.stuckRounds === 3);
  s = i.nextStep(R({ checked: 0, unreachable: 5 }), s.stuckRounds);
  ok("nach vier Runden ohne Fortschritt: Abbruch statt Endlosschleife", s.action === "stuck");
  s = i.nextStep(R({ checked: 0, limited: true }), 3);
  ok("ständig gebremst ohne Fortschritt: Abbruch", s.action === "stuck");
  s = i.nextStep(R({ checked: 3 }), 3);
  ok("Fortschritt setzt den Zähler zurück", s.action === "next" && s.stuckRounds === 0);
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN (nach Ergänzung)" : `\n${fails} FEHLER (nach Ergänzung)`);

// ================= Rezept =================
{
  const bila = { name: "6CA 'Bila'", class_name: "SHLD_BEHR_S03_6CA_SCItem", size: 3, grade: "B", class: "Civilian", type_label: "Shield Generator", manufacturer: { name: "Behring" }, is_craftable: true,
    blueprint: [{ uuid: "CD86DD07-2425-4CD2-81C4-88E62499C113", craft_time_seconds: 810, craft_time_label: "13 minutes 30 seconds", is_available_by_default: false, ingredient_count: 3, unlocking_missions_count: 7,
      ingredients: [{ name: "Torite", kind: "resource", quantity_scu: 1.2 }, { name: "Laranite", kind: "resource", quantity_scu: 1.9 }, { name: "Glacosite", kind: "item", quantity: 170 }] }] };
  let rec = i.parseRecipe(bila.blueprint);
  ok("Rezept: Zeit, Verfügbarkeit, Missionen, Kennung", rec.secs === 810 && rec.free === false && rec.missions === 7 && rec.id === "cd86dd07-2425-4cd2-81c4-88e62499c113");
  ok("Rezept: drei Zutaten mit SCU bzw. Stückzahl", rec.items.length === 3 && rec.items[0].scu === 1.2 && rec.items[2].qty === 170 && rec.items[2].scu === undefined);
  ok("Dauer in Worten", i.formatDuration(810) === "13 Min 30 Sek" && i.formatDuration(0) === "0 Sek" && i.formatDuration(59) === "59 Sek" && i.formatDuration(3600) === "1 Std" && i.formatDuration(3725) === "1 Std 2 Min 5 Sek");
  ok("Mengen deutsch formatiert", i.formatAmount(rec.items[0]) === "1,2 SCU" && i.formatAmount(rec.items[2]) === "170×");
  ok("Mehrere Stück: Mengen werden multipliziert", i.formatAmount(rec.items[0], 3) === "3,6 SCU" && i.formatAmount(rec.items[1], 5) === "9,5 SCU" && i.formatAmount(rec.items[2], 3) === "510×");
  ok("Fließkomma-Rauschen wird gerundet", i.formatAmount({ name: "x", scu: 0.1 }, 3) === "0,3 SCU");
  ok("Wiki-Link nur mit gültiger Kennung", i.wikiBlueprintUrl(rec.id) === "https://api.star-citizen.wiki/blueprints/cd86dd07-2425-4cd2-81c4-88e62499c113" && i.wikiBlueprintUrl("x") === null && i.wikiBlueprintUrl("javascript:alert(1)") === null && i.wikiBlueprintUrl(undefined) === null);
  ok("nur Links statt Rezept (ohne include) = kein Rezept", i.parseRecipe([{ uuid: "cd86dd07-2425-4cd2-81c4-88e62499c113", name: "x", link: "https://..." }]) === null);
  ok("kein Array / leer / Unsinn = kein Rezept", i.parseRecipe(undefined) === null && i.parseRecipe("x") === null && i.parseRecipe([]) === null && i.parseRecipe([null, 5]) === null);
  ok("ungültige Kennung wird verworfen", i.parseRecipe([{ uuid: "<script>", craft_time_seconds: 60, ingredients: [] }]).id === undefined);
  rec = i.parseRecipe([{ craft_time_seconds: 30, ingredients: [{ name: "A", quantity_scu: -5 }, { name: "B", quantity_scu: NaN }, { name: "", quantity: 3 }, { quantity: 2 }, { name: "C", quantity_scu: 2 }, { name: "N".repeat(300), quantity: 1 }] }]);
  ok("Zutaten: ungültige Mengen fallen weg (Name bleibt), Einträge ohne Namen werden verworfen", rec.items.length === 4 && rec.items[0].name === "A" && rec.items[0].scu === undefined && rec.items[1].name === "B" && rec.items[1].scu === undefined && rec.items[2].name === "C" && rec.items[2].scu === 2 && rec.items[3].name.length === 60 && rec.items[3].qty === 1);
  rec = i.parseRecipe([{ ingredients: Array.from({ length: 80 }, (_, k) => ({ name: "Z" + k, quantity: 1 })) }]);
  ok("höchstens 30 Zutaten", rec.items.length === 30);
  const stored = i.cleanRecipe({ id: "cd86dd07-2425-4cd2-81c4-88e62499c113", secs: 810.4, free: false, missions: 7, items: [{ name: "Torite", scu: 1.2, evil: "<b>" }], evil: "x" });
  ok("aus der Datenbank: nur Erwartetes", JSON.stringify(stored) === '{"id":"cd86dd07-2425-4cd2-81c4-88e62499c113","secs":810,"free":false,"missions":7,"items":[{"name":"Torite","scu":1.2}]}');
  ok("aus der Datenbank: Unsinn = kein Rezept", i.cleanRecipe(null) === null && i.cleanRecipe("x") === null && i.cleanRecipe({ items: "x" }) === null);

  // Abfrage mit Rezept
  const calls2 = []; const mk2 = (h) => async (u) => { calls2.push(u); return h(u); };
  const reply2 = (data, status = 200) => ({ ok: status < 400, status, json: async () => ({ data }) });
  let r = await i.lookupItem(mk2(() => reply2([bila])), { name: "6CA 'Bila'", ini: "item_Name_SHLD_BEHR_S03_6CA" });
  ok("Abfrage holt Beschreibung UND Rezept in einem Aufruf", r.status === "found" && r.details.grade === "B" && r.recipe.secs === 810 && calls2.length === 1 && calls2[0].includes("include=blueprints"));
  const noBp = { ...bila, blueprint: undefined, is_craftable: false };
  r = await i.lookupItem(mk2(() => reply2([noBp])), { name: "6CA 'Bila'", ini: "item_Name_SHLD_BEHR_S03_6CA" });
  ok("Item ohne Rezept: Beschreibung ja, Rezept nein", r.status === "found" && r.details.cls === "Civilian" && r.recipe === null);
  const linksOnly = { ...bila, blueprint: [{ uuid: "cd86dd07-2425-4cd2-81c4-88e62499c113", name: "x", link: "https://..." }] };
  r = await i.lookupItem(mk2(() => reply2([linksOnly])), { name: "6CA 'Bila'", ini: "item_Name_SHLD_BEHR_S03_6CA" });
  ok("nur Links im Feld: Beschreibung ja, Rezept nein", r.status === "found" && r.recipe === null);
  calls2.length = 0; r = await i.lookupItem(mk2((u) => u.includes("class_name") ? reply2([]) : reply2([bila])), { name: "6ca 'bila'", ini: "item_Name_SHLD_BEHR_S03_6CA" });
  ok("Rückfall über den Namen holt ebenfalls das Rezept", r.status === "found" && r.recipe.items.length === 3 && calls2.length === 2 && calls2[1].includes("include=blueprints"));
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN (inkl. Rezept)" : `\n${fails} FEHLER (inkl. Rezept)`);

// ================= Ersatzwege für das Rezept =================
{
  const BP = "cd86dd07-2425-4cd2-81c4-88e62499c113", IT = "6534d6d3-85dc-4c29-aa3d-80cab37c4fa5";
  const full = { uuid: BP, craft_time_seconds: 810, is_available_by_default: false, unlocking_missions_count: 7, ingredients: [{ name: "Torite", quantity_scu: 1.2 }] };
  const base = { name: "6CA 'Bila'", class_name: "SHLD_BEHR_S03_6CA_SCItem", uuid: IT, size: 3, grade: "B", class: "Civilian", type_label: "Shield Generator", is_craftable: true };
  const urls = [];
  const mk3 = (routes) => async (u) => { urls.push(u); for (const [frag, res] of routes) if (u.includes(frag)) { const r = typeof res === "function" ? res(u) : res; return { ...r, clone() { return r; } }; } return { ok: false, status: 500, json: async () => ({}), clone() { return this; } }; };
  const J = (data, status = 200) => ({ ok: status < 400, status, json: async () => (data === undefined ? {} : data) });
  const input = { name: "6CA 'Bila'", ini: "item_Name_SHLD_BEHR_S03_6CA" };

  // 1) nur Links: Link wird verfolgt
  urls.length = 0;
  let r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base, blueprint: [{ uuid: BP, name: "6CA 'Bila'", link: "x" }] }] })], [`/blueprints/${BP}`, J({ data: full })]]), input);
  ok("nur Link im Item: Rezept wird über die Blaupause nachgeholt", r.status === "found" && r.recipe?.items[0].name === "Torite" && r.recipeState === "ok" && urls.some((u) => u.endsWith(`/blueprints/${BP}`)));
  // 2) gar nichts im Item, aber herstellbar: über die Item-Kennung
  urls.length = 0;
  r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base }] })], ["output.uuid]=" + IT, J({ data: [full] })]]), input);
  ok("kein Rezept im Item: Abfrage über die Item-Kennung", r.status === "found" && r.recipe?.secs === 810 && r.recipeState === "ok" && urls.some((u) => u.includes("filter[output.uuid]=" + IT)));
  // 3) Datenbank kennt sicher keines
  r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base }] })], ["output.uuid]=", J({ data: [] })]]), input);
  ok("leere Antwort = sicher kein Rezept (wird nicht ewig wiederholt)", r.status === "found" && r.recipe === null && r.recipeState === "none");
  // 4) nicht herstellbar laut Item
  r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base, is_craftable: false }] })]]), input);
  ok("Item ist nicht herstellbar = kein Rezept, ohne weitere Abfrage", r.recipeState === "none" && urls.filter((u) => u.includes("/blueprints")).length === 0 || r.recipeState === "none");
  // 5) Abfrage nach dem Rezept schlägt fehl: bleibt offen (unknown)
  r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base }] })], ["output.uuid]=", J({}, 500)]]), input);
  ok("Fehler bei der Rezept-Abfrage: bleibt offen statt 'kein Rezept'", r.status === "found" && r.recipeState === "unknown" && r.details?.cls === "Civilian");
  // 6) Datenbank bremst beim Rezept
  r = await i.lookupItem(mk3([["/items?", J({ data: [{ ...base }] })], ["output.uuid]=", J({}, 429)]]), input);
  ok("429 beim Rezept wird als Bremse gemeldet", r.status === "error" && r.limited === true);
  // 7) Item nicht gefunden, Blaupause unter dem Namen bekannt
  urls.length = 0;
  r = await i.lookupItem(mk3([["/items?", J({ data: [] })], ["/blueprints?filter[output.class]", J({ data: [] })], ["/blueprints?filter[output.name]", J({ data: [{ ...full, output_name: "6CA 'Bila'", output: { name: "6CA 'Bila'", grade: "B", type_label: "Shield Generator" } }] })]]), input);
  ok("Item unbekannt, Blaupause über den Namen gefunden", r.status === "found" && r.recipe?.items.length === 1 && r.details?.grade === "B" && r.recipeState === "ok");
  r = await i.lookupItem(mk3([["/items?", J({ data: [] })], ["/blueprints?", J({ data: [{ ...full, output_name: "Etwas ganz anderes" }] })]]), input);
  ok("falsche Blaupause (anderer Name) wird nicht übernommen", r.status === "none");
  // 8) 404 beim Item wird wie 'nicht gefunden' behandelt
  r = await i.lookupItem(mk3([["/items?", J({}, 404)], ["/blueprints?", J({}, 404)]]), input);
  ok("404 überall = nichts gefunden (kein Fehler)", r.status === "none");
  // 9) Diagnose
  const lines = await i.diagnoseItem(mk3([["/items?", J({ data: [{ ...base, blueprint: [{ uuid: BP }] }] })], [`/blueprints/${BP}`, J({ data: full })]]), input);
  ok("Diagnose beschreibt jeden Schritt", lines.length >= 6 && lines.some((l) => l.includes("→ HTTP 200")) && lines.some((l) => l.startsWith("Rezept: 1 Zutaten")) && lines.some((l) => l.includes("Klassenname für die Suche: SHLD_BEHR_S03_6CA")));
  const bad = await i.diagnoseItem(async () => { throw new Error("netz"); }, input);
  ok("Diagnose bei nicht erreichbarer Datenbank", bad.some((l) => l.includes("keine Antwort")) && bad.some((l) => l.includes("nicht erreichbar")));
}
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN (inkl. Ersatzwege)" : `\n${fails} FEHLER (inkl. Ersatzwege)`);
process.exit(fails === 0 ? 0 : 1);
