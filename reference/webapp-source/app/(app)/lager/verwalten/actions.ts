"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../utils/supabase/server";
import { announce } from "../../../../utils/notify";
import { lootMessageChanged, lootReleasedNotice } from "../../../../utils/discord-publish";
import {
  awardCancelled,
  lootAwarded,
  paymentConfirmed,
} from "../../../../utils/notifications";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(itemId?: number) {
  revalidatePath("/lager");
  revalidatePath("/lager/verwalten");
  revalidatePath("/kassenbuch");
  if (itemId) revalidatePath(`/lager/${itemId}`);
}

// Meldungen aus unseren Datenbank-Regeln, die angezeigt werden dürfen.
const SAFE = [
  "Keine Berechtigung",
  "Objekt nicht gefunden",
  "Objekt ist nicht gesperrt",
  "Objekt ist nicht zugeteilt",
  "Ungültiger Preis",
  "Ungültiger Lagerort",
  "Bitte angeben, bei wem das Objekt liegt",
  "Spieler nicht gefunden",
  "Verkaufte Objekte lassen sich nicht verschieben",
];

function friendly(message: string, fallback: string) {
  const known = SAFE.find((m) => message.includes(m));
  return known ? `${known}.` : fallback;
}

export async function releaseLoot(
  itemId: number,
  price: number
): Promise<{ error: string | null }> {
  if (!Number.isInteger(itemId) || itemId <= 0) return { error: "Ungültiges Objekt." };
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000_000_000) {
    return { error: "Der Preis muss eine ganze Zahl in aUEC sein (0 oder mehr)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("release_loot", {
    p_item_id: itemId,
    p_price: price,
  });
  if (error) return { error: friendly(error.message, "Freigeben fehlgeschlagen.") };

  refresh(itemId);
  await lootReleasedNotice(supabase, itemId);
  return { error: null };
}

// Ein Officer entscheidet, wer von den Claimenden das Objekt bekommt.
export async function awardLoot(formData: FormData): Promise<void> {
  const id = Number(formData.get("item_id"));
  const userId = String(formData.get("user_id") ?? "");
  if (!Number.isInteger(id) || id <= 0 || !UUID.test(userId)) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("award_loot", { p_item_id: id, p_user_id: userId });
  refresh(id);
  if (!error) {
    await announce("kasse", () => lootAwarded(supabase, id));
    lootMessageChanged(id);
  }
}

export async function confirmPayment(formData: FormData): Promise<void> {
  const id = Number(formData.get("item_id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_payment", { p_item_id: id });
  refresh(id);
  if (!error) {
    await announce("kasse", () => paymentConfirmed(supabase, id));
    lootMessageChanged(id);
  }
}

export async function cancelAward(formData: FormData): Promise<void> {
  const id = Number(formData.get("item_id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_award", { p_item_id: id });
  refresh(id);
  if (!error) {
    await announce("kasse", () => awardCancelled(supabase, id));
    lootMessageChanged(id);
  }
}

export async function moveLoot(input: {
  itemId: number;
  location: "player" | "vizsla_bank";
  holderId: string | null;
  note: string;
}): Promise<{ error: string | null }> {
  if (!Number.isInteger(input?.itemId) || input.itemId <= 0) {
    return { error: "Ungültiges Objekt." };
  }
  if (input.location !== "player" && input.location !== "vizsla_bank") {
    return { error: "Ungültiger Lagerort." };
  }
  if (input.holderId !== null && !UUID.test(input.holderId)) {
    return { error: "Ungültiger Spieler." };
  }
  if (input.location === "player" && !input.holderId) {
    return { error: "Bitte angeben, bei wem das Objekt liegt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_loot", {
    p_item_id: input.itemId,
    p_location: input.location,
    p_holder: input.holderId,
    p_note: String(input.note ?? "").trim(),
  });
  if (error) return { error: friendly(error.message, "Speichern fehlgeschlagen.") };

  refresh(input.itemId);
  return { error: null };
}
