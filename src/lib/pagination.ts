// Read complete shared collections without relying on the project's API row cap.
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 499);
    if (error) return { data: null, error };
    if (!data?.length) return { data: rows, error: null };
    rows.push(...(data as T[]));
  }
}
