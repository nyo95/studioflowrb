export type BrandLinkDraft = { kind: string; url: string; label: string };

type NormalizedUrl = { ok: true; value: string } | { ok: false; error: string };
type NormalizedLinks = { ok: true; value: BrandLinkDraft[] } | { ok: false; error: string };

export function normalizeBrandLinkUrl(value: string): NormalizedUrl {
  const entered = value.trim();
  if (!entered) return { ok: false, error: "Enter a website address." };

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(entered) ? entered : `https://${entered}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return { ok: false, error: "Use an HTTP(S) website address." };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: "Enter a valid website address, for example example.com." };
  }
}

export function normalizeBrandLinks(links: readonly BrandLinkDraft[]): NormalizedLinks {
  const normalized: BrandLinkDraft[] = [];
  for (const link of links) {
    const url = normalizeBrandLinkUrl(link.url);
    if (!url.ok) return url;
    normalized.push({ ...link, url: url.value, label: link.label.trim() });
  }
  return { ok: true, value: normalized };
}
