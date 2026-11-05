"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

export async function addShip(
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht angemeldet." };

  const shipId = Number(formData.get("ship_id"));
  const source = formData.get("source") === "pledge" ? "pledge" : "ingame";
  const raw = String(formData.get("pledge_value") ?? "").trim().replace(",", ".");
  const value = source === "pledge" && raw !== "" ? Number(raw) : null;

  if (!Number.isInteger(shipId) || shipId <= 0) {
    return { error: "Bitte ein Schiff aus der Liste wählen." };
  }
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    return { error: "Der Pledge-Wert ist ungültig." };
  }

  // Die Datenbank-Regeln (RLS) stellen sicher, dass nur für sich selbst eingetragen wird.
  const { error } = await supabase.from("hangar_ships").insert({
    user_id: user.id,
    ship_id: shipId,
    source,
    pledge_value_eur: value,
  });
  if (error) return { error: "Speichern fehlgeschlagen. Bitte erneut versuchen." };

  revalidatePath("/hangar");
  return { error: null };
}

export async function removeShip(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const supabase = await createClient();
  await supabase.from("hangar_ships").delete().eq("id", id);
  revalidatePath("/hangar");
}
