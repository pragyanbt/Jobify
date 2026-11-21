export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const h = mins / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  return d < 30 ? `${Math.round(d)}d ago` : new Date(iso).toLocaleDateString();
}
