import type { Metadata, Viewport } from "next";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-600.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "./globals.css";
import { BRAND } from "../utils/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND.tool}`, template: `%s · ${BRAND.short}` },
  description: `${BRAND.clan} · ${BRAND.slogan}`,
  robots: { index: false, follow: false },
  applicationName: BRAND.tool,
  appleWebApp: { capable: true, title: BRAND.short, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#05090e", colorScheme: "dark" };

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <head>
        {/* Gespeicherte Einstellung "Animationen aus" sofort anwenden, noch vor dem ersten Zeichnen */}
        <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('vza-motion')==='off')document.documentElement.dataset.motion='off'}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
