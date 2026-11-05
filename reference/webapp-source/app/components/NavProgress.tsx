"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Dünner Ladebalken am oberen Rand mit leuchtender Spitze: startet beim Klick auf einen Link, endet mit der neuen Seite.
export default function NavProgress() {
  const pathname = usePathname();
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = useRef(false);

  const finish = useCallback(() => {
    if (!loading.current) return;
    loading.current = false;
    if (timer.current) clearInterval(timer.current);
    if (hide.current) clearTimeout(hide.current);
    setPct(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 400);
  }, []);

  const start = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    if (hide.current) clearTimeout(hide.current);
    setVisible(true);
    setPct(10);
    // Sicherheitsnetz: nach 10 Sekunden verschwindet der Balken in jedem Fall
    hide.current = setTimeout(finish, 10000);
    timer.current = setInterval(() => {
      setPct((p) => (p < 85 ? p + (90 - p) * 0.12 : p));
    }, 250);
  }, [finish]);

  useEffect(() => {
    finish();
  }, [pathname, finish]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;
      start();
    }
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (timer.current) clearInterval(timer.current);
      if (hide.current) clearTimeout(hide.current);
    };
  }, [start]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 300ms ease-out" }}
    >
      <div className="h-full bg-hud-accent" style={{ width: `${pct}%`, transition: "width 300ms ease-out" }} />
      {/* leuchtende Spitze */}
      <div
        className="absolute top-1/2 h-1.5 w-16 -translate-y-1/2 -translate-x-full rounded-full bg-gradient-to-r from-transparent to-white/90 blur-[2px]"
        style={{ left: `${pct}%`, transition: "left 300ms ease-out" }}
      />
    </div>
  );
}
