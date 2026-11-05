"use server";

import { revalidatePath } from "next/cache";
import { craftChanged } from "../../../utils/discord-publish";
import { retryUnknownRecipes } from "../../../utils/item-enrich";
import { diagnoseItem, paced } from "../../../utils/item-info";
import { createClient } from "../../../utils/supabase/server";

type Result = { error: string | null; message?: string };

const refresh = () => revalidatePath("/blueprints");
const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

async function currentUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

// ---------- Einkaufsliste (jede Person nur ihre eigene, durch die Datenbank-Regeln gesichert) ----------

export async function setShoppingQty(blueprintId: number, qty: number): Promise<Result> {
  if (!isInt(blueprintId, 1, Number.MAX_SAFE_INTEGER) || !isInt(qty, 1, 99)) {
    return { error: "Die Menge muss zwischen 1 und 99 liegen." };
  }
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "Nicht angemeldet." };
  const { error } = await supabase
    .from("shopping_list")
    .upsert({ user_id: userId, blueprint_id: blueprintId, qty }, { onConflict: "user_id,blueprint_id" });
  if (error) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  refresh();
  return { error: null };
}

export async function removeShopping(blueprintId: number): Promise<Result> {
  if (!isInt(blueprintId, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Blaupause." };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "Nicht angemeldet." };
  const { error } = await supabase.from("shopping_list").delete().eq("user_id", userId).eq("blueprint_id", blueprintId);
  if (error) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  refresh();
  return { error: null };
}

export async function clearShopping(): Promise<Result> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { error: "Nicht angemeldet." };
  const { error } = await supabase.from("shopping_list").delete().eq("user_id", userId);
  if (error) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  refresh();
  return { error: null };
}

// ---------- Herstellungs-Anfragen ----------

const REQUEST_ERRORS: Record<string, string> = {
  not_member: "Dein Konto ist noch nicht freigegeben.",
  bad_qty: "Die Menge muss zwischen 1 und 99 liegen.",
  no_blueprint: "Diese Blaupause gibt es nicht mehr.",
  own: "Du besitzt diese Blaupause schon selbst.",
  exists: "Für diese Blaupause hast du schon eine offene Anfrage.",
  too_many: "Du hast schon 5 offene Anfragen. Schließe oder brich zuerst eine ab.",
  no_owners: "Zurzeit besitzt niemand in der Org diese Blaupause.",
};

export async function createCraftRequest(blueprintId: number, qty: number, note: string): Promise<Result> {
  if (!isInt(blueprintId, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Blaupause." };
  if (!isInt(qty, 1, 99)) return { error: "Die Menge muss zwischen 1 und 99 liegen." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_craft_request", {
    p_blueprint_id: blueprintId,
    p_qty: qty,
    p_note: String(note ?? "").slice(0, 200),
  });
  if (error || !data) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  const res = data as { status?: string; id?: number; owners?: { discord_id: string | null }[] };
  if (res.status !== "ok") return { error: REQUEST_ERRORS[res.status ?? ""] ?? "Das hat nicht geklappt." };

  const owners = res.owners ?? [];
  craftChanged(Number(res.id), "created", owners);
  refresh();
  const n = owners.length;
  return { error: null, message: `Anfrage gesendet. ${n} ${n === 1 ? "Besitzer wird" : "Besitzer werden"} in Discord benachrichtigt.` };
}

const ACTION_ERRORS: Record<string, string> = {
  not_member: "Dein Konto ist noch nicht freigegeben.",
  not_found: "Diese Anfrage gibt es nicht mehr.",
  closed: "Diese Anfrage ist schon übernommen oder abgeschlossen.",
  not_owner: "Nur Mitglieder mit dieser Blaupause können die Anfrage übernehmen.",
  own_request: "Das ist deine eigene Anfrage.",
  forbidden: "Das darfst du bei dieser Anfrage nicht.",
};

export async function takeCraftRequest(id: number): Promise<Result> {
  if (!isInt(id, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Anfrage." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("take_craft_request", { p_id: id });
  if (error || !data) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  const res = data as { status?: string };
  if (res.status !== "ok") return { error: ACTION_ERRORS[res.status ?? ""] ?? "Das hat nicht geklappt." };
  craftChanged(id, "updated");
  refresh();
  return { error: null };
}

export async function closeCraftRequest(id: number, action: "done" | "cancel" | "release"): Promise<Result> {
  if (!isInt(id, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Anfrage." };
  if (action !== "done" && action !== "cancel" && action !== "release") return { error: "Ungültige Aktion." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_craft_request", { p_id: id, p_action: action });
  if (error || !data) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  const res = data as { status?: string };
  if (res.status !== "ok") return { error: ACTION_ERRORS[res.status ?? ""] ?? "Das hat nicht geklappt." };
  craftChanged(id, "updated");
  refresh();
  return { error: null };
}

// ---------- Nur Officer und Admins ----------

async function requireStaff() {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  return { supabase, ok: role === "officer" || role === "admin" };
}

// Zeigt Schritt für Schritt, was die Wiki-Datenbank zu einer Blaupause antwortet
export async function diagnoseBlueprint(id: number): Promise<{ error: string | null; lines: string[] }> {
  if (!isInt(id, 1, Number.MAX_SAFE_INTEGER)) return { error: "Ungültige Blaupause.", lines: [] };
  const { supabase, ok } = await requireStaff();
  if (!ok) return { error: "Keine Berechtigung.", lines: [] };
  const { data } = await supabase.from("blueprints").select("name, ini_key").eq("id", id).maybeSingle();
  if (!data) return { error: "Blaupause nicht gefunden.", lines: [] };
  const lines = await diagnoseItem(paced(fetch as never, 1200) as never, { name: data.name, ini: data.ini_key });
  return { error: null, lines };
}

export async function retryRecipes(): Promise<{ error: string | null; count: number }> {
  const { ok } = await requireStaff();
  if (!ok) return { error: "Keine Berechtigung.", count: 0 };
  const count = await retryUnknownRecipes();
  refresh();
  return { error: null, count };
}
