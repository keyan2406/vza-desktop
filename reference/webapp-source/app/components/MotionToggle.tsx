"use client";

import { useSyncExternalStore } from "react";

export const MOTION_KEY = "vza-motion";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("vza-motion", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("vza-motion", cb);
  };
};
const isOff = () => {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "off";
  } catch {
    return false;
  }
};

// Schaltet alle Animationen der Seite aus oder an (gilt für diesen Browser)
export default function MotionToggle() {
  const off = useSyncExternalStore(subscribe, isOff, () => false);

  function set(next: boolean) {
    try {
      if (next) window.localStorage.setItem(MOTION_KEY, "off");
      else window.localStorage.removeItem(MOTION_KEY);
    } catch {
      // Ohne Speicher gilt die Einstellung nur bis zum Neuladen
    }
    if (next) document.documentElement.dataset.motion = "off";
    else delete document.documentElement.dataset.motion;
    window.dispatchEvent(new Event("vza-motion"));
  }

  return (
    <label className="flex max-w-2xl cursor-pointer items-start gap-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-hud-accent" checked={!off} onChange={(e) => set(!e.target.checked)} />
      <span>
        <span className="font-medium">Animationen</span>
        <span className="block text-sm text-hud-muted">
          Bewegte Hintergründe, Zähler und Übergänge. Schalte sie aus, wenn dein Rechner dadurch langsamer wird oder sie dich stören. Das gilt für
          diesen Browser. Hast du in Windows „Animationen anzeigen“ ausgeschaltet, bleiben sie ohnehin aus.
        </span>
      </span>
    </label>
  );
}
