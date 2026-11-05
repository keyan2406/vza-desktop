"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../utils/supabase/server";
import { eventSignupsChanged } from "../../../utils/discord-publish";

function parseIds(formData: FormData) {
  const eventId = Number(formData.get("event_id"));
  const rawRole = String(formData.get("role_id") ?? "").trim();
  const roleId = rawRole === "" ? null : Number(rawRole);
  if (!Number.isInteger(eventId) || eventId <= 0) return null;
  if (roleId !== null && (!Number.isInteger(roleId) || roleId <= 0)) return null;
  return { eventId, roleId };
}

// Anmelden oder die Rolle wechseln. Die Prüfung (nur geplante Operationen,
// Rolle gehört zur Operation) macht die Datenbank-Funktion.
export async function signUp(formData: FormData): Promise<void> {
  const ids = parseIds(formData);
  if (!ids) return;

  const supabase = await createClient();
  await supabase.rpc("signup_for_event", {
    p_event_id: ids.eventId,
    p_role_id: ids.roleId,
  });

  revalidatePath("/operationen");
  revalidatePath(`/operationen/${ids.eventId}`);
  eventSignupsChanged(ids.eventId);
}

export async function signOff(formData: FormData): Promise<void> {
  const ids = parseIds(formData);
  if (!ids) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("event_signups")
    .delete()
    .eq("event_id", ids.eventId)
    .eq("user_id", user.id);

  revalidatePath("/operationen");
  revalidatePath(`/operationen/${ids.eventId}`);
  eventSignupsChanged(ids.eventId);
}
