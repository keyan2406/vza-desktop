// Schnittstelle für den PC-Helfer: nimmt Blaupausen-Namen entgegen und trägt sie für den Besitzer des Schlüssels ein.
// Frei von Next.js-Abhängigkeiten, damit sie sich testen lässt.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomChars } from "./auth-codes";

export const TOKEN_RE = /^vzh_[A-HJ-NP-Z2-9]{32}$/;
export const MAX_ITEMS = 2000;
export const MAX_BODY = 400_000;

export const newImportToken = () => `vzh_${randomChars(32)}`;
export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

const fail = (status: number, error: string, message: string) => json(status, { ok: false, error, message });

type Item = { name: string; at: string | null };

function cleanItems(raw: unknown): Item[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Item[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const at = typeof o.at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(o.at) ? o.at.slice(0, 40) : null;
    out.push({ name, at });
  }
  return out;
}

export async function handleImportRequest(request: Request, db: SupabaseClient | null): Promise<Response> {
  if (!db) return fail(503, "not_configured", "Die Seite ist dafür nicht eingerichtet (SUPABASE_SERVICE_ROLE_KEY fehlt).");

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // Offensichtlich falsche Schlüssel kommen gar nicht erst zur Datenbank
  if (!TOKEN_RE.test(token)) {
    return fail(401, "invalid_token", "Der Schlüssel ist ungültig. Lade den Helfer auf der Seite neu herunter.");
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return fail(413, "too_large", "Die Datenmenge ist zu groß.");
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "bad_data", "Die Daten waren nicht lesbar.");
  }
  if (text.length > MAX_BODY) return fail(413, "too_large", "Die Datenmenge ist zu groß.");

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return fail(400, "bad_data", "Die Daten waren nicht lesbar.");
  }
  const items = cleanItems((body as { items?: unknown } | null)?.items);
  if (!items) return fail(400, "bad_data", "Die Daten waren nicht lesbar.");
  if (items.length === 0) return json(200, { ok: true, received: 0, added: 0, already_owned: 0, new_in_catalog: 0, skipped: 0 });
  if (items.length > MAX_ITEMS) return fail(413, "too_many", `Zu viele Einträge auf einmal (höchstens ${MAX_ITEMS}).`);

  const { data, error } = await db.rpc("import_blueprints_for_token", { p_token_hash: hashToken(token), p_items: items });
  if (error || !data) return fail(502, "server_error", "Die Seite hatte ein Problem. Der Helfer versucht es gleich noch einmal.");

  const r = data as { status?: string; received?: number; added?: number; already_owned?: number; new_in_catalog?: number; skipped?: number };
  switch (r.status) {
    case "ok":
      return json(200, {
        ok: true,
        received: r.received ?? 0,
        added: r.added ?? 0,
        already_owned: r.already_owned ?? 0,
        new_in_catalog: r.new_in_catalog ?? 0,
        skipped: r.skipped ?? 0,
      });
    case "invalid_token":
      return fail(401, "invalid_token", "Der Schlüssel ist ungültig oder wurde ersetzt. Lade den Helfer auf der Seite neu herunter.");
    case "not_allowed":
      return fail(403, "not_allowed", "Dein Konto ist (noch) nicht freigegeben oder gesperrt.");
    case "too_many":
      return fail(413, "too_many", `Zu viele Einträge auf einmal (höchstens ${MAX_ITEMS}).`);
    default:
      return fail(400, "bad_data", "Die Daten waren nicht lesbar.");
  }
}
