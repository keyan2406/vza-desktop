// Voraussetzungen für das Live-Update der Blaupausen. Reine Logik, damit sie sich prüfen lässt.

export type Perm = "granted" | "prompt" | "denied" | "unknown";

export type LiveEnv = {
  supported: boolean | null; // kann der Browser einen Ordner dauerhaft lesen? null = noch nicht geprüft
  connected: boolean; // Spielordner verbunden
  permission: Perm; // Lesezugriff erlaubt?
  live: boolean; // Überwachung läuft
};

export type Check = { id: "browser" | "folder" | "permission" | "running"; label: string; state: "ok" | "todo" | "fail" | "unknown"; hint?: string };

export function liveChecks(env: LiveEnv): Check[] {
  const browser: Check =
    env.supported === null
      ? { id: "browser", label: "Browser prüfen", state: "unknown" }
      : env.supported
        ? { id: "browser", label: "Browser kann den Spielordner lesen (Chrome oder Edge am Computer)", state: "ok" }
        : {
            id: "browser",
            label: "Browser kann den Spielordner nicht dauerhaft lesen",
            state: "fail",
            hint: "Firefox, Safari und Handys können das nicht. Nutze den PC-Helfer (Windows), „Einmal auslesen“ oder die Launcher-Datei.",
          };

  const folder: Check = !env.supported
    ? { id: "folder", label: "Spielordner verbunden", state: "todo" }
    : env.connected
      ? { id: "folder", label: "Spielordner verbunden", state: "ok" }
      : { id: "folder", label: "Spielordner verbunden", state: "todo", hint: "Wähle einmal den Ordner StarCitizen\\LIVE." };

  let permission: Check;
  if (!env.supported || !env.connected) permission = { id: "permission", label: "Lesezugriff erlaubt", state: "todo" };
  else if (env.permission === "granted") permission = { id: "permission", label: "Lesezugriff erlaubt", state: "ok" };
  else if (env.permission === "denied")
    permission = {
      id: "permission",
      label: "Lesezugriff erlaubt",
      state: "fail",
      hint: "Der Browser hat den Zugriff abgelehnt. Erlaube ihn in den Seiteneinstellungen (Schloss neben der Adresse) oder wähle den Ordner neu.",
    };
  else
    permission = {
      id: "permission",
      label: "Lesezugriff erlaubt",
      state: "todo",
      hint: "Nach einem Browser-Neustart fragt Chrome einmal erneut. Ein Klick auf „Live-Überwachung starten“ genügt.",
    };

  const running: Check = env.live
    ? { id: "running", label: "Überwachung läuft", state: "ok" }
    : { id: "running", label: "Überwachung läuft", state: "todo" };

  return [browser, folder, permission, running];
}

// Alles bereit, um die Überwachung zu starten (ohne dass sie schon läuft)?
export function liveReady(env: LiveEnv): boolean {
  return env.supported === true && env.connected && env.permission !== "denied";
}
