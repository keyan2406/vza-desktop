import { exportChunks, exportFilename } from "../../../utils/export-data";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

export const maxDuration = 60;

// Nur für Admins: Alle wichtigen Daten als JSON-Datei herunterladen (Datensicherung)
export async function GET() {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "admin") return new Response("Nur für Admins.", { status: 403, headers: { "Cache-Control": "no-store" } });

  const db = createAdminClient();
  if (!db) return new Response("SUPABASE_SERVICE_ROLE_KEY fehlt bei Vercel.", { status: 503, headers: { "Cache-Control": "no-store" } });

  const iterator = exportChunks(db)[Symbol.asyncIterator]();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
