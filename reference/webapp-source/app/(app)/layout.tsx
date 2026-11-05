import { Suspense } from "react";
import { requireProfile } from "../../utils/auth";
import AppShell from "../components/AppShell";

// Gemeinsamer Rahmen für alle Seiten nach dem Login. Menü und Kopf bleiben beim Wechseln stehen.
async function Frame({ children }: { children: React.ReactNode }) {
  const { username, role } = await requireProfile();
  return (
    <AppShell role={role} username={username}>
      {children}
    </AppShell>
  );
}

function FrameSkeleton() {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-64 shrink-0 border-r border-hud-line bg-hud-panel/80 p-5 md:block">
        <div className="hud-skeleton h-6 w-40" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="hud-skeleton h-9 w-full" />
          ))}
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-5 md:p-8">
        <div className="hud-skeleton h-9 w-64" />
        <div className="mt-8 grid max-w-3xl gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="hud-skeleton h-28 border border-hud-line" />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<FrameSkeleton />}>
      <Frame>{children}</Frame>
    </Suspense>
  );
}
