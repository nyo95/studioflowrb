import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

function scriptKindFor(fileName) {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return ts.ScriptKind.TS;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.JS;
}

function isStringLikeLiteral(node) {
  return (
    ts.isStringLiteral(node) ||
    node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
    node.kind === ts.SyntaxKind.TemplateHead ||
    node.kind === ts.SyntaxKind.TemplateMiddle ||
    node.kind === ts.SyntaxKind.TemplateTail
  );
}

function collectActiveStringValues(fileName, content) {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const values = [];
  const visit = (node) => {
    if (isStringLikeLiteral(node) && typeof node.text === "string") {
      values.push({
        text: node.text,
        line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

function collectActiveEnvValues(content) {
  const values = [];
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].trim().startsWith("#")) continue;
    values.push({ text: lines[index], line: index + 1 });
  }
  return values;
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
    const isEnvFile = basename(file).startsWith(".env");
    const activeValues = isEnvFile
      ? collectActiveEnvValues(content)
      : collectActiveStringValues(file, content);

    for (const value of activeValues) {
      LEGACY_PATH_PATTERN.lastIndex = 0;
      for (const match of value.text.matchAll(LEGACY_PATH_PATTERN)) {
        const token = extendTokenFromMatch(value.text, match.index);
        if (isInside(projectRoot, resolve(dirname(file), token))) continue;
        const newlinesBeforeMatch = value.text.slice(0, match.index).split("\n").length - 1;
        violations.push({
          rule: RULE_LEGACY_RUNTIME_REFERENCE,
          file,
          line: value.line + newlinesBeforeMatch,
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
