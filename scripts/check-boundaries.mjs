import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src", "apps");
const apps = ["studioflow", "masterdata", "bq"];
let violations = 0;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
}

for (const owner of apps) {
  const files = await walk(join(root, owner));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const target of apps.filter((x) => x !== owner)) {
      const forbidden = [`@${target}/domain`, `@${target}/application`, `@${target}/infrastructure`, `@${target}/ui`];
      for (const token of forbidden) {
        if (source.includes(token)) {
          console.error(`BOUNDARY: ${relative(process.cwd(), file)} imports ${token}. Use @${target}/public instead.`);
          violations++;
        }
      }
    }
  }
}

if (violations) process.exit(1);
console.log("Architecture boundaries OK");
