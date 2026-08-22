import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RULE_LEGACY_RUNTIME_REFERENCE = "runtime-reference-to-legacy-repo";

const LEGACY_PATH_PATTERN = /\.\.[\\/]+studioflow(?![\w-])/g;
const TOKEN_END = new Set(['"', "'", "`", " ", "\t", ")", ";", "]", ","]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "generated"]);
const CONFIG_EXTENSIONS = /\.(json|ts|tsx|js|jsx|mjs|cjs)$/i;
const LOCK_FILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "deno.lock",
]);

function extname(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

async function listRootConfigFiles(projectRoot) {
  const entries = await readdir(projectRoot, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => !LOCK_FILES.has(name))
    .filter((name) => name.startsWith(".env") || CONFIG_EXTENSIONS.test(name))
    .sort();
}

async function walkSources(dir, skipDirectories = SKIP_DIRECTORIES) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirectories.has(entry.name)) files.push(...(await walkSources(path, skipDirectories)));
    } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files.sort();
}

function extendTokenFromMatch(line, startIndex) {
  let begin = startIndex;
  while (begin > 0 && /[./\\]/.test(line[begin - 1])) begin--;
  let endIndex = startIndex;
  while (endIndex < line.length && !TOKEN_END.has(line[endIndex])) endIndex++;
  return line.slice(begin, endIndex);
}

export async function collectLegacyRuntimeReferences({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");

  const candidates = [
    ...(await walkSources(srcDir)),
    ...(await listRootConfigFiles(projectRoot)).map((name) => join(projectRoot, name)),
  ];

  const violations = [];
  for (const file of candidates) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      LEGACY_PATH_PATTERN.lastIndex = 0;
      for (const match of line.matchAll(LEGACY_PATH_PATTERN)) {
        const token = extendTokenFromMatch(line, match.index);
        if (isInside(projectRoot, resolve(dirname(file), token))) continue;
        violations.push({
          rule: RULE_LEGACY_RUNTIME_REFERENCE,
          file,
          line: lineIndex + 1,
          reference: token,
        });
      }
    }
  }
  return violations;
}

async function main() {
  const projectRoot = process.cwd();
  const violations = await collectLegacyRuntimeReferences({ projectRoot });
  const rel = (p) => relative(projectRoot, p) || p;
  for (const violation of violations) {
    console.error(
      [
        `LEGACY RUNTIME REFERENCE [${violation.rule}]`,
        `  file:      ${rel(violation.file)}`,
        `  line:      ${violation.line}`,
        `  reference: ${violation.reference}`,
        `  problem:   production source/configuration must not reference the sibling legacy repository at ../studioflow. Legacy code is extracted manually, never imported.`,
      ].join("\n"),
    );
  }
  if (violations.length > 0) {
    console.error(`Legacy runtime coupling FAILED (${violations.length} reference(s))`);
    process.exitCode = 1;
    return;
  }
  console.log("No legacy runtime references OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
