"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRAND } from "../../utils/brand";
import Monogram from "./Monogram";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleUser,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Rocket,
  ScrollText,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  Warehouse,
  X,
  type LucideIcon,
} from "lucide-react";

type Role = "member" | "officer" | "admin";
type Item = { label: string; href: string; icon: LucideIcon };

const main: Item[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Operationen", href: "/operationen", icon: CalendarClock },
  { label: "Kalender", href: "/kalender", icon: CalendarDays },
  { label: "Flotte & Hangare", href: "/hangar", icon: Rocket },
  { label: "Lager & Claims", href: "/lager", icon: Warehouse },
  { label: "Blaupausen", href: "/blueprints", icon: ScrollText },
  { label: "Rangliste", href: "/rangliste", icon: Trophy },
];

const staff: Item[] = [
  { label: "Operationen verwalten", href: "/operationen/verwalten", icon: ClipboardList },
  { label: "Lager verwalten", href: "/lager/verwalten", icon: PackageCheck },
  { label: "Kassenbuch", href: "/kassenbuch", icon: Wallet },
];

const adminOnly: Item[] = [{ label: "Benutzerverwaltung", href: "/benutzer", icon: Users }];

const roleLabel: Record<Role, string> = {
  member: "Mitglied",
  officer: "Offizier",
  admin: "Admin",
};

// Der längste passende Pfad gewinnt, damit "/operationen/verwalten" nicht auch "Operationen" markiert.
function activeHref(pathname: string, items: Item[]) {
  let best = "";
  for (const i of items) {
    if ((pathname === i.href || pathname.startsWith(`${i.href}/`)) && i.href.length > best.length) {
      best = i.href;
    }
  }
  return best;
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-active={active}
      className="group relative flex items-center gap-3 px-3 py-2.5 font-display text-[1.05rem] font-semibold uppercase leading-tight tracking-wider text-hud-muted transition-all duration-200 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:origin-center before:scale-y-0 before:bg-hud-accent before:transition-transform before:duration-200 hover:bg-white/5 hover:text-hud-text data-[active=true]:bg-hud-accent/10 data-[active=true]:text-hud-accent data-[active=true]:before:scale-y-100"
    >
      <Icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

function Menu_({
  role,
  active,
  groupOpen,
  onToggleGroup,
}: {
  role: Role;
  active: string;
  groupOpen: boolean;
  onToggleGroup: () => void;
}) {
  const verwaltung = role === "admin" ? [...staff, ...adminOnly] : staff;
  return (
    <nav aria-label="Hauptmenü" className="flex flex-col gap-1">
      {main.map((i) => (
        <NavLink key={i.href} item={i} active={active === i.href} />
      ))}

      {role !== "member" && (
        <div className="mt-4 border-t border-hud-line pt-4">
          <button
            type="button"
            onClick={onToggleGroup}
            aria-expanded={groupOpen}
            aria-controls="nav-verwaltung"
            className="flex w-full items-center gap-3 px-3 py-2.5 font-display text-[1.05rem] font-semibold uppercase tracking-wider text-hud-amber transition-colors hover:bg-hud-amber/10"
          >
            <ShieldCheck className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className="flex-1 text-left">Verwaltung</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${groupOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          <div
            id="nav-verwaltung"
            className={`grid transition-[grid-template-rows] duration-300 ease-out ${
              groupOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden" inert={!groupOpen}>
              <div className="flex flex-col gap-1 pb-1 pl-3 pt-1">
                {verwaltung.map((i) => (
                  <NavLink key={i.href} item={i} active={active === i.href} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function UserCard({ username, role }: { username: string; role: Role }) {
  return (
    <div className="border-t border-hud-line pt-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center border border-hud-accent/60 bg-hud-accent/10 font-display text-lg font-bold uppercase text-hud-accent"
        >
          {username.trim().charAt(0) || "?"}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold leading-tight tracking-wide">{username}</p>
          <span className="inline-block border border-hud-amber/60 px-1.5 font-display text-[0.7rem] font-semibold uppercase tracking-widest text-hud-amber">
            {roleLabel[role]}
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href="/profil"
          className="hud-btn-ghost hud-btn-sm flex-1 gap-2"
          aria-label="Profil bearbeiten"
        >
          <CircleUser className="h-4 w-4" aria-hidden />
          Profil
        </Link>
        <form action="/auth/signout" method="post">
          <button className="hud-btn-ghost hud-btn-sm gap-2" aria-label="Abmelden">
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="sr-only">Abmelden</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <span className="hud-ring">
        <Monogram size={40} />
      </span>
      <div>
        <p className="font-display text-2xl font-bold uppercase leading-none tracking-[0.2em] text-hud-accent">
          {BRAND.short}
        </p>
        <p className="hud-label mt-1">{BRAND.clan}</p>
      </div>
    </div>
  );
}

export default function SideNav({ role, username }: { role: Role; username: string }) {
  const pathname = usePathname();
  const items = [...main, ...staff, ...adminOnly];
  const active = activeHref(pathname, items);
  const inGroup = [...staff, ...adminOnly].some((i) => i.href === active);

  const [groupOpen, setGroupOpen] = useState(inGroup);
  const [drawer, setDrawer] = useState(false);

  // Gruppe öffnet sich von allein, wenn man eine ihrer Seiten besucht, und das Handy-Menü schließt nach dem Seitenwechsel.
  // Beides wird beim Aufbau abgeleitet (kein zusätzlicher Durchlauf wie bei einem Effekt).
  const [seenGroup, setSeenGroup] = useState(inGroup);
  if (inGroup !== seenGroup) {
    setSeenGroup(inGroup);
    if (inGroup) setGroupOpen(true);
  }
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setDrawer(false);
  }

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawer]);

  return (
    <>
      {/* Computer: feste Seitenleiste */}
      <aside className="hidden shrink-0 flex-col gap-6 border-r border-hud-line bg-hud-panel/80 p-5 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:overflow-y-auto">
        <Logo />
        <div className="flex-1">
          <Menu_ role={role} active={active} groupOpen={groupOpen} onToggleGroup={() => setGroupOpen((o) => !o)} />
        </div>
        <UserCard username={username} role={role} />
      </aside>

      {/* Handy: Kopfleiste mit ausklappbarem Menü */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hud-line bg-hud-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Menü öffnen"
          aria-expanded={drawer}
          aria-controls="mobile-menu"
          className="hud-btn-ghost hud-btn-sm"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div
        className={`fixed inset-0 z-40 md:hidden ${drawer ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!drawer}
        inert={!drawer}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label="Menü schließen"
          onClick={() => setDrawer(false)}
          className={`absolute inset-0 bg-black/70 transition-opacity duration-300 ${drawer ? "opacity-100" : "opacity-0"}`}
        />
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menü"
          className={`absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col gap-6 overflow-y-auto border-r border-hud-line bg-hud-panel p-5 transition-transform duration-300 ease-out ${
            drawer ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <Logo />
            <button
              type="button"
              onClick={() => setDrawer(false)}
              aria-label="Menü schließen"
              className="hud-btn-ghost hud-btn-sm"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="flex-1">
            <Menu_ role={role} active={active} groupOpen={groupOpen} onToggleGroup={() => setGroupOpen((o) => !o)} />
          </div>
          <UserCard username={username} role={role} />
        </div>
      </div>
    </>
  );
}
