// Bewertung der Geschwindigkeits-Messung (Server-Region, Datenbank, Anmelde-Prüfung). Reine Logik, gut testbar.

export type SpeedResult = {
  region: string | null; // Vercel-Region der Funktion, z. B. "fra1" oder "iad1"
  dbFirstMs: number; // erste Abfrage (mit Verbindungsaufbau)
  dbMedianMs: number; // typische Abfrage
  claimsFirstMs: number; // Token prüfen, erster Aufruf
  claimsNextMs: number; // Token prüfen, danach
  getUserMs: number; // Nachfrage beim Auth-Server (zum Vergleich)
};

export type Verdict = { level: "ok" | "warn" | "bad"; title: string; text: string };

const REGION_NAME: Record<string, string> = {
  fra1: "Frankfurt",
  iad1: "Washington D.C. (USA)",
  sfo1: "San Francisco (USA)",
  cdg1: "Paris",
  lhr1: "London",
  dub1: "Dublin",
  arn1: "Stockholm",
  cle1: "Cleveland (USA)",
};

export const regionName = (r: string | null) => (r ? (REGION_NAME[r] ?? r) : "unbekannt (lokal)");

export function interpretSpeed(r: SpeedResult): Verdict[] {
  const out: Verdict[] = [];
  const where = regionName(r.region);

  if (r.dbMedianMs <= 25) {
    out.push({ level: "ok", title: "Datenbank ist schnell erreichbar", text: `Eine Abfrage dauert etwa ${r.dbMedianMs} ms. Die Seite läuft in ${where}, das passt zur Datenbank in Frankfurt.` });
  } else if (r.dbMedianMs <= 60) {
    out.push({ level: "warn", title: "Datenbank antwortet mittelmäßig", text: `Eine Abfrage dauert etwa ${r.dbMedianMs} ms. Die Seite läuft in ${where}. Frankfurt (fra1) wäre ideal, weil dort auch die Datenbank steht.` });
  } else {
    out.push({
      level: "bad",
      title: "Die Seite läuft zu weit von der Datenbank entfernt",
      text: `Eine einzige Abfrage dauert etwa ${r.dbMedianMs} ms (Server: ${where}). Jede Seite braucht mehrere Abfragen, das summiert sich. Stelle bei Vercel die Function Region auf Frankfurt (fra1).`,
    });
  }

  if (r.region && r.region !== "fra1" && r.dbMedianMs > 25) {
    out.push({ level: "warn", title: "Region prüfen", text: `Die Funktionen laufen in ${where} (${r.region}). Die Datenbank liegt in Frankfurt. Mit fra1 sind die Wege kurz.` });
  }

  if (r.claimsNextMs <= 15) {
    out.push({ level: "ok", title: "Anmelde-Prüfung läuft lokal", text: `Das Token wird in etwa ${r.claimsNextMs} ms ohne Netzwerk geprüft.` });
  } else if (r.claimsNextMs <= 40) {
    out.push({ level: "warn", title: "Anmelde-Prüfung etwas langsam", text: `Etwa ${r.claimsNextMs} ms. Das kann an einem kalten Start liegen. Miss noch einmal.` });
  } else {
    out.push({
      level: "bad",
      title: "Anmelde-Prüfung geht über das Netzwerk",
      text: `Etwa ${r.claimsNextMs} ms pro Prüfung (Nachfrage beim Auth-Server: ${r.getUserMs} ms). Aktiviere in Supabase unter Project Settings, JWT Keys die neuen Signing Keys, dann prüft die Seite lokal und spart bei jedem Aufruf diese Zeit.`,
    });
  }
  return out;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
