import { revalidatePath } from "next/cache";
import { handleImportRequest } from "../../../../utils/import-api";
import { createAdminClient } from "../../../../utils/supabase/admin";

export const maxDuration = 30;

// Hier trägt der PC-Helfer Blaupausen ein. Geschützt durch den persönlichen Schlüssel (kein Anmelde-Cookie nötig).
export async function POST(request: Request) {
  const res = await handleImportRequest(request, createAdminClient());
  if (res.status === 200) {
    try {
      const body = (await res.clone().json()) as { added?: number };
      if ((body.added ?? 0) > 0) revalidatePath("/blueprints");
    } catch {
      // Die Anzeige aktualisiert sich dann beim nächsten Laden
    }
  }
  return res;
}
