"use client";

import { useState, useTransition } from "react";
import { claimLoot, withdrawClaim } from "../(app)/lager/actions";

// Zeigt "Claimen" oder, wenn du schon geclaimt hast, "Claim zurückziehen".
export default function ClaimButton({
  itemId,
  mine,
}: {
  itemId: number;
  mine: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        className={mine ? "hud-btn-ghost hud-btn-sm" : "hud-btn hud-btn-sm"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = mine ? await withdrawClaim(itemId) : await claimLoot(itemId);
            setError(res.error);
          })
        }
      >
        {pending ? "Moment …" : mine ? "Claim zurückziehen" : "Claimen"}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-hud-danger">
          {error}
        </p>
      )}
    </div>
  );
}
