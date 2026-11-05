"use client";

import { usePathname } from "next/navigation";

// Neuer Seiteninhalt blendet weich ein, statt hart zu erscheinen.
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="hud-page">
      {children}
    </div>
  );
}
