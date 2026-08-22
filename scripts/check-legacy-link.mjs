import { access } from "node:fs/promises";
import { resolve } from "node:path";

const legacy = resolve(process.cwd(), "../studioflow");
try {
  await access(legacy);
  console.log(`OK legacy repo found: ${legacy}`);
} catch {
  console.error(`Legacy repo not found at ${legacy}`);
  process.exitCode = 1;
}
