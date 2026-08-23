import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const fixtureSuites = [
  join("scripts", "test-boundaries-checker.mjs"),
  join("scripts", "test-legacy-runtime-checker.mjs"),
];

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
  ["--import", "tsx", "--test", ...testFiles, ...fixtureSuites],
  { stdio: "inherit" },
);

process.exit(result.status ?? 1);
