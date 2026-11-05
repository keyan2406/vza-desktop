// Sicherheits-Kopfzeilen für alle Antworten der Seite.
// Bewusst ohne "script-src": Die Seite braucht Inline-Skripte von Next.js, ein strenger Skript-Schutz würde sie lahmlegen.
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000",
  "Cross-Origin-Opener-Policy": "same-origin",
  // Die Seite darf in keinem fremden Rahmen erscheinen, keine fremde Basisadresse bekommen und keine Plug-ins laden
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};

export function applySecurityHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
}
