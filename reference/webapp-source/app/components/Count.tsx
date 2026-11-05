import type { CSSProperties } from "react";

// Eine Zahl, die beim Erscheinen von 0 hochzählt (reines CSS, siehe .hud-count). Für ganze Zahlen von 0 aufwärts.
// Der echte Wert steht für Screenreader im Text, sichtbar ist der zählende Wert.
export default function Count({ value, className }: { value: number; className?: string }) {
  const n = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const style = { "--to": n, "--digits": String(n).length } as CSSProperties;
  return (
    <span className={`hud-count${className ? ` ${className}` : ""}`} style={style}>
      <span className="sr-only">{n}</span>
    </span>
  );
}
