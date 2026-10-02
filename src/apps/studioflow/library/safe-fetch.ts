import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_REDIRECTS = 3;

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isPublicIpv4(ip: string): boolean {
  const p = ipv4Parts(ip);
  if (!p) return false;
  const [a, b, c] = p as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const value = ip.toLowerCase().split("%")[0] ?? "";
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1] as string);
  const hexMapped = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const high = parseInt(hexMapped[1] as string, 16);
    const low = parseInt(hexMapped[2] as string, 16);
    return isPublicIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (value === "::" || value === "::1") return false;
  const first = parseInt(value.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (value.startsWith("2001:db8")) return false; // documentation
  return true;
}

/** True only for globally routable addresses. Anything unparsable is treated as unsafe. */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicIpv4(ip);
  if (family === 6) return isPublicIpv6(ip);
  return false;
}

/** Synchronous screen of a URL's scheme and host text. DNS is checked separately by `fetchPublicHtml`. */
export function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!host) return false;
    if (isIP(host)) return isPublicIp(host);
    return host !== "localhost"
      && !host.endsWith(".localhost")
      && !host.endsWith(".local")
      && !host.endsWith(".internal")
      && !host.endsWith(".lan")
      && host.includes(".");
  } catch {
    return false;
  }
}

export type SafeFetchDeps = {
  fetch: typeof fetch;
  resolve: (host: string) => Promise<string[]>;
};

const defaultDeps: SafeFetchDeps = {
  fetch: (input, init) => fetch(input, init),
  resolve: async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
};

async function hostResolvesPublicly(url: URL, resolve: SafeFetchDeps["resolve"]): Promise<boolean> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicIp(host);
  try {
    const addresses = await resolve(host);
    return addresses.length > 0 && addresses.every(isPublicIp);
  } catch {
    return false;
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const merged = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.length;
    if (offset >= merged.length) break;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Fetches a public HTML page for read-only enrichment. Every hop (including redirects) is screened by
 * scheme/host text and by DNS answers, redirects are followed manually (max 3), and the body is read
 * as a stream and cut at `maxBytes`. Returns null on any unsafe, slow, non-HTML, or failed response.
 * Residual risk: the connection re-resolves DNS, so a rebinding host could differ between check and use.
 */
export async function fetchPublicHtml(
  startUrl: string,
  options: { timeoutMs: number; maxBytes: number },
  deps: SafeFetchDeps = defaultDeps,
): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    let current = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isSafeWebUrl(current)) return null;
      if (!(await hostResolvesPublicly(new URL(current), deps.resolve))) return null;
      const response = await deps.fetch(current, {
        headers: { accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      return { html: await readCapped(response, options.maxBytes), finalUrl: current };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
