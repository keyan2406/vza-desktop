// Platzhalter, solange Inhalt lädt. Schimmert leicht, damit man sieht, dass etwas passiert.
export default function PageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <div className="hud-skeleton h-9 w-64 max-w-full" />
      <div className="hud-skeleton mt-4 h-4 w-96 max-w-full" />
      <div className="mt-8 grid max-w-3xl gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hud-skeleton h-28 border border-hud-line" />
        ))}
      </div>
      <span className="sr-only">Lade …</span>
    </div>
  );
}
