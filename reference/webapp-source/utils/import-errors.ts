// Verständliche Erklärungen, wenn der Browser den Spielordner oder eine Log-Datei nicht öffnen kann.

export function explainFolderError(name?: string): string | null {
  switch (name) {
    case "AbortError":
      return null; // abgebrochen: keine Meldung nötig
    case "SecurityError":
      return "Der Browser sperrt diesen Ordner. Das ist bei Systemordnern wie „Program Files“ normal. Nimm „Dateien auswählen“ oder zieh den Ordner LIVE auf das Feld darunter. Beides geht trotzdem. Oder nutze den PC-Helfer.";
    case "NotAllowedError":
      return "Der Browser hat den Zugriff nicht erlaubt. Klicke noch einmal und bestätige die Abfrage mit „Dateien ansehen“, oder nutze „Dateien auswählen“.";
    default:
      return "Der Ordner konnte nicht geöffnet werden. Versuche „Dateien auswählen“, zieh den Ordner LIVE auf das Feld darunter, oder nutze den PC-Helfer.";
  }
}

export function explainReadError(name?: string): string {
  switch (name) {
    case "NotReadableError":
      return "Die Datei ist gerade gesperrt, wahrscheinlich weil das Spiel sie benutzt. Beende das Spiel und versuche es noch einmal. Oder nutze den PC-Helfer, der auch bei laufendem Spiel mitliest.";
    case "NotFoundError":
      return "Die Datei wurde verschoben oder gelöscht, während ich sie lesen wollte. Bitte versuche es noch einmal.";
    case "SecurityError":
    case "NotAllowedError":
      return "Der Browser erlaubt den Zugriff auf diese Datei nicht. Wähle die Datei mit „Dateien auswählen“ aus oder nutze den PC-Helfer.";
    default:
      return "Eine Datei konnte nicht gelesen werden. Läuft das Spiel gerade, beende es und versuche es noch einmal. Oder nutze den PC-Helfer.";
  }
}
