import { describe, expect, it } from "vitest";
import { filterAndScore, locationOk, titleMatches } from "@/lib/jobsearch/match";
import { htmlToText } from "@/lib/jobsearch/html";
import type { Listing } from "@/lib/jobsearch/sources";
import { DEFAULT_JOB_SEARCH, type JobSearchSettings } from "@/lib/types";

const S: JobSearchSettings = {
  ...DEFAULT_JOB_SEARCH,
  keywords: ["Java Developer", "Full Stack Engineer", "Backend Engineer"],
  excludeKeywords: ["Principal", "Intern", "Manager"],
  locations: ["Dallas, TX"],
  includeRemote: true,
  maxAgeDays: 14,
};

const NOW = new Date("2026-11-20T12:00:00Z");
const L = (p: Partial<Listing>): Listing => ({
  externalKey: Math.random().toString(),
  source: "greenhouse:x",
  company: "X",
  title: "Software Engineer",
  location: "Dallas, TX",
  remote: false,
  url: "https://x",
  postedAt: new Date("2026-11-18T12:00:00Z"),
  ...p,
});

describe("titleMatches", () => {
  it("treats developer/engineer and full-stack spellings as equivalent", () => {
    expect(titleMatches("Senior Full-Stack Developer", "Full Stack Engineer")).toBe(true);
    expect(titleMatches("Software Engineer, Backend (Java)", "Java Developer")).toBe(true);
    expect(titleMatches("Back-End Engineer", "Backend Engineer")).toBe(true);
    expect(titleMatches("JavaScript Engineer", "Java Developer")).toBe(false);
    expect(titleMatches("Data Scientist", "Java Developer")).toBe(false);
  });
});

describe("locationOk", () => {
  it("accepts the configured city and region-appropriate remote roles", () => {
    expect(locationOk({ location: "Dallas, Texas", remote: false }, S)).toEqual({ ok: true, local: true });
    expect(locationOk({ location: "New York, NY", remote: false }, S).ok).toBe(false);
    expect(locationOk({ location: "Remote", remote: true }, S).ok).toBe(true);
    expect(locationOk({ location: "Remote - US", remote: true }, S).ok).toBe(true);
    expect(locationOk({ location: "Remote (United States)", remote: true }, S).ok).toBe(true);
    expect(locationOk({ location: "Remote - Germany", remote: true }, S).ok).toBe(false);
    expect(locationOk({ location: "Remote, Europe", remote: true }, { ...S, includeRemote: false }).ok).toBe(false);
  });
});

describe("filterAndScore", () => {
  it("keeps recent, matching, non-excluded jobs and ranks local above remote", () => {
    const out = filterAndScore(
      [
        L({ title: "Java Developer" }),
        L({ title: "Java Developer", location: "Remote - US", remote: true }),
        L({ title: "Principal Java Developer" }),
        L({ title: "Java Developer", postedAt: new Date("2026-10-01T00:00:00Z") }),
        L({ title: "Product Manager" }),
      ],
      S,
      NOW,
    );
    expect(out).toHaveLength(2);
    expect(out[0].relevance).toBeGreaterThan(out[1].relevance);
  });
});

describe("htmlToText", () => {
  it("decodes Greenhouse's entity-escaped HTML into readable text", () => {
    const t = htmlToText("&lt;h2&gt;About&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;Java &amp;amp; Spring&lt;/li&gt;&lt;li&gt;AWS&lt;/li&gt;&lt;/ul&gt;");
    expect(t).toBe("About\n- Java & Spring\n- AWS");
  });
});
