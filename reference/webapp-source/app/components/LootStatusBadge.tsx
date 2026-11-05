export type LootStatus = "locked" | "released" | "awarded" | "sold";

const styles: Record<LootStatus, { label: string; cls: string }> = {
  locked: { label: "Gesperrt", cls: "border-hud-line-strong text-hud-muted" },
  released: { label: "Freigegeben", cls: "border-hud-accent/60 text-hud-accent" },
  awarded: { label: "Zugeteilt", cls: "border-hud-amber/60 text-hud-amber" },
  sold: { label: "Verkauft", cls: "border-hud-line-strong text-hud-muted" },
};

export default function LootStatusBadge({ status }: { status: LootStatus }) {
  const s = styles[status] ?? styles.locked;
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-widest ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
