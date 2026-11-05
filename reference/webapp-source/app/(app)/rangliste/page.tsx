import { Suspense } from "react";
import { after } from "next/server";
import { requireProfile } from "../../../utils/auth";
import PageSkeleton from "../../components/PageSkeleton";

export const metadata = { title: "Rangliste" };

type Row = {
  user_id: string;
  username: string;
  total_points: number;
  ops_count: number;
  level: number;
};

async function RanglisteContent() {
  const { supabase, user } = await requireProfile();

  after(async () => {
    await supabase.rpc("run_daily_maintenance");
  });

  const { data } = await supabase
    .from("player_stats")
    .select("user_id, username, total_points, ops_count, level")
    .order("total_points", { ascending: false })
    .order("username", { ascending: true });

  const rows = (data ?? []) as Row[];

  return (
    <>
      <h1 className="hud-h1">Rangliste</h1>
      <p className="mt-4 max-w-xl text-hud-muted">
        Punkte und Level aller Mitglieder. Punkte gibt es für die Teilnahme an
        Operationen. Wer 30 Tage an keiner Operation teilnimmt, verliert ein Level.
      </p>

      <div className="mt-6 max-w-3xl overflow-x-auto border border-hud-line bg-hud-panel/60">
        <table className="w-full text-left">
          <thead className="bg-hud-accent/5">
            <tr>
              {["Rang", "Spieler", "Level", "Punkte", "Operationen"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.user_id}
                className={`border-t border-hud-line ${
                  r.user_id === user.id ? "bg-hud-accent/10" : "hover:bg-hud-accent/5"
                }`}
              >
                <td className="px-4 py-2 font-display text-lg font-semibold tabular-nums">
                  {i + 1}
                </td>
                <td className="px-4 py-2 font-medium">{r.username}</td>
                <td className="px-4 py-2 font-display font-semibold text-hud-accent">
                  {r.level}
                </td>
                <td className="px-4 py-2 font-display font-semibold tabular-nums text-hud-amber">
                  {r.total_points}
                </td>
                <td className="px-4 py-2 tabular-nums text-hud-muted">{r.ops_count}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-hud-muted">
                  Noch keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function RanglistePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RanglisteContent />
    </Suspense>
  );
}
