import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const testFiles = [];

async function discoverTests(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      await discoverTests(path);
      continue;
    }

    if (
      entry.isFile() &&
      (extname(entry.name) === ".ts" || extname(entry.name) === ".tsx") &&
      /\.test\.tsx?$/.test(entry.name)
    ) {
      testFiles.push(path);
    }
  }
}

await discoverTests("src");

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
