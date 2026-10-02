import { isSafeWebUrl } from "./brand-image";

type BrandLink = { kind: string; url: string };

const FETCH_TIMEOUT_MS = 3500;
const MAX_HTML_BYTES = 512_000;
const MAX_OFFERINGS = 12;
const GENERIC_LABELS = new Set(["home", "about", "contact", "login", "menu", "shop", "products", "services"]);

export type WebsiteCatalogue = {
  sourceUrl: string;
  offerings: string[];
};

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanLabel(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function addLabel(labels: string[], value: unknown) {
  if (typeof value !== "string") return;
  const label = cleanLabel(value);
  const normalized = label.toLocaleLowerCase();
  if (!label || label.length > 80 || GENERIC_LABELS.has(normalized) || labels.some((item) => item.toLocaleLowerCase() === normalized)) return;
  labels.push(label);
}

function collectStructuredOfferings(value: unknown, labels: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectStructuredOfferings(item, labels));
    return;
  }

  const record = value as Record<string, unknown>;
  const type = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  if (type.some((item) => typeof item === "string" && ["product", "offer", "itemlist"].includes(item.toLowerCase()))) {
    addLabel(labels, record.name);
    addLabel(labels, record.category);
    if (typeof record.keywords === "string") record.keywords.split(/[,|;]/).forEach((item) => addLabel(labels, item));
  }
  Object.values(record).forEach((item) => collectStructuredOfferings(item, labels));
}

/** Extracts public catalogue hints without changing or persisting Brand data. */
export function extractWebsiteCatalogue(html: string, sourceUrl: string): WebsiteCatalogue {
  const offerings: string[] = [];
  const headings = html.match(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi) ?? [];
  headings.forEach((heading) => addLabel(offerings, heading));

  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  scripts.forEach((script) => {
    const body = script.replace(/^<[\s\S]*?>|<\/script>$/gi, "").trim();
    try {
      collectStructuredOfferings(JSON.parse(body), offerings);
    } catch {
      // Invalid JSON-LD is common on public websites; headings remain useful.
    }
  });

  return { sourceUrl, offerings: offerings.slice(0, MAX_OFFERINGS) };
}

export async function discoverBrandWebsiteCatalogue(links: readonly BrandLink[]): Promise<WebsiteCatalogue | null> {
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
    if (!response.ok || !isSafeWebUrl(response.url || website.url)) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    const catalogue = extractWebsiteCatalogue(html, response.url || website.url);
    return catalogue.offerings.length > 0 ? catalogue : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
