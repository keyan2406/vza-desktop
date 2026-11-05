"use server";

import { revalidatePath, updateTag } from "next/cache";
import { sourcesOf, type Source } from "../../../utils/catalog";
import { syncCatalog, type SyncResult } from "../../../utils/catalog-sync";
import { cleanDetails, lookupItem, paced, type Details } from "../../../utils/item-info";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEEK_MS = 7 * 24 * 3600 * 1000;

async function staff() {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  return { supabase, ok: role === "officer" || role === "admin" };
}

// Nur Officer und Admins: den Katalog mit der Wiki-Datenbank abgleichen (dauert etwa 10 bis 30 Sekunden)
export async function syncCatalogAction(): Promise<{ error: string | null; result: SyncResult | null }> {
  const { ok } = await staff();
  if (!ok) return { error: "Keine Berechtigung.", result: null };
  const db = createAdminClient();
  if (!db) return { error: "Dafür fehlt bei Vercel der Eintrag SUPABASE_SERVICE_ROLE_KEY.", result: null };

  const result = await syncCatalog({ fetchImpl: paced(fetch as never, 1200) as never, db });
  if (result.ok) {
    updateTag("catalog");
    revalidatePath("/blueprints");
  }
  return { error: null, result };
}

export type CatalogDetail = {
  error: string | null;
  sources: Source[];
  detail: Details | null;
  owners: string[];
};

// Wird beim Aufklappen einer Zeile geladen: Missionen, Besitzer und (einmalig nachgeschlagen) Klasse und Hersteller
export async function catalogDetail(uuid: string): Promise<CatalogDetail> {
  const empty: CatalogDetail = { error: null, sources: [], detail: null, owners: [] };
  if (!UUID.test(String(uuid))) return { ...empty, error: "Ungültige Blaupause." };
  const supabase = await createClient();

  const { data } = await supabase
    .from("catalog_blueprints")
    .select("name, name_norm, class_name, sources, detail, detail_checked_at")
    .eq("uuid", uuid)
    .maybeSingle();
  if (!data) return { ...empty, error: "Diese Blaupause gibt es nicht mehr." };
  const row = data as { name: string; name_norm: string; class_name: string | null; sources: unknown; detail: unknown; detail_checked_at: string | null };

  let detail = cleanDetails(row.detail);
  const stale = !row.detail_checked_at || Date.now() - Date.parse(row.detail_checked_at) > WEEK_MS;
  if (!detail && stale && row.class_name) {
    const admin = createAdminClient();
    if (admin) {
      const r = await lookupItem(paced(fetch as never, 600) as never, { name: row.name, ini: `item_Name_${row.class_name}` });
      if (r.status === "found" && r.details) detail = r.details;
      if (r.status !== "error") {
        await admin
          .from("catalog_blueprints")
          .update({ ...(detail ? { detail } : {}), detail_checked_at: new Date().toISOString() })
          .eq("uuid", uuid);
      }
    }
  }

  const { data: owned } = await supabase
    .from("blueprints")
    .select("player_blueprints(profiles(username))")
    .eq("name_norm", row.name_norm)
    .maybeSingle();
  const owners = (
    ((owned as { player_blueprints?: { profiles: { username: string } | { username: string }[] | null }[] } | null)?.player_blueprints ?? [])
      .map((p) => (Array.isArray(p.profiles) ? p.profiles[0]?.username : p.profiles?.username))
      .filter((n): n is string => !!n)
  )
    .sort((a, b) => a.localeCompare(b, "de"))
    .slice(0, 40);

  return { error: null, sources: sourcesOf(row.sources), detail, owners };
}

// Einkaufsliste für eine Blaupause aus dem Katalog: legt bei Bedarf den Org-Eintrag an
export async function catalogAddToShopping(uuid: string, qty: number): Promise<{ error: string | null }> {
  if (!UUID.test(String(uuid))) return { error: "Ungültige Blaupause." };
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return { error: "Die Menge muss zwischen 1 und 99 liegen." };
  const supabase = await createClient();
  const {
    data: { claims },
  } = (await supabase.auth.getClaims()) as { data: { claims?: { sub?: string } } };
  if (!claims?.sub) return { error: "Nicht angemeldet." };

  const { data: id, error } = await supabase.rpc("ensure_org_blueprint", { p_catalog_uuid: uuid });
  if (error || typeof id !== "number") return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  const res = await supabase
    .from("shopping_list")
    .upsert({ user_id: claims.sub, blueprint_id: id, qty }, { onConflict: "user_id,blueprint_id" });
  if (res.error) return { error: "Das hat nicht geklappt. Bitte versuche es noch einmal." };
  revalidatePath("/blueprints");
  return { error: null };
}
