import type { JobSearchSettings } from "../types";
import type { Listing } from "./sources";

// Cheap, deterministic filtering of search results before anything is saved.
// This is title/location relevance only; resume fit comes from the Claude
// analysis when the user opens a job.

export function normalizeTitle(s: string): string {
  return ` ${s.toLowerCase()} `
    .replace(/full[\s-]?stack/g, "fullstack")
    .replace(/back[\s-]?end/g, "backend")
    .replace(/front[\s-]?end/g, "frontend")
    .replace(/\bsr\.?\s/g, "senior ")
    .replace(/\bjr\.?\s/g, "junior ")
    .replace(/\bswe\b/g, "software engineer")
    .replace(/\bsde\b/g, "software engineer")
    .replace(/\b(developer|programmer|dev|engineering)\b/g, "engineer")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ");
}

const tokens = (s: string) => normalizeTitle(s).trim().split(" ").filter(Boolean);

/** All of the keyword's words appear in the title (any order). */
export function titleMatches(title: string, keyword: string): boolean {
  const t = new Set(tokens(title));
  const k = tokens(keyword);
  return k.length > 0 && k.every((w) => t.has(w));
}

export function locationOk(l: Pick<Listing, "location" | "remote">, s: JobSearchSettings): { ok: boolean; local: boolean } {
  const loc = l.location.toLowerCase();
  const local = s.locations.some((want) => {
    const city = want.split(",")[0].trim().toLowerCase();
    return city.length > 1 && loc.includes(city);
  });
  if (local) return { ok: true, local: true };
  if (l.remote && s.includeRemote) {
    // Remote must be open to one of the user's regions. "Remote" with no region counts.
    const rest = loc.replace(/remote|hybrid|anywhere|[()\-–,/|]/g, " ").trim();
    const regionOk =
      rest === "" ||
      s.remoteRegions.some((r) => new RegExp(`(^|[^a-z])${r.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(loc));
    return { ok: regionOk, local: false };
  }
  return { ok: s.locations.length === 0, local: false };
}

export interface Scored {
  listing: Listing;
  relevance: number;
}

export function filterAndScore(listings: Listing[], s: JobSearchSettings, now = new Date()): Scored[] {
  const maxAgeMs = s.maxAgeDays * 86_400_000;
  const out: Scored[] = [];
  for (const l of listings) {
    if (l.postedAt && now.getTime() - l.postedAt.getTime() > maxAgeMs) continue;
    const hits = s.keywords.filter((k) => titleMatches(l.title, k));
    if (hits.length === 0) continue;
    if (s.excludeKeywords.some((x) => x.trim() && titleMatches(l.title, x))) continue;
    const loc = locationOk(l, s);
    if (!loc.ok) continue;

    const phrase = hits.some((k) => normalizeTitle(l.title).includes(normalizeTitle(k).trim()));
    const ageFrac = l.postedAt ? Math.max(0, 1 - (now.getTime() - l.postedAt.getTime()) / maxAgeMs) : 0.3;
    const relevance = Math.round(55 + (phrase ? 15 : 0) + (loc.local ? 15 : l.remote ? 8 : 0) + ageFrac * 15);
    out.push({ listing: l, relevance: Math.min(100, relevance) });
  }
  return out;
}
