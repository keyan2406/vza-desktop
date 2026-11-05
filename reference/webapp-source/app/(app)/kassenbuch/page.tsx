import { Suspense } from "react";
import { requireOfficer } from "../../../utils/auth";
import { first, formatAuec, formatDate } from "../../../utils/format";
import PageSkeleton from "../../components/PageSkeleton";

export const metadata = { title: "Kassenbuch" };

type Row = {
  id: number;
  item_name: string;
  quantity: number;
  buyer_name: string;
  amount_auec: number;
  created_at: string;
  confirmer: { username: string } | { username: string }[] | null;
};

async function KassenbuchContent() {
  const { supabase } = await requireOfficer();

  const { data } = await supabase
    .from("cash_ledger")
    .select(
      `id, item_name, quantity, buyer_name, amount_auec, created_at,
       confirmer:profiles!cash_ledger_confirmed_by_fkey(username)`
    )
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as Row[];
  const total = rows.reduce((sum, r) => sum + Number(r.amount_auec), 0);

  return (
    <>
      <h1 className="hud-h1">Kassenbuch</h1>

      <div className="hud-panel mt-6 max-w-sm p-5">
        <span className="hud-label">Eingänge gesamt</span>
        <p className="mt-1 font-display text-4xl font-bold tabular-nums text-hud-amber">
          {formatAuec(total)}
        </p>
        <p className="mt-1 text-sm text-hud-muted">{rows.length} bestätigte Zahlungen</p>
      </div>

      <div className="mt-8 max-w-4xl overflow-x-auto border border-hud-line bg-hud-panel/60">
        <table className="w-full text-left">
          <thead className="bg-hud-accent/5">
            <tr>
              {["Datum", "Objekt", "Menge", "Käufer", "Betrag", "Bestätigt von"].map((h) => (
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
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hud-line hover:bg-hud-accent/5">
                <td className="px-4 py-2 text-sm text-hud-muted">{formatDate(r.created_at)}</td>
                <td className="px-4 py-2 font-medium">{r.item_name}</td>
                <td className="px-4 py-2 tabular-nums">{r.quantity}</td>
                <td className="px-4 py-2">{r.buyer_name}</td>
                <td className="px-4 py-2 font-display font-semibold tabular-nums text-hud-amber">
                  {formatAuec(r.amount_auec)}
                </td>
                <td className="px-4 py-2 text-hud-muted">
                  {first(r.confirmer)?.username ?? "–"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-hud-muted">
                  Noch keine Zahlungen verbucht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function KassenbuchPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KassenbuchContent />
    </Suspense>
  );
}
