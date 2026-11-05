import type { MyStats } from "../../utils/stats";
import Count from "./Count";

export default function LevelPanel({ stats }: { stats: MyStats }) {
  const span = stats.next ? stats.next.minPoints - stats.currentMin : 0;
  const pct =
    stats.next && span > 0
      ? Math.min(100, Math.max(0, Math.round(((stats.totalPoints - stats.currentMin) / span) * 100)))
      : 100;

  return (
    <div className="hud-panel max-w-xl p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <span className="hud-label">Dein Rang</span>
          <p className="mt-1 font-display text-5xl font-bold uppercase tracking-wide text-hud-accent">
            Level <Count value={stats.level} />
          </p>
        </div>
        <div className="text-right">
          <span className="hud-label">Punkte</span>
          <p className="font-display text-3xl font-bold tabular-nums text-hud-amber">
            <Count value={stats.totalPoints} />
          </p>
        </div>
      </div>
      <div
        className="mt-4 h-2 bg-hud-line"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Fortschritt zum nächsten Level"
      >
        <div className="hud-grow hud-shine h-full bg-hud-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-hud-muted">
        {stats.next
          ? `Noch ${stats.next.minPoints - stats.totalPoints} Punkte bis Level ${stats.next.level}`
          : "Höchstes Level erreicht"}
        {" · "}
        {stats.opsCount} {stats.opsCount === 1 ? "Operation" : "Operationen"}
      </p>
    </div>
  );
}
