"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { randomChars } from "../../../utils/auth-codes";
import { AUTH_DOMAIN_DEFAULT, toAuthEmail } from "../../../utils/auth-validate";
import { median, type SpeedResult } from "../../../utils/speed";
import { createAdminClient } from "../../../utils/supabase/admin";
import { createClient } from "../../../utils/supabase/server";

const time = async (fn: () => PromiseLike<unknown>) => {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
};

// Misst, wie schnell Server, Datenbank und Anmelde-Prüfung sind. Nur für Admins.
export async function measureSpeed(): Promise<{ error: string | null; result: SpeedResult | null }> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "admin") return { error: "Keine Berechtigung.", result: null };

  const db: number[] = [];
  for (let i = 0; i < 5; i++) {
    db.push(await time(() => supabase.from("level_thresholds").select("level").limit(1)));
  }
  const claimsFirstMs = await time(() => supabase.auth.getClaims());
  const claimsNextMs = await time(() => supabase.auth.getClaims());
  const getUserMs = await time(() => supabase.auth.getUser());

  return {
    error: null,
    result: {
      region: process.env.VERCEL_REGION ?? null,
      dbFirstMs: db[0],
      dbMedianMs: median(db.slice(1)),
      claimsFirstMs,
      claimsNextMs,
      getUserMs,
    },
  };
}

export type CheckStep = { ok: boolean; text: string };

// Probelauf der Anmeldung mit Benutzername: legt ein Testkonto an, meldet es an und räumt alles wieder weg.
// So siehst du vor der ersten Einladung, ob alles eingerichtet ist. Nur für Admins.
export async function testAccountSetup(): Promise<{ error: string | null; steps: CheckStep[] }> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("get_my_role");
  if (role !== "admin") return { error: "Keine Berechtigung.", steps: [] };

  const steps: CheckStep[] = [];
  const admin = createAdminClient();
  if (!admin) {
    return { error: null, steps: [{ ok: false, text: "Bei Vercel fehlt SUPABASE_SERVICE_ROLE_KEY. Ohne ihn geht die Anmeldung mit Benutzername nicht." }] };
  }
  steps.push({ ok: true, text: "Dienst-Schlüssel ist eingetragen." });
  if (!process.env.SITE_URL?.trim()) {
    steps.push({ ok: false, text: "SITE_URL fehlt bei Vercel. Ohne sie bekommen Passwort-Links keine vollständige Adresse." });
  } else steps.push({ ok: true, text: "SITE_URL ist eingetragen (für die Passwort-Links)." });

  const domain = process.env.AUTH_EMAIL_DOMAIN?.trim() || AUTH_DOMAIN_DEFAULT;
  const name = `test-${randomChars(8).toLowerCase()}`;
  const email = toAuthEmail(name, domain);
  const password = `${randomChars(12)}-${randomChars(12)}`;
  const code = `TEST-${randomChars(8)}`;
  let userId: string | null = null;
  let codeMade = false;

  try {
    const ins = await admin.from("invite_codes").insert({ code, max_uses: 1, note: "Probelauf, wird gelöscht" });
    if (ins.error) {
      steps.push({ ok: false, text: "Die Einladungstabelle fehlt oder ist nicht erreichbar. Wurde die SQL-Datei 26_konten ausgeführt?" });
      return { error: null, steps };
    }
    codeMade = true;

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Probelauf", invite_code: code },
    });
    if (created.error || !created.data?.user) {
      steps.push({
        ok: false,
        text: `Das Testkonto konnte nicht angelegt werden (${created.error?.message ?? "unbekannt"}). Wenn dort von der E-Mail-Adresse die Rede ist, trage bei Vercel AUTH_EMAIL_DOMAIN mit einer anderen Endung ein, zum Beispiel vza.example.`,
      });
      return { error: null, steps };
    }
    userId = created.data.user.id;
    steps.push({ ok: true, text: `Ein Konto ohne echte E-Mail-Adresse lässt sich anlegen (Endung @${domain}).` });

    const prof = await admin.from("profiles").select("id, approved").eq("id", userId).maybeSingle();
    steps.push(
      prof.data
        ? { ok: true, text: "Das Profil wird automatisch angelegt und wartet auf Freigabe." }
        : { ok: false, text: "Das Profil wurde nicht angelegt. Wurde die SQL-Datei 26_konten ausgeführt?" }
    );

    const plain = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await plain.auth.signInWithPassword({ email, password });
    steps.push(
      login.data?.session
        ? { ok: true, text: "Anmeldung mit Passwort funktioniert." }
        : { ok: false, text: `Die Anmeldung mit Passwort ging nicht (${login.error?.message ?? "unbekannt"}).` }
    );

    const bad = await plain.auth.signInWithPassword({ email, password: `${password}x` });
    steps.push(bad.data?.session ? { ok: false, text: "Ein falsches Passwort wurde akzeptiert. Das darf nicht sein." } : { ok: true, text: "Ein falsches Passwort wird abgelehnt." });
  } finally {
    let clean = true;
    if (userId) clean = !(await admin.auth.admin.deleteUser(userId)).error && clean;
    if (codeMade) clean = !(await admin.from("invite_codes").delete().eq("code", code)).error && clean;
    steps.push(clean ? { ok: true, text: "Das Testkonto und der Test-Code wurden wieder gelöscht." } : { ok: false, text: `Aufräumen hat nicht geklappt. Lösche das Konto ${name} und den Code ${code} von Hand.` });
  }
  return { error: null, steps };
}
