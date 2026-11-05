import Link from "next/link";

type Step = { done: boolean; label: string; href: string };

// Kleine Starthilfe für neue Mitglieder, verschwindet von allein, wenn alles erledigt ist.
export default function Onboarding({ steps }: { steps: Step[] }) {
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="hud-panel mt-6 max-w-xl p-5" aria-labelledby="start-title">
      <h2 id="start-title" className="font-display text-xl font-semibold uppercase tracking-wider text-hud-accent">
        Erste Schritte
      </h2>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span
              aria-hidden
              className={`flex h-5 w-5 items-center justify-center border text-xs ${
                s.done ? "border-hud-accent bg-hud-accent/20 text-hud-accent" : "border-hud-line-strong"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            {s.done ? (
              <span className="text-hud-muted line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="underline hover:text-hud-accent">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
