type BrandLink = { kind: string; url: string };

const FETCH_TIMEOUT_MS = 2500;

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    return host !== "localhost"
      && host !== "127.0.0.1"
      && host !== "::1"
      && !host.startsWith("10.")
      && !host.startsWith("192.168.")
      && !host.startsWith("169.254.")
      && !/^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  } catch {
    return false;
  }
}

function extractAttribute(tag: string, attribute: string): string | null {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() || null;
}

function extractMetaContent(html: string, property: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = extractAttribute(tag, "property") ?? extractAttribute(tag, "name");
    if (name?.toLowerCase() === property.toLowerCase()) return extractAttribute(tag, "content");
  }
  return null;
}

/** Pure HTML metadata extraction, kept exported so the crawler remains easy to test. */
export function extractBrandImageUrl(html: string, pageUrl: string): string | null {
  const candidates = [
    extractMetaContent(html, "og:image"),
    extractMetaContent(html, "twitter:image"),
    extractMetaContent(html, "twitter:image:src"),
  ];

  const iconTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of iconTags) {
    const rel = extractAttribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    if (rel.includes("icon") || rel.includes("apple-touch-icon")) candidates.push(extractAttribute(tag, "href"));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = new URL(candidate, pageUrl).toString();
      if (isSafeWebUrl(resolved)) return resolved;
    } catch {
      // Ignore malformed metadata and continue to the next candidate.
    }
  }
  return null;
}

export async function discoverBrandImageUrl(links: readonly BrandLink[]): Promise<string | null> {
  const website = links.find((link) => link.kind.trim().toUpperCase() === "WEBSITE" && isSafeWebUrl(link.url));
  if (!website) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(website.url, {
      headers: { accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    if (!isSafeWebUrl(response.url || website.url)) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
    const html = (await response.text()).slice(0, 512_000);
    return extractBrandImageUrl(html, response.url || website.url);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
