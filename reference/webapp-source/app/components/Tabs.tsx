"use client";

import { useId, useRef, useState } from "react";

export type TabDef = {
  id: string;
  label: string;
  badge?: number | string;
  content: React.ReactNode;
};

// Registerkarten gegen langes Scrollen. Alle Inhalte bleiben geladen, nur einer ist sichtbar.
export default function Tabs({
  tabs,
  initial,
}: {
  tabs: TabDef[];
  initial?: string;
}) {
  const base = useId();
  const [active, setActive] = useState(
    tabs.some((t) => t.id === initial) ? (initial as string) : tabs[0].id
  );
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(tabs[next].id);
    buttons.current[tabs[next].id]?.focus();
  }

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Bereiche"
        className="hud-scroll-x -mx-5 flex gap-1 overflow-x-auto border-b border-hud-line px-5 md:mx-0 md:px-0"
      >
        {tabs.map((t, i) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                buttons.current[t.id] = el;
              }}
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 font-display text-base font-semibold uppercase tracking-wider transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-hud-accent ${
                selected
                  ? "border-hud-accent text-hud-accent"
                  : "border-transparent text-hud-muted hover:text-hud-text"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge !== "" && (
                <span
                  className={`min-w-6 px-1.5 text-center text-xs tabular-nums transition-colors duration-200 ${
                    selected ? "bg-hud-accent/20 text-hud-accent" : "bg-white/5 text-hud-muted"
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-panel-${t.id}`}
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-6"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
