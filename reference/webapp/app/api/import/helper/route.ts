import { getSessionUser } from "../../../../utils/auth";
import { buildHelperScript, HELPER_FILENAME } from "../../../../utils/helper-script";
import { hashToken, newImportToken } from "../../../../utils/import-api";

export const maxDuration = 15;

const text = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// Erzeugt für die angemeldete Person einen neuen persönlichen Schlüssel und liefert den PC-Helfer als Datei.
// Ein früherer Schlüssel (und damit ein früher heruntergeladener Helfer) wird dabei ungültig.
export async function POST(request: Request) {
  const url = new URL(request.url);
  // Nur von der eigenen Seite aus (schützt davor, dass eine fremde Seite einen neuen Schlüssel auslöst)
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return text(403, "Nicht erlaubt.");

  const { supabase, user } = await getSessionUser();
  if (!user) return text(401, "Bitte melde dich an.");

  const site = (process.env.SITE_URL?.trim() || url.origin).replace(/\/+$/, "");
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = newImportToken();
    const { data, error } = await supabase.rpc("set_import_token", { p_hash: hashToken(token) });
    const status = (data as { status?: string } | null)?.status;
    if (error || !status) return text(500, "Das hat nicht geklappt. Wurde die SQL-Datei 28 ausgeführt?");
    if (status === "retry") continue;
    if (status === "not_allowed") return text(403, "Dein Konto ist noch nicht freigegeben.");
    if (status !== "ok") return text(500, "Das hat nicht geklappt.");

    let script: string;
    try {
      script = buildHelperScript({ site, token });
    } catch {
      return text(500, "Die Adresse der Seite ist ungültig (SITE_URL bei Vercel prüfen).");
    }
    return new Response(script, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${HELPER_FILENAME}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return text(500, "Das hat nicht geklappt. Bitte versuche es noch einmal.");
}
