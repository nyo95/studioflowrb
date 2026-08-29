import nextConfig from "eslint-config-next";

/**
 * Flat ESLint 9 configuration using the already-installed Next.js /
 * TypeScript ESLint packages. Rules are the locked Next.js baseline — they
 * are not weakened to make the command pass.
 */
const config = [
  ...nextConfig,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "src/generated/**"],
  },
];

export default config;
