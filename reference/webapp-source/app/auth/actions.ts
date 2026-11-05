"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "../../utils/auth";
import { hashCode, newLinkCode } from "../../utils/auth-codes";
import { notifyIfNewRequest } from "../../utils/auth-notify";
import {
  AUTH_DOMAIN_DEFAULT,
  authErrorText,
  normalizeInviteCode,
  normalizeResetCode,
  toAuthEmail,
  validateLoginName,
  validatePassword,
} from "../../utils/auth-validate";
import { createAdminClient } from "../../utils/supabase/admin";
import { createClient } from "../../utils/supabase/server";

// values: Eingaben, die nach einem Fehler im Formular stehen bleiben (nie Passwörter)
export type FormState = { error?: string; done?: "registered" | "saved"; values?: Record<string, string> };

const KEEP_LIMIT = 200;
function withValues(fd: FormData, names: string[], state: FormState): FormState {
  if (!state.error) return state;
  const values: Record<string, string> = {};
  for (const n of names) {
    const v = fd.get(n);
    if (typeof v === "string") values[n] = v.slice(0, KEEP_LIMIT);
  }
  return { ...state, values };
}

const get = (fd: FormData, key: string) => fd.get(key);
const authDomain = () => process.env.AUTH_EMAIL_DOMAIN?.trim() || AUTH_DOMAIN_DEFAULT;
const SERVICE_MISSING = "Dafür fehlt bei Vercel der Eintrag SUPABASE_SERVICE_ROLE_KEY. Bitte melde das einem Admin.";
const NAME_TAKEN = "Dieser Benutzername ist schon vergeben. Wähle einen anderen.";
const INVITE_BAD = "Dieser Einladungscode ist ungültig, abgelaufen oder aufgebraucht.";
const LINK_BAD = "Der Link ist ungültig oder abgelaufen. Schreibe in Discord /passwort, um einen neuen zu bekommen.";
const GENERIC = "Das hat nicht geklappt. Bitte versuche es noch einmal.";

function twoPasswords(fd: FormData): { ok: true; value: string } | { ok: false; error: string } {
  const password = validatePassword(get(fd, "password"));
  if (!password.ok) return password;
  if (String(get(fd, "password2") ?? "") !== password.value) return { ok: false, error: "Die beiden Passwörter sind nicht gleich." };
  return password;
}

// ---------- Anmelden ----------

async function _signInWithUsername(_prev: FormState, fd: FormData): Promise<FormState> {
  const typed = String(get(fd, "username") ?? "").trim();
  const password = String(get(fd, "password") ?? "");
  if (!typed) return { error: "Bitte gib deinen Benutzernamen ein." };
  if (!password) return { error: "Bitte gib dein Passwort ein." };

  const admin = createAdminClient();
  if (!admin) return { error: SERVICE_MISSING };

  // Bewusst allgemein: nicht verraten, ob es den Benutzernamen gibt
  const wrong = { error: "Benutzername oder Passwort stimmt nicht." };
  const name = validateLoginName(typed);
  if (!name.ok) return wrong;
  const key = name.value;

  const { data: allowed } = await admin.rpc("login_throttle_check", { p_key: key });
  if (allowed === false) return { error: "Zu viele falsche Versuche. Warte etwa 10 Minuten oder melde dich mit Discord an." };

  const { data: prof } = await admin.from("profiles").select("id").eq("login_name", key).maybeSingle();
  let email: string | null = null;
  if (prof?.id) {
    const res = await admin.auth.admin.getUserById(prof.id as string);
    email = res.data?.user?.email ?? null;
  }
  if (!email) {
    await admin.rpc("login_throttle_fail", { p_key: key });
    return wrong;
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "over_request_rate_limit") return { error: authErrorText("over_request_rate_limit") };
    await admin.rpc("login_throttle_fail", { p_key: key });
    return wrong;
  }
  await admin.rpc("login_throttle_reset", { p_key: key });
  await notifyIfNewRequest(supabase);
  redirect("/dashboard");
}

// ---------- Registrieren (nur mit Einladungscode, ohne E-Mail) ----------

async function _registerWithUsername(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = normalizeInviteCode(get(fd, "code"));
  const name = validateLoginName(get(fd, "username"));
  const password = twoPasswords(fd);
  if (!code.ok) return { error: code.error };
  if (!name.ok) return { error: name.error };
  if (!password.ok) return { error: password.error };

  const admin = createAdminClient();
  if (!admin) return { error: SERVICE_MISSING };

  const { data: valid } = await admin.rpc("check_invite_code", { p_code: code.value });
  if (valid !== true) return { error: INVITE_BAD };

  const { data: taken } = await admin.from("profiles").select("id").eq("login_name", name.value).maybeSingle();
  if (taken) return { error: NAME_TAKEN };

  // Das Konto wird direkt angelegt und gilt als bestätigt. Es wird keine E-Mail verschickt.
  const email = toAuthEmail(name.value, authDomain());
  const created = await admin.auth.admin.createUser({
    email,
    password: password.value,
    email_confirm: true,
    user_metadata: { full_name: name.display ?? name.value, invite_code: code.value },
  });
  if (created.error || !created.data?.user) {
    const msg = created.error?.message ?? "";
    if (/already|registered|exists/i.test(msg)) return { error: NAME_TAKEN };
    if (/Einladungscode|Database error/i.test(msg)) return { error: INVITE_BAD };
    return { error: GENERIC };
  }
  const userId = created.data.user.id;

  const upd = await admin.from("profiles").update({ login_name: name.value }).eq("id", userId);
  if (upd.error) {
    await admin.auth.admin.deleteUser(userId);
    return { error: NAME_TAKEN };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: password.value });
  if (error) return { done: "registered" };
  await notifyIfNewRequest(supabase);
  redirect("/dashboard");
}

// ---------- Passwort ändern oder Benutzername und Passwort festlegen (im Profil) ----------

async function _saveCredentials(_prev: FormState, fd: FormData): Promise<FormState> {
  const { user } = await getSessionUser();
  if (!user) return { error: authErrorText("session_not_found") };
  const password = twoPasswords(fd);
  if (!password.ok) return { error: password.error };

  const admin = createAdminClient();
  if (!admin) return { error: SERVICE_MISSING };

  const { data: prof } = await admin.from("profiles").select("login_name").eq("id", user.id).maybeSingle();
  if (!prof) return { error: GENERIC };

  // Hat das Konto noch keinen Benutzernamen (zum Beispiel Anmeldung über Discord), wird er jetzt festgelegt
  let newLogin: string | null = null;
  if (!prof.login_name) {
    const name = validateLoginName(get(fd, "username"));
    if (!name.ok) return { error: name.error };
    const { data: taken } = await admin.from("profiles").select("id").eq("login_name", name.value).maybeSingle();
    if (taken && taken.id !== user.id) return { error: NAME_TAKEN };
    newLogin = name.value;
    const res = await admin.from("profiles").update({ login_name: newLogin }).eq("id", user.id);
    if (res.error) return { error: NAME_TAKEN };
  }
  const login = newLogin ?? (prof.login_name as string);

  const cur = await admin.auth.admin.getUserById(user.id);
  const hasEmail = !!cur.data?.user?.email;
  const upd = await admin.auth.admin.updateUserById(user.id, {
    password: password.value,
    email_confirm: true,
    ...(hasEmail ? {} : { email: toAuthEmail(login, authDomain()) }),
  });
  if (upd.error) {
    if (newLogin) await admin.from("profiles").update({ login_name: null }).eq("id", user.id);
    return { error: authErrorText(upd.error.code, upd.error.message) };
  }
  return { done: "saved" };
}

// ---------- Neues Passwort über den Link aus Discord (oder von einem Admin) ----------

async function _resetPasswordWithCode(_prev: FormState, fd: FormData): Promise<FormState> {
  const code = normalizeResetCode(get(fd, "code"));
  if (!code.ok) return { error: code.error };
  const password = twoPasswords(fd);
  if (!password.ok) return { error: password.error };

  const admin = createAdminClient();
  if (!admin) return { error: SERVICE_MISSING };
  const hash = hashCode(code.value);

  const peek = await admin.rpc("peek_password_reset", { p_hash: hash });
  const info = (peek.data ?? {}) as { status?: string; login_name?: string | null };
  if (peek.error || info.status !== "ok") return { error: LINK_BAD };

  // Hat das Konto noch keinen Benutzernamen, wird er hier festgelegt (vor dem Einlösen prüfen, damit der Link nicht verfällt)
  let newLogin: string | null = null;
  if (!info.login_name) {
    const name = validateLoginName(get(fd, "username"));
    if (!name.ok) return { error: name.error };
    const { data: taken } = await admin.from("profiles").select("id").eq("login_name", name.value).maybeSingle();
    if (taken) return { error: NAME_TAKEN };
    newLogin = name.value;
  }

  const consumed = await admin.rpc("consume_password_reset", { p_hash: hash });
  const c = (consumed.data ?? {}) as { status?: string; user_id?: string };
  if (consumed.error || c.status !== "ok" || !c.user_id) return { error: LINK_BAD };
  const userId = c.user_id;
  const retry = " Schreibe in Discord /passwort für einen neuen Link.";

  if (newLogin) {
    const res = await admin.from("profiles").update({ login_name: newLogin }).eq("id", userId);
    if (res.error) return { error: NAME_TAKEN + retry };
  }
  const login = newLogin ?? (info.login_name as string);

  const cur = await admin.auth.admin.getUserById(userId);
  const hasEmail = !!cur.data?.user?.email;
  const upd = await admin.auth.admin.updateUserById(userId, {
    password: password.value,
    email_confirm: true,
    ...(hasEmail ? {} : { email: toAuthEmail(login, authDomain()) }),
  });
  if (upd.error) return { error: GENERIC + retry };

  await admin.rpc("login_throttle_reset", { p_key: login });
  redirect("/?info=passwort");
}

// ---------- Discord verknüpfen ----------

export async function startDiscordLink(): Promise<{ error: string | null; code: string | null; minutes: number }> {
  const { supabase, user } = await getSessionUser();
  if (!user) return { error: authErrorText("session_not_found"), code: null, minutes: 0 };

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newLinkCode();
    const { data, error } = await supabase.rpc("set_discord_link_code", { p_code: code });
    if (error || !data) return { error: GENERIC, code: null, minutes: 0 };
    const status = (data as { status?: string }).status;
    if (status === "ok") return { error: null, code, minutes: 15 };
    if (status === "already_linked") return { error: "Dein Konto ist schon mit Discord verknüpft.", code: null, minutes: 0 };
    if (status !== "retry") return { error: GENERIC, code: null, minutes: 0 };
  }
  return { error: GENERIC, code: null, minutes: 0 };
}

// Server-Aktionen müssen einzeln als async-Funktionen exportiert werden
export async function signInWithUsername(prev: FormState, fd: FormData): Promise<FormState> {
  return withValues(fd, ["username"], await _signInWithUsername(prev, fd));
}
export async function registerWithUsername(prev: FormState, fd: FormData): Promise<FormState> {
  return withValues(fd, ["code", "username"], await _registerWithUsername(prev, fd));
}
export async function saveCredentials(prev: FormState, fd: FormData): Promise<FormState> {
  return withValues(fd, ["username"], await _saveCredentials(prev, fd));
}
export async function resetPasswordWithCode(prev: FormState, fd: FormData): Promise<FormState> {
  return withValues(fd, ["username"], await _resetPasswordWithCode(prev, fd));
}
