import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The office Wi-Fi address is used only for local development access.
  // Next.js otherwise blocks its development assets/endpoints as cross-origin.
  allowedDevOrigins: ["172.16.1.163"],
  experimental: {
    // Brand marks are explicitly permitted up to 2 MB by Platform Settings,
    // with additional request body headroom for multipart form metadata and boundaries.
    serverActions: { bodySizeLimit: "4mb" },
    // Default (0s) means every revisit of a dynamic page (e.g. leaving a
    // project and coming back) refetches the whole layout chain from
    // scratch — including the app shell (rail, StudioFlow nav) above it —
    // even though shared layouts are otherwise reused on plain forward
    // navigation. 30s lets the client reuse a just-rendered dynamic page on
    // a quick revisit instead of showing the platform-wide loading spinner
    // for the whole shell again (owner, 2026-09-24: "kenapa ga
    // diselaraskan" after seeing this on every project revisit).
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
