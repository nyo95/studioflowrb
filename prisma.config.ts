import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

const location = process.env.STUDIOFLOW_LOCATION;
const locationEnvFile =
  location === "kantor" ? ".env.kantor" : location === "rumah" ? ".env.rumah" : ".env.local";

// Location-specific files keep home and office connection details isolated.
loadEnv({ path: locationEnvFile });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL!,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
