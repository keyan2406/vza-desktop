"use client";

import { memo, useEffect, useMemo, useState, useTransition } from "react";
import {
  GROUPS,
  applyFilters,
  groupCounts,
  groupLabel,
  haystack,
  sortRows,
  type Filters,
  type GroupId,
  type LightRow,
  type OrgInfo,
  type SortKey,
  type Source,
  type Tile,
} from "../../utils/catalog";
import type { CatalogMeta } from "../../utils/catalog-load";
import Count from "./Count";
import { cleanDetails, detailsLabel, formatAmount, formatDuration, type Details } from "../../utils/item-info";
import { catalogAddToShopping, catalogDetail, syncCatalogAction } from "../(app)/blueprints/catalog-actions";
import { createCraftRequest, removeShopping } from "../(app)/blueprints/extra-actions";

const PAGE = 20;
const day = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });
const SORTS: { id: SortKey; label: string }[] = [
  { id: "name", label: "Name" },
  { id: "time", label: "Craftzeit, kurz zuerst" },
  { id: "size", label: "Größe, klein zuerst" },
  { id: "missions", label: "Meiste Missionen" },
];

const Chev = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className={`h-4 w-4 shrink-0 text-hud-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
    <path d="M5 8l5 5 5-5" />
  </svg>
);

// ---------- Abgleich mit der Wiki-Datenbank (Officer) ----------

function SyncBar({ meta, canSync, empty }: { meta: CatalogMeta; canSync: boolean; empty: boolean }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const stand = meta.syncedAt ? `Stand ${day.format(new Date(meta.syncedAt))} Uhr` : "Noch nicht abgeglichen";
  return (
    <div className="hud-panel flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 text-sm">
        <p className="text-hud-muted">
          {stand}
          {meta.version ? ` · Spielversion ${meta.version}` : ""}
        </p>
        {empty && (
          <p className="mt-1 text-hud-amber">
            Der Katalog ist noch leer. {canSync ? "Klicke auf „Katalog aktualisieren“, das dauert etwa eine halbe Minute." : "Ein Officer kann ihn mit einem Klick füllen."}
          </p>
        )}
        {msg && (
          <div role={msg.ok ? "status" : "alert"} className={`mt-2 space-y-1 ${msg.ok ? "text-hud-accent" : "text-hud-danger"}`}>
            {msg.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        )}
      </div>
      {canSync && (
        <button
          disabled={busy}
          className="hud-btn hud-btn-sm"
          onClick={() =>
            start(async () => {
              setMsg(null);
              const res = await syncCatalogAction();
              if (res.error || !res.result) return setMsg({ ok: false, lines: [res.error ?? "Das hat nicht geklappt."] });
              const r = res.result;
              const lines = r.ok
                ? [`${r.blueprints} Blaupausen, ${r.missions} Missionen, ${r.givers} Missionsgeber.`, ...r.warnings]
                : r.warnings.length
                  ? r.warnings
                  : ["Das hat nicht geklappt."];
              setMsg({ ok: r.ok && r.warnings.length === 0, lines });
            })
          }
        >
          {busy ? "Gleiche ab … (bis 30 s)" : "Katalog aktualisieren"}
        </button>
      )}
    </div>
  );
}

// ---------- Eine Zeile ----------

type Detail = { sources: Source[]; detail: Details | null; owners: string[] };

const Row = memo(function Row({
  r,
  org,
  inList,
}: {
  r: LightRow;
  org: OrgInfo | undefined;
  inList: number;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!open || detail || loadErr) return;
    let alive = true;
    catalogDetail(r.id).then((d) => {
      if (!alive) return;
      if (d.error) setLoadErr(d.error);
      else setDetail({ sources: d.sources, detail: d.detail, owners: d.owners });
    });
    return () => {
      alive = false;
    };
  }, [open, detail, loadErr, r.id]);

  const clamp = (v: number) => Math.min(99, Math.max(1, Math.round(v) || 1));
  const bySource = useMemo(() => {
    const map = new Map<string, Source[]>();
    for (const s of detail?.sources ?? []) map.set(s.g, [...(map.get(s.g) ?? []), s]);
    return [...map.entries()];
  }, [detail]);

  const sourceText = r.f ? (
    <span className="text-hud-accent">Ohne Mission verfügbar</span>
  ) : r.gv.length > 0 ? (
    <>
      <span className="font-medium">{r.gv[0]}</span>
      <span className="block text-xs text-hud-muted">
        {r.gv.length > 1 ? `+ ${r.gv.length - 1} weitere · ` : ""}
        {r.mc} {r.mc === 1 ? "Mission" : "Missionen"}
      </span>
    </>
  ) : (
    <span className="text-hud-amber">Quelle unbekannt</span>
  );

  return (
    <li className="border-t border-hud-line first:border-t-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="hud-row grid cursor-pointer gap-x-4 gap-y-2 p-3 transition-colors hover:bg-hud-accent/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud-accent md:grid-cols-[minmax(0,1.3fr)_7rem_minmax(0,2fr)_minmax(0,1.3fr)_5.5rem_1rem] md:items-start"
      >
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight tracking-wide">{r.n}</p>
          <p className="text-xs text-hud-muted">
            {r.sub ?? groupLabel(r.g)}
            {org?.mine ? <span className="ml-2 border border-hud-accent/60 px-1.5 text-hud-accent">Du hast sie</span> : org && org.owners > 0 ? <span className="ml-2 text-hud-amber">{org.owners} in der Org</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-1.5 md:pt-0.5">
          {r.sz !== null && <span className="border border-hud-text/70 px-1.5 py-0.5 font-mono text-xs tabular-nums">S{r.sz}</span>}
          {r.gr && <span className="bg-hud-text px-1.5 py-0.5 font-display text-xs font-bold text-hud-bg">{r.gr}</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {r.m.slice(0, 4).map((m) => (
            <span key={m.n} className="border border-hud-line bg-white/5 px-1.5 py-0.5 font-mono text-xs">
              {m.n}
              <em className="ml-1 not-italic text-hud-muted">{formatAmount({ name: m.n, scu: m.s, qty: m.q }) || ""}</em>
            </span>
          ))}
          {r.m.length > 4 && <span className="px-1 py-0.5 text-xs text-hud-muted">+ {r.m.length - 4}</span>}
          {r.m.length === 0 && <span className="text-xs text-hud-muted">Zutaten unbekannt</span>}
        </div>
        <div className="text-sm leading-snug">{sourceText}</div>
        <div className="font-mono text-sm tabular-nums md:text-right">{r.t !== null ? formatDuration(r.t) : "–"}</div>
        <div className="hidden md:block">
          <Chev open={open} />
        </div>
      </div>

      {open && (
        <div className="hud-reveal grid gap-x-8 gap-y-5 border-t border-dashed border-hud-line bg-white/[0.03] p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-4 text-sm">
            <dl className="grid gap-2">
              <div>
                <dt className="hud-label">Typ</dt>
                <dd>{[groupLabel(r.g), r.sub].filter((x, i, a) => x && a.indexOf(x) === i).join(" · ")}</dd>
              </div>
              {detail?.detail && (
                <div>
                  <dt className="hud-label">Eigenschaften</dt>
                  <dd>{detailsLabel(cleanDetails(detail.detail))}</dd>
                </div>
              )}
              <div>
                <dt className="hud-label">Verfügbarkeit</dt>
                <dd>{r.f ? "ohne Blaupause" : r.mc > 0 ? "nur mit Blaupause, von Missionen vergeben" : "nur mit Blaupause, Quelle noch unbekannt"}</dd>
              </div>
              <div>
                <dt className="hud-label">In der Org</dt>
                <dd>
                  {!detail ? (loadErr ? "–" : "Lade …") : detail.owners.length === 0 ? "Niemand besitzt sie zurzeit." : detail.owners.join(", ")}
                </dd>
              </div>
            </dl>
            {loadErr && <p role="alert" className="text-hud-danger">{loadErr}</p>}
          </div>

          <div className="space-y-5 text-sm">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="hud-label">Zutaten</p>
                <label className="flex items-center gap-2 text-hud-muted">
                  für
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={qty}
                    aria-label="Stückzahl"
                    onChange={(e) => setQty(clamp(Number(e.target.value)))}
                    className="hud-input w-20 py-1"
                  />
                  Stück
                </label>
              </div>
              {r.m.length === 0 ? (
                <p className="text-hud-muted">Für diese Blaupause sind keine Zutaten bekannt.</p>
              ) : (
                <ul className="max-w-md divide-y divide-hud-line border border-hud-line">
                  {r.m.map((m) => (
                    <li key={m.n} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
                      <span>{m.n}</span>
                      <span className="tabular-nums text-hud-amber">{formatAmount({ name: m.n, scu: m.s, qty: m.q }, qty) || "–"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <p className="hud-label">
                Missionen{detail ? ` (${detail.sources.length}${r.mc > detail.sources.length ? ` von ${r.mc}` : ""})` : ""}
              </p>
              {!detail && !loadErr && <p className="text-hud-muted">Lade …</p>}
              {detail && detail.sources.length === 0 && (
                <p className="text-hud-muted">
                  {r.f ? "Diese Blaupause ist ohne Mission verfügbar." : "Es ist noch keine Mission bekannt, die diese Blaupause vergibt."}
                </p>
              )}
              {bySource.map(([giver, list]) => (
                <div key={giver}>
                  <p className="font-medium">
                    {giver} <span className="text-hud-muted">({list.length})</span>
                  </p>
                  <ul className="mt-1 divide-y divide-hud-line border-l border-hud-line pl-3">
                    {list.slice(0, 10).map((s) => (
                      <li key={s.t} className="flex flex-wrap items-baseline justify-between gap-x-4 py-1">
                        <span>{s.t}</span>
                        <span className="font-mono text-xs text-hud-muted">{[s.r, s.s.join(", ")].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                    {list.length > 10 && <li className="py-1 text-xs text-hud-muted">… und {list.length - 10} weitere</li>}
                  </ul>
                </div>
              ))}
            </div>

            <div className="space-y-3 border-t border-hud-line pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  disabled={busy}
                  className="hud-btn hud-btn-sm"
                  onClick={() =>
                    start(async () => {
                      const res = await catalogAddToShopping(r.id, qty);
                      setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: inList > 0 ? "Menge auf der Einkaufsliste aktualisiert." : `${qty}× stehen auf deiner Einkaufsliste.` });
                    })
                  }
                >
                  {inList > 0 ? `Einkaufsliste: auf ${qty}× setzen` : `${qty}× auf die Einkaufsliste`}
                </button>
                {inList > 0 && org && (
                  <button
                    disabled={busy}
                    className="hud-btn-ghost hud-btn-sm"
                    onClick={() =>
                      start(async () => {
                        const res = await removeShopping(org.id);
                        setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Von der Einkaufsliste entfernt." });
                      })
                    }
                  >
                    Von der Liste nehmen
                  </button>
                )}
              </div>

              {org && org.owners > 0 && !org.mine && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-48 flex-1">
                    <span className="hud-label mb-1 block">Herstellung anfragen, Notiz (optional)</span>
                    <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="z. B. bis Freitag" className="hud-input py-1" />
                  </label>
                  <button
                    disabled={busy}
                    className="hud-btn hud-btn-sm"
                    onClick={() =>
                      start(async () => {
                        const res = await createCraftRequest(org.id, qty, note);
                        if (res.error) setMsg({ ok: false, text: res.error });
                        else {
                          setMsg({ ok: true, text: res.message ?? "Anfrage gesendet." });
                          setNote("");
                        }
                      })
                    }
                  >
                    {qty}× anfragen ({org.owners} {org.owners === 1 ? "Besitzer" : "Besitzer"})
                  </button>
                </div>
              )}
              {msg && (
                <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-hud-accent" : "text-hud-danger"}>
                  {msg.text}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
});

// ---------- Gesamte Ansicht ----------

export default function CatalogView({
  rows,
  tiles,
  meta,
  org,
  shopping,
  canSync,
}: {
  rows: LightRow[];
  tiles: Tile[];
  meta: CatalogMeta;
  org: Record<string, OrgInfo>;
  shopping: Record<number, number>;
  canSync: boolean;
}) {
  const [f, setF] = useState<Filters>({ q: "", group: "all", size: "all", giver: null, onlyOrg: false, onlyMissing: false });
  const [sort, setSort] = useState<SortKey>("name");
  const [allTiles, setAllTiles] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>({});

  const orgMap = useMemo(() => new Map(Object.entries(org)), [org]);
  const hay = useMemo(() => new Map(rows.map((r) => [r.id, haystack(r)])), [rows]);
  const set = (patch: Partial<Filters>) => {
    setF((cur) => ({ ...cur, ...patch }));
    setLimits({});
  };

  // Gruppen- und Größenknöpfe zeigen, wie viele Treffer es gäbe (ohne ihren eigenen Filter)
  const withoutGroup = useMemo(() => applyFilters(rows, { ...f, group: "all" }, orgMap, hay), [rows, f, orgMap, hay]);
  const withoutSize = useMemo(() => applyFilters(rows, { ...f, size: "all" }, orgMap, hay), [rows, f, orgMap, hay]);
  const counts = useMemo(() => groupCounts(withoutGroup), [withoutGroup]);
  const totals = useMemo(() => groupCounts(rows), [rows]);
  const sizes = useMemo(() => [...new Set(withoutSize.map((r) => r.sz).filter((s): s is number => s !== null))].sort((a, b) => a - b), [withoutSize]);
  const shown = useMemo(() => sortRows(applyFilters(rows, f, orgMap, hay), sort), [rows, f, orgMap, hay, sort]);

  const grouped = useMemo(
    () => GROUPS.map((g) => ({ g, items: shown.filter((r) => r.g === g.id) })).filter((x) => x.items.length > 0),
    [shown]
  );

  const withMission = useMemo(() => rows.filter((r) => r.mc > 0 || r.gv.length > 0).length, [rows]);
  const inOrg = useMemo(() => rows.filter((r) => (orgMap.get(r.nn)?.owners ?? 0) > 0).length, [rows, orgMap]);
  const filtered = f.q || f.group !== "all" || f.size !== "all" || f.giver || f.onlyOrg || f.onlyMissing;
  const visibleTiles = allTiles ? tiles : tiles.slice(0, 8);

  return (
    <div className="space-y-6">
      <SyncBar meta={meta} canSync={canSync} empty={rows.length === 0} />

      {rows.length > 0 && (
        <>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-hud-muted">
            {[
              [rows.length, "Blaupausen im Spiel"],
              [withMission, "mit bekannter Mission"],
              [tiles.length, "Missionsgeber"],
              [inOrg, "davon in der Org"],
            ].map(([n, label]) => (
              <div key={label as string} className="flex items-baseline gap-2">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <b className="font-display text-2xl font-semibold text-hud-text tabular-nums">
                    <Count value={n as number} />
                  </b>{" "}
                  {label}
                </dd>
              </div>
            ))}
          </dl>

          {tiles.length > 0 && (
            <section aria-labelledby="cat-givers" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="cat-givers" className="hud-h2">Missionsgeber</h2>
                <p className="text-sm text-hud-muted">Ein Klick filtert die Liste auf die Blaupausen dieses Gebers.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {visibleTiles.map((t) => {
                  const on = f.giver === t.name;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ giver: on ? null : t.name })}
                      className={`flex items-center justify-between gap-3 border p-3 text-left transition-colors ${on ? "border-hud-accent bg-hud-accent/10" : "border-hud-line-strong hover:border-hud-accent/60"}`}
                    >
                      <span className="min-w-0 font-medium leading-tight">{t.name}</span>
                      <span className="font-display text-xl font-semibold tabular-nums text-hud-accent" aria-label={`${t.count} Blaupausen`}>{t.count}</span>
                    </button>
                  );
                })}
              </div>
              {tiles.length > 8 && (
                <button type="button" onClick={() => setAllTiles((v) => !v)} className="text-sm text-hud-muted underline hover:text-hud-text">
                  {allTiles ? "Weniger Missionsgeber anzeigen" : `Alle ${tiles.length} Missionsgeber anzeigen`}
                </button>
              )}
            </section>
          )}

          <section aria-labelledby="cat-list" className="space-y-4">
            <h2 id="cat-list" className="sr-only">Blaupausen</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <input
                type="search"
                value={f.q}
                onChange={(e) => set({ q: e.target.value })}
                placeholder="Suche nach Blaupause, Rohstoff oder Missionsgeber"
                aria-label="Katalog durchsuchen"
                className="hud-input max-w-md"
              />
              <label className="flex items-center gap-2 text-sm">
                <span className="hud-label whitespace-nowrap">Sortieren</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="hud-input w-auto">
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-hud-accent" checked={f.onlyOrg} onChange={(e) => set({ onlyOrg: e.target.checked })} />
                Nur welche in der Org vorhanden
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-hud-accent" checked={f.onlyMissing} onChange={(e) => set({ onlyMissing: e.target.checked })} />
                Nur welche ich noch nicht habe
              </label>
            </div>

            <div role="group" aria-label="Nach Typ filtern" className="flex flex-wrap gap-2">
              {[{ id: "all" as const, label: "Alle", n: withoutGroup.length }, ...GROUPS.map((g) => ({ id: g.id as GroupId, label: g.label, n: counts[g.id] ?? 0 })).filter((g) => (totals[g.id] ?? 0) > 0)].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={f.group === g.id}
                  onClick={() => set({ group: g.id, size: "all" })}
                  className={`flex items-center gap-2 border px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition-colors ${f.group === g.id ? "border-hud-accent bg-hud-accent/15 text-hud-accent" : g.n === 0 ? "border-hud-line text-hud-muted/50 hover:text-hud-muted" : "border-hud-line-strong text-hud-muted hover:border-hud-accent/60 hover:text-hud-text"}`}
                >
                  {g.label}
                  <span className="text-xs tabular-nums opacity-70">{g.n}</span>
                </button>
              ))}
            </div>
            {sizes.length > 0 && (
              <div role="group" aria-label="Nach Größe filtern" className="flex flex-wrap items-center gap-2">
                <span className="hud-label mr-1">Größe</span>
                {(["all", ...sizes] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={f.size === s}
                    onClick={() => set({ size: s })}
                    className={`border px-2.5 py-1 font-mono text-xs transition-colors ${f.size === s ? "border-hud-accent bg-hud-accent/15 text-hud-accent" : "border-hud-line-strong text-hud-muted hover:text-hud-text"}`}
                  >
                    {s === "all" ? "Alle" : `S${s}`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4">
              <p className="font-mono text-xs text-hud-muted" aria-live="polite">{shown.length} von {rows.length}</p>
              {filtered && (
                <button
                  type="button"
                  className="text-sm text-hud-accent underline underline-offset-4"
                  onClick={() => set({ q: "", group: "all", size: "all", giver: null, onlyOrg: false, onlyMissing: false })}
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>

            {grouped.length === 0 ? (
              <p className="hud-panel p-6 text-center text-hud-muted">Keine Blaupause passt zu diesen Filtern.</p>
            ) : (
              <div className="space-y-6">
                {grouped.map(({ g, items }) => {
                  const limit = limits[g.id] ?? PAGE;
                  return (
                    <div key={g.id}>
                      <div className="flex items-baseline gap-3 pb-2">
                        <h3 className="font-display text-xl font-semibold tracking-wide">{g.label}</h3>
                        <span className="font-mono text-xs text-hud-muted">{items.length}</span>
                      </div>
                      <div className="hud-panel overflow-hidden">
                        <div className="hidden grid-cols-[minmax(0,1.3fr)_7rem_minmax(0,2fr)_minmax(0,1.3fr)_5.5rem_1rem] gap-x-4 border-b border-hud-line bg-hud-accent/5 px-3 py-2 font-mono text-[0.65rem] uppercase tracking-widest text-hud-muted md:grid">
                          <span>Blaupause</span>
                          <span>Größe · Grade</span>
                          <span>Materialien</span>
                          <span>Missionsgeber</span>
                          <span className="text-right">Craftzeit</span>
                          <span />
                        </div>
                        <ul>
                          {items.slice(0, limit).map((r) => {
                            const o = orgMap.get(r.nn);
                            return <Row key={r.id} r={r} org={o} inList={o ? (shopping[o.id] ?? 0) : 0} />;
                          })}
                        </ul>
                      </div>
                      {items.length > limit && (
                        <button type="button" className="hud-btn-ghost hud-btn-sm mt-3" onClick={() => setLimits((l) => ({ ...l, [g.id]: limit + PAGE }))}>
                          Mehr anzeigen ({items.length - limit} weitere)
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <p className="max-w-3xl text-xs text-hud-muted">
        Alle Angaben (Zutaten, Craftzeit, Missionen) stammen aus der Star Citizen Wiki API (api.star-citizen.wiki, Community-Projekt,
        inoffiziell). Mengen gelten für die Grundqualität. Missionen vergeben eine Blaupause aus einem Pool, das gewünschte Teil ist also
        nicht bei jedem Abschluss garantiert.
      </p>
    </div>
  );
}
