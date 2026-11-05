// Supabase liefert pro Abfrage höchstens 1000 Zeilen. Diese Hilfe holt bei Bedarf Seite für Seite nach.
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  size = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) break;
    all.push(...(data as T[]));
    if (data.length < size) break;
  }
  return all;
}
