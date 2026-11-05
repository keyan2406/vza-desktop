import FanNotice from "./FanNotice";
import NavProgress from "./NavProgress";
import PageTransition from "./PageTransition";
import SideNav from "./SideNav";

// Fester Rahmen: Menü bleibt stehen, nur der Inhalt wechselt (mit Ladeanzeige und Übergang).
export default function AppShell({
  role,
  username,
  children,
}: {
  role: "member" | "officer" | "admin";
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <NavProgress />
      <SideNav role={role} username={username} />
      <main className="min-w-0 flex-1 p-5 md:p-8">
        <PageTransition>{children}</PageTransition>
        <FanNotice className="mt-16 border-t border-hud-line pt-4" />
      </main>
    </div>
  );
}
