import { Suspense } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireProfile } from "../../../utils/auth";
import {
  WEEKDAYS,
  berlinParts,
  dayKey,
  gridRange,
  keyOf,
  longDay,
  monthGrid,
  monthTitle,
  parseDay,
  parseMonth,
  shiftMonth,
  timeOf,
} from "../../../utils/calendar";
import PageSkeleton from "../../components/PageSkeleton";
import StatusBadge, { type EventStatus } from "../../components/StatusBadge";

export const metadata = { title: "Kalender" };

type Ev = {
  id: number;
  title: string;
  starts_at: string;
  status: EventStatus;
  min_players: number;
  event_signups: { user_id: string }[] | null;
};

const chipStyle: Record<EventStatus, string> = {
  planned: "border-hud-accent/60 bg-hud-accent/10 text-hud-accent hover:bg-hud-accent/20",
  running: "border-hud-amber/70 bg-hud-amber/10 text-hud-amber hover:bg-hud-amber/20",
  finished: "border-hud-line-strong bg-white/5 text-hud-muted hover:bg-white/10",
  cancelled: "border-hud-danger/50 bg-hud-danger/5 text-hud-danger/80 line-through hover:bg-hud-danger/10",
};

async function KalenderContent({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  const { supabase, user } = await requireProfile();
  const sp = await searchParams;

  const today = berlinParts(new Date());
  const todayKey = dayKey(today.y, today.m, today.d);
  const { y, m } = parseMonth(sp.m, { y: today.y, m: today.m });
  const selected = parseDay(sp.d);

  const cells = monthGrid(y, m);
  const { startIso, endIso } = gridRange(cells);

  const { data } = await supabase
    .from("events")
    .select("id, title, starts_at, status, min_players, event_signups(user_id)")
    .gte("starts_at", startIso)
    .lte("starts_at", endIso)
    .order("starts_at", { ascending: true })
    .limit(500);

  const byDay = new Map<string, Ev[]>();
  for (const e of (data ?? []) as unknown as Ev[]) {
    const k = keyOf(new Date(e.starts_at));
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  const prev = shiftMonth(y, m, -1);
  const next = shiftMonth(y, m, 1);
  const href = (yy: number, mm: number, d?: string) =>
    `/kalender?m=${yy}-${String(mm).padStart(2, "0")}${d ? `&d=${d}` : ""}`;
  const monthEvents = [...byDay.entries()].filter(([k]) => k.startsWith(`${y}-${String(m).padStart(2, "0")}`));
  const monthCount = monthEvents.reduce((n, [, list]) => n + list.length, 0);

  const dayList = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <>
      <h1 className="hud-h1">Kalender</h1>
      <p className="mt-4 max-w-2xl text-hud-muted">
        Alle Operationen auf einen Blick. Ein Klick auf eine Operation öffnet sie, ein Klick auf den Tag zeigt
        alle Operationen dieses Tages.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href={href(prev.y, prev.m)} className="hud-btn-ghost hud-btn-sm" aria-label="Voriger Monat">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <h2 className="min-w-44 text-center font-display text-2xl font-semibold uppercase tracking-wider">
            {monthTitle(y, m)}
          </h2>
          <Link href={href(next.y, next.m)} className="hud-btn-ghost hud-btn-sm" aria-label="Nächster Monat">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-hud-muted">
            {monthCount} {monthCount === 1 ? "Operation" : "Operationen"} in diesem Monat
          </p>
          <Link href={href(today.y, today.m, todayKey)} className="hud-btn hud-btn-sm">
            Heute
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden border border-hud-line bg-hud-panel/60">
        <div className="grid grid-cols-7 border-b border-hud-line bg-hud-accent/5">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="px-2 py-2 text-center font-display text-xs font-semibold uppercase tracking-[0.14em] text-hud-muted"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((c, idx) => {
            const list = byDay.get(c.key) ?? [];
            const isToday = c.key === todayKey;
            const isSelected = c.key === selected;
            const mine = list.some((e) => (e.event_signups ?? []).some((s) => s.user_id === user.id));
            return (
              <div
                key={c.key}
                className={`relative min-h-16 border-b border-hud-line p-1.5 md:min-h-28 ${
                  idx % 7 !== 6 ? "border-r" : ""
                } ${c.inMonth ? "" : "bg-black/20"} ${isSelected ? "bg-hud-accent/10" : ""}`}
              >
                <Link
                  href={href(y, m, c.key)}
                  aria-label={`${longDay(c.key)}${list.length ? `, ${list.length} Operationen` : ""}`}
                  className="absolute inset-0 z-0 transition-colors hover:bg-white/5"
                />
                <div className="pointer-events-none relative z-10 flex items-center justify-between">
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center px-1 text-sm tabular-nums ${
                      isToday
                        ? "bg-hud-accent font-bold text-hud-bg"
                        : c.inMonth
                          ? "text-hud-text"
                          : "text-hud-muted/50"
                    }`}
                  >
                    {c.d}
                  </span>
                  {mine && (
                    <span className="text-[0.6rem] font-semibold uppercase tracking-widest text-hud-amber">dabei</span>
                  )}
                </div>

                {/* Computer: Operationen als Kärtchen */}
                <ul className="relative z-10 mt-1 hidden space-y-1 md:block">
                  {list.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link
                        href={`/operationen/${e.id}`}
                        title={`${timeOf(new Date(e.starts_at))} Uhr · ${e.title}`}
                        className={`block truncate border px-1.5 py-0.5 text-xs transition-colors ${chipStyle[e.status]}`}
                      >
                        <span className="tabular-nums">{timeOf(new Date(e.starts_at))}</span> {e.title}
                      </Link>
                    </li>
                  ))}
                  {list.length > 3 && (
                    <li className="px-1 text-xs text-hud-muted">+ {list.length - 3} weitere</li>
                  )}
                </ul>

                {/* Handy: nur Punkte, Details beim Antippen */}
                {list.length > 0 && (
                  <div className="pointer-events-none relative z-10 mt-1 flex flex-wrap gap-1 md:hidden" aria-hidden>
                    {list.slice(0, 4).map((e) => (
                      <span
                        key={e.id}
                        className={`h-1.5 w-1.5 rounded-full ${
                          e.status === "planned"
                            ? "bg-hud-accent"
                            : e.status === "running"
                              ? "bg-hud-amber"
                              : e.status === "cancelled"
                                ? "bg-hud-danger"
                                : "bg-hud-muted"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-hud-muted">
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-hud-accent" />Geplant</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-hud-amber" />Läuft</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-hud-muted" />Beendet</span>
        <span className="flex items-center gap-2"><span className="h-2 w-2 bg-hud-danger" />Abgesagt</span>
        <span className="text-hud-amber">dabei = du bist angemeldet</span>
      </div>

      {selected && (
        <section className="mt-8 max-w-3xl" aria-live="polite">
          <h2 className="hud-h2 mb-4">{longDay(selected)}</h2>
          {dayList.length === 0 ? (
            <p className="text-hud-muted">An diesem Tag ist keine Operation geplant.</p>
          ) : (
            <ul className="hud-stagger grid gap-3">
              {dayList.map((e) => {
                const signed = (e.event_signups ?? []).length;
                const me = (e.event_signups ?? []).some((s) => s.user_id === user.id);
                return (
                  <li key={e.id} className="hud-panel hud-lift p-4">
                    <Link href={`/operationen/${e.id}`} className="block">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <StatusBadge status={e.status} />
                          <p className="mt-2 font-display text-xl font-semibold tracking-wide">{e.title}</p>
                          <p className="text-sm text-hud-muted">
                            {timeOf(new Date(e.starts_at))} Uhr · {signed} von mindestens {e.min_players} angemeldet
                          </p>
                        </div>
                        {me && (
                          <span className="border border-hud-amber/60 px-2 py-0.5 font-display text-xs font-semibold uppercase tracking-widest text-hud-amber">
                            Du bist dabei
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

export default function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; d?: string }>;
}) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KalenderContent searchParams={searchParams} />
    </Suspense>
  );
}
