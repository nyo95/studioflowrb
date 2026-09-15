import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The office Wi-Fi address is used only for local development access.
  // Next.js otherwise blocks its development assets/endpoints as cross-origin.
  allowedDevOrigins: ["172.16.1.163"],
  // SF-R1 (D-SF-07): temporary redirects from meaningful legacy StudioFlow entry
  // points. Remove at SF-RF parity cutover; never add a parallel route tree.
  async redirects() {
    return [
      { source: "/projects", destination: "/studioflow/projects", permanent: false },
      { source: "/projects/:projectId", destination: "/studioflow/projects/:projectId", permanent: false },
      { source: "/projects/:projectId/phases/:phaseId", destination: "/studioflow/projects/:projectId/phases/:phaseId", permanent: false },
      { source: "/projects/:projectId/activity", destination: "/studioflow/projects/:projectId/history", permanent: false },
      { source: "/upcoming", destination: "/studioflow", permanent: false },
      { source: "/settings/studio", destination: "/studioflow/settings", permanent: false },
      { source: "/settings/clients", destination: "/studioflow/clients", permanent: false },
    ];
  },
  experimental: {
    // Brand marks are explicitly permitted up to 2 MB by Platform Settings,
    // with additional request body headroom for multipart form metadata and boundaries.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
