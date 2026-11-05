"use client";

// Letzte Rettung, wenn sogar das Grundgerüst der Seite einen Fehler wirft. Hier gibt es keine Stildateien, deshalb direkte Farben.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#05090e", color: "#dbe9f1", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center", border: "1px solid #24566a", padding: 32 }}>
          <p style={{ margin: 0, letterSpacing: "0.14em", textTransform: "uppercase", fontSize: 12, color: "#8ba5b4" }}>Fehler</p>
          <h1 style={{ margin: "8px 0 0", fontSize: 28, textTransform: "uppercase", letterSpacing: "0.1em", color: "#ff7a7a" }}>Da ist etwas schiefgelaufen</h1>
          <p style={{ color: "#8ba5b4" }}>Bitte lade die Seite neu. Hilft das nicht, melde dich bei einem Admin.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#8ba5b4" }}>Fehlernummer: {error.digest}</p>}
          <button onClick={reset} style={{ marginTop: 16, cursor: "pointer", color: "#35d6ff", background: "rgba(53,214,255,0.12)", border: "1px solid #35d6ff", padding: "10px 22px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
