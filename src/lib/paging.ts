import "server-only";

/** Supabase trả tối đa 1.000 dòng/lần → đọc lần lượt từng khối đến khi hết (hoặc chạm `max`). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  max = 20_000,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export const PAGE_SIZE = 100;

export function pageOf(raw: string | undefined) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}
