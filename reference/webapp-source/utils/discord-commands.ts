// Slash-Befehle (/blaupause, /operationen, /rangliste ...). Frei von Next.js-Abhängigkeiten, damit sie sich testen lassen.
// Alle Befehle laufen mit dem Dienst-Schlüssel der Seite; wer sie benutzen darf, prüft requireMember() über die Discord-ID.
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashCode, newResetCode } from "./auth-codes";
import { normalizeResetCode } from "./auth-validate";
import { categoryLabel, effectiveCategory } from "./blueprint-category";
import { COLOR, esc, siteLink } from "./discord";
import { describeResult } from "./discord-bot";
import { first, formatAuec } from "./format";
import { cleanDetails, cleanRecipe, decodeKey, detailsLabel, formatAmount, formatDuration } from "./item-info";
import { amountOf, totals, type ShopRow } from "./shopping";

// ---------- Typen ----------

export type Opt = { type: number; name: string; value?: string | number | boolean; focused?: boolean; options?: Opt[] };
export type CommandInteraction = {
  type?: number; // 2 = Befehl, 4 = Autovervollständigung
  data?: { name?: string; options?: Opt[] };
  member?: { user?: { id?: unknown } };
  user?: { id?: unknown };
  channel_id?: string;
};
export type CmdReply = { content?: string; embeds?: object[]; components?: object[]; allowed_mentions?: object };
export type CmdResult = CmdReply & { refresh?: { type: "event" | "loot" | "craft"; id: number } };
export type CommandHandled = { response: Record<string, unknown>; work?: () => Promise<CmdResult> };
export type CmdDeps = {
  db: SupabaseClient;
  siteUrl?: string;
  // Veröffentlicht die Anfrage-Karte mit Knöpfen im Kanal (Bot). Liefert false, wenn nichts gepostet werden konnte.
  publishCraft: (requestId: number, owners: { discord_id: string | null }[], channelId?: string) => Promise<boolean>;
};

const EPHEMERAL = 64;
const CATEGORY_MAX = 25;

// ---------- Befehle für Discord (Registrierung) ----------

const S = 3, I = 4, B = 5, U = 6, SUB = 1;
const str = (name: string, description: string, o: { required?: boolean; autocomplete?: boolean } = {}) => ({
  type: S, name, description, required: o.required ?? false, autocomplete: o.autocomplete ?? false,
});
const pub = { type: B, name: "oeffentlich", description: "Antwort für alle im Kanal sichtbar machen", required: false };

export const COMMANDS = [
  { name: "hilfe", description: "Alle Befehle des Bots im Überblick" },
  {
    name: "verknuepfen",
    description: "Dein Konto auf der Seite mit diesem Discord-Konto verbinden",
    options: [str("code", "Der Code aus deinem Profil auf der Seite", { required: true })],
  },
  { name: "passwort", description: "Link zum Festlegen eines neuen Passworts (nur für dich sichtbar)" },
  {
    name: "blaupause",
    description: "Blaupausen suchen, anfragen und ansehen",
    options: [
      { type: SUB, name: "suchen", description: "Wer hat die Blaupause? Dazu Zutaten und Herstellzeit", options: [str("name", "Name der Blaupause", { required: true, autocomplete: true }), pub] },
      {
        type: SUB, name: "anfragen", description: "Alle, die die Blaupause besitzen, bitten, sie dir herzustellen",
        options: [
          str("name", "Name der Blaupause", { required: true, autocomplete: true }),
          { type: I, name: "menge", description: "Wie viele Stück (1 bis 99)", required: false, min_value: 1, max_value: 99 },
          str("notiz", "Kurze Notiz, z. B. bis wann"),
        ],
      },
      { type: SUB, name: "meine", description: "Deine zuletzt erhaltenen Blaupausen" },
    ],
  },
  { name: "anfragen", description: "Offene Herstellungs-Anfragen anzeigen", options: [pub] },
  {
    name: "einkaufsliste",
    description: "Deine Einkaufsliste für Zutaten",
    options: [
      { type: SUB, name: "zeigen", description: "Liste und Zutaten gesamt anzeigen", options: [pub] },
      {
        type: SUB, name: "hinzufuegen", description: "Blaupause zur Liste hinzufügen",
        options: [str("blaupause", "Name der Blaupause", { required: true, autocomplete: true }), { type: I, name: "menge", description: "Wie viele Stück (1 bis 99)", required: false, min_value: 1, max_value: 99 }],
      },
      { type: SUB, name: "entfernen", description: "Blaupause von der Liste nehmen", options: [str("blaupause", "Name der Blaupause", { required: true, autocomplete: true })] },
      { type: SUB, name: "leeren", description: "Die ganze Liste leeren" },
    ],
  },
  { name: "operationen", description: "Die nächsten Operationen", options: [pub] },
  { name: "anmelden", description: "Zu einer Operation anmelden", options: [str("operation", "Welche Operation", { required: true, autocomplete: true }), str("rolle", "Deine Rolle (optional)", { autocomplete: true })] },
  { name: "abmelden", description: "Von einer Operation abmelden", options: [str("operation", "Welche Operation", { required: true, autocomplete: true })] },
  { name: "lager", description: "Freigegebene Objekte im Lager", options: [pub] },
  { name: "claimen", description: "Ein freigegebenes Objekt claimen", options: [str("objekt", "Welches Objekt", { required: true, autocomplete: true })] },
  { name: "rangliste", description: "Die Rangliste nach Punkten", options: [{ type: I, name: "anzahl", description: "Wie viele Plätze (3 bis 25)", required: false, min_value: 3, max_value: 25 }, pub] },
  { name: "profil", description: "Level, Punkte und Rang", options: [{ type: U, name: "mitglied", description: "Ein anderes Mitglied (sonst du)", required: false }, pub] },
  { name: "hangar", description: "Die Schiffe eines Mitglieds", options: [{ type: U, name: "mitglied", description: "Ein anderes Mitglied (sonst du)", required: false }, pub] },
  { name: "schiff", description: "Wer in der Org hat ein bestimmtes Schiff?", options: [str("name", "Name des Schiffs", { required: true, autocomplete: true }), pub] },
];

// ---------- Kleine Helfer ----------

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const escLike = (q: string) => q.replace(/[\\%_]/g, (m) => `\\${m}`).trim();
const isId = (v: unknown): boolean => typeof v === "string" && /^\d{1,15}$/.test(v);
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const mention = (p: { username?: string | null; discord_id?: string | null } | null) =>
  p ? (p.discord_id && /^\d{5,25}$/.test(p.discord_id) ? `<@${p.discord_id}>` : esc(p.username ?? "Unbekannt")) : "–";

type Parsed = { sub: string | null; vals: Record<string, string | number | boolean>; focused: { name: string; value: string } | null };

export function parseOptions(options?: Opt[]): Parsed {
  const out: Parsed = { sub: null, vals: {}, focused: null };
  let list = options ?? [];
  if (list[0]?.type === SUB) {
    out.sub = list[0].name;
    list = list[0].options ?? [];
  }
  for (const o of list) {
    if (o.value === undefined) continue;
    out.vals[o.name] = o.value;
    if (o.focused) out.focused = { name: o.name, value: String(o.value) };
  }
  return out;
}

const say = (content: string): CmdResult => ({ content });
const card = (embed: object, extra: Partial<CmdReply> = {}): CmdResult => ({ embeds: [embed], ...extra });

function noAccount(siteUrl?: string) {
  return `Du hast noch kein Konto. Melde dich einmal mit Discord auf ${siteUrl ?? "der Seite"} an, dann klappt es auch hier.`;
}

type Me = { id: string; username: string; role: string };
async function requireMember(db: SupabaseClient, discordId: string, siteUrl?: string): Promise<{ me: Me } | { error: string }> {
  const { data } = await db.from("profiles").select("id, username, role, approved").eq("discord_id", discordId).limit(1).maybeSingle();
  if (!data) return { error: noAccount(siteUrl) };
  if (!(data as { approved: boolean }).approved) return { error: "Dein Konto wartet noch auf die Freigabe durch einen Admin." };
  return { me: data as unknown as Me };
}

// ---------- Blaupausen finden ----------

type BpRow = {
  id: number;
  name: string;
  ini_key: string | null;
  category: string | null;
  details: unknown;
  recipe: unknown;
  player_blueprints: { user_id: string; profiles: { username: string; discord_id: string | null; approved: boolean } | { username: string; discord_id: string | null; approved: boolean }[] | null }[] | null;
};
const BP_SELECT = "id, name, ini_key, category, details, recipe, player_blueprints(user_id, profiles(username, discord_id, approved))";

// raw kommt aus der Autovervollständigung (Kennung) oder wurde von Hand getippt (Name)
async function findBlueprint(db: SupabaseClient, raw: string): Promise<{ bp: BpRow } | { error: string }> {
  const text = String(raw ?? "").trim();
  if (!text) return { error: "Bitte gib eine Blaupause an." };
  if (isId(text)) {
    const { data } = await db.from("blueprints").select(BP_SELECT).eq("id", Number(text)).maybeSingle();
    return data ? { bp: data as unknown as BpRow } : { error: "Diese Blaupause gibt es nicht." };
  }
  const exact = await db.from("blueprints").select(BP_SELECT).ilike("name", escLike(text)).limit(2);
  const e = (exact.data ?? []) as unknown as BpRow[];
  if (e.length === 1) return { bp: e[0] };
  const part = await db.from("blueprints").select("id, name").ilike("name", `%${escLike(text)}%`).order("name").limit(6);
  const p = (part.data ?? []) as { id: number; name: string }[];
  if (p.length === 1) {
    const { data } = await db.from("blueprints").select(BP_SELECT).eq("id", p[0].id).maybeSingle();
    if (data) return { bp: data as unknown as BpRow };
  }
  if (p.length === 0) return { error: `Zu „${clip(text, 60)}“ habe ich keine Blaupause gefunden.` };
  return { error: `Mehrere passen: ${p.map((x) => x.name).join(", ")}. Tippe den Namen und wähle einen Eintrag aus der Liste.` };
}

const ownersOf = (bp: BpRow) =>
  (bp.player_blueprints ?? [])
    .map((o) => ({ id: o.user_id, ...(first(o.profiles) ?? { username: "Unbekannt", discord_id: null, approved: false }) }))
    .filter((o) => o.approved);

function recipeLines(recipe: ReturnType<typeof cleanRecipe>, factor = 1) {
  if (!recipe) return null;
  const lines = recipe.items.slice(0, 10).map((i) => `${esc(i.name)}: ${formatAmount(i, factor) || "–"}`);
  if (recipe.items.length > 10) lines.push(`… und ${recipe.items.length - 10} weitere`);
  return lines;
}

async function cmdBlueprintSearch(db: SupabaseClient, me: Me, raw: string, siteUrl?: string): Promise<CmdResult> {
  const r = await findBlueprint(db, raw);
  if ("error" in r) return say(r.error);
  const bp = r.bp;
  const owners = ownersOf(bp);
  const recipe = cleanRecipe(bp.recipe);
  const info = detailsLabel(cleanDetails(bp.details)) ?? decodeKey(bp.ini_key);
  const cat = categoryLabel(effectiveCategory({ name: bp.name, ini_key: bp.ini_key, category: bp.category }));
  const mine = owners.some((o) => o.id === me.id);

  const ownerText = owners.length === 0 ? "Niemand in der Org besitzt sie zurzeit." : clip(owners.map((o) => mention(o)).join(", "), 1000);
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: `Besitzer (${owners.length})`, value: ownerText },
  ];
  const lines = recipeLines(recipe);
  if (lines && lines.length > 0) fields.push({ name: "Zutaten (1 Stück)", value: lines.join("\n") });
  if (recipe?.secs !== undefined) fields.push({ name: "Herstellzeit", value: formatDuration(recipe.secs), inline: true });
  if (recipe?.free === true) fields.push({ name: "Verfügbarkeit", value: "ohne Blaupause", inline: true });
  if (!recipe) fields.push({ name: "Rezept", value: "Zu dieser Blaupause ist kein Rezept bekannt." });

  const hint = mine
    ? "Du besitzt diese Blaupause."
    : owners.length > 0
      ? "Mit `/blaupause anfragen` bittest du die Besitzer, sie dir herzustellen."
      : "";
  return card(
    { title: bp.name, url: siteLink("/blueprints") ?? siteUrl, description: `${cat}${info ? ` · ${info}` : ""}${hint ? `\n\n${hint}` : ""}`, color: COLOR.info, fields },
    { allowed_mentions: { parse: [] } }
  );
}

async function cmdBlueprintRequest(deps: CmdDeps, me: Me, discordId: string, raw: string, qty: number, note: string | null, channelId?: string): Promise<CmdResult> {
  const r = await findBlueprint(deps.db, raw);
  if ("error" in r) return say(r.error);
  const { data, error } = await deps.db.rpc("discord_create_craft_request", {
    p_discord_id: discordId, p_blueprint_id: r.bp.id, p_qty: qty, p_note: note,
  });
  const res = (data ?? {}) as { status?: string; id?: number; blueprint_name?: string; owners?: { discord_id: string | null }[] };
  if (error || !data) return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  switch (res.status) {
    case "no_account": return say(noAccount(deps.siteUrl));
    case "not_member": return say("Dein Konto wartet noch auf die Freigabe durch einen Admin.");
    case "bad_qty": return say("Die Menge muss zwischen 1 und 99 liegen.");
    case "no_blueprint": return say("Diese Blaupause gibt es nicht.");
    case "own": return say(`Du besitzt **${esc(res.blueprint_name ?? r.bp.name)}** schon selbst.`);
    case "exists": return say(`Du hast für **${esc(res.blueprint_name ?? r.bp.name)}** schon eine offene Anfrage (#${res.id}). Warte, bis jemand sie übernimmt, oder brich sie auf der Seite ab.`);
    case "too_many": return say("Du hast schon 5 offene Anfragen. Schließe oder brich zuerst eine ab.");
    case "no_owners": return say(`Zurzeit besitzt niemand in der Org **${esc(res.blueprint_name ?? r.bp.name)}**. Es gibt also niemanden, den ich fragen könnte.`);
    case "ok": break;
    default: return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  }
  const posted = await deps.publishCraft(Number(res.id), res.owners ?? [], channelId);
  const n = (res.owners ?? []).length;
  return say(
    posted
      ? `✅ Deine Anfrage #${res.id} ist raus. ${n} ${n === 1 ? "Besitzer wurde" : "Besitzer wurden"} benachrichtigt.`
      : `Deine Anfrage #${res.id} ist gespeichert, aber ich konnte sie nicht in Discord posten (dem Bot fehlt wohl ein Kanal oder ein Recht). Sie steht auf der Seite unter Blaupausen.`
  );
}

async function cmdMyBlueprints(db: SupabaseClient, me: Me): Promise<CmdResult> {
  const { data, count } = await db
    .from("player_blueprints")
    .select("acquired_at, created_at, blueprints(name)", { count: "exact" })
    .eq("user_id", me.id)
    .order("acquired_at", { ascending: false, nullsFirst: false })
    .limit(10);
  const rows = (data ?? []) as unknown as { acquired_at: string | null; created_at: string; blueprints: { name: string } | { name: string }[] | null }[];
  if (rows.length === 0) return say("Du hast noch keine Blaupausen eingetragen. Lies sie auf der Seite aus dem Spiel aus oder importiere sie.");
  const lines = rows.map((r) => `• ${esc(first(r.blueprints)?.name ?? "Unbekannt")} <t:${unix(r.acquired_at ?? r.created_at)}:d>`);
  return card({ title: `Deine Blaupausen (${count ?? rows.length})`, description: `Die zuletzt erhaltenen:\n${lines.join("\n")}`, color: COLOR.info });
}

async function cmdRequests(db: SupabaseClient, me: Me): Promise<CmdResult> {
  const { data } = await db
    .from("craft_requests")
    .select(`id, qty, status, blueprint_id, blueprints(name),
      requester:profiles!craft_requests_requester_id_fkey(username, discord_id),
      taker:profiles!craft_requests_taker_id_fkey(username, discord_id)`)
    .in("status", ["open", "taken"])
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as unknown as {
    id: number; qty: number; status: string; blueprint_id: number;
    blueprints: { name: string } | { name: string }[] | null;
    requester: { username: string; discord_id: string | null } | { username: string; discord_id: string | null }[] | null;
    taker: { username: string; discord_id: string | null } | { username: string; discord_id: string | null }[] | null;
  }[];
  if (rows.length === 0) return say("Zurzeit gibt es keine offenen Anfragen.");
  const { data: owned } = await db.from("player_blueprints").select("blueprint_id").eq("user_id", me.id).in("blueprint_id", rows.map((r) => r.blueprint_id));
  const mine = new Set(((owned ?? []) as { blueprint_id: number }[]).map((o) => o.blueprint_id));
  const lines = rows.map((r) => {
    const base = `**#${r.id}** ${r.qty}× ${esc(first(r.blueprints)?.name ?? "Blaupause")} · von ${mention(first(r.requester))}`;
    if (r.status === "taken") return `${base} · übernommen von ${mention(first(r.taker))}`;
    return `${base}${mine.has(r.blueprint_id) ? " · **du kannst sie übernehmen**" : ""}`;
  });
  return card(
    { title: "Offene Anfragen", description: `${lines.join("\n")}\n\nÜbernehmen kannst du mit dem Knopf an der Anfrage oder auf der Seite.`, color: COLOR.info },
    { allowed_mentions: { parse: [] } }
  );
}

// ---------- Einkaufsliste ----------

async function loadShopping(db: SupabaseClient, userId: string): Promise<ShopRow[]> {
  const { data } = await db.from("shopping_list").select("blueprint_id, qty, blueprints(name, recipe)").eq("user_id", userId).order("created_at");
  return ((data ?? []) as unknown as { blueprint_id: number; qty: number; blueprints: { name: string; recipe: unknown } | { name: string; recipe: unknown }[] | null }[]).map((r) => {
    const b = first(r.blueprints);
    return { blueprintId: r.blueprint_id, name: b?.name ?? "Unbekannt", qty: r.qty, recipe: cleanRecipe(b?.recipe) };
  });
}

async function cmdShoppingShow(db: SupabaseClient, me: Me): Promise<CmdResult> {
  const rows = await loadShopping(db, me.id);
  if (rows.length === 0) return say("Deine Einkaufsliste ist leer. Füge etwas mit `/einkaufsliste hinzufuegen` hinzu oder auf der Seite bei den Blaupausen.");
  const { totals: sums, withoutRecipe } = totals(rows);
  const fields: { name: string; value: string }[] = [
    { name: "Herzustellen", value: clip(rows.map((r) => `${r.qty}× ${esc(r.name)}`).join("\n"), 1000) },
  ];
  if (sums.length > 0) fields.push({ name: "Zutaten gesamt", value: clip(sums.map((t) => `${esc(t.name)}: ${amountOf(t) || "–"}`).join("\n"), 1000) });
  if (withoutRecipe.length > 0) fields.push({ name: "Ohne bekanntes Rezept", value: clip(withoutRecipe.map(esc).join(", "), 500) });
  return card({ title: "Deine Einkaufsliste", color: COLOR.money, fields });
}

async function cmdShoppingAdd(db: SupabaseClient, me: Me, raw: string, qty: number): Promise<CmdResult> {
  const r = await findBlueprint(db, raw);
  if ("error" in r) return say(r.error);
  const { error } = await db.from("shopping_list").upsert({ user_id: me.id, blueprint_id: r.bp.id, qty }, { onConflict: "user_id,blueprint_id" });
  if (error) return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  return say(`✅ **${qty}× ${esc(r.bp.name)}** steht auf deiner Einkaufsliste. Mit \`/einkaufsliste zeigen\` siehst du alle Zutaten.`);
}

async function cmdShoppingRemove(db: SupabaseClient, me: Me, raw: string): Promise<CmdResult> {
  const r = await findBlueprint(db, raw);
  if ("error" in r) return say(r.error);
  const { error } = await db.from("shopping_list").delete().eq("user_id", me.id).eq("blueprint_id", r.bp.id);
  if (error) return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  return say(`**${esc(r.bp.name)}** ist von deiner Einkaufsliste entfernt.`);
}

async function cmdShoppingClear(db: SupabaseClient, me: Me): Promise<CmdResult> {
  const { error } = await db.from("shopping_list").delete().eq("user_id", me.id);
  return say(error ? "Das hat nicht geklappt. Bitte versuche es auf der Seite." : "Deine Einkaufsliste ist leer.");
}

// ---------- Operationen ----------

type EventRow = { id: number; title: string; starts_at: string; min_players: number; status: string; event_signups: { user_id: string }[] | null };

async function upcomingEvents(db: SupabaseClient, limit: number): Promise<EventRow[]> {
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("events")
    .select("id, title, starts_at, min_players, status, event_signups(user_id)")
    .in("status", ["planned", "running"])
    .gte("starts_at", since)
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data ?? []) as unknown as EventRow[];
}

async function findEvent(db: SupabaseClient, raw: string): Promise<{ ev: { id: number; title: string } } | { error: string }> {
  const text = String(raw ?? "").trim();
  if (isId(text)) {
    const { data } = await db.from("events").select("id, title").eq("id", Number(text)).maybeSingle();
    return data ? { ev: data as { id: number; title: string } } : { error: "Diese Operation gibt es nicht." };
  }
  const { data } = await db.from("events").select("id, title").eq("status", "planned").ilike("title", `%${escLike(text)}%`).order("starts_at").limit(2);
  const list = (data ?? []) as { id: number; title: string }[];
  if (list.length === 1) return { ev: list[0] };
  return { error: list.length === 0 ? `Zu „${clip(text, 60)}“ habe ich keine geplante Operation gefunden.` : "Mehrere Operationen passen. Tippe den Namen und wähle einen Eintrag aus der Liste." };
}

async function cmdEvents(db: SupabaseClient, siteUrl?: string): Promise<CmdResult> {
  const rows = await upcomingEvents(db, 5);
  if (rows.length === 0) return say("Zurzeit ist keine Operation geplant.");
  const lines = rows.map((e) => {
    const n = (e.event_signups ?? []).length;
    const ts = unix(e.starts_at);
    return `**${esc(e.title)}**${e.status === "running" ? " (läuft)" : ""}\n<t:${ts}:F> · <t:${ts}:R>\n${n} von mindestens ${e.min_players} angemeldet · ${siteUrl ? `[Details](${siteUrl}/operationen/${e.id})` : `#${e.id}`}`;
  });
  return card({ title: "Die nächsten Operationen", description: lines.join("\n\n"), color: COLOR.info }, { allowed_mentions: { parse: [] } });
}

async function cmdSignup(deps: CmdDeps, discordId: string, rawEvent: string, rawRole: string | null, leave: boolean): Promise<CmdResult> {
  const f = await findEvent(deps.db, rawEvent);
  if ("error" in f) return say(f.error);
  let roleId: number | null = null;
  if (!leave && rawRole) {
    if (isId(rawRole)) roleId = Number(rawRole);
    else {
      const { data } = await deps.db.from("event_role_requirements").select("id").eq("event_id", f.ev.id).ilike("name", escLike(rawRole)).limit(1);
      const hit = ((data ?? []) as { id: number }[])[0];
      if (!hit) return say(`Die Rolle „${clip(rawRole, 40)}“ gibt es bei dieser Operation nicht. Wähle eine aus der Liste.`);
      roleId = hit.id;
    }
  }
  const fn = leave ? "discord_event_signoff" : "discord_event_signup";
  const args = leave ? { p_discord_id: discordId, p_event_id: f.ev.id } : { p_discord_id: discordId, p_event_id: f.ev.id, p_role_id: roleId };
  const { data, error } = await deps.db.rpc(fn, args);
  if (error || !data || typeof data !== "object") return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  const result = data as { status?: string };
  const kind = leave ? "op_leave" : roleId !== null ? "op_role" : "op_join";
  const text = describeResult({ kind, id: f.ev.id }, result, deps.siteUrl);
  return { content: `**${esc(f.ev.title)}**: ${text}`, refresh: result.status === "ok" ? { type: "event", id: f.ev.id } : undefined };
}

// ---------- Lager ----------

type LootRow = { id: number; name: string; quantity: number | null; price_auec: number | null; location: string | null; loot_claims: { status: string }[] | null };

async function cmdStock(db: SupabaseClient): Promise<CmdResult> {
  const { data } = await db
    .from("loot_items")
    .select("id, name, quantity, price_auec, location, loot_claims(status)")
    .eq("status", "released")
    .order("released_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as unknown as LootRow[];
  if (rows.length === 0) return say("Zurzeit ist nichts zum Claimen freigegeben.");
  const lines = rows.map((r) => {
    const claims = (r.loot_claims ?? []).filter((c) => c.status === "pending").length;
    return `**${esc(r.name)}**${r.quantity && r.quantity > 1 ? ` ×${r.quantity}` : ""} · ${formatAuec(r.price_auec)} · ${claims} ${claims === 1 ? "Claim" : "Claims"}`;
  });
  return card({ title: "Freigegebene Objekte", description: `${lines.join("\n")}\n\nClaimen mit \`/claimen\` oder dem Knopf an der Nachricht.`, color: COLOR.money });
}

async function cmdClaim(deps: CmdDeps, discordId: string, raw: string): Promise<CmdResult> {
  let id: number | null = isId(raw) ? Number(raw) : null;
  let name = "";
  if (id === null) {
    const { data } = await deps.db.from("loot_items").select("id, name").eq("status", "released").ilike("name", `%${escLike(String(raw))}%`).limit(2);
    const list = (data ?? []) as { id: number; name: string }[];
    if (list.length !== 1) return say(list.length === 0 ? "Dazu habe ich kein freigegebenes Objekt gefunden." : "Mehrere Objekte passen. Wähle eines aus der Liste.");
    id = list[0].id;
    name = list[0].name;
  }
  const { data, error } = await deps.db.rpc("discord_loot_claim", { p_discord_id: discordId, p_item_id: id });
  if (error || !data || typeof data !== "object") return say("Das hat nicht geklappt. Bitte versuche es auf der Seite.");
  const result = data as { status?: string; name?: string };
  return { content: describeResult({ kind: "loot_claim", id }, { ...result, name: result.name ?? name }, deps.siteUrl), refresh: result.status === "ok" ? { type: "loot", id } : undefined };
}

// ---------- Rangliste, Profil, Hangar ----------

async function cmdLeaderboard(db: SupabaseClient, n: number): Promise<CmdResult> {
  const { data } = await db.from("player_stats").select("user_id, username, total_points, ops_count, level").order("total_points", { ascending: false }).limit(n);
  const rows = (data ?? []) as { username: string; total_points: number; ops_count: number; level: number }[];
  if (rows.length === 0) return say("Es gibt noch keine Punkte.");
  const medal = ["🥇", "🥈", "🥉"];
  const lines = rows.map((r, i) => `${medal[i] ?? `**${i + 1}.**`} ${esc(r.username)} · Level ${r.level} · ${r.total_points} Punkte · ${r.ops_count} Operationen`);
  return card({ title: "Rangliste", description: lines.join("\n"), color: COLOR.money });
}

async function memberByDiscord(db: SupabaseClient, discordId: string) {
  const { data } = await db.from("profiles").select("id, username, discord_id, approved").eq("discord_id", discordId).limit(1).maybeSingle();
  return (data as { id: string; username: string; discord_id: string; approved: boolean } | null) ?? null;
}

async function cmdProfile(db: SupabaseClient, targetDiscordId: string): Promise<CmdResult> {
  const p = await memberByDiscord(db, targetDiscordId);
  if (!p || !p.approved) return say("Dieses Mitglied habe ich nicht gefunden.");
  const { data } = await db.from("player_stats").select("total_points, ops_count, level").eq("user_id", p.id).maybeSingle();
  const s = (data as { total_points: number; ops_count: number; level: number } | null) ?? { total_points: 0, ops_count: 0, level: 1 };
  const higher = await db.from("player_stats").select("user_id", { count: "exact", head: true }).gt("total_points", s.total_points);
  const { data: th } = await db.from("level_thresholds").select("level, min_points").gt("min_points", s.total_points).order("min_points").limit(1);
  const next = ((th ?? []) as { level: number; min_points: number }[])[0];
  const fields = [
    { name: "Level", value: String(s.level), inline: true },
    { name: "Punkte", value: String(s.total_points), inline: true },
    { name: "Rang", value: `${(higher.count ?? 0) + 1}.`, inline: true },
    { name: "Operationen", value: String(s.ops_count), inline: true },
  ];
  if (next) fields.push({ name: `Bis Level ${next.level}`, value: `noch ${next.min_points - s.total_points} Punkte`, inline: true });
  return card({ title: esc(p.username), color: COLOR.info, fields }, { allowed_mentions: { parse: [] } });
}

async function cmdHangar(db: SupabaseClient, targetDiscordId: string): Promise<CmdResult> {
  const p = await memberByDiscord(db, targetDiscordId);
  if (!p || !p.approved) return say("Dieses Mitglied habe ich nicht gefunden.");
  const { data } = await db.from("hangar_ships").select("source, ships(name)").eq("user_id", p.id);
  const rows = (data ?? []) as unknown as { source: string; ships: { name: string } | { name: string }[] | null }[];
  if (rows.length === 0) return say(`${esc(p.username)} hat noch keine Schiffe eingetragen.`);
  const count = new Map<string, number>();
  for (const r of rows) {
    const key = `${first(r.ships)?.name ?? "Unbekannt"}|${r.source}`;
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  const list = (src: string) =>
    [...count.entries()].filter(([k]) => k.endsWith(`|${src}`)).map(([k, n]) => `${esc(k.split("|")[0])}${n > 1 ? ` ×${n}` : ""}`).sort((a, b) => a.localeCompare(b, "de"));
  const ingame = list("ingame"), pledge = list("pledge");
  const fields: { name: string; value: string }[] = [];
  if (ingame.length) fields.push({ name: `Im Spiel (${ingame.length})`, value: clip(ingame.join(", "), 1000) });
  if (pledge.length) fields.push({ name: `Pledge (${pledge.length})`, value: clip(pledge.join(", "), 1000) });
  return card({ title: `Hangar von ${esc(p.username)}`, color: COLOR.info, fields });
}

async function cmdShip(db: SupabaseClient, raw: string): Promise<CmdResult> {
  const text = String(raw ?? "").trim();
  let ship: { id: number; name: string } | null = null;
  if (isId(text)) {
    const { data } = await db.from("ships").select("id, name").eq("id", Number(text)).maybeSingle();
    ship = (data as { id: number; name: string } | null) ?? null;
  } else {
    const { data } = await db.from("ships").select("id, name").ilike("name", `%${escLike(text)}%`).order("name").limit(2);
    const list = (data ?? []) as { id: number; name: string }[];
    const exact = list.find((s) => s.name.toLowerCase() === text.toLowerCase());
    ship = exact ?? (list.length === 1 ? list[0] : null);
    if (!ship) return say(list.length === 0 ? `Zu „${clip(text, 60)}“ habe ich kein Schiff gefunden.` : "Mehrere Schiffe passen. Tippe den Namen und wähle einen Eintrag aus der Liste.");
  }
  if (!ship) return say("Dieses Schiff gibt es nicht.");
  const { data } = await db.from("hangar_ships").select("source, profiles(username, discord_id, approved)").eq("ship_id", ship.id);
  const rows = (data ?? []) as unknown as { source: string; profiles: { username: string; discord_id: string | null; approved: boolean } | { username: string; discord_id: string | null; approved: boolean }[] | null }[];
  const owners = (src: string) => rows.filter((r) => r.source === src).map((r) => first(r.profiles)).filter((p): p is NonNullable<typeof p> => !!p && p.approved);
  const ingame = owners("ingame"), pledge = owners("pledge");
  const fields: { name: string; value: string }[] = [];
  if (ingame.length) fields.push({ name: `Im Spiel (${ingame.length})`, value: clip(ingame.map(mention).join(", "), 1000) });
  if (pledge.length) fields.push({ name: `Pledge (${pledge.length})`, value: clip(pledge.map(mention).join(", "), 1000) });
  if (fields.length === 0) return say(`**${esc(ship.name)}** hat zurzeit niemand in der Org eingetragen.`);
  return card({ title: ship.name, color: COLOR.info, fields }, { allowed_mentions: { parse: [] } });
}

// ---------- Konto verknüpfen ----------

async function linkAccount(deps: CmdDeps, discordId: string, rawCode: string): Promise<CmdResult> {
  const code = String(rawCode ?? "").replace(/[\s-]+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    return say("Der Code hat 8 Zeichen aus Buchstaben und Ziffern. Erzeuge ihn auf der Seite unter Profil.");
  }
  const { data, error } = await deps.db.rpc("discord_link_account", { p_discord_id: discordId, p_code: code });
  const res = (data ?? {}) as { status?: string; username?: string };
  if (error || !data) return say("Das hat nicht geklappt. Bitte versuche es später noch einmal.");
  switch (res.status) {
    case "ok":
      return say(`✅ Verknüpft! Dein Konto **${esc(res.username ?? "")}** gehört jetzt zu diesem Discord-Konto. Der Bot erwähnt dich ab sofort, und alle Befehle funktionieren für dich. Teste es mit \`/hilfe\`.`);
    case "invalid":
      return say("Der Code stimmt nicht oder ist abgelaufen. Erzeuge auf der Seite unter Profil einen neuen (15 Minuten gültig, nur einmal benutzbar).");
    case "discord_taken":
      return say("Dieses Discord-Konto ist schon mit einem anderen Konto verbunden. Melde dich auf der Seite mit Discord an, dann landest du in dem Konto. Hilft das nicht, sprich einen Admin an.");
    case "already_linked":
      return say("Dein Konto ist schon mit Discord verknüpft.");
    default:
      return say("Das hat nicht geklappt. Bitte versuche es später noch einmal.");
  }
}

// ---------- Passwort zurücksetzen ----------

// Wer in Discord schreibt, ist durch Discord bestätigt. Der Link ist nur für diese Person sichtbar (ephemeral).
async function passwordReset(deps: CmdDeps, discordId: string): Promise<CmdResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newResetCode();
    const norm = normalizeResetCode(code);
    if (!norm.ok) break;
    const { data, error } = await deps.db.rpc("discord_create_password_reset", { p_discord_id: discordId, p_hash: hashCode(norm.value) });
    if (error || !data) return say("Das hat nicht geklappt. Bitte versuche es später noch einmal.");
    const res = data as { status?: string; login_name?: string | null };
    switch (res.status) {
      case "ok": {
        const base = deps.siteUrl?.replace(/\/+$/, "");
        const link = base ? `${base}/passwort-neu?code=${code}` : null;
        return {
          content: [
            "🔑 **Neues Passwort festlegen**",
            link ? `Öffne diesen Link: ${link}` : `Die Adresse der Seite ist nicht eingestellt. Dein Code ist \`${code}\`, ein Admin sagt dir, wo du ihn eingibst.`,
            "Er gilt 15 Minuten und nur einmal. Gib ihn niemandem weiter, auch keinem Admin.",
            res.login_name ? `Dein Benutzername ist \`${res.login_name}\`.` : "Du hast noch keinen Benutzernamen, den legst du auf der Seite gleich mit fest.",
          ].join("\n"),
          allowed_mentions: { parse: [] },
        };
      }
      case "no_account":
        return say(`Dieses Discord-Konto ist mit keinem Konto auf der Seite verknüpft. Melde dich auf ${deps.siteUrl ?? "der Seite"} an und verknüpfe es unter Profil. Hilft das nicht, bitte einen Admin um einen Link.`);
      case "blocked":
        return say("Dein Konto ist gesperrt. Wende dich an einen Admin.");
      case "too_soon":
        return say("Du hast gerade erst einen Link angefordert. Nutze den von eben oder warte eine Minute und versuche es dann noch einmal.");
      case "retry":
        continue;
      default:
        return say("Das hat nicht geklappt. Bitte versuche es später noch einmal.");
    }
  }
  return say("Das hat nicht geklappt. Bitte versuche es noch einmal.");
}

// ---------- Hilfe ----------

export function helpEmbed(siteUrl?: string) {
  return {
    title: "Befehle des Bots",
    color: COLOR.info,
    description: [
      "**Konto**",
      "`/verknuepfen` dein Konto mit Discord verbinden (Code aus dem Profil)",
      "`/passwort` neues Passwort festlegen (Link nur für dich sichtbar)",
      "",
      "**Blaupausen**",
      "`/blaupause suchen` wer hat sie, Zutaten, Herstellzeit",
      "`/blaupause anfragen` alle Besitzer bitten, sie dir herzustellen",
      "`/blaupause meine` deine zuletzt erhaltenen",
      "`/anfragen` offene Herstellungs-Anfragen",
      "`/einkaufsliste` zeigen, hinzufuegen, entfernen, leeren",
      "",
      "**Operationen und Lager**",
      "`/operationen` die nächsten Termine",
      "`/anmelden` und `/abmelden` mit Rolle zur Auswahl",
      "`/lager` und `/claimen` freigegebene Objekte",
      "",
      "**Mitglieder und Flotte**",
      "`/rangliste` · `/profil` · `/hangar` · `/schiff`",
      "",
      "Bei vielen Befehlen kannst du `oeffentlich` einschalten, dann sehen es alle im Kanal.",
      siteUrl ? `Alles Weitere auf ${siteUrl}.` : "",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

// ---------- Autovervollständigung ----------

type Choice = { name: string; value: string };
const choices = (list: Choice[]) => ({ type: 8, data: { choices: list.slice(0, CATEGORY_MAX).map((c) => ({ name: clip(c.name, 100), value: clip(c.value, 100) })) } });

async function autocomplete(i: CommandInteraction, deps: CmdDeps, discordId: string): Promise<Record<string, unknown>> {
  const cmd = i.data?.name ?? "";
  const { sub, vals, focused } = parseOptions(i.data?.options);
  if (!focused) return choices([]);
  const q = escLike(focused.value);
  const db = deps.db;

  // Nur freigegebene Mitglieder bekommen Vorschläge
  const m = await requireMember(db, discordId);
  if ("error" in m) return choices([]);

  const field = focused.name;
  if ((cmd === "blaupause" && field === "name") || (cmd === "einkaufsliste" && sub === "hinzufuegen" && field === "blaupause")) {
    const { data } = await db.from("blueprints").select("id, name").ilike("name", `%${q}%`).order("name").limit(CATEGORY_MAX);
    return choices(((data ?? []) as { id: number; name: string }[]).map((b) => ({ name: b.name, value: String(b.id) })));
  }
  if (cmd === "einkaufsliste" && sub === "entfernen" && field === "blaupause") {
    const rows = await loadShopping(db, m.me.id);
    const low = focused.value.trim().toLowerCase();
    return choices(rows.filter((r) => !low || r.name.toLowerCase().includes(low)).map((r) => ({ name: `${r.qty}× ${r.name}`, value: String(r.blueprintId) })));
  }
  if ((cmd === "anmelden" || cmd === "abmelden") && field === "operation") {
    const rows = await upcomingEvents(db, 25);
    const low = focused.value.trim().toLowerCase();
    return choices(rows.filter((e) => e.status === "planned" && (!low || e.title.toLowerCase().includes(low))).map((e) => ({ name: `${e.title} (${new Date(e.starts_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })})`, value: String(e.id) })));
  }
  if (cmd === "anmelden" && field === "rolle") {
    const opId = isId(vals.operation) ? Number(vals.operation) : null;
    if (opId === null) return choices([]);
    const { data } = await db.from("event_role_requirements").select("id, name").eq("event_id", opId).order("id");
    const low = focused.value.trim().toLowerCase();
    return choices(((data ?? []) as { id: number; name: string }[]).filter((r) => !low || r.name.toLowerCase().includes(low)).map((r) => ({ name: r.name, value: String(r.id) })));
  }
  if (cmd === "claimen" && field === "objekt") {
    const { data } = await db.from("loot_items").select("id, name").eq("status", "released").ilike("name", `%${q}%`).order("released_at", { ascending: false }).limit(CATEGORY_MAX);
    return choices(((data ?? []) as { id: number; name: string }[]).map((l) => ({ name: l.name, value: String(l.id) })));
  }
  if (cmd === "schiff" && field === "name") {
    const { data } = await db.from("ships").select("id, name").ilike("name", `%${q}%`).order("name").limit(CATEGORY_MAX);
    return choices(((data ?? []) as { id: number; name: string }[]).map((s) => ({ name: s.name, value: String(s.id) })));
  }
  return choices([]);
}

// ---------- Einstieg ----------

export async function handleCommand(i: CommandInteraction, deps: CmdDeps): Promise<CommandHandled> {
  const discordId = String(i.member?.user?.id ?? i.user?.id ?? "");
  if (!/^\d{5,25}$/.test(discordId)) return { response: { type: 4, data: { content: "Diese Aktion wird nicht unterstützt.", flags: EPHEMERAL } } };

  if (i.type === 4) {
    try {
      return { response: await autocomplete(i, deps, discordId) };
    } catch {
      return { response: choices([]) };
    }
  }

  const name = i.data?.name ?? "";
  if (name === "hilfe") return { response: { type: 4, data: { embeds: [helpEmbed(deps.siteUrl)], flags: EPHEMERAL } } };
  if (!COMMANDS.some((c) => c.name === name)) return { response: { type: 4, data: { content: "Diesen Befehl kenne ich nicht.", flags: EPHEMERAL } } };

  const { sub, vals } = parseOptions(i.data?.options);
  const isPublic = vals.oeffentlich === true;

  // Verknüpfen geht schon, bevor es eine Verbindung gibt: Der Code beweist, wem das Konto gehört
  if (name === "verknuepfen") {
    return {
      response: { type: 5, data: { flags: EPHEMERAL } },
      work: async () => linkAccount(deps, discordId, String(vals.code ?? "")),
    };
  }

  // Passwort vergessen: geht auch ohne Freigabe, der Link ist nur für diese Person sichtbar
  if (name === "passwort") {
    return {
      response: { type: 5, data: { flags: EPHEMERAL } },
      work: async () => passwordReset(deps, discordId),
    };
  }

  return {
    // Sofort quittieren (Discord erwartet in 3 Sekunden eine Antwort), die Arbeit folgt danach.
    response: { type: 5, data: isPublic ? {} : { flags: EPHEMERAL } },
    work: async () => {
      const m = await requireMember(deps.db, discordId, deps.siteUrl);
      if ("error" in m) return say(m.error);
      const me = m.me;
      const qty = Math.min(99, Math.max(1, Math.round(Number(vals.menge ?? 1)) || 1));
      const target = typeof vals.mitglied === "string" && /^\d{5,25}$/.test(vals.mitglied) ? vals.mitglied : discordId;

      switch (name) {
        case "blaupause":
          if (sub === "suchen") return cmdBlueprintSearch(deps.db, me, String(vals.name ?? ""), deps.siteUrl);
          if (sub === "anfragen") return cmdBlueprintRequest(deps, me, discordId, String(vals.name ?? ""), qty, typeof vals.notiz === "string" ? vals.notiz : null, i.channel_id);
          if (sub === "meine") return cmdMyBlueprints(deps.db, me);
          break;
        case "anfragen": return cmdRequests(deps.db, me);
        case "einkaufsliste":
          if (sub === "zeigen") return cmdShoppingShow(deps.db, me);
          if (sub === "hinzufuegen") return cmdShoppingAdd(deps.db, me, String(vals.blaupause ?? ""), qty);
          if (sub === "entfernen") return cmdShoppingRemove(deps.db, me, String(vals.blaupause ?? ""));
          if (sub === "leeren") return cmdShoppingClear(deps.db, me);
          break;
        case "operationen": return cmdEvents(deps.db, deps.siteUrl);
        case "anmelden": return cmdSignup(deps, discordId, String(vals.operation ?? ""), typeof vals.rolle === "string" ? vals.rolle : null, false);
        case "abmelden": return cmdSignup(deps, discordId, String(vals.operation ?? ""), null, true);
        case "lager": return cmdStock(deps.db);
        case "claimen": return cmdClaim(deps, discordId, String(vals.objekt ?? ""));
        case "rangliste": return cmdLeaderboard(deps.db, Math.min(25, Math.max(3, Math.round(Number(vals.anzahl ?? 10)) || 10)));
        case "profil": return cmdProfile(deps.db, target);
        case "hangar": return cmdHangar(deps.db, target);
        case "schiff": return cmdShip(deps.db, String(vals.name ?? ""));
      }
      return say("Diesen Befehl kenne ich nicht.");
    },
  };
}

// Trägt die Befehle beim Server ein (sofort gültig, Discord ersetzt dabei die ganze Liste)
export async function registerCommands(
  call: (path: string, method: string, body: unknown, token: string) => Promise<{ ok: boolean; status: number; json: unknown }>,
  appId: string,
  guildId: string,
  botToken: string
) {
  const r = await call(`/applications/${appId}/guilds/${guildId}/commands`, "PUT", COMMANDS, botToken);
  return { ok: r.ok, status: r.status, count: Array.isArray(r.json) ? r.json.length : 0 };
}
