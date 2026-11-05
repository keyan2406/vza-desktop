import type { MetadataRoute } from "next";

// Das Org-Tool ist nicht öffentlich und soll nicht in Suchmaschinen auftauchen.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
