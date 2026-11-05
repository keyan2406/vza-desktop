"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "../../../utils/supabase/server";
import { isCategory } from "../../../utils/blueprint-category";
import { enrichSome, type EnrichResult } from "../../../utils/item-enrich";

export type ImportItem = { name: string; ini: string | null; at: string | null };
export type ImportResult = {
  received: number;
  skipped: number;
  new_in_catalog: number;
  added: number;
  already_owned: number;
};

function refresh() {
  revalidatePath("/blueprints");
  revalidatePath("/blueprints/suche");
}

const SAFE = ["Nicht angemeldet", "Ungültige Daten", "Zu viele Einträge (maximal 2000)"];

// Die Datenbank-Funktion ergänzt nur und überschreibt nichts. Sie filtert außerdem
// Personennamen aus den Logs heraus und entfernt Doppelte.
async function addItems(
  items: ImportItem[],
  source: "import" | "manual"
): Promise<{ error: string | null; result: ImportResult | null }> {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "Keine Blaupausen zum Eintragen gefunden.", result: null };
  }
  if (items.length > 2000) {
    return { error: "Zu viele Einträge (maximal 2000 auf einmal).", result: null };
  }

  const clean = items.map((i) => ({
    name: String(i?.name ?? "").trim().slice(0, 120),
    ini: i?.ini ? String(i.ini).trim().slice(0, 150) : null,
    at: i?.at && /^\d{4}-\d{2}-\d{2}T/.test(String(i.at)) ? String(i.at) : null,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_my_blueprints", {
    p_items: clean,
    p_source: source,
  });

  if (error) {
    const known = SAFE.find((m) => error.message.includes(m));
    return { error: known ? `${known}.` : "Eintragen fehlgeschlagen. Bitte erneut versuchen.", result: null };
  }

  refresh();
  // Neue Blaupausen im Katalog: im Hintergrund ein paar Beschreibungen nachschlagen
  const result = data as ImportResult;
  if (result.new_in_catalog > 0) {
    after(async () => {
      try {
        await enrichSome(6, 15000);
        refresh();
      } catch {
        // Beschreibungen sind nur eine Zugabe
      }
    });
  }
  return { error: null, result };
}

export async function importBlueprints(items: ImportItem[]) {
  return addItems(items, "import");
}

export async function addBlueprintByName(name: string) {
  return addItems([{ name: String(name ?? ""), ini: null, at: null }], "manual");
}

export async function removeBlueprint(formData: FormData): Promise<void> {
  const id = Number(formData.get("blueprint_id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Die Datenbank-Regeln erlauben nur, die eigenen Einträge zu löschen.
  await supabase
    .from("player_blueprints")
    .delete()
    .eq("blueprint_id", id)
    .eq("user_id", user.id);
  refresh();
}

// Nur Officer und Admins (per Datenbank-Regeln): Namen korrigieren oder Einträge löschen.
export async function renameBlueprint(
  id: number,
  name: string
): Promise<{ error: string | null }> {
  const trimmed = String(name ?? "").trim();
  if (!Number.isInteger(id) || id <= 0) return { error: "Ungültige Blaupause." };
  if (trimmed.length < 1 || trimmed.length > 120) {
    return { error: "Der Name braucht 1 bis 120 Zeichen." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blueprints")
    .update({ name: trimmed })
    .eq("id", id)
    .select("id");

  if (error) {
    return {
      error: error.code === "23505" ? "Diesen Namen gibt es schon." : "Speichern fehlgeschlagen.",
    };
  }
  if (!data || data.length === 0) return { error: "Keine Berechtigung." };

  refresh();
  return { error: null };
}

export async function deleteBlueprint(formData: FormData): Promise<void> {
  const id = Number(formData.get("blueprint_id"));
  if (!Number.isInteger(id) || id <= 0) return;
  const supabase = await createClient();
  await supabase.from("blueprints").delete().eq("id", id);
  refresh();
}

// Nur Officer und Admins (per Datenbank-Regeln): Kategorie festlegen oder wieder automatisch erkennen lassen.
export async function setBlueprintCategory(
  id: number,
  category: string | null
): Promise<{ error: string | null }> {
  if (!Number.isInteger(id) || id <= 0) return { error: "Ungültige Blaupause." };
  if (category !== null && !isCategory(category)) return { error: "Ungültige Kategorie." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blueprints")
    .update({ category })
    .eq("id", id)
    .select("id");
  if (error) return { error: "Speichern fehlgeschlagen." };
  if (!data || data.length === 0) return { error: "Keine Berechtigung." };

  refresh();
  return { error: null };
}

// Nur Officer und Admins: Beschreibungen (Klasse, Grade, Größe, Typ) für die nächsten Blaupausen nachschlagen.
export async function enrichBlueprints(): Promise<{ error: string | null; result: EnrichResult | null }> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "officer" && role !== "admin") return { error: "Keine Berechtigung.", result: null };

  // Eine Runde dauert bis etwa 25 Sekunden; die Oberfläche startet so lange neue Runden, bis alles durch ist
  const result = await enrichSome(30, 25000);
  if (!result.configured) {
    return { error: "Dafür fehlt bei Vercel der Eintrag SUPABASE_SERVICE_ROLE_KEY.", result: null };
  }
  refresh();
  return { error: null, result };
}
