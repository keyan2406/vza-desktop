"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";
import { announce } from "../../../utils/notify";
import { lootClaimed } from "../../../utils/notifications";
import { lootMessageChanged } from "../../../utils/discord-publish";

// Diese Meldungen stammen aus unseren Datenbank-Regeln und dürfen angezeigt werden.
const SAFE = [
  "Du hast dieses Objekt bereits geclaimt",
  "Dieses Objekt kann nicht geclaimt werden",
  "Claim kann nicht mehr zurückgezogen werden",
  "Kein Claim vorhanden",
  "Objekt nicht gefunden",
  "Nicht angemeldet",
];

function refresh(itemId: number) {
  revalidatePath("/lager");
  revalidatePath("/lager/verwalten");
  revalidatePath(`/lager/${itemId}`);
}

export async function claimLoot(itemId: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { error: "Ungültiges Objekt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_loot", { p_item_id: itemId });

  if (error) {
    const known = SAFE.some((m) => error.message.includes(m));
    return { error: known ? error.message : "Claim fehlgeschlagen. Bitte erneut versuchen." };
  }

  refresh(itemId);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await announce("kasse", () => lootClaimed(supabase, itemId, user.id));
  lootMessageChanged(itemId);
  return { error: null };
}

export async function withdrawClaim(itemId: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { error: "Ungültiges Objekt." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_claim", { p_item_id: itemId });

  if (error) {
    const known = SAFE.some((m) => error.message.includes(m));
    return { error: known ? error.message : "Zurückziehen fehlgeschlagen. Bitte erneut versuchen." };
  }

  refresh(itemId);
  lootMessageChanged(itemId);
  return { error: null };
}
