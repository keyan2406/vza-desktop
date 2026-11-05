import type { SupabaseClient } from "@supabase/supabase-js";

export type MyStats = {
  level: number;
  totalPoints: number;
  opsCount: number;
  currentMin: number;
  next: { level: number; minPoints: number } | null;
};

// Punkte, Level und Fortschritt zum nächsten Level für einen Spieler.
export async function getMyStats(
  supabase: SupabaseClient,
  userId: string
): Promise<MyStats> {
  const [statRes, thRes] = await Promise.all([
    supabase
      .from("player_stats")
      .select("level, total_points, ops_count")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("level_thresholds").select("level, min_points").order("level"),
  ]);

  const level = (statRes.data?.level as number | undefined) ?? 1;
  const thresholds = (thRes.data ?? []) as { level: number; min_points: number }[];
  const current = thresholds.find((t) => t.level === level);
  const next = thresholds.find((t) => t.level === level + 1);

  return {
    level,
    totalPoints: (statRes.data?.total_points as number | undefined) ?? 0,
    opsCount: (statRes.data?.ops_count as number | undefined) ?? 0,
    currentMin: current?.min_points ?? 0,
    next: next ? { level: next.level, minPoints: next.min_points } : null,
  };
}
