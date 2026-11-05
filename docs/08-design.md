# Aussehen (HUD-Stil der WebApp)

Das Programm soll sich wie die WebApp anfühlen. Eigene Fenster des Programms (Einstellungen, Import-Protokoll, Offline-Seite, Kopplung) übernehmen den Stil. Die WebApp selbst erscheint unverändert im Fenster. Vollständige Stildatei: `reference/webapp/app/globals.css`.

## Farben
| Name | Wert | Verwendung |
|---|---|---|
| hud-bg | `#05090e` | Hintergrund |
| hud-panel | `#0a121a` | Flächen |
| hud-line | `#17303c` | dünne Linien |
| hud-line-strong | `#24566a` | Rahmen |
| hud-accent | `#35d6ff` | Hauptfarbe (Cyan) |
| hud-amber | `#ffb43a` | Hinweise, Verwaltung |
| hud-danger | `#ff7a7a` | Fehler |
| hud-text | `#dbe9f1` | Text |
| hud-muted | `#8ba5b4` | Nebentext |

## Schrift
Überschriften und Knöpfe: **Rajdhani** (500/600/700), GROSSBUCHSTABEN mit Buchstabenabstand 0,08–0,14 em. Fließtext: **Barlow** (400/500/600). Beide sind freie Schriften (`@fontsource/rajdhani`, `@fontsource/barlow`), im Programm **mitliefern** (kein Internet nötig).

## Formen und Bewegung
- Flächen mit dünnem Rahmen und Eck-Markierungen (zwei Ecken in Cyan, 12 px). Knöpfe mit abgeschrägten Ecken (`clip-path`), Cyan-Rahmen, beim Darüberfahren heller Glanzstreifen.
- Sanfte Einblendungen (ca. 0,3–0,5 s), nichts blinkt. **Rücksicht auf „Animationen reduzieren“ von Windows** und einen Schalter in den Einstellungen. Der Rest der Bewegungen steht in der Stildatei.
- Tray-Symbol: `assets/tray-16.png` / `tray-32.png` (Wappen). Programmsymbol `assets/icon.ico`.
- Texte immer Deutsch, du-Form, kurz und freundlich („Das hat nicht geklappt. Bitte versuche es noch einmal.“), keine technischen Fehlermeldungen für Nutzer, Technisches nur in der Protokolldatei.
