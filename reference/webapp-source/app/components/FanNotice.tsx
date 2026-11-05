import { FAN_NOTICE } from "../../utils/brand";

// Kleiner Hinweis am Seitenende, dass dies keine offizielle Seite von Cloud Imperium ist.
export default function FanNotice({ className = "" }: { className?: string }) {
  return <p className={`max-w-3xl text-xs leading-relaxed text-hud-muted/70 ${className}`}>{FAN_NOTICE}</p>;
}
