import * as c from "../utils/catalog.ts";
let fails = 0; const ok = (n, cond) => { if (!cond) fails++; console.log(cond ? "OK   " : "FEHLER", n); };
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------- Gruppen ----------
const g = (name, cls, type) => c.groupOf(name, cls, type);
ok("Schild per Klassenname", g("7CA 'Nargun'", "SHLD_BEHR_S03_7CA_SCItem", null) === "shield");
ok("Kühler / Power Plant / Quantenantrieb / Radar / Sprungantrieb per Klassenname", g("Glacier", "COOL_AEGS_S01_Glacier_SCItem", null) === "cooler" && g("JS-300", "POWR_AMRS_S01_JS300", null) === "power" && g("VK-00", "QDRV_WETK_S01_VK00", null) === "qdrive" && g("Sens", "RADR_GRNP_S00_Sens", null) === "radar" && g("Jump", "JDRV_RSI_S02_X", null) === "jdrive");
ok("Gruppe auch über den Typ, wenn der Klassenname nichts verrät", g("X", "foo_bar", "Shield") === "shield" && g("X", "foo", "QuantumDrive") === "qdrive" && g("X", "foo", "PowerPlant") === "power" && g("X", "foo", "Cooler") === "cooler");
ok("Rüstung (Typ Char_Armor_*) und Waffen zu Fuß (WeaponPersonal)", g("Antium Core Storm", "qrt_specialist_heavy_core_01_01_10", "Char_Armor_Torso") === "armor" && g("Parallax Rifle", "volt_rifle_energy_01", "WeaponPersonal") === "weapon");
ok("Schiffswaffe (WeaponGun) und Laserkanone nur per Klassenname", g("M3A Cannon", "BEHR_LaserCannon_S1", "WeaponGun") === "shipweapon" && g("Omnisky VI Cannon", "AMRS_LaserCannon_S2_SCItem", null) === "shipweapon");
ok("Magazin/Batterie bleibt Magazin, auch wenn Typ WeaponAttachment", g("Parallax Rifle Battery (80 Cap)", "volt_rifle_energy_01_mag", "WeaponAttachment") === "magazine");
ok("Rüstung ohne Typ aus dem Klassennamen, Waffe ohne Typ aus dem Klassennamen", g("Monde Helmet", "kap_combat_heavy_helmet_02_07_01", null) === "armor" && g("Taurus", "gmni_shotgun_ballistic_01", null) === "weapon");
ok("alles Unbekannte = Sonstiges, ohne Absturz bei null", g("Irgendwas", null, null) === "other" && g("", "", "") === "other");
ok("Gruppenbezeichnungen", c.groupLabel("qdrive") === "Quantenantriebe" && c.groupLabel("weapon") === "Waffen (zu Fuß)" && c.groupLabel("gibts-nicht") === "Sonstiges");
ok("jede Gruppe hat eine Bezeichnung, Reihenfolge eindeutig", c.GROUPS.length === 11 && new Set(c.GROUPS.map((x) => x.id)).size === 11 && c.GROUPS.every((x) => x.label.length > 2));

// ---------- Größe ----------
ok("Größe aus dem Klassennamen (nur Schiffsteile)", c.sizeOf("SHLD_BEHR_S03_7CA", "shield") === 3 && c.sizeOf("AMRS_LaserCannon_S2", "shipweapon") === 2 && c.sizeOf("RADR_GRNP_S00_Sens", "radar") === 0 && c.sizeOf("QDRV_X_S12_Y", "qdrive") === 12);
ok("Größe fehlt bei Rüstung/Waffen zu Fuß und ohne Muster", c.sizeOf("qrt_core_S03_x", "armor") === null && c.sizeOf("volt_rifle_S1", "weapon") === null && c.sizeOf("SHLD_X_Y", "shield") === null && c.sizeOf(null, "shield") === null && c.sizeOf("SHLD_X_S99_Y", "shield") === null);

// ---------- Blaupause aus der API ----------
const api = (o = {}) => ({ uuid: U(1), key: "BP_CRAFT_x", output_name: "7CA 'Nargun'", output_class: "SHLD_BEHR_S03_7CA_SCItem", craft_time_seconds: 810.4, is_available_by_default: false, ingredient_count: 3, unlocking_missions_count: 7,
  ingredients: [{ name: "Torite", quantity_scu: 1.2 }, { name: "Laranite", quantity_scu: 1.9 }, { name: "Glacosite", quantity: 170 }],
  output: { uuid: U(101), name: "7CA 'Nargun'", class: "SHLD_BEHR_S03_7CA_SCItem", type: "Shield", type_label: "Shield Generator", grade: "a" }, game_version: "4.4.1", ...o });
let b = c.parseBlueprint(api());
ok("Blaupause: Name, Klasse, Typ, Grade (groß), Craftzeit gerundet, Zutaten", b.name === "7CA 'Nargun'" && b.class_name === "SHLD_BEHR_S03_7CA_SCItem" && b.type_label === "Shield Generator" && b.grade === "A" && b.craft_secs === 810 && b.ingredients.length === 3 && b.ingredients[2].qty === 170 && b.missions_count === 7 && b.output_uuid === U(101) && b.free === false);
ok("Blaupause: Kennung wird klein geschrieben", c.parseBlueprint(api({ uuid: U(1).toUpperCase() })).uuid === U(1));
ok("Blaupause: Name aus output.name, wenn output_name fehlt", c.parseBlueprint(api({ output_name: null })).name === "7CA 'Nargun'");
ok("Blaupause: ohne gültige Kennung oder ohne Namen = verworfen", c.parseBlueprint(api({ uuid: "x" })) === null && c.parseBlueprint(api({ output_name: null, output: {} })) === null && c.parseBlueprint(null) === null && c.parseBlueprint("x") === null && c.parseBlueprint([]) === null);
ok("Blaupause: kaputte Felder werden unschädlich gemacht", (() => { const x = c.parseBlueprint(api({ craft_time_seconds: -5, ingredients: "x", ingredient_count: "viele", unlocking_missions_count: NaN, output: { grade: "Z", type: 5 } })); return x.craft_secs === null && x.ingredients.length === 0 && x.missions_count === 0 && x.grade === null && x.type === null; })());
ok("Blaupause: Standard-Verfügbarkeit", c.parseBlueprint(api({ is_available_by_default: true })).free === true);
ok("Blaupause: überlange Namen werden gekürzt", c.parseBlueprint(api({ output_name: "N".repeat(500) })).name.length === 120);

// ---------- Missionen ----------
const mission = (o = {}) => ({ uuid: U(500), title: "Escort Fuel Tanks", mission_giver: "Foxwell Rep", faction: { name: "Foxwell Enforcement" }, rank_index: 2, min_standing: { name: "Jr. Contractor" }, star_systems: ["Stanton", "Pyro"],
  blueprints: [{ name: "7CA 'Nargun'", uuid: U(1) }, { name: "Etwas anderes", uuid: U(9) }], ...o });
let m = c.parseMission(mission());
ok("Mission: Titel, Geber = Fraktion, Rang = Mindeststand, Systeme", m.title === "Escort Fuel Tanks" && m.giver === "Foxwell Enforcement" && m.rank === "Jr. Contractor" && m.systems.join() === "Stanton,Pyro" && m.blueprints.length === 2);
ok("Mission: ohne Fraktion zählt der Auftraggeber, ohne beides 'Unbekannt'", c.parseMission(mission({ faction: null })).giver === "Foxwell Rep" && c.parseMission(mission({ faction: null, mission_giver: null })).giver === "Unbekannt");
ok("Mission: Rang aus Rangzahl, wenn kein Name da ist", c.parseMission(mission({ min_standing: null, rank_index: 3 })).rank === "Rang 3" && c.parseMission(mission({ min_standing: null, rank_index: null })).rank === null);
ok("Mission: ohne Titel verworfen, Unsinn überstanden", c.parseMission(mission({ title: "" })) === null && c.parseMission(null) === null && c.parseMission(7) === null);
ok("Mission: Blaupausen mit ungültiger Kennung und ohne Namen fliegen raus, nur Name reicht", c.parseMission(mission({ blueprints: [{ name: "A", uuid: "kaputt" }, { uuid: "kaputt" }, null, 5, { name: null, uuid: U(3) }] })).blueprints.length === 2);
ok("Mission: höchstens 5 Systeme", c.parseMission(mission({ star_systems: ["a", "b", "c", "d", "e", "f", "g"] })).systems.length === 5);

// ---------- Zuordnung ----------
const bps = [c.parseBlueprint(api()), c.parseBlueprint(api({ uuid: U(2), output_name: "M3A Cannon", output_class: "BEHR_LaserCannon_S1", output: { uuid: U(102), name: "M3A Cannon", type: "WeaponGun" } })), c.parseBlueprint(api({ uuid: U(3), output_name: "Antium Core", output: { uuid: U(103), name: "Antium Core" } }))];
const missions = [
  c.parseMission(mission()),
  c.parseMission(mission({ title: "Erste Mission", faction: { name: "Headhunters" }, blueprints: [{ name: "x", uuid: U(102) }] })), // über die Item-Kennung
  c.parseMission(mission({ title: "Dritte Mission", faction: { name: "Headhunters" }, blueprints: [{ name: "ANTIUM core", uuid: null }] })), // nur über den Namen
  c.parseMission(mission({ blueprints: [{ name: "7CA 'Nargun'", uuid: U(1) }] })), // Doppelte derselben Mission
  c.parseMission(mission({ title: "Nirgends", blueprints: [{ name: "Gibt es nicht", uuid: U(999) }] })),
];
const src = c.buildSources(bps, missions);
ok("Zuordnung über die Kennung der Blaupause", src.get(U(1)).length === 1 && src.get(U(1))[0].g === "Foxwell Enforcement" && src.get(U(1))[0].r === "Jr. Contractor");
ok("Zuordnung über die Kennung des Items", src.get(U(2)).length === 1 && src.get(U(2))[0].g === "Headhunters" && src.get(U(2))[0].t === "Erste Mission");
ok("Zuordnung nur über den Namen (Groß-/Kleinschreibung egal)", src.get(U(3)).length === 1 && src.get(U(3))[0].t === "Dritte Mission");
ok("dieselbe Mission zählt pro Blaupause nur einmal", src.get(U(1)).length === 1);
ok("unbekannte Blaupausen werden nirgends einsortiert", [...src.values()].flat().every((s) => s.t !== "Nirgends"));
const many = Array.from({ length: 80 }, (_, i) => c.parseMission(mission({ title: "M" + String(i).padStart(2, "0"), blueprints: [{ uuid: U(1), name: "7CA 'Nargun'" }] })));
ok("höchstens 40 Quellen je Blaupause", c.buildSources(bps, many).get(U(1)).length === 40);
ok("Quellen sind nach Geber und Titel sortiert", (() => { const l = c.buildSources(bps, [c.parseMission(mission({ title: "B", faction: { name: "Zeta" } })), c.parseMission(mission({ title: "A", faction: { name: "Zeta" } })), c.parseMission(mission({ title: "C", faction: { name: "Alpha" } }))]).get(U(1)); return l.map((s) => s.g + s.t).join() === "AlphaC,ZetaA,ZetaB"; })());

// ---------- Leichte Zeilen ----------
const dbRow = (o = {}) => ({ uuid: U(1), name: "7CA 'Nargun'", class_name: "SHLD_BEHR_S03_7CA_SCItem", type: "Shield", type_label: "Shield Generator", grade: "A", craft_secs: 810, free: false, missions_count: 1,
  ingredients: [{ name: "Torite", scu: 1.2 }, { name: "Glacosite", qty: 170 }, { name: "" }, null], sources: [{ g: "Foxwell Enforcement", t: "Escort", r: "Jr. Contractor", s: ["Stanton"] }, { g: "Foxwell Enforcement", t: "Defend", r: null, s: [] }, { g: "Headhunters", t: "Hit", r: null, s: [] }, { g: "", t: "kaputt" }], ...o });
let row = c.toLightRow(dbRow());
ok("Zeile: Gruppe, Größe, Grade, Untertyp, Craftzeit", row.g === "shield" && row.sz === 3 && row.gr === "A" && row.sub === "Shield Generator" && row.t === 810 && row.f === false);
ok("Zeile: Zutaten bereinigt, Missionsgeber eindeutig, Missionszahl", row.m.length === 2 && row.m[0].s === 1.2 && row.m[1].q === 170 && row.gv.join() === "Foxwell Enforcement,Headhunters" && row.mc === 3);
ok("Zeile: Missionszahl nimmt den größeren Wert (API-Zahl oder bekannte Quellen)", c.toLightRow(dbRow({ missions_count: 12 })).mc === 12);
ok("Zeile: 'Undefined' als Untertyp wird nicht gezeigt, Unsinn in Zutaten/Quellen überstanden", c.toLightRow(dbRow({ type_label: "Undefined", ingredients: "x", sources: "y" })).sub === null && c.toLightRow(dbRow({ ingredients: null, sources: null })).m.length === 0);
ok("Zeile: Name klein zum Abgleich mit der Org", row.nn === "7ca 'nargun'");
ok("Zeile: höchstens 12 Zutaten", c.toLightRow(dbRow({ ingredients: Array.from({ length: 40 }, (_, i) => ({ name: "Z" + i, qty: 1 })) })).m.length === 12);

// ---------- Missionsgeber-Kacheln ----------
const rows = [
  c.toLightRow(dbRow()),
  c.toLightRow(dbRow({ uuid: U(2), name: "M3A Cannon", class_name: "BEHR_LaserCannon_S1", type: "WeaponGun", type_label: "Gun", grade: "B", craft_secs: 540, sources: [{ g: "Headhunters", t: "Hit" }], missions_count: 1, ingredients: [{ name: "Agricium", scu: 0.36 }] })),
  c.toLightRow(dbRow({ uuid: U(3), name: "Antium Core", class_name: "qrt_specialist_heavy_core_01_01_10", type: "Char_Armor_Torso", type_label: "Torso", grade: null, craft_secs: 300, sources: [], missions_count: 0, free: true, ingredients: [] })),
  c.toLightRow(dbRow({ uuid: U(4), name: "Zeta Kühler", class_name: "COOL_AEGS_S02_X", type: "Cooler", type_label: "Cooler", craft_secs: 700, sources: [{ g: "Foxwell Enforcement", t: "Defend" }], ingredients: [{ name: "Torite", scu: 2 }] })),
];
const tiles = c.giverTiles(rows);
ok("Kacheln: Zahl der Blaupausen je Geber, größte zuerst", tiles.map((t) => `${t.name}:${t.count}`).join() === "Foxwell Enforcement:2,Headhunters:2" || tiles.map((t) => `${t.name}:${t.count}`).join() === "Headhunters:2,Foxwell Enforcement:2");
ok("Kacheln: bei Gleichstand alphabetisch", tiles[0].name === "Foxwell Enforcement");
ok("Kacheln: ohne Quellen keine Kachel", c.giverTiles([rows[2]]).length === 0);

// ---------- Filtern ----------
const org = new Map([["7ca 'nargun'", { id: 1, owners: 2, mine: false }], ["m3a cannon", { id: 2, owners: 1, mine: true }], ["antium core", { id: 3, owners: 0, mine: false }]]);
const hay = new Map(); for (const r of rows) hay.set(r.id, c.haystack(r));
const F = (o = {}) => ({ q: "", group: "all", size: "all", giver: null, onlyOrg: false, onlyMissing: false, ...o });
const names = (f) => c.applyFilters(rows, F(f), org, hay).map((r) => r.n).join("|");
ok("Filter: alles", names({}).split("|").length === 4);
ok("Filter: Gruppe", names({ group: "shield" }) === "7CA 'Nargun'" && names({ group: "armor" }) === "Antium Core");
ok("Filter: Größe", names({ size: 3 }) === "7CA 'Nargun'" && names({ size: 1 }) === "M3A Cannon" && names({ size: 7 }) === "");
ok("Filter: Missionsgeber", names({ giver: "Headhunters" }).split("|").sort().join("|") === "7CA 'Nargun'|M3A Cannon" && names({ giver: "Gibt es nicht" }) === "");
ok("Filter: nur was jemand in der Org besitzt", names({ onlyOrg: true }).split("|").sort().join("|") === "7CA 'Nargun'|M3A Cannon");
ok("Filter: nur was ich noch nicht habe (eigene fallen raus, unbekannte bleiben)", names({ onlyMissing: true }).split("|").sort().join("|") === "7CA 'Nargun'|Antium Core|Zeta Kühler");
ok("Filter: Suche nach Name, Zutat, Geber, Gruppe (mehrere Wörter, Groß-/Kleinschreibung egal)", names({ q: "nargun" }) === "7CA 'Nargun'" && names({ q: "AGRICIUM" }) === "M3A Cannon" && names({ q: "foxwell" }).split("|").length === 2 && names({ q: "schild torite" }) === "7CA 'Nargun'" && names({ q: "kühler torite" }) === "Zeta Kühler" && names({ q: "nargun agricium" }) === "");
ok("Filter: kombiniert (Gruppe + Org)", names({ group: "shield", onlyOrg: true }) === "7CA 'Nargun'" && names({ group: "armor", onlyOrg: true }) === "");
ok("Filter: Leerzeichen in der Suche stören nicht", names({ q: "   " }).split("|").length === 4);

// ---------- Sortieren, Zählen ----------
const s = (k) => c.sortRows(rows, k).map((r) => r.n).join("|");
ok("Sortieren nach Name", s("name") === "7CA 'Nargun'|Antium Core|M3A Cannon|Zeta Kühler");
ok("Sortieren nach Craftzeit (kurz zuerst)", s("time") === "Antium Core|M3A Cannon|Zeta Kühler|7CA 'Nargun'");
ok("Sortieren nach Größe (ohne Größe zuletzt)", s("size") === "M3A Cannon|Zeta Kühler|7CA 'Nargun'|Antium Core");
ok("Sortieren nach Missionen (viele zuerst)", s("missions").startsWith("7CA 'Nargun'"));
ok("Sortieren verändert die Eingabe nicht", rows[0].n === "7CA 'Nargun'");
ok("Zählen je Gruppe", JSON.stringify(c.groupCounts(rows)) === '{"shield":1,"shipweapon":1,"armor":1,"cooler":1}');
console.log(fails === 0 ? "\nALLE TESTS BESTANDEN" : `\n${fails} FEHLER`);
process.exit(fails === 0 ? 0 : 1);
