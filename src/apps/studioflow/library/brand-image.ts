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

function safe(candidate: string | null, pageUrl: string): string | null {
  if (!candidate) return null;
  try { const resolved = new URL(candidate, pageUrl).toString(); return isSafeWebUrl(resolved) ? resolved : null; } catch { return null; }
}

function stringsFromLogo(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return [object.url, object.contentUrl].filter((item): item is string => typeof item === "string");
  }
  return [];
}

function jsonLdLogos(html: string): string[] {
  const scripts = html.match(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const values: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object") return;
    const object = node as Record<string, unknown>;
    const types = Array.isArray(object["@type"]) ? object["@type"] : [object["@type"]];
    if (types.some((type) => typeof type === "string" && /^(Organization|Brand|WebSite|LocalBusiness)$/i.test(type))) values.push(...stringsFromLogo(object.logo));
    visit(object["@graph"]);
  };
  for (const script of scripts) {
    const body = script.replace(/^.*?>/s, "").replace(/<\/script>$/i, "");
    try { visit(JSON.parse(body)); } catch { /* malformed publisher metadata is ignorable */ }
  }
  return values;
}

function logoTags(html: string): string[] {
  const tags = html.match(/<(?:img|link|source)\b[^>]*>/gi) ?? [];
  const ranked = tags.map((tag) => {
    const src = extractAttribute(tag, "src") ?? extractAttribute(tag, "href");
    const hint = [extractAttribute(tag, "class"), extractAttribute(tag, "id"), extractAttribute(tag, "alt"), src].filter(Boolean).join(" ").toLowerCase();
    if (!/logo/.test(hint) || /banner|hero|slider|product|sprite/.test(hint)) return null;
    const context = html.slice(Math.max(0, html.indexOf(tag) - 400), html.indexOf(tag)).toLowerCase();
    return { src, score: /<header|<nav|href\s*=\s*["'][^"']*\/?["']/.test(context) ? 1 : 0 };
  }).filter((item): item is { src: string | null; score: number } => item !== null).sort((a, b) => b.score - a.score);
  return ranked.map((item) => item.src).filter((item): item is string => Boolean(item));
}

function iconTags(html: string): string[] {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  const scored = tags.map((tag) => {
    const rel = extractAttribute(tag, "rel")?.toLowerCase().split(/\s+/) ?? [];
    const href = extractAttribute(tag, "href");
    if (!href || (!rel.includes("icon") && !rel.includes("apple-touch-icon"))) return null;
    const size = Number((extractAttribute(tag, "sizes") ?? "0").match(/\d+/)?.[0] ?? 0);
    const type = `${href} ${extractAttribute(tag, "type") ?? ""}`.toLowerCase();
    return { href, score: (rel.includes("apple-touch-icon") ? 1_000_000 : 0) + size + (/svg|png/.test(type) ? 10_000 : 0) };
  }).filter((item): item is { href: string; score: number } => item !== null).sort((a, b) => b.score - a.score);
  return scored.map((item) => item.href);
}

/** Pure HTML metadata extraction, kept exported so the crawler remains easy to test. */
export function extractBrandImageUrl(html: string, pageUrl: string): string | null {
  const candidates = [...jsonLdLogos(html), ...logoTags(html), ...iconTags(html), extractMetaContent(html, "og:image"), extractMetaContent(html, "twitter:image"), extractMetaContent(html, "twitter:image:src")];
  for (const candidate of candidates) { const resolved = safe(candidate, pageUrl); if (resolved) return resolved; }
  return null;
}
