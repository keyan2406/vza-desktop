"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../../../utils/supabase/server";
import { berlinLocalToISO } from "../../../../utils/format";
import { eventChanged, eventEdited } from "../../../../utils/discord-publish";

function refresh(eventId?: number) {
  revalidatePath("/operationen");
  revalidatePath("/operationen/verwalten");
  revalidatePath("/rangliste");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/operationen/${eventId}`);
}

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

type NewEventInput = {
  title: string;
  description: string;
  startsAt: string;
  minPlayers: number;
  points: number;
  ships: { shipId: number; quantity: number }[];
  roles: { name: string; quantity: number }[];
};

const CREATE_ERRORS = ["Keine Berechtigung", "Der Titel braucht 3 bis 100 Zeichen"];

function validateInput(input: NewEventInput) {
  const title = String(input?.title ?? "").trim();
  const description = String(input?.description ?? "").trim();
  const startsAt = berlinLocalToISO(String(input?.startsAt ?? ""));
  const ships = Array.isArray(input?.ships) ? input.ships : [];
  const roles = Array.isArray(input?.roles) ? input.roles : [];

  if (title.length < 3 || title.length > 100) {
    return { error: "Der Titel braucht 3 bis 100 Zeichen." };
  }
  if (!startsAt) return { error: "Bitte Datum und Uhrzeit angeben." };
  if (!isInt(input.minPlayers, 0, 500)) {
    return { error: "Die Mindestspielerzahl muss zwischen 0 und 500 liegen." };
  }
  if (!isInt(input.points, 0, 1000)) {
    return { error: "Die Punkte müssen zwischen 0 und 1000 liegen." };
  }
  if (ships.length > 30 || roles.length > 30) {
    return { error: "Zu viele Schiffe oder Rollen." };
  }
  if (!ships.every((s) => isInt(s?.shipId, 1, Number.MAX_SAFE_INTEGER) && isInt(s?.quantity, 1, 100))) {
    return { error: "Die Anzahl pro Schiff muss zwischen 1 und 100 liegen." };
  }
  if (
    !roles.every(
      (r) =>
        typeof r?.name === "string" &&
        r.name.trim().length >= 1 &&
        r.name.trim().length <= 60 &&
        isInt(r?.quantity, 1, 100)
    )
  ) {
    return { error: "Rollen brauchen einen Namen (bis 60 Zeichen) und eine Anzahl von 1 bis 100." };
  }
  return {
    value: {
      title,
      description,
      startsAt,
      ships,
      roles,
      minPlayers: input.minPlayers,
      points: input.points,
    },
  };
}

// Die Datenbank-Funktion legt Operation, Schiffe und Rollen in einem Schritt an.
export async function createEvent(
  input: NewEventInput
): Promise<{ error: string | null }> {
  const v = validateInput(input);
  if ("error" in v) return { error: v.error as string };
  const { title, description, startsAt, ships, roles } = v.value;

  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("create_event", {
    p_title: title,
    p_description: description,
    p_starts_at: startsAt,
    p_min_players: input.minPlayers,
    p_points: input.points,
    p_ships: ships.map((s) => ({ ship_id: s.shipId, quantity: s.quantity })),
    p_roles: roles.map((r) => ({ name: r.name.trim(), quantity: r.quantity })),
  });

  if (error) {
    const known = CREATE_ERRORS.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "Anlegen fehlgeschlagen. Bitte erneut versuchen." };
  }

  refresh();
  if (typeof newId === "number") {
    await eventChanged(supabase, newId, "created");
  }
  return { error: null };
}

function parseId(formData: FormData) {
  const id = Number(formData.get("event_id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function startEvent(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .update({ status: "running" })
    .eq("id", id)
    .eq("status", "planned")
    .select("id");
  refresh(id);
  if (data && data.length > 0) {
    await eventChanged(supabase, id, "running");
  }
}

export async function cancelEvent(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["planned", "running"])
    .select("id");
  refresh(id);
  if (data && data.length > 0) {
    await eventChanged(supabase, id, "cancelled");
  }
}

// Beendete Operationen bleiben bestehen, damit Punkte und Loot nachvollziehbar sind.
export async function deleteEvent(formData: FormData): Promise<void> {
  const id = parseId(formData);
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .in("status", ["planned", "cancelled"]);
  refresh(id);
}

const KNOWN_FINISH_ERRORS = [
  "Keine Berechtigung",
  "Operation nicht gefunden",
  "Operation ist bereits abgeschlossen",
  "Operation wurde abgesagt",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LootInput = {
  name: string;
  quantity: number;
  holderId: string | null;
  location: "player" | "vizsla_bank";
  note: string;
};

export async function finishEvent(
  eventId: number,
  attendeeIds: string[],
  loot: LootInput[]
): Promise<{ error: string | null }> {
  if (!isInt(eventId, 1, Number.MAX_SAFE_INTEGER)) {
    return { error: "Ungültige Operation." };
  }
  if (
    !Array.isArray(attendeeIds) ||
    attendeeIds.length > 500 ||
    !attendeeIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return { error: "Ungültige Teilnehmerliste." };
  }
  if (!Array.isArray(loot) || loot.length > 200) {
    return { error: "Zu viele Loot-Einträge (maximal 200)." };
  }
  for (const l of loot) {
    const name = String(l?.name ?? "").trim();
    if (name.length < 1 || name.length > 100) {
      return { error: "Jedes Loot-Objekt braucht einen Namen (bis 100 Zeichen)." };
    }
    if (!isInt(l?.quantity, 1, 1_000_000)) {
      return { error: `Ungültige Menge bei „${name}“.` };
    }
    if (l.location !== "player" && l.location !== "vizsla_bank") {
      return { error: `Ungültiger Lagerort bei „${name}“.` };
    }
    if (l.holderId !== null && !(typeof l.holderId === "string" && UUID.test(l.holderId))) {
      return { error: `Ungültiger Spieler bei „${name}“.` };
    }
    if (l.location === "player" && !l.holderId) {
      return { error: `Bei „${name}“ fehlt, bei wem es liegt.` };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_event", {
    p_event_id: eventId,
    p_attendees: attendeeIds,
    p_loot: loot.map((l) => ({
      name: l.name.trim(),
      quantity: l.quantity,
      holder_id: l.holderId,
      location: l.location,
      location_note: String(l.note ?? "").trim(),
    })),
  });

  if (error) {
    const known = KNOWN_FINISH_ERRORS.find((m) => error.message.includes(m));
    if (known) return { error: `${known}.` };
    const lootMsg = error.message.indexOf("Loot:");
    if (lootMsg >= 0) return { error: error.message.slice(lootMsg).split("\n")[0] };
    return { error: "Abschließen fehlgeschlagen. Bitte erneut versuchen." };
  }

  refresh(eventId);
  await eventChanged(supabase, eventId, "finished", {
    attendees: attendeeIds.length,
    loot: loot.length,
  });
  return { error: null };
}

const UPDATE_ERRORS = [
  "Keine Berechtigung",
  "Der Titel braucht 3 bis 100 Zeichen",
  "Operation nicht gefunden",
  "Nur geplante Operationen lassen sich bearbeiten",
];

// Bearbeiten: bestehende Rollen behalten ihre Anmeldungen
export async function updateEvent(
  eventId: number,
  input: NewEventInput
): Promise<{ error: string | null }> {
  if (!isInt(eventId, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Operation." };
  const v = validateInput(input);
  if ("error" in v) return { error: v.error as string };
  const { title, description, startsAt, ships, roles } = v.value;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_event", {
    p_event_id: eventId,
    p_title: title,
    p_description: description,
    p_starts_at: startsAt,
    p_min_players: v.value.minPlayers,
    p_points: v.value.points,
    p_ships: ships.map((s) => ({ ship_id: s.shipId, quantity: s.quantity })),
    p_roles: roles.map((r) => ({ name: r.name.trim(), quantity: r.quantity })),
  });

  if (error) {
    const known = UPDATE_ERRORS.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "Speichern fehlgeschlagen. Bitte erneut versuchen." };
  }

  refresh(eventId);
  const timeChanged = (data as { time_changed?: boolean } | null)?.time_changed === true;
  await eventEdited(supabase, eventId, timeChanged);
  return { error: null };
}
