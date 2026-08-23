import { readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const RULE_APP_TO_OTHER_APP_INTERNAL = "app -> other-app/<internal>";
export const RULE_PLATFORM_TO_APP = "platform -> app";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "generated"]);

export function stripJsonComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < n) {
          out += text[i] + text[i + 1];
          i += 2;
          continue;
        }
        out += text[i];
        i++;
      }
      if (i < n) {
        out += text[i];
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export async function readAliasMap(projectRoot, tsconfigPath = join(projectRoot, "tsconfig.json")) {
  let config;
  try {
    config = JSON.parse(stripJsonComments(await readFile(tsconfigPath, "utf8")).replace(/,\s*([}\]])/g, "$1"));
  } catch (error) {
    throw new Error(`check-boundaries: cannot parse ${tsconfigPath}: ${error.message}`);
  }
  const paths = config?.compilerOptions?.paths;
  if (!paths || typeof paths !== "object") {
    throw new Error(`check-boundaries: tsconfig.json has no compilerOptions.paths; cannot resolve aliases`);
  }
  const aliases = [];
  for (const [key, targets] of Object.entries(paths)) {
    const target = Array.isArray(targets) ? targets[0] : targets;
    if (typeof target !== "string") continue;
    const starIndex = key.indexOf("*");
    const targetStarIndex = target.indexOf("*");
    if (starIndex >= 0) {
      const prefix = key.slice(0, starIndex);
      const suffix = key.slice(starIndex + 1);
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      aliases.push({
        regex: new RegExp("^" + escapedPrefix + "([\\s\\S]*)$"),
        suffix,
        head: target.slice(0, targetStarIndex),
        tail: target.slice(targetStarIndex + 1),
        prefixLength: prefix.length,
      });
    } else {
      aliases.push({
        exact: key,
        head: target.slice(0, targetStarIndex < 0 ? target.length : targetStarIndex),
        tail: "",
        prefixLength: key.length,
      });
    }
  }
  return aliases.sort((a, b) => b.prefixLength - a.prefixLength);
}

export function resolveSpecifier(specifier, importerFile, aliasMap, projectRoot) {
  for (const alias of aliasMap) {
    if (alias.exact !== undefined) {
      if (specifier === alias.exact) return resolve(projectRoot, alias.head);
      continue;
    }
    const match = alias.regex.exec(specifier);
    if (match) return resolve(projectRoot, alias.head + match[1] + alias.suffix);
  }
  if (specifier.startsWith(".")) {
    return resolve(dirname(importerFile), specifier);
  }
  return null;
}

export async function walkSources(dir, skipDirectories = SKIP_DIRECTORIES) {
  const entries = await readdir(dir, { withFileTypes: true });
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

function extname(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function classifyTarget(targetPath, projectRoot, apps) {
  const appsRoot = join(resolve(projectRoot), "src", "apps");
  const platformRoot = join(resolve(projectRoot), "src", "platform");
  if (isInside(appsRoot, targetPath)) {
    const segments = relative(appsRoot, targetPath).split(sep);
    const app = segments[0];
    if (apps.includes(app)) {
      const layer = segments.length >= 2 ? segments[1] : "(root)";
      return { kind: "app", app, layer };
    }
  }
  if (isInside(platformRoot, targetPath) || relative(platformRoot, targetPath) === "") {
    return { kind: "platform" };
  }
  return { kind: "other" };
}

function scriptKindFor(fileName) {
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return ts.ScriptKind.TS;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.JS;
}

export function extractImportSpecifiers(source, fileName = "module.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const specifiers = new Set();
  const addModuleSpecifier = (node) => {
    if (node && ts.isStringLiteral(node)) specifiers.add(node.text);
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node)) {
      addModuleSpecifier(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      addModuleSpecifier(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addModuleSpecifier(node.arguments[0]);
      } else if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        addModuleSpecifier(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...specifiers];
}

export async function collectBoundaryViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");

  const aliasMap = await readAliasMap(projectRoot);
  const appsRoot = join(srcDir, "apps");
  const apps = (await readdir(appsRoot, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const violations = [];
  const files = await walkSources(srcDir);

  for (const file of files) {
    const importer = classifyTarget(file, projectRoot, apps);
    if (importer.kind !== "app" && importer.kind !== "platform") continue;
    const source = await readFile(file, "utf8");
    for (const specifier of extractImportSpecifiers(source, file)) {
      const targetPath = resolveSpecifier(specifier, file, aliasMap, projectRoot);
      if (!targetPath) continue;
      const target = classifyTarget(targetPath, projectRoot, apps);

      if (
        importer.kind === "app" &&
        target.kind === "app" &&
        target.app !== importer.app &&
        target.layer !== "public"
      ) {
        violations.push({
          rule: RULE_APP_TO_OTHER_APP_INTERNAL,
          file: file,
          specifier,
          targetApp: target.app,
          targetLayer: target.layer,
          detail: `imports other app "${target.app}" internal layer "${target.layer}" via "${specifier}". Cross-app imports must target only "${target.app}/public".`,
        });
      }

      if (importer.kind === "platform" && target.kind === "app") {
        violations.push({
          rule: RULE_PLATFORM_TO_APP,
          file: file,
          specifier,
          targetApp: target.app,
          targetLayer: target.layer,
          detail: `platform code imports app "${target.app}" via "${specifier}". Platform must not import from any app folder.`,
        });
      }
    }
  }

  return violations;
}

async function main() {
  const projectRoot = process.cwd();
  let violations;
  try {
    violations = await collectBoundaryViolations({ projectRoot });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const rel = (p) => relative(projectRoot, p) || p;
  for (const violation of violations) {
    console.error(
      [
        `BOUNDARY VIOLATION [${violation.rule}]`,
        `  file:     ${rel(violation.file)}`,
        `  import:   ${violation.specifier}`,
        `  problem:  ${violation.detail}`,
      ].join("\n"),
    );
  }
  if (violations.length > 0) {
    console.error(`Architecture boundaries FAILED (${violations.length} violation(s))`);
    process.exitCode = 1;
    return;
  }
  console.log("Architecture boundaries OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
