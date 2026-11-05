import { after } from "next/server";
import { createAdminClient } from "../../../../utils/supabase/admin";
import {
  editInteractionReply,
  handleInteraction,
  verifyDiscordSignature,
  type Interaction,
} from "../../../../utils/discord-bot";
import { handleCommand, type CommandInteraction } from "../../../../utils/discord-commands";
import {
  publishCraftRequest,
  refreshCraftMessage,
  refreshEventMessage,
  refreshLootMessage,
} from "../../../../utils/discord-publish";

// Hier landen alle Klicks auf Knöpfe und Menüs aus Discord.
export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const appId = process.env.DISCORD_APP_ID;
  if (!publicKey || !appId) return new Response("not configured", { status: 503 });

  const body = await request.text();
  const ok = verifyDiscordSignature(
    publicKey,
    request.headers.get("x-signature-ed25519") ?? "",
    request.headers.get("x-signature-timestamp") ?? "",
    body
  );
  if (!ok) return new Response("invalid request signature", { status: 401 });

  let interaction: { token?: string } & Record<string, unknown>;
  try {
    interaction = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json({
      type: 4,
      data: { content: "Der Bot ist noch nicht fertig eingerichtet.", flags: 64 },
    });
  }

  const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, "");

  // Slash-Befehle (2) und Vorschläge beim Tippen (4)
  if (interaction.type === 2 || interaction.type === 4) {
    const cmd = await handleCommand(interaction as CommandInteraction, {
      db: admin,
      siteUrl,
      publishCraft: publishCraftRequest,
    });
    if (cmd.work && typeof interaction.token === "string") {
      const token = interaction.token;
      after(async () => {
        try {
          const result = await cmd.work!();
          const { refresh, ...reply } = result;
          await editInteractionReply(appId, token, reply);
          if (refresh?.type === "event") await refreshEventMessage(refresh.id);
          if (refresh?.type === "loot") await refreshLootMessage(refresh.id);
          if (refresh?.type === "craft") await refreshCraftMessage(refresh.id);
        } catch {
          await editInteractionReply(appId, token, "Das hat nicht geklappt. Bitte versuche es später noch einmal.");
        }
      });
    }
    return Response.json(cmd.response);
  }

  const handled = handleInteraction(interaction as Interaction, {
    rpc: (fn, args) => Promise.resolve(admin.rpc(fn, args)),
    siteUrl,
  });

  if (handled.work && typeof interaction.token === "string") {
    const token = interaction.token;
    after(async () => {
      try {
        const result = await handled.work!();
        await editInteractionReply(appId, token, result.content);
        if (result.refresh?.type === "event") await refreshEventMessage(result.refresh.id);
        if (result.refresh?.type === "loot") await refreshLootMessage(result.refresh.id);
        if (result.refresh?.type === "craft") await refreshCraftMessage(result.refresh.id);
      } catch {
        await editInteractionReply(appId, token, "Das hat nicht geklappt. Bitte versuche es auf der Seite.");
      }
    });
  }

  return Response.json(handled.response);
}
