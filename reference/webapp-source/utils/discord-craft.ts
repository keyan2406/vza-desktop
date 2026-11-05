// Nachricht zu einer Herstellungs-Anfrage ("Wer kann mir das herstellen?") mit Knöpfen.
// Frei von Next.js-Abhängigkeiten, damit sich das gut testen lässt.
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLOR, esc, siteLink } from "./discord";
import { first } from "./format";
import { cleanRecipe, formatAmount, formatDuration } from "./item-info";

type Person = { username: string; discord_id: string | null };
type Row = {
  id: number;
  qty: number;
  note: string | null;
  status: string;
  discord_channel_id: string | null;
  discord_message_id: string | null;
  blueprints: { name: string; recipe: unknown } | { name: string; recipe: unknown }[] | null;
  requester: Person | Person[] | null;
  taker: Person | Person[] | null;
};

const BUTTON = { success: 3, secondary: 2, danger: 4, link: 5 } as const;

export function craftComponents(id: number, status: string, url?: string) {
  const link = url ? [{ type: 2, style: BUTTON.link, label: "Auf der Seite", url }] : [];
  if (status === "open") {
    return [
      {
        type: 1,
        components: [
          { type: 2, style: BUTTON.success, label: "Das übernehme ich", custom_id: `bp:take:${id}` },
          { type: 2, style: BUTTON.danger, label: "Abbrechen", custom_id: `bp:cancel:${id}` },
          ...link,
        ],
      },
    ];
  }
  if (status === "taken") {
    return [
      {
        type: 1,
        components: [
          { type: 2, style: BUTTON.success, label: "Erledigt", custom_id: `bp:done:${id}` },
          { type: 2, style: BUTTON.secondary, label: "Zurückgeben", custom_id: `bp:release:${id}` },
          { type: 2, style: BUTTON.danger, label: "Abbrechen", custom_id: `bp:cancel:${id}` },
          ...link,
        ],
      },
    ];
  }
  return []; // erledigt oder abgebrochen: keine Knöpfe mehr
}

const who = (p: Person | null) => (p ? (p.discord_id && /^\d{5,25}$/.test(p.discord_id) ? `<@${p.discord_id}>` : esc(p.username)) : "jemand");

const STATUS: Record<string, { title: string; color: number; label: string }> = {
  open: { title: "Blaupause angefragt", color: COLOR.info, label: "Offen" },
  taken: { title: "Anfrage übernommen", color: COLOR.money, label: "Übernommen" },
  done: { title: "Anfrage erledigt", color: COLOR.muted, label: "Erledigt" },
  cancelled: { title: "Anfrage abgebrochen", color: COLOR.muted, label: "Abgebrochen" },
};

export type CraftMessage = {
  payload: { content?: string; embeds: object[]; components: object[]; allowed_mentions: object };
  channelId: string | null;
  messageId: string | null;
};

// owners: nur beim Anlegen angeben. Sie werden einzeln erwähnt (ohne @everyone), damit die Besitzer es sehen.
export async function buildCraftMessage(
  db: SupabaseClient,
  id: number,
  owners?: { discord_id: string | null }[]
): Promise<CraftMessage | null> {
  const { data } = await db
    .from("craft_requests")
    .select(
      `id, qty, note, status, discord_channel_id, discord_message_id,
       blueprints(name, recipe),
       requester:profiles!craft_requests_requester_id_fkey(username, discord_id),
       taker:profiles!craft_requests_taker_id_fkey(username, discord_id)`
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as Row;

  const bp = first(r.blueprints);
  const requester = first(r.requester);
  const taker = first(r.taker);
  const st = STATUS[r.status] ?? STATUS.open;
  const recipe = cleanRecipe(bp?.recipe);

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "Status",
      value: r.status === "taken" || (r.status === "done" && taker) ? `${st.label} von ${who(taker)}` : st.label,
      inline: true,
    },
    { name: "Menge", value: `${r.qty}×`, inline: true },
  ];
  if (recipe && recipe.items.length > 0) {
    const lines = recipe.items.slice(0, 8).map((i) => `${esc(i.name)}: ${formatAmount(i, r.qty) || "–"}`);
    if (recipe.items.length > 8) lines.push(`… und ${recipe.items.length - 8} weitere`);
    fields.push({ name: `Zutaten für ${r.qty}×`, value: lines.join("\n") });
  }
  if (recipe?.secs !== undefined) {
    fields.push({ name: "Herstellzeit je Stück", value: formatDuration(recipe.secs), inline: true });
  }

  const embed = {
    title: `${st.title}: ${esc(bp?.name ?? "Blaupause")}`,
    url: siteLink("/blueprints"),
    description:
      `${who(requester)} sucht jemanden, der **${r.qty}×** ${esc(bp?.name ?? "das")} herstellt.` +
      (r.note ? `\n> ${esc(r.note)}` : ""),
    color: st.color,
    fields,
    footer: { text: `Anfrage #${r.id}` },
  };

  const message: CraftMessage = {
    payload: {
      embeds: [embed],
      components: craftComponents(r.id, r.status, siteLink("/blueprints")),
      allowed_mentions: { parse: [] },
    },
    channelId: r.discord_channel_id,
    messageId: r.discord_message_id,
  };

  if (owners) {
    const ids = [...new Set(owners.map((o) => o.discord_id).filter((x): x is string => !!x && /^\d{5,25}$/.test(x)))].slice(0, 50);
    const mentions = ids.map((x) => `<@${x}>`).join(" ");
    message.payload.content = `${mentions ? `${mentions} ` : ""}Wer von euch kann ${esc(bp?.name ?? "das")} herstellen?`.slice(0, 1900);
    message.payload.allowed_mentions = { parse: [], users: ids };
  }
  return message;
}
