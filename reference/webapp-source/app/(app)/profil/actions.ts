"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

const KNOWN = [
  "Dieser Name ist bereits vergeben",
  "Der Name braucht 2 bis 32 Zeichen",
  "Nicht angemeldet",
];

export async function updateDisplayName(
  name: string
): Promise<{ error: string | null }> {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length < 2 || trimmed.length > 32) {
    return { error: "Der Name braucht 2 bis 32 Zeichen." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_display_name", { p_name: trimmed });
  if (error) {
    const known = KNOWN.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "Speichern fehlgeschlagen." };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
