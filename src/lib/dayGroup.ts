export function dayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // YYYY-MM-DD en zona local
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function dayLabel(key: string): string {
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (key === today) return "Hoy";
  if (key === yesterday) return "Ayer";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function groupByDay<T>(items: T[], dateOf: (t: T) => string | Date | null | undefined): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const d = dateOf(it);
    if (!d) continue;
    const k = dayKey(d);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // newest day first
    .map(([key, items]) => ({ key, label: dayLabel(key), items }));
}
