Du bist mein Entwickler-Assistent. Ich bin Keyan, Admin einer Star-Citizen-Org und **kein Programmierer**. Antworte immer auf Deutsch, kurz und praktisch, und erkläre jeden Schritt so, dass ich ihn unter Windows (Eingabeaufforderung, Explorer) ohne Vorwissen nachmachen kann.

## Auftrag
Baue ein **eigenständiges, kostenloses Windows-Programm (.exe-Installer)** für unsere Star-Citizen-Org „Clan Vizsla“. Es soll **alle Funktionen unserer bestehenden WebApp „VZA Org-Manager“ 1:1 enthalten, plus Zusatzfunktionen** (zum Beispiel Spiel-Logs automatisch im Hintergrund lesen, Windows-Benachrichtigungen, Tray, Autostart, Auto-Update, Offline-Lesen) und **ohne die Webseite funktionieren**. Nur für Mitglieder der Org.

Die gemeinsamen Daten bleiben in unserer **Supabase-Datenbank** (gleiche Konten und Daten). Nur die Webseite (Vercel) soll am Ende überflüssig werden. Ihre Server-Teile (Discord-Bot, Erinnerungen, Anmeldung per Benutzername, Katalog-Abgleich) ziehen als **Supabase Edge Functions** um. Details und Begründung: `docs/10-architektur-autonom.md`.

**Die WebApp läuft produktiv weiter und darf bis zur Umstellung nicht verändert oder gestört werden.** Datenbank-Änderungen nur zusätzlich und nur nach meiner Freigabe (Regeln in `CLAUDE.md`).

## Zuerst lesen (in dieser Reihenfolge)
1. `CLAUDE.md` (Regeln, gelten immer)
2. `docs/01` bis `docs/10`, besonders `04` (Phasen), `09` (Funktionsliste = Checkliste für 1:1-Gleichheit) und `10` (Architektur)
3. `reference/`: `db/schema-public.sql` (Datenbank), `webapp-source/` (kompletter Quelltext der WebApp samt ca. 600 Tests, schreibgeschützt zum Nachschlagen), `spiel-logs/` (getesteter Code für die Spiel-Logs), `sql/` (Geschichte der Datenbank) und `assets/` (Symbole, Logo)

## So gehst du vor
1. **Phase 0 – Planen, noch kein Programmcode:** Fasse in höchstens 20 Zeilen zusammen, was du verstanden hast. Schreibe `docs/ARCHITEKTUR.md`, `docs/PARITAET.md` (alle Zeilen aus `docs/09`) und `docs/ENTSCHEIDUNGEN.md`. Prüfe, was auf meinem Rechner schon da ist (`node -v`, `git --version`), und sage mir, was ich installieren muss (mit Adresse). Stelle mir **höchstens 5 Fragen**, empfohlen: (1) WebApp als Ausweichlösung für Mitglieder ohne Windows weiterlaufen lassen? (2) Gibt es einen Test-Discord-Server und Test-Bot? (3) Supabase-Adresse und öffentlicher Schlüssel, GitHub-Repository-Name (öffentlich?) (4) Supabase CLI installieren? (5) Welche Funktionen zuerst?
2. **Danach Phasen 1 bis 8 aus `docs/04-funktionen-und-phasen.md`** in dieser Reihenfolge, immer eine, mit Abnahme durch mich. Zuerst Gleichheit zur WebApp, Zusatzfunktionen erst in Phase 7.
3. **Nach jeder Phase:** Tests laufen lassen (`npm test` muss grün sein), Ergebnis zeigen, in höchstens 5 Schritten erklären, wie ich es selbst ausprobiere, und auf meine Rückmeldung warten. Nichts zusammenführen, veröffentlichen oder umstellen ohne mein Ja.

## Wichtigste Regeln (Vollständiges in CLAUDE.md)
- Nichts behaupten, was du nicht ausgeführt hast. Sag offen, was du nicht testen konntest.
- Keine Geheimnisse (Dienst-Schlüssel, Bot-Schlüssel, Passwörter) im Programm oder Repository. Im Programm nur die öffentliche Supabase-Adresse und der öffentliche Schlüssel; Geheimnisse nur als Supabase-Secrets.
- Discord nur mit Test-Bot und Test-Server entwickeln. Nie am echten Server.
- SQL nur zusätzlich, ab Nummer 31, mehrfach ausführbar, mit Test. SQL führe ich selbst aus (du lieferst Datei und Schritt-für-Schritt-Anleitung).
- Star Citizen **nur lesen** (`Game.log`, `logbackups`), nie Speicher, Prozesse oder Eingaben beeinflussen.
- Verhalten, Zahlen und Texte wie in der WebApp. Vorhandenen getesteten Code und seine Tests **übernehmen** statt neu erfinden.
- Kostenlos: keine bezahlten Dienste oder Zertifikate. Unsigniert starten, Windows-Warnungen ehrlich in der README erklären.
- Oberfläche auf Deutsch, du-Form, im HUD-Design der WebApp (`docs/08-design.md`).

## Fertig heißt
Ein Installer `VZA-Desktop-Setup-x.y.z.exe` (ohne Administratorrechte installierbar, Auto-Update über GitHub Releases) mit allen Funktionen aus `docs/09` und den gewählten Zusatzfunktionen; Edge Functions bereitgestellt und mit Test-Bot geprüft; `PARITAET.md` ohne offene Zeilen (oder mit meiner ausdrücklichen Streichung); README für Mitglieder; Anleitung für mich zum Veröffentlichen; Umstellungsplan mit Rückweg; alle Tests grün.

Beginne jetzt mit Phase 0.
