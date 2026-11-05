# VZA Desktop – Projektregeln für Claude Code

Dieses Projekt ist ein **eigenständiges Windows-Programm (.exe)** für die Star-Citizen-Org **Clan Vizsla (VZA)**. Es soll **alle Funktionen der bestehenden WebApp „VZA Org-Manager“ 1:1 enthalten (plus Zusatzfunktionen)** und **ohne die Webseite funktionieren**. Nur für Mitglieder der Org, **kostenlos** (keine kostenpflichtigen Dienste oder Zertifikate).

Die gemeinsamen Daten der Org liegen weiter in der vorhandenen **Supabase-Datenbank** (gleiche Konten, gleiche Daten). Wegfallen soll nur die Webseite bei Vercel. Die Server-Teile der WebApp (Discord-Bot, Zeitplan, Anmeldung per Benutzername, Katalog-Abgleich) bekommen einen neuen Platz als **Supabase Edge Functions**. Zielbild: `docs/10-architektur-autonom.md`.

## Wer ich bin und wie du mit mir arbeitest
- Ich heiße Keyan, bin Admin der Org und **kein Programmierer**. Ich arbeite unter **Windows** (Eingabeaufforderung `cmd`, Explorer, Notepad).
- **Antworte immer auf Deutsch**, kurz und praktisch. Erkläre Schritte so, dass ich sie ohne Vorwissen nachmachen kann (genaue Befehle, wo ich klicke).
- **Frage vor größeren Entscheidungen** (Technik, neue Abhängigkeiten, Umfang, alles mit Discord oder der Datenbank). Kleines entscheide selbst und schreibe es in `docs/ENTSCHEIDUNGEN.md`.
- Nach jedem Abschnitt: Tests laufen lassen, Ergebnis nennen, in höchstens 5 Schritten erklären, wie ich es ausprobiere, dann auf meine Rückmeldung warten.
- Sei ehrlich über Unsicheres und Ungetestetes. Behaupte nie, etwas funktioniere, wenn du es nicht ausgeführt hast. Nenne offen, was du nicht testen konntest (echtes Spiel, echte Windows-Warnung, echter Discord-Server).

## Harte Regeln (nie brechen)
1. **Die WebApp und ihre Datenbank bleiben unangetastet und produktiv**, bis ich ausdrücklich die Umstellung freigebe (Ablauf: `docs/10-…`, Abschnitt „Umstellung“). Der Ordner `reference/webapp-source` ist eine **schreibgeschützte Kopie zum Nachschlagen**; **nie** darin ändern, nie das Original-Repository der WebApp anfassen.
2. **Datenbank nur zusätzlich ändern:** neue SQL-Dateien ab Nummer **31**, **mehrfach ausführbar**, mit Test (angemeldet / nicht angemeldet / fremde Daten). **Ich führe SQL selbst** im Supabase-SQL-Editor aus (du lieferst die Datei und eine Schritt-für-Schritt-Anleitung). Bestehende Tabellen, Funktionen und Regeln ändern ihr Verhalten nicht. Die laufende WebApp muss danach unverändert funktionieren.
3. **Dienst-Schlüssel (`service_role`), Bot-Schlüssel und andere Geheimnisse gehören nie ins Programm und nie ins Repository.** Das Programm kennt nur die öffentliche Supabase-Adresse und den öffentlichen Schlüssel (`publishable key`). Geheimnisse liegen nur als **Supabase-Secrets** bei den Edge Functions. Sitzungen im Programm mit Electron `safeStorage` verschlüsseln.
4. **Discord nur mit Test-Bot und Test-Server entwickeln.** Nie am echten Server oder mit dem echten Bot ausprobieren, bevor ich die Umstellung freigebe. Beim Umstellen immer nur **eine** Seite aktiv (sonst doppelte Meldungen).
5. **Star Citizen wird nur gelesen:** ausschließlich `Game.log` und `logbackups\*.log`, schreibgeschützt. **Niemals** Speicher lesen, Prozesse beeinflussen, ins Spiel einklinken, Eingaben automatisieren (Easy Anti-Cheat, Nutzungsbedingungen).
6. **Nur diese Org:** Das Programm spricht nur mit dem konfigurierten Supabase-Projekt und Discord, sammelt keine Nutzerdaten.
7. Electron-Sicherheit: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, kleine feste `contextBridge`-Schnittstelle, strenge Liste erlaubter Adressen, nur HTTPS, Content-Security-Policy.

## Gleichheit zur WebApp ist die Hauptaufgabe
- `docs/09-funktionsliste-paritaet.md` ist die Checkliste (61 Aktionen, alle Seiten, alle Server-Teile). Führe `docs/PARITAET.md` mit Status je Zeile. **Gleichheit wird geprüft, nicht angenommen** (Test oder benannte manuelle Prüfung durch mich).
- Verhalten, Zahlenwerte (Level, Punkte), Texte und Meldungen **wie in der WebApp**. Den Quelltext in `reference/webapp-source` lesen (Seiten, Aktionen, `utils/`, `tests/`), die Datenbank in `reference/db/schema-public.sql`.
- Reine Logik nicht neu erfinden: Log-Erkennung (`reference/spiel-logs/log-scan.ts`), Katalog-Regeln, Discord-Texte, Anmelde-Regeln, Automatische Absage usw. **übernehmen** (in `packages/core` oder die Edge Functions) und die zugehörigen Tests mitnehmen (ca. 600 Prüfungen, `reference/webapp-source/tests`).
- Zuerst Gleichheit, dann Zusatzfunktionen (`docs/04`, Phase 7).

## Technik (Vorschlag, bitte bestätigen oder begründet ändern)
- **Electron + TypeScript**, Oberfläche **React + Vite + Tailwind v4** im HUD-Design (`docs/08-design.md`), Daten über `@supabase/supabase-js`, Server-Teile als **Supabase Edge Functions** (Deno/TypeScript), Installer **electron-builder (NSIS)**, Updates über **GitHub Releases** (`electron-updater`), Bau mit **GitHub Actions**.
- Monorepo: `apps/desktop`, `packages/core`, `supabase/functions`, `supabase/migrations`.
- Windows 10/11, 64 Bit. Oberfläche Deutsch, du-Form. Kommentare im Code Deutsch, Bezeichner Englisch.
- Begründung Electron: Node ist bei mir vorhanden, keine weitere Werkzeugkette nötig. Nachteil: Installer ca. 80–120 MB. Alternative Tauri (ca. 10 MB, braucht Rust und C++-Buildtools). Ich entscheide.

## Qualität
- TypeScript streng, ESLint ohne Fehler, `npm test` grün, bevor du etwas als fertig meldest. Tests geben je Prüfung „OK/FEHLER“ aus.
- Im Leerlauf kaum Last (unter 1 % CPU, unter 150 MB mit geschlossenem Fenster). Wichtiges ins Protokoll `%APPDATA%\VZA Desktop\logs` (rotierend, ohne Schlüssel).
- Kleine Commits mit deutscher Nachricht, Branch pro Phase, Zusammenführen nur nach meiner Freigabe. Pflege `CHANGELOG.md`, `docs/ARCHITEKTUR.md`, `docs/PARITAET.md`, `docs/ENTSCHEIDUNGEN.md`, `docs/ENTWICKLUNG.md` (wie man baut, testet, veröffentlicht), `README.md` für Mitglieder.

## Wo was steht
`PROMPT-fuer-Claude-Code.md` (Auftrag) · `docs/01…10` (WebApp, Datenbank-Schnittstellen, Spiel-Logs, Phasen, Verteilung, Sicherheit, Datenmodell, Design, Funktionsliste, Architektur) · `reference/` (Log-Code, **SQL-Geschichte**, **Datenbank-Aufbau**, **WebApp-Quelltext**) · `assets/` (Symbole, Logo, Installer-Bilder)
