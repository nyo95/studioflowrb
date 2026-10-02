import { extractBrandImageUrl } from "./brand-image";
import { fetchPublicHtml } from "./safe-fetch";
import { extractWebsiteCatalogue, type WebsiteCatalogue } from "./website-catalogue";

type BrandLink = { kind: string; url: string };
export type WebsiteSnapshot = { imageUrl: string | null; catalogue: WebsiteCatalogue | null };

const EMPTY: WebsiteSnapshot = { imageUrl: null, catalogue: null };
const FETCH_TIMEOUT_MS = 3500;
const MAX_HTML_BYTES = 512_000;
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const MAX_CONCURRENT = 5;

const cache = new Map<string, { expires: number; value: Promise<WebsiteSnapshot> }>();
let active = 0;
const waiting: Array<() => void> = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await task();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

async function readWebsite(url: string): Promise<WebsiteSnapshot> {
  const page = await fetchPublicHtml(url, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_HTML_BYTES });
  if (!page) return EMPTY;
  const catalogue = extractWebsiteCatalogue(page.html, page.finalUrl);
  return {
    imageUrl: extractBrandImageUrl(page.html, page.finalUrl),
    catalogue: catalogue.offerings.length > 0 ? catalogue : null,
  };
}

/** One bounded, cached, read-only fetch per Brand website, shared by the image and catalogue readers. */
export function discoverBrandWebsite(links: readonly BrandLink[]): Promise<WebsiteSnapshot> {
  const website = links.find((link) => link.kind.trim().toUpperCase() === "WEBSITE");
  if (!website) return Promise.resolve(EMPTY);

  const now = Date.now();
  const cached = cache.get(website.url);
  if (cached && cached.expires > now) return cached.value;

  const value = withSlot(() => readWebsite(website.url));
  cache.set(website.url, { expires: now + MISS_TTL_MS, value });
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  void value.then((snapshot) => {
    const entry = cache.get(website.url);
    if (entry?.value === value && (snapshot.imageUrl || snapshot.catalogue)) entry.expires = Date.now() + HIT_TTL_MS;
  });
  return value;
}
