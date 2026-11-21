import { describe, expect, it, vi } from "vitest";

// Blocked sites fall back to "paste the posting"; pasted text is extracted by Claude (mocked).

const extract = vi.fn();
vi.mock("@/lib/ai/operations", () => ({ extractJobFromPage: (...a: unknown[]) => extract(...a) }));
vi.mock("@/lib/net", () => ({
  safeFetchText: vi.fn(async () => { throw new Error("The page returned HTTP 403."); }),
}));

const { fetchJobFromUrl, jobFromPastedText, ManualEntryNeeded } = await import("@/lib/jobsearch/fromUrl");

const POSTING = "Software Engineer\nFidelity Investments · Boston, MA\n\n" + "Build and run Java services for retirement products. ".repeat(10);

describe("blocked job sites", () => {
  it("turns an HTTP 403 into a paste-the-posting prompt naming the site", async () => {
    const err = await fetchJobFromUrl("https://jobs.fidelity.com/en/jobs/2135222/software-engineer/").catch((e) => e);
    expect(err).toBeInstanceOf(ManualEntryNeeded);
    expect(err.message).toMatch(/jobs\.fidelity\.com blocks automated reading/);
    expect(err.message).toMatch(/paste it below/);
  });
});

describe("jobFromPastedText", () => {
  it("extracts the posting and keeps the link", async () => {
    extract.mockResolvedValueOnce({
      isJobPosting: true, title: "Software Engineer", company: "Fidelity Investments", location: "Boston, MA",
      remote: false, description: "Build and run Java services for retirement products. ".repeat(4),
    });
    const j = await jobFromPastedText(POSTING, "https://jobs.fidelity.com/en/jobs/2135222/software-engineer/");
    expect(j).toMatchObject({ title: "Software Engineer", company: "Fidelity Investments", via: "pasted", externalKey: null });
    expect(j.url).toContain("2135222");
  });

  it("rejects text that's too short or isn't a posting", async () => {
    await expect(jobFromPastedText("Software Engineer at Fidelity", "")).rejects.toBeInstanceOf(ManualEntryNeeded);
    extract.mockResolvedValueOnce({ isJobPosting: false, title: "", company: "", location: "", remote: false, description: "" });
    await expect(jobFromPastedText(POSTING, "")).rejects.toThrow(/doesn't look like a single job posting/);
  });
});
