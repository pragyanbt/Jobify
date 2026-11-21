import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateIp } from "@/lib/net";
import { parseJsonLdJob } from "@/lib/jobsearch/fromUrl";

describe("isPrivateIp / assertPublicUrl", () => {
  it("blocks loopback, LAN, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.206", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    expect(isPrivateIp("140.82.112.3")).toBe(false);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });

  it("rejects non-http schemes, credentials and local hosts", async () => {
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("http://localhost:3000/api")).rejects.toThrow(/local/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("https://user:pw@example.com")).rejects.toThrow(/credentials/);
  });
});

describe("parseJsonLdJob", () => {
  it("reads schema.org JobPosting, including inside @graph", () => {
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "x" },
        {
          "@type": "JobPosting",
          title: "Java Developer",
          description: "<p>Build &amp; ship <b>Spring Boot</b> services.</p><ul><li>5+ years Java</li></ul>",
          datePosted: "2026-11-18",
          hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
          jobLocation: [{ address: { addressLocality: "Dallas", addressRegion: "TX", addressCountry: "US" } }],
        },
      ],
    };
    const html = `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`;
    const j = parseJsonLdJob(html, "https://careers.acme.com/jobs/1")!;
    expect(j.title).toBe("Java Developer");
    expect(j.company).toBe("Acme Corp");
    expect(j.location).toBe("Dallas, TX, US");
    expect(j.description).toBe("Build & ship Spring Boot services.\n- 5+ years Java");
    expect(j.postedAt).toBe("2026-11-18");
    expect(j.via).toBe("structured-data");
  });

  it("returns null when there's no JobPosting", () => {
    expect(parseJsonLdJob('<script type="application/ld+json">{"@type":"Organization"}</script>', "https://x.com")).toBeNull();
  });
});
