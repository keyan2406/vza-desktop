// Discord-Bot ohne Dauerbetrieb: Discord ruft die Seite bei jedem Klick auf einen Knopf auf (HTTP).
// Dieses Modul ist frei von Next.js-Abhängigkeiten, damit es sich gut testen lässt.
import { createPublicKey, verify } from "node:crypto";

const API = "https://discord.com/api/v10";

// ---------- Echtheit der Anfrage ----------

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
  nowSeconds = Date.now() / 1000
): boolean {
  try {
    if (!/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
    // Alte Anfragen werden abgelehnt (Schutz gegen erneutes Abspielen)
    if (!/^\d{9,12}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

export { pingFor } from "./discord";

// ---------- Knöpfe und Auswahlmenü ----------

export type RoleOption = { id: number; name: string; filled: number; needed: number };

const BUTTON = { primary: 1, secondary: 2, success: 3, danger: 4, link: 5 } as const;

export function eventComponents(eventId: number, roles: RoleOption[], url?: string, discordEventUrl?: string) {
  const rows: object[] = [
    {
      type: 1,
      components: [
        { type: 2, style: BUTTON.success, label: "Anmelden", custom_id: `op:join:${eventId}` },
        { type: 2, style: BUTTON.secondary, label: "Abmelden", custom_id: `op:leave:${eventId}` },
        ...(url ? [{ type: 2, style: BUTTON.link, label: "Auf der Seite öffnen", url }] : []),
        ...(discordEventUrl ? [{ type: 2, style: BUTTON.link, label: "Discord-Event", url: discordEventUrl }] : []),
      ],
    },
  ];
  if (roles.length > 0) {
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `op:role:${eventId}`,
          placeholder: "Rolle wählen",
          min_values: 1,
          max_values: 1,
          options: roles.slice(0, 25).map((r) => ({
            label: r.name.slice(0, 100),
            value: String(r.id),
            description: `${r.filled} von ${r.needed} angemeldet`.slice(0, 100),
          })),
        },
      ],
    });
  }
  return rows;
}

export function lootComponents(itemId: number, url?: string) {
  return [
    {
      type: 1,
      components: [
        { type: 2, style: BUTTON.primary, label: "Claim setzen", custom_id: `loot:claim:${itemId}` },
        { type: 2, style: BUTTON.secondary, label: "Claim zurückziehen", custom_id: `loot:unclaim:${itemId}` },
        ...(url ? [{ type: 2, style: BUTTON.link, label: "Im Lager öffnen", url }] : []),
      ],
    },
  ];
}

// ---------- Klicks auswerten ----------

export type Action =
  | { kind: "op_join"; id: number }
  | { kind: "op_leave"; id: number }
  | { kind: "op_role"; id: number }
  | { kind: "loot_claim"; id: number }
  | { kind: "loot_unclaim"; id: number }
  | { kind: "bp_take"; id: number }
  | { kind: "bp_release"; id: number }
  | { kind: "bp_done"; id: number }
  | { kind: "bp_cancel"; id: number };

export function parseCustomId(raw: unknown): Action | null {
  if (typeof raw !== "string") return null;
  const m = /^(op|loot|bp):(join|leave|role|claim|unclaim|take|release|done|cancel):(\d{1,15})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[3]);
  const key = `${m[1]}:${m[2]}`;
  const kinds: Record<string, Action["kind"]> = {
    "op:join": "op_join",
    "op:leave": "op_leave",
    "op:role": "op_role",
    "loot:claim": "loot_claim",
    "loot:unclaim": "loot_unclaim",
    "bp:take": "bp_take",
    "bp:release": "bp_release",
    "bp:done": "bp_done",
    "bp:cancel": "bp_cancel",
  };
  const kind = kinds[key];
  return kind ? ({ kind, id } as Action) : null;
}

type RpcResult = { data: unknown; error: unknown };
export type BotDeps = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  siteUrl?: string;
};
export type Handled = {
  response: Record<string, unknown>;
  work?: () => Promise<{ content: string; refresh?: { type: "event" | "loot" | "craft"; id: number } }>;
};

const EPHEMERAL = 64;
const say = (content: string) => ({ type: 4, data: { content, flags: EPHEMERAL } });

export type Interaction = {
  type?: number;
  data?: { custom_id?: unknown; values?: unknown };
  member?: { user?: { id?: unknown } };
  user?: { id?: unknown };
};

function noAccount(siteUrl?: string) {
  return `Du hast noch kein Konto. Melde dich einmal mit Discord auf ${siteUrl ?? "der Seite"} an, dann klappt es auch hier.`;
}

// Übersetzt das Ergebnis der Datenbank in eine kurze Antwort, die nur der Klickende sieht.
export function describeResult(
  action: Action,
  result: { status?: string; role?: string | null; already?: boolean; name?: string; was_signed_up?: boolean },
  siteUrl?: string
): string {
  if (action.kind.startsWith("bp_")) {
    switch (result.status) {
      case "no_account":
        return noAccount(siteUrl);
      case "pending":
      case "not_member":
        return "Dein Konto wartet noch auf die Freigabe durch einen Admin.";
      case "not_found":
        return "Diese Anfrage gibt es nicht mehr.";
      case "closed":
        return "Diese Anfrage ist schon übernommen oder abgeschlossen.";
      case "not_owner":
        return "Nur Mitglieder, die diese Blaupause besitzen, können die Anfrage übernehmen.";
      case "own_request":
        return "Das ist deine eigene Anfrage. Du kannst sie abbrechen oder als erledigt markieren.";
      case "forbidden":
        return "Das darfst du bei dieser Anfrage nicht.";
      case "ok":
        return {
          bp_take: "✅ Du hast die Anfrage übernommen. Klicke auf Erledigt, wenn du fertig bist.",
          bp_release: "Du hast die Anfrage zurückgegeben. Sie ist wieder offen.",
          bp_done: "✅ Die Anfrage ist als erledigt markiert.",
          bp_cancel: "Die Anfrage ist abgebrochen.",
        }[action.kind as "bp_take" | "bp_release" | "bp_done" | "bp_cancel"];
      default:
        return "Das hat nicht geklappt. Bitte versuche es auf der Seite.";
    }
  }
  switch (result.status) {
    case "no_account":
      return noAccount(siteUrl);
    case "pending":
      return "Dein Konto wartet noch auf die Freigabe durch einen Admin.";
    case "no_event":
    case "no_item":
      return "Das gibt es nicht mehr.";
    case "closed":
      return "Dafür kann man sich nicht mehr an- oder abmelden.";
    case "bad_role":
      return "Diese Rolle gibt es bei dieser Operation nicht.";
    case "not_released":
      return `**${result.name ?? "Das Objekt"}** kann zurzeit nicht geclaimt werden.`;
    case "none":
      return "Du hattest keinen Claim auf dieses Objekt.";
    case "already":
      return `Du hast **${result.name ?? "das Objekt"}** schon geclaimt.`;
    case "ok":
      break;
    default:
      return "Das hat nicht geklappt. Bitte versuche es auf der Seite.";
  }
  switch (action.kind) {
    case "op_join":
      return result.already
        ? "Du bist schon angemeldet. Wähle im Menü eine Rolle, wenn du magst."
        : "✅ Du bist dabei! Wähle im Menü eine Rolle, wenn du magst.";
    case "op_role":
      return `✅ Angemeldet als **${result.role ?? "Rolle"}**.`;
    case "op_leave":
      return result.was_signed_up ? "Du bist abgemeldet." : "Du warst nicht angemeldet.";
    case "loot_claim":
      return `✅ Dein Claim für **${result.name ?? "das Objekt"}** ist gesetzt. Ein Offizier entscheidet, wer es bekommt.`;
    case "loot_unclaim":
      return `Dein Claim für **${result.name ?? "das Objekt"}** ist zurückgezogen.`;
    default:
      return "Das hat nicht geklappt. Bitte versuche es auf der Seite.";
  }
}

export function handleInteraction(i: Interaction, deps: BotDeps): Handled {
  if (i.type === 1) return { response: { type: 1 } };
  if (i.type !== 3) return { response: say("Diese Aktion wird nicht unterstützt.") };

  const action = parseCustomId(i.data?.custom_id);
  const discordId = String(i.member?.user?.id ?? i.user?.id ?? "");
  if (!action || !/^\d{5,25}$/.test(discordId)) return { response: say("Diese Aktion wird nicht unterstützt.") };

  let roleId: number | null = null;
  if (action.kind === "op_role") {
    const first = Array.isArray(i.data?.values) ? (i.data?.values as unknown[])[0] : null;
    roleId = typeof first === "string" && /^\d{1,15}$/.test(first) ? Number(first) : null;
    if (roleId === null) return { response: say("Bitte wähle eine Rolle aus dem Menü.") };
  }

  // Sofort quittieren (Discord erwartet in 3 Sekunden eine Antwort), die Arbeit folgt danach.
  return {
    response: { type: 5, data: { flags: EPHEMERAL } },
    work: async () => {
      const calls: Record<Action["kind"], [string, Record<string, unknown>]> = {
        op_join: ["discord_event_signup", { p_discord_id: discordId, p_event_id: action.id, p_role_id: null }],
        op_role: ["discord_event_signup", { p_discord_id: discordId, p_event_id: action.id, p_role_id: roleId }],
        op_leave: ["discord_event_signoff", { p_discord_id: discordId, p_event_id: action.id }],
        loot_claim: ["discord_loot_claim", { p_discord_id: discordId, p_item_id: action.id }],
        loot_unclaim: ["discord_loot_unclaim", { p_discord_id: discordId, p_item_id: action.id }],
        bp_take: ["discord_take_craft_request", { p_discord_id: discordId, p_id: action.id }],
        bp_release: ["discord_close_craft_request", { p_discord_id: discordId, p_id: action.id, p_action: "release" }],
        bp_done: ["discord_close_craft_request", { p_discord_id: discordId, p_id: action.id, p_action: "done" }],
        bp_cancel: ["discord_close_craft_request", { p_discord_id: discordId, p_id: action.id, p_action: "cancel" }],
      };
      const [fn, args] = calls[action.kind];
      const { data, error } = await deps.rpc(fn, args);
      if (error || !data || typeof data !== "object") {
        return { content: "Das hat nicht geklappt. Bitte versuche es auf der Seite." };
      }
      const result = data as { status?: string };
      return {
        content: describeResult(action, result, deps.siteUrl),
        refresh:
          result.status === "ok"
            ? {
                type: action.kind.startsWith("op_")
                  ? ("event" as const)
                  : action.kind.startsWith("bp_")
                    ? ("craft" as const)
                    : ("loot" as const),
                id: action.id,
              }
            : undefined,
      };
    },
  };
}

// ---------- Nachrichten über die Discord-Schnittstelle ----------

export async function discordCall(path: string, method: string, body?: unknown, botToken?: string) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(botToken ? { Authorization: `Bot ${botToken}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok, status: res.status, json } as { ok: boolean; status: number; json: Record<string, unknown> | null };
  } catch {
    return { ok: false, status: 0, json: null };
  }
}

export async function postBotMessage(botToken: string, channelId: string, payload: object) {
  const r = await discordCall(`/channels/${channelId}/messages`, "POST", payload, botToken);
  return r.ok && typeof r.json?.id === "string" ? (r.json.id as string) : null;
}

export async function editBotMessage(botToken: string, channelId: string, messageId: string, payload: object) {
  return (await discordCall(`/channels/${channelId}/messages/${messageId}`, "PATCH", payload, botToken)).ok;
}

// Antwort auf einen Klick oder Befehl. Nur Text, oder eine ganze Nachricht mit Karten und Knöpfen.
export type ReplyPayload = {
  content?: string;
  embeds?: object[];
  components?: object[];
  allowed_mentions?: object;
};

export async function editInteractionReply(appId: string, interactionToken: string, reply: string | ReplyPayload) {
  const payload: ReplyPayload =
    typeof reply === "string" ? { content: reply } : { ...reply };
  if (payload.content !== undefined) payload.content = payload.content.slice(0, 1900);
  if (!payload.allowed_mentions) payload.allowed_mentions = { parse: [] };
  return (await discordCall(`/webhooks/${appId}/${interactionToken}/messages/@original`, "PATCH", payload)).ok;
}

// Liest die Nachricht, die als Antwort auf einen Befehl entstanden ist (für Kanal- und Nachrichten-Kennung)
export async function getInteractionReply(appId: string, interactionToken: string) {
  const r = await discordCall(`/webhooks/${appId}/${interactionToken}/messages/@original`, "GET");
  const id = r.json?.id;
  const channel = r.json?.channel_id;
  return r.ok && typeof id === "string" && typeof channel === "string" ? { messageId: id, channelId: channel } : null;
}
