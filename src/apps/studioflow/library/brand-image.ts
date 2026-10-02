import { isSafeWebUrl } from "./safe-fetch";

export { isSafeWebUrl };

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
