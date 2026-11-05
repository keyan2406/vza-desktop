export type EventStatus = "planned" | "running" | "finished" | "cancelled";

const styles: Record<EventStatus, { label: string; cls: string }> = {
  planned: { label: "Geplant", cls: "border-hud-accent/60 text-hud-accent" },
  running: { label: "Läuft", cls: "hud-live border-hud-amber/60 text-hud-amber" },
  finished: { label: "Beendet", cls: "border-hud-line-strong text-hud-muted" },
  cancelled: { label: "Abgesagt", cls: "border-hud-danger/60 text-hud-danger" },
};

export default function StatusBadge({ status }: { status: EventStatus }) {
  const s = styles[status];
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-widest ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
