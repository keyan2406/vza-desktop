"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";

// Den Schlüssel des PC-Helfers widerrufen: Eine schon heruntergeladene Datei trägt danach nichts mehr ein.
export async function revokeImportHelper(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_my_import_token");
  if (error) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  revalidatePath("/blueprints");
  return { error: null };
}
