import type { MetadataRoute } from "next";
import { BRAND } from "../utils/brand";

// Macht die Seite als App installierbar (Chrome und Edge: Menü → "Installieren"). Sie bekommt dann ein eigenes Fenster und ein Symbol.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.tool,
    short_name: BRAND.short,
    description: `${BRAND.clan} · ${BRAND.slogan}`,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#05090e",
    theme_color: "#05090e",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Operationen", url: "/operationen" },
      { name: "Blaupausen", url: "/blueprints" },
      { name: "Lager", url: "/lager" },
    ],
  };
}
