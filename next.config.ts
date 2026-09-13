import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The office Wi-Fi address is used only for local development access.
  // Next.js otherwise blocks its development assets/endpoints as cross-origin.
  allowedDevOrigins: ["172.16.1.163"],
  experimental: {
    // Brand marks are explicitly permitted up to 2 MB by Platform Settings.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
