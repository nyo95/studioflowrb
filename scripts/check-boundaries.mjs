import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const RULE_APP_TO_OTHER_APP_INTERNAL = "app -> other-app/<internal>";
export const RULE_PLATFORM_TO_APP = "platform -> app";
export const RULE_CORE_TO_UI_ENGINE = "core -> ui_engine";
export const RULE_CORE_TO_INFRASTRUCTURE = "core -> infrastructure";
export const RULE_APP_TO_UI_ENGINE_INTERNAL = "app -> ui_engine/<internal>";
export const RULE_RAW_LEGACY_UI_CLASS = "app -> raw legacy ui-* class";
export const RULE_PERMISSION_VOCABULARY = "permission vocabulary SSOT";
export const RULE_ROUTE_OWNERSHIP = "app route ownership";
export const RULE_DUPLICATE_PRIMITIVE = "app-local duplicate primitive";
export const RULE_SHELL_TO_APP_INTERNAL = "shell -> app/<internal>";
export const RULE_DOMAIN_TO_PERSISTENCE = "app domain -> persistence";
export const RULE_DATABASE_OWNERSHIP = "database ownership";
export const RULE_STALE_ALLOW_LIST = "stale allow-list entry";
export const RULE_UNSCANNED_FILE = "unscanned file under src";
export const RULE_DUPLICATE_MACHINERY = "app-local copy of generic machinery";
export const RULE_MIGRATION_ISOLATION = "migration touches more than one app schema";
export const RULE_SERVER_CALLS_CLIENT_FUNCTION = "server code -> function in a \"use client\" module";
export const RULE_INTEGRATION_ROUTE_IMPORTS = "integration route import allow-list";
export const RULE_MODULE_MANIFEST_REQUIRES = "module manifest requires";
export const RULE_MODULE_ADMIN_IMPORT = "module state writer import";

/**
 * App layers a composition/shell file (anything under `src/app` or
 * `src/application` that no app owns) may import. Everything else in an app is
 * private: the shell wires apps together through their public contract, their
 * server runtime composition, and their own route lane, never their internals.
 */
export const SHELL_ALLOWED_APP_LAYERS = new Set(["public", "runtime", "route"]);

/**
 * Route groups outside `(platform)` whose first segment names the owning app,
 * e.g. `src/app/(document)/studioflow/**` belongs to the studioflow app.
 */
export const APP_ROUTE_GROUPS = ["(platform)", "(document)"];

/**
 * App-owned files where a raw `Intl.DateTimeFormat` display primitive is
 * deliberately retained as a proven, recorded deferral (see
 * docs/UTILITY-INVENTORY.md). Paths are repo-relative with forward slashes.
 * Anything else matching the canonical pattern must use `formatInstant` from
 * "@platform/utilities/date".
 */
export const APP_DUPLICATE_PRIMITIVE_ALLOW_LIST = [
  "src/app/(platform)/bq/project-deletion-review.tsx",
];

/**
 * Platform route subtrees that belong to exactly one app but do not sit under
 * that app's own `/<app>` root, so the root-segment check alone cannot see them.
 * Paths are relative to `src/app/(platform)` with forward slashes; the longest
 * matching prefix wins.
 *
 * Without an entry here the owning app is unknown, `classifyImporter` returns
 * "other", and the whole boundary scan skips the file. That is how six live
 * `masterdata/service` + `masterdata/runtime` imports went unreported from
 * `settings/general/masterdata` (KB-037).
 */
export const PLATFORM_ROUTE_OWNERS = [
  { path: "settings/general/masterdata", app: "masterdata" },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
// Skipped at any depth: dependency and build output only. Generated code is
// skipped solely as the top-level `generated` folder of the walked root
// (`src/generated`), so a directory of that name inside an app stays scanned.
const SKIP_DIRECTORIES = new Set(["node_modules", ".next"]);
const GENERATED_ROOT_DIRECTORY = "generated";
// Non-source files that may live under src. Anything else there (extensionless
// files, `.mts`, `.fuse_hidden*` sync debris) is invisible to every rule above.
const NON_SOURCE_EXTENSIONS = new Set([".css", ".woff", ".woff2", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".json", ".md", ".txt"]);

const PERMISSION_LITERAL_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/;
const PERMISSION_CONSUMPTION_FUNCTIONS = new Set(["hasPermission", "hasAnyPermission", "hasAllPermissions", "requirePermission"]);
const LEGACY_UI_CLASS_PATTERN =
  /\b(?:ui-button|ui-btn|ui-card|ui-table|ui-input|ui-select|ui-toolbar|ui-dialog|ui-modal|ui-form|ui-menu|ui-nav|ui-tab|ui-badge|ui-pill|ui-switch|ui-radio|ui-checkbox|ui-dropdown|ui-accordion|ui-alert|ui-avatar|ui-breadcrumb|ui-pagination|ui-search|ui-stat|ui-progress|ui-stepper|ui-tag|ui-toggle|ui-tooltip)\b/;
/**
 * Generic interaction/pagination machinery that must have ONE canonical
 * implementation (AGENTS.md "Foundation and ownership invariants"). Each entry is
 * a ratchet: `baseline` lists the files that still carry a private copy today.
 * A new copy fails the build; a listed file that no longer matches must be
 * removed from the baseline, so the list can only shrink toward empty. Converge
 * the copies onto the named canonical API, then delete the entry.
 */
export const APP_DUPLICATE_MACHINERY = [];

const INT_DATETIME_FORMAT_PATTERN = /new\s+Intl\.(?:DateTimeFormat|RelativeTimeFormat)\s*\(|\.toLocale(?:Date|Time)String\s*\(/;

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

export async function walkSources(dir, skipDirectories = SKIP_DIRECTORIES, root = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const generatedRoot = dir === root && entry.name === GENERATED_ROOT_DIRECTORY;
      if (!skipDirectories.has(entry.name) && !generatedRoot) files.push(...(await walkSources(path, skipDirectories, root)));
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

function isEqualToOrInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function listAppsInDir(appsRoot) {
  let appEntries = [];
  try {
    appEntries = await readdir(appsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return appEntries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export function routeLaneApp(filePath, projectRoot, apps, routeOwners = PLATFORM_ROUTE_OWNERS) {
  for (const group of APP_ROUTE_GROUPS) {
    if (group === "(platform)") continue;
    const groupRel = relative(join(resolve(projectRoot), "src", "app", group), filePath);
    if (groupRel.startsWith("..") || isAbsolute(groupRel)) continue;
    const first = groupRel.split(sep)[0];
    if (apps.includes(first)) return first;
  }
  const routePlatformRoot = join(resolve(projectRoot), "src", "app", "(platform)");
  const rel = relative(routePlatformRoot, filePath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  const segments = rel.split(sep);
  if (apps.includes(segments[0])) return segments[0];
  // Longest owned prefix wins, so a nested app-owned route group (e.g. a
  // masterdata admin UI under settings/) is attributed to its app even though it
  // does not sit under that app's own `/<app>` root.
  for (let depth = segments.length; depth > 0; depth--) {
    const owner = routeOwners.find((candidate) => candidate.path === segments.slice(0, depth).join("/"));
    if (owner) return owner.app;
  }
  return null;
}

export function classifyTarget(targetPath, projectRoot, apps, routeOwners = PLATFORM_ROUTE_OWNERS) {
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
  const routeApp = routeLaneApp(targetPath, projectRoot, apps, routeOwners);
  if (routeApp) return { kind: "app", app: routeApp, layer: "route" };
  return { kind: "other" };
}

export function classifyImporter(filePath, projectRoot, apps, routeOwners = PLATFORM_ROUTE_OWNERS) {
  const root = resolve(projectRoot);
  const appsRoot = join(root, "src", "apps");
  const platformRoot = join(root, "src", "platform");
  if (isInside(appsRoot, filePath)) {
    const segments = relative(appsRoot, filePath).split(sep);
    if (apps.includes(segments[0])) return { kind: "app", app: segments[0], lane: false };
  }
  if (isInside(platformRoot, filePath) || relative(platformRoot, filePath) === "") {
    return { kind: "platform" };
  }
  const routeApp = routeLaneApp(filePath, root, apps, routeOwners);
  if (routeApp) return { kind: "app", app: routeApp, lane: true };
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

function jsxClassNameValue(initializer) {
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression;
    if (ts.isStringLiteral(expr)) return expr.text;
    if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (ts.isTemplateExpression(expr)) {
      let out = expr.head.text;
      for (const span of expr.templateSpans) out += span.literal.text;
      return out;
    }
  }
  return null;
}

export function findLegacyUiClassTokens(source, fileName = "module.tsx") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const hits = [];
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "className") {
      const value = jsxClassNameValue(node.initializer);
      if (value) {
        const token = LEGACY_UI_CLASS_PATTERN.exec(value);
        if (token) hits.push({ className: value, token: token[0] });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

export function extractPermissionLiterals(source, fileName = "module.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const literals = new Set();
  const collect = (arg) => {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      if (PERMISSION_LITERAL_PATTERN.test(arg.text)) literals.add(arg.text);
    } else if (ts.isArrayLiteralExpression(arg)) {
      for (const el of arg.elements) collect(el);
    }
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && PERMISSION_CONSUMPTION_FUNCTIONS.has(node.expression.text)) {
      for (const arg of node.arguments) collect(arg);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...literals];
}

export function parsePermissionContractIds(source, constName) {
  const match = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*([\\[{])`).exec(source);
  if (!match) return [];
  const openChar = source[match.index + match[0].length - 1];
  let depth = 0;
  let end = -1;
  for (let i = match.index + match[0].length - 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(match.index + match[0].length - 1 + 1, end);
  const ids = new Set();
  for (const quote of body.matchAll(/"([^"]+)"/g)) {
    if (PERMISSION_LITERAL_PATTERN.test(quote[1])) ids.add(quote[1]);
  }
  return [...ids];
}

export function permissionContractNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*_PERMISSIONS)\s*=/g)) names.add(m[1]);
  return [...names];
}

export function extractRouteConstantValues(source, fileName = "nav.ts") {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const values = [];
  const collect = (initializer) => {
    let init = initializer;
    if (ts.isAsExpression(init)) init = init.expression;
    if (!init || !ts.isObjectLiteralExpression(init)) return;
    for (const prop of init.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const init = prop.initializer;
      if (ts.isStringLiteral(init)) values.push(init.text);
      else if (ts.isNoSubstitutionTemplateLiteral(init)) values.push(init.text);
    }
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /_ROUTES$/.test(node.name.text)) {
      collect(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

export function findRegistrationBlock(source, appId) {
  const marker = new RegExp(`appId:\\s*"${appId}"`).exec(source);
  if (!marker) return null;
  const braceStart = source.lastIndexOf("{", marker.index);
  if (braceStart === -1) return null;
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  return null;
}

function registrationRequires(source, appId) {
  const block = findRegistrationBlock(source, appId);
  if (!block) return [];
  const match = /\brequires\s*:\s*\[([\s\S]*?)\]/.exec(block);
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
}

function countedPublicAppImports(source, fileName, importerApp) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const imports = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const match = /^@\/apps\/([^/]+)\/public(?:\/(.*))?$/.exec(specifier);
    if (!match || match[1] === importerApp) continue;
    const imported = statement.importClause?.namedBindings;
    const routesOnly = imported && ts.isNamedImports(imported) && imported.elements.length > 0 &&
      imported.elements.every((element) => (element.propertyName ?? element.name).text.endsWith("_ROUTES"));
    const navOnly = match[2] === "nav" || match[2]?.startsWith("nav/");
    if (!navOnly && !routesOnly) imports.push({ app: match[1], specifier });
  }
  return imports;
}

/**
 * Module manifests must name every runtime/data cross-app dependency, while
 * navigation-only imports remain ordinary links. The module state writer is a
 * deliberately narrow administrative surface: only its own module package and
 * repository scripts may import it.
 */
export async function collectModuleBoundaryViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const appsRoot = join(srcDir, "apps");
  const apps = await listAppsInDir(appsRoot);
  const registrationsPath = join(srcDir, "app", "app-registrations.ts");
  let registrations = "";
  try {
    registrations = await readFile(registrationsPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const violations = [];

  for (const app of apps) {
    const declared = new Set(registrationRequires(registrations, app));
    const observed = new Map();
    for (const file of await walkSources(join(appsRoot, app))) {
      if (/\.(test|spec)\.[jt]sx?$/.test(file)) continue;
      const source = await readFile(file, "utf8");
      for (const dependency of countedPublicAppImports(source, file, app)) {
        if (!observed.has(dependency.app)) observed.set(dependency.app, { file, specifier: dependency.specifier });
      }
    }
    for (const [dependency, evidence] of observed) {
      if (declared.has(dependency)) continue;
      violations.push({
        rule: RULE_MODULE_MANIFEST_REQUIRES,
        file: evidence.file,
        specifier: evidence.specifier,
        detail: `app "${app}" imports runtime/data capability from "${dependency}" but its manifest does not declare requires: ["${dependency}"].`,
      });
    }
    for (const dependency of declared) {
      if (observed.has(dependency)) continue;
      violations.push({
        rule: RULE_MODULE_MANIFEST_REQUIRES,
        file: registrationsPath,
        specifier: `${app} -> ${dependency}`,
        detail: `app "${app}" declares module requirement "${dependency}" without a counted cross-app public import. Remove the stale requirement or add the runtime/data dependency.`,
      });
    }
  }

  const aliasMap = await readAliasMap(projectRoot);
  const modulesRoot = join(srcDir, "platform", "core", "modules");
  const scriptsRoot = join(projectRoot, "scripts");
  let scripts = [];
  try {
    scripts = await walkSources(scriptsRoot);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const adminTarget = join(modulesRoot, "admin");
  for (const file of [...await walkSources(srcDir), ...scripts]) {
    if (isEqualToOrInside(modulesRoot, file) || isEqualToOrInside(scriptsRoot, file)) continue;
    const source = await readFile(file, "utf8");
    for (const specifier of extractImportSpecifiers(source, file)) {
      const target = resolveSpecifier(specifier, file, aliasMap, projectRoot);
      if (!target || target.replace(/\.[^.\\/]+$/, "") !== adminTarget) continue;
      violations.push({
        rule: RULE_MODULE_ADMIN_IMPORT,
        file,
        specifier,
        detail: "Only repository scripts and platform/core/modules may import the module state writer. Application code must use the read-only public module API.",
      });
    }
  }
  return violations;
}

function importDeclares(source, declaredName, fromModule) {
  for (const m of source.matchAll(/import\s*\{(?:[\s\S]*?)\}\s*from\s*["']([^"']+)["']/g)) {
    if (m[1] !== fromModule) continue;
    if (new RegExp(`\\b${declaredName}\\b`).test(m[0])) return true;
  }
  return false;
}

function domainAppOf(file, appsRoot) {
  const segments = relative(appsRoot, file).split(sep);
  return segments.length >= 3 && segments[1] === "domain" ? segments[0] : null;
}

function importsPersistence(specifier, targetPath, srcDir) {
  if (specifier === "@prisma/client" || specifier.startsWith("@prisma/client/")) return true;
  if (!targetPath) return false;
  return (
    isEqualToOrInside(join(srcDir, "generated"), targetPath) ||
    isEqualToOrInside(join(srcDir, "platform", "infrastructure"), targetPath)
  );
}

export async function collectBoundaryViolations({ projectRoot = process.cwd(), srcDir, routeOwners = PLATFORM_ROUTE_OWNERS } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");

  const aliasMap = await readAliasMap(projectRoot);
  const appsRoot = join(srcDir, "apps");
  const apps = await listAppsInDir(appsRoot);
  const platformRoot = join(srcDir, "platform");
  const uiEngineRoot = join(platformRoot, "ui_engine");
  const infrastructureRoot = join(platformRoot, "infrastructure");

  const violations = [];
  const files = await walkSources(srcDir);

  for (const file of files) {
    const importer = classifyImporter(file, projectRoot, apps, routeOwners);
    const shell =
      importer.kind === "other" && (isInside(join(srcDir, "app"), file) || isInside(join(srcDir, "application"), file));
    if (importer.kind !== "app" && importer.kind !== "platform" && !shell) continue;
    const source = await readFile(file, "utf8");
    const integrationRoute = isInside(join(srcDir, "app", "api", "integrations"), file);
    const importerDomainApp = importer.kind === "app" && !importer.lane ? domainAppOf(file, appsRoot) : null;
    const importerCore =
      importer.kind === "platform" && isInside(platformRoot, file) && relative(platformRoot, file).split(sep)[0] === "core";

    for (const specifier of extractImportSpecifiers(source, file)) {
      const targetPath = resolveSpecifier(specifier, file, aliasMap, projectRoot);

      if (integrationRoute && !isAllowedIntegrationRouteImport(specifier, targetPath, projectRoot, apps)) {
        violations.push({
          rule: RULE_INTEGRATION_ROUTE_IMPORTS,
          file,
          specifier,
          detail: "Integration API routes may import only the integration kit, safe errors, zod, or an extension public/contract/runtime lane. Keep Prisma and app internals behind the kit/service boundary.",
        });
        continue;
      }

      if (importerDomainApp && !/\.(test|spec)\.[jt]sx?$/.test(file) && importsPersistence(specifier, targetPath, srcDir)) {
        violations.push({
          rule: RULE_DOMAIN_TO_PERSISTENCE,
          file: file,
          specifier,
          detail: `app "${importerDomainApp}" domain code imports persistence (${specifier}). Domain stays pure; queries belong to the app's services.`,
        });
      }

      if (!targetPath) continue;
      const target = classifyTarget(targetPath, projectRoot, apps, routeOwners);

      if (shell && target.kind === "app" && !SHELL_ALLOWED_APP_LAYERS.has(target.layer.replace(/.[jt]sx?$/, ""))) {
        violations.push({
          rule: RULE_SHELL_TO_APP_INTERNAL,
          file: file,
          specifier,
          targetApp: target.app,
          targetLayer: target.layer,
          detail: `composition/shell file imports app "${target.app}" internal layer "${target.layer}" via "${specifier}". Shell files may reach an app only through "public", "runtime", or its route lane.`,
        });
        continue;
      }
      if (shell) continue;

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

      if (importerCore && target.kind === "platform") {
        if (isEqualToOrInside(uiEngineRoot, targetPath)) {
          violations.push({
            rule: RULE_CORE_TO_UI_ENGINE,
            file: file,
            specifier,
            detail: `core must stay UI-agnostic; it must not import the UI Engine (${specifier}).`,
          });
        }
        if (isEqualToOrInside(infrastructureRoot, targetPath)) {
          violations.push({
            rule: RULE_CORE_TO_INFRASTRUCTURE,
            file: file,
            specifier,
            detail: `core must stay persistence-agnostic; it must not import infrastructure (${specifier}).`,
          });
        }
      }

      if (importer.kind === "app" && target.kind === "platform" && isEqualToOrInside(uiEngineRoot, targetPath)) {
        const uiRel = relative(uiEngineRoot, targetPath);
        const isPublicIndex = uiRel === "" || uiRel.endsWith("index") || uiRel.endsWith("index.ts") || uiRel.endsWith("index.tsx");
        if (!isPublicIndex) {
          violations.push({
            rule: RULE_APP_TO_UI_ENGINE_INTERNAL,
            file: file,
            specifier,
            detail: `apps must import the UI Engine only through its canonical surface ("@/platform/ui_engine"); "${specifier}" reaches the internal module "${uiRel}".`,
          });
        }
      }
    }

    if (importer.kind === "app" && (file.endsWith(".tsx") || file.endsWith(".jsx"))) {
      for (const { className, token } of findLegacyUiClassTokens(source, file)) {
        violations.push({
          rule: RULE_RAW_LEGACY_UI_CLASS,
          file: file,
          specifier: token,
          className,
          detail: `className="${className}" uses raw legacy token "${token}". Use the canonical UI Engine surface ("@/platform/ui_engine") or record an explicit app-owned exception.`,
        });
      }
    }
  }

  return violations;
}

function isAllowedIntegrationRouteImport(specifier, targetPath, projectRoot, apps) {
  if (specifier === "@platform/core/integrations" || specifier === "@platform/core/errors" || specifier === "zod") return true;
  if (!targetPath) return false;
  const target = classifyTarget(targetPath, projectRoot, apps);
  return target.kind === "app" && ["public", "contract.ts", "contract", "runtime.ts", "runtime"].includes(target.layer);
}

export async function collectPermissionVocabularyViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const violations = [];
  const appsRoot = join(srcDir, "apps");
  const apps = await listAppsInDir(appsRoot);
  const push = (rule, file, specifier, detail) => violations.push({ rule, file, specifier, detail });

  const vocab = new Map();

  const registryPath = join(srcDir, "platform", "core", "rbac", "registry.ts");
  let registrySource = null;
  try {
    registrySource = await readFile(registryPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (registrySource) {
    for (const id of parsePermissionContractIds(registrySource, "PLATFORM_PERMISSIONS")) {
      if (vocab.has(id)) {
        push(RULE_PERMISSION_VOCABULARY, registryPath, id, `Platform permission "${id}" is declared twice in PLATFORM_PERMISSIONS.`);
      } else {
        vocab.set(id, "platform");
      }
    }
  }

  for (const app of apps) {
    const appDir = join(appsRoot, app);
    for (const file of await walkSources(appDir)) {
      const source = await readFile(file, "utf8");
      for (const constName of permissionContractNames(source)) {
        for (const id of parsePermissionContractIds(source, constName)) {
          const owned = id === `${app}.access` || id.startsWith(`${app}.`);
          if (!owned) {
            push(RULE_PERMISSION_VOCABULARY, file, id, `App "${app}" declares permission "${id}" outside its owned namespace ("${app}.*" or "${app}.access").`);
          } else if (vocab.has(id)) {
            push(RULE_PERMISSION_VOCABULARY, file, id, `Permission "${id}" is already declared by "${vocab.get(id)}". The vocabulary must be a disjoint union; every permission has exactly one owner.`);
          } else {
            vocab.set(id, app);
          }
        }
      }
    }
  }

  const files = await walkSources(srcDir);
  for (const file of files) {
    if (/\.test\.(ts|tsx)$/.test(file)) continue;
    const importer = classifyImporter(file, projectRoot, apps);
    if (importer.kind !== "app" && importer.kind !== "platform") continue;
    const source = await readFile(file, "utf8");
    for (const id of extractPermissionLiterals(source, file)) {
      if (!vocab.has(id)) {
        push(RULE_PERMISSION_VOCABULARY, file, id, `Permission literal "${id}" used at a permission call site is not in the code-owned vocabulary. Use a constant from the owning registry or from the app's public "_PERMISSIONS" map.`);
      }
    }
  }

  return violations;
}

export async function collectRouteOwnershipViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const violations = [];
  const apps = await listAppsInDir(join(srcDir, "apps"));
  const aliasMap = await readAliasMap(projectRoot);
  const push = (rule, file, specifier, detail) => violations.push({ rule, file, specifier, detail });

  const registrationsPath = join(srcDir, "app", "app-registrations.ts");
  let registrationsSource = null;
  try {
    registrationsSource = await readFile(registrationsPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const registered = new Set();
  if (registrationsSource) {
    for (const app of apps) {
      const block = findRegistrationBlock(registrationsSource, app);
      if (!block) {
        push(RULE_ROUTE_OWNERSHIP, registrationsPath, `appId:"${app}"`, `App "${app}" has no entry in the composition root (${relative(projectRoot, registrationsPath)}). Every app must be registered with launcher metadata.`);
        continue;
      }
      registered.add(app);
      const rootPath = /rootPath:\s*"([^"]+)"/.exec(block)?.[1];
      if (rootPath !== `/${app}`) {
        push(RULE_ROUTE_OWNERSHIP, registrationsPath, `rootPath:"${rootPath}"`, `App "${app}" registers rootPath "${rootPath}" but it must be "/${app}", matching its app directory.`);
      }
      const ovMatch = /permissions:\s*Object\.values\(\s*([A-Z][A-Z0-9_]*_PERMISSIONS)\s*\)/.exec(block);
      if (!ovMatch) {
        push(RULE_ROUTE_OWNERSHIP, registrationsPath, `appId:"${app}"`, `App "${app}" composition must register its permissions via "Object.values(<APP>_PERMISSIONS)" so the map stays the single source of truth.`);
      } else if (!importDeclares(registrationsSource, ovMatch[1], `@/apps/${app}/public`)) {
        push(RULE_ROUTE_OWNERSHIP, registrationsPath, ovMatch[1], `Composition root must import ${ovMatch[1]} from "@/apps/${app}/public" (public boundary), not from an app internal module.`);
      }
    }
  } else {
    for (const app of apps) {
      push(RULE_ROUTE_OWNERSHIP, registrationsPath, app, `No composition root found at ${relative(projectRoot, registrationsPath)}; app "${app}" is not registered.`);
    }
  }

  for (const app of apps) {
    const navPath = join(srcDir, "apps", app, "public", "nav.ts");
    let navSource = null;
    try {
      navSource = await readFile(navPath, "utf8");
    } catch (error) {
      if ((error?.code !== "ENOENT") && error) throw error;
    }
    if (!navSource) {
      push(RULE_ROUTE_OWNERSHIP, navPath, null, `App "${app}" has no client-safe navigation constants file (${relative(projectRoot, navPath)}). Route/nav constants must live in the app public boundary and stay import-free.`);
      continue;
    }
    const routes = extractRouteConstantValues(navSource);
    if (!routes.includes(`/${app}`)) {
      push(RULE_ROUTE_OWNERSHIP, navPath, null, `App "${app}" navigation must declare its root route "/${app}".`);
    }
    for (const route of routes.filter((r) => r.startsWith("/") && !r.startsWith(`/${app}`))) {
      push(RULE_ROUTE_OWNERSHIP, navPath, route, `App "${app}" navigation route "${route}" is not under its owned root "/${app}".`);
    }
    for (const specifier of extractImportSpecifiers(navSource, navPath)) {
      const targetPath = resolveSpecifier(specifier, navPath, aliasMap, projectRoot);
      if (targetPath && isInside(srcDir, targetPath)) {
        push(RULE_ROUTE_OWNERSHIP, navPath, specifier, `Navigation constants must be client-safe and import-free; remove internal import "${specifier}".`);
      }
    }
  }

  for (const app of registered) {
    const routeDir = join(srcDir, "app", "(platform)", app);
    try {
      const info = await stat(routeDir);
      if (!info.isDirectory()) {
        push(RULE_ROUTE_OWNERSHIP, routeDir, null, `Registered app "${app}" route path exists but is not a directory.`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        push(RULE_ROUTE_OWNERSHIP, routeDir, null, `Registered app "${app}" has no route directory (${relative(projectRoot, routeDir)}).`);
      } else {
        throw error;
      }
    }
  }

  return violations;
}

export async function collectDuplicatePrimitiveViolations({
  projectRoot = process.cwd(),
  srcDir,
  allowList = APP_DUPLICATE_PRIMITIVE_ALLOW_LIST,
} = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const violations = [];
  const apps = await listAppsInDir(join(srcDir, "apps"));
  const allowed = new Set(allowList.map((p) => resolve(projectRoot, p)));

  // An allow-list entry that no longer resolves is indistinguishable from a
  // working exemption, so it must be removed rather than left to rot.
  for (const entry of allowList) {
    try {
      await stat(resolve(projectRoot, entry));
    } catch {
      violations.push({
        rule: RULE_STALE_ALLOW_LIST,
        file: resolve(projectRoot, entry),
        specifier: entry,
        detail: "Allow-list entry points at a file that does not exist. Delete the entry.",
      });
    }
  }

  for (const file of await walkSources(srcDir)) {
    if (allowed.has(file)) continue;
    const importer = classifyImporter(file, projectRoot, apps);
    if (importer.kind !== "app") continue;
    const source = await readFile(file, "utf8");
    if (INT_DATETIME_FORMAT_PATTERN.test(source)) {
      violations.push({
        rule: RULE_DUPLICATE_PRIMITIVE,
        file: file,
        specifier: "Intl/toLocale date display",
        detail: `App file formats dates with a raw Intl.DateTimeFormat / toLocale*String call. Use the canonical "formatInstant" from "@platform/utilities/date"; converge or record an explicit deferral in docs/UTILITY-INVENTORY.md.`,
      });
    }
  }

  // Spreadsheet and PDF files have one canonical implementation (WO-PLAT-TABULAR-01); an app must not
  // reach for the libraries directly. Test files may build fixtures with them.
  for (const file of await walkSources(srcDir)) {
    if (allowed.has(file) || /\.test\.[cm]?[jt]sx?$/.test(file)) continue;
    if (classifyImporter(file, projectRoot, apps).kind !== "app") continue;
    const source = await readFile(file, "utf8");
    const match = /from\s+["'](exceljs|pdf-lib|pdfkit|xlsx)["']/.exec(source);
    if (match) {
      violations.push({
        rule: RULE_DUPLICATE_PRIMITIVE,
        file,
        specifier: match[1],
        detail: `App file imports "${match[1]}" directly. Export and import tables through "@platform/utilities/tabular".`,
      });
    }
  }

  return violations;
}

/**
 * Prisma delegate receivers a service can hold: `prisma.x`, `db.x`, `tx.x`,
 * `this.db.x`, `ports.prisma.x` ... Only the property name is compared against
 * the model list, so an unrelated `foo.vendor` is not flagged.
 */
const DB_RECEIVER_NAMES = new Set(["prisma", "db", "tx", "client", "dbClient", "transaction", "database"]);

export function parsePrismaOwnership(schemaSource) {
  const models = new Map();
  for (const block of schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const schema = /@@schema\("([^"]+)"\)/.exec(block[2])?.[1];
    if (schema) models.set(block[1], schema);
  }
  const relations = [];
  for (const block of schemaSource.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    for (const line of block[2].split("\n")) {
      const field = /^\s*(\w+)\s+(\w+)(?:\[\])?\??\s.*@relation\(/.exec(line);
      if (field && models.has(field[2])) relations.push({ model: block[1], field: field[1], target: field[2] });
    }
  }
  const declared = /schemas\s*=\s*\[([^\]]*)\]/.exec(schemaSource)?.[1] ?? "";
  const schemas = [...declared.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  return { models, relations, schemas };
}

function receiverName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function literalTexts(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  return [];
}

/**
 * Database ownership: each Prisma schema (`@@schema`) is owned by the app of the
 * same name (`master_data` -> masterdata) or by the platform. A file may touch a
 * model, or name a schema in raw SQL, only when it belongs to the owner. Shell
 * files (`src/app`, `src/application`) count as platform. Tests are exempt:
 * they seed and inspect across ownership on purpose. Independently of any file,
 * a Prisma `@relation` may not join models of two different schemas.
 */
/**
 * The Prisma schema as text: `prisma/schema/*.prisma` (one file per database schema) when that folder exists,
 * otherwise the single `prisma/schema.prisma`. `path` names what to point a violation at.
 */
export async function readPrismaSchema(projectRoot) {
  const folder = join(projectRoot, "prisma", "schema");
  try {
    const names = (await readdir(folder)).filter((name) => name.endsWith(".prisma")).sort();
    if (names.length > 0) {
      const parts = [];
      for (const name of names) parts.push(await readFile(join(folder, name), "utf8"));
      return { source: parts.join("\n"), path: folder };
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    const file = join(projectRoot, "prisma", "schema.prisma");
    return { source: await readFile(file, "utf8"), path: file };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function collectDatabaseOwnershipViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const schemaRead = await readPrismaSchema(projectRoot);
  if (!schemaRead) return [];
  const { models, relations, schemas } = parsePrismaOwnership(schemaRead.source);
  if (models.size === 0) return [];

  const violations = [];
  // A relation is a foreign key; it may not cross a schema, so no app can be
  // migrated or deleted into by another app's tables (cross-app FKs are forbidden).
  for (const { model, field, target } of relations) {
    if (models.get(model) === models.get(target)) continue;
    violations.push({
      rule: RULE_DATABASE_OWNERSHIP,
      file: schemaRead.path,
      specifier: `${model}.${field} -> ${target}`,
      detail: `Prisma relation ${model}.${field} points from schema "${models.get(model)}" to ${target} in schema "${models.get(target)}". Store a plain id (and a label snapshot when history matters), not a cross-schema foreign key.`,
    });
  }

  const apps = await listAppsInDir(join(srcDir, "apps"));
  const ownerOfSchema = (schema) => {
    const owner = schema.replace(/_/g, "");
    return owner === "platform" || apps.includes(owner) ? owner : null;
  };
  const delegates = new Map([...models].map(([model, schema]) => [model[0].toLowerCase() + model.slice(1), { model, schema }]));
  const modelNames = [...models.keys()].sort((a, b) => b.length - a.length);
  const modelOfTypeName = (name) => modelNames.find((model) => name === model || (name.startsWith(model) && /[A-Z]/.test(name[model.length])));
  const schemaPattern = schemas.length > 0 ? new RegExp(`"(${schemas.join("|")})"\\s*\\.\\s*"`) : null;

  for (const file of await walkSources(srcDir)) {
    if (/\.(test|spec)\.[jt]sx?$/.test(file)) continue;
    const importer = classifyImporter(file, projectRoot, apps);
    let fileOwner;
    if (importer.kind === "app") fileOwner = importer.app;
    else if (importer.kind === "platform") fileOwner = "platform";
    else if (isInside(join(srcDir, "app"), file) || isInside(join(srcDir, "application"), file)) fileOwner = "platform";
    else continue;

    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
    const report = (token, ownerApp, what) =>
      violations.push({
        rule: RULE_DATABASE_OWNERSHIP,
        file,
        specifier: token,
        detail: `${fileOwner === "platform" ? "platform/shell" : `app "${fileOwner}"`} code touches ${what}, which is owned by "${ownerApp}". Reach it through the owner's public contract, not through the shared Prisma client.`,
      });
    const check = (token, schema, what) => {
      const owner = ownerOfSchema(schema);
      if (owner && owner !== fileOwner) report(token, owner, what);
    };

    const visit = (node) => {
      if (ts.isPropertyAccessExpression(node)) {
        const receiver = receiverName(node.expression);
        const hit = receiver && DB_RECEIVER_NAMES.has(receiver) ? delegates.get(node.name.text) : undefined;
        if (hit) check(`${receiver}.${node.name.text}`, hit.schema, `model "${hit.model}" (schema "${hit.schema}")`);
        if (ts.isIdentifier(node.expression) && node.expression.text === "Prisma") {
          const model = modelOfTypeName(node.name.text);
          if (model) check(`Prisma.${node.name.text}`, models.get(model), `model "${model}" (schema "${models.get(model)}")`);
        }
      } else if (ts.isQualifiedName(node) && ts.isIdentifier(node.left) && node.left.text === "Prisma") {
        const model = modelOfTypeName(node.right.text);
        if (model) check(`Prisma.${node.right.text}`, models.get(model), `model "${model}" (schema "${models.get(model)}")`);
      }
      if (schemaPattern) {
        for (const text of literalTexts(node)) {
          const match = schemaPattern.exec(text);
          if (match) check(`"${match[1]}"."...`, match[1], `schema "${match[1]}" in raw SQL`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return violations;
}

export async function collectDuplicateMachineryViolations({
  projectRoot = process.cwd(),
  srcDir,
  machinery = APP_DUPLICATE_MACHINERY,
} = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const violations = [];
  const apps = await listAppsInDir(join(srcDir, "apps"));
  const matched = new Map(machinery.map((entry) => [entry, new Set()]));

  for (const file of await walkSources(srcDir)) {
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) continue;
    // Apps and the shell lanes under src/app; the platform layer owns the canonical copies.
    if (classifyImporter(file, projectRoot, apps).kind === "platform") continue;
    const source = await readFile(file, "utf8");
    for (const entry of machinery) {
      if (!entry.pattern.test(source)) continue;
      matched.get(entry).add(file);
      if (!entry.baseline.some((p) => resolve(projectRoot, p) === file)) {
        violations.push({
          rule: RULE_DUPLICATE_MACHINERY,
          file,
          specifier: entry.name,
          detail: `New private copy. Use the canonical implementation: ${entry.canonical}.`,
        });
      }
    }
  }
  for (const entry of machinery) {
    for (const path of entry.baseline) {
      if (matched.get(entry).has(resolve(projectRoot, path))) continue;
      violations.push({
        rule: RULE_STALE_ALLOW_LIST,
        file: resolve(projectRoot, path),
        specifier: entry.name,
        detail: "Baseline entry no longer matches (converged or deleted). Remove it from APP_DUPLICATE_MACHINERY.",
      });
    }
  }
  return violations;
}

async function walkAllFiles(dir, root = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name) || (dir === root && entry.name === GENERATED_ROOT_DIRECTORY)) continue;
      files.push(...(await walkAllFiles(path, root)));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}

/** Files under src that no rule can read: they would silently opt out of every check. */
export async function collectUnscannedFileViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const violations = [];
  for (const file of await walkAllFiles(srcDir)) {
    const ext = extname(basename(file));
    if (SOURCE_EXTENSIONS.has(ext) || NON_SOURCE_EXTENSIONS.has(ext)) continue;
    violations.push({
      rule: RULE_UNSCANNED_FILE,
      file,
      specifier: ext || "(no extension)",
      detail: "File is neither scanned source nor a known asset, so no boundary rule can see it. Delete it or rename it to a scanned extension.",
    });
  }
  return violations;
}


const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Resolves an extension-less import target to the source file it names (`x.ts`, `x.tsx`, `x/index.ts`, ...). */
async function resolveModuleFile(targetPath) {
  if (SOURCE_EXTENSIONS.has(extname(basename(targetPath))) && (await fileExists(targetPath))) return targetPath;
  for (const ext of MODULE_EXTENSIONS) if (await fileExists(targetPath + ext)) return targetPath + ext;
  for (const ext of MODULE_EXTENSIONS) if (await fileExists(join(targetPath, "index" + ext))) return join(targetPath, "index" + ext);
  return null;
}

function hasUseClientDirective(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) {
      if (statement.expression.text === "use client") return true;
      continue;
    }
    break;
  }
  return false;
}

function hasExportModifier(node) {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * Where an exported name is really defined. Follows `export { a } from`, `export { a as b } from` and
 * `export * from` chains, so a barrel that re-exports a client-module function does not hide it.
 */
async function exportOrigin(file, name, context, seen = new Set()) {
  const key = `${file}::${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const info = await context.moduleInfo(file);
  if (!info) return null;
  if (info.local.has(name)) return { file, kind: info.local.get(name), client: info.client };
  const named = info.reexportNamed.get(name);
  if (named) {
    const target = await context.resolve(named.specifier, file);
    if (target) return exportOrigin(target, named.original, context, seen);
  }
  for (const specifier of info.reexportStar) {
    const target = await context.resolve(specifier, file);
    if (!target) continue;
    const found = await exportOrigin(target, name, context, seen);
    if (found) return found;
  }
  return null;
}

/**
 * Server code (no `"use client"` directive) must not CALL a function that lives in a `"use client"` module: Next turns
 * every export of such a module into a client reference, so the call throws at render time. Components (rendered as
 * JSX), types, and hooks are not in scope; only lower-case identifiers invoked as a function are. R8.164 and R8.210
 * both shipped this failure and neither `npm test` nor `next build` caught it.
 */
export async function collectServerClientCallViolations({ projectRoot = process.cwd(), srcDir } = {}) {
  projectRoot = resolve(projectRoot);
  srcDir = srcDir ? resolve(srcDir) : join(projectRoot, "src");
  const aliasMap = await readAliasMap(projectRoot);
  const cache = new Map();
  const context = {
    async resolve(specifier, importer) {
      const target = resolveSpecifier(specifier, importer, aliasMap, projectRoot);
      return target ? resolveModuleFile(target) : null;
    },
    async moduleInfo(file) {
      if (cache.has(file)) return cache.get(file);
      let info = null;
      try {
        const source = await readFile(file, "utf8");
        const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
        info = { client: hasUseClientDirective(sourceFile), local: new Map(), reexportNamed: new Map(), reexportStar: [], sourceFile };
        for (const statement of sourceFile.statements) {
          if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement) && statement.name) {
            info.local.set(statement.name.text, "function");
            if (statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) info.local.set("default", "function");
          } else if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              if (!ts.isIdentifier(declaration.name)) continue;
              const init = declaration.initializer;
              const isFunction = Boolean(init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)));
              info.local.set(declaration.name.text, isFunction ? "function" : "value");
            }
          } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
            if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
              const specifier = statement.moduleSpecifier.text;
              if (!statement.exportClause) info.reexportStar.push(specifier);
              else if (ts.isNamedExports(statement.exportClause)) {
                for (const element of statement.exportClause.elements) {
                  if (element.isTypeOnly) continue;
                  info.reexportNamed.set(element.name.text, { specifier, original: (element.propertyName ?? element.name).text });
                }
              }
            }
          }
        }
      } catch {
        info = null;
      }
      cache.set(file, info);
      return info;
    },
  };

  const violations = [];
  for (const file of await walkSources(srcDir)) {
    if (/\.(test|spec)\.[jt]sx?$/.test(file)) continue;
    const info = await context.moduleInfo(file);
    if (!info || info.client) continue;
    // Local name -> { specifier, original } for every named value import.
    const imported = new Map();
    for (const statement of info.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
      const bindings = statement.importClause.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        imported.set(element.name.text, { specifier: statement.moduleSpecifier.text, original: (element.propertyName ?? element.name).text });
      }
    }
    if (imported.size === 0) continue;
    const called = new Set();
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) called.add(node.expression.text);
      ts.forEachChild(node, visit);
    };
    visit(info.sourceFile);
    for (const [localName, { specifier, original }] of imported) {
      if (!called.has(localName) || /^[A-Z]/.test(localName) || /^use[A-Z]/.test(localName)) continue;
      const target = await context.resolve(specifier, file);
      if (!target) continue;
      const origin = await exportOrigin(target, original, context);
      if (origin && origin.client && origin.kind === "function") {
        violations.push({
          rule: RULE_SERVER_CALLS_CLIENT_FUNCTION,
          file,
          specifier: `${localName} from ${specifier}`,
          detail: `Server code calls "${original}", which is defined in "${relative(projectRoot, origin.file).split(sep).join("/")}" (a "use client" module). Move the pure function into a module without the directive and import it from there.`,
        });
      }
    }
  }
  return violations;
}


/**
 * Migrations that predate this rule and legitimately touch two app schemas. Ratchet: a new migration must not join
 * this list (split it per app instead), and an entry whose migration no longer spans two schemas fails as stale.
 */
export const MIGRATION_ISOLATION_ALLOW_LIST = [
  // Owner-approved, migration-time-only Master Data vocabulary normalization.
  // It is intentionally the sole cross-app write exception in WO-MD-PROGRAM-01.
  "20261001100000_masterdata_lowercase_unit_codes",
  "20261001103000_bq_item_unit_lowercase",
  "20260906110000_bq_project_deletion_workflow",
  "20260907090000_regression_sku_and_custom_snapshot",
  "20260907091000_r6_21_db_invariants",
];

/**
 * One migration may change the tables of at most one app schema (studioflow, master_data, bq). The platform schema
 * may appear alongside, because grants and audit rows live there. This keeps a fix in one app from silently rewriting
 * another app's tables in the same deploy step.
 */
export async function collectMigrationIsolationViolations({ projectRoot = process.cwd(), allowList = MIGRATION_ISOLATION_ALLOW_LIST } = {}) {
  projectRoot = resolve(projectRoot);
  const schemaRead = await readPrismaSchema(projectRoot);
  const datasource = schemaRead ? /schemas\s*=\s*\[([^\]]*)\]/.exec(schemaRead.source) : null;
  if (!datasource) return [];
  const appSchemas = [...datasource[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]).filter((name) => name !== "platform");
  const migrationsDir = join(projectRoot, "prisma", "migrations");
  let names;
  try {
    names = (await readdir(migrationsDir, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const violations = [];
  const spanning = new Set();
  for (const name of names) {
    let sql;
    try {
      sql = await readFile(join(migrationsDir, name, "migration.sql"), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const touched = appSchemas.filter((schema) => new RegExp(`"${schema}"\\s*\\.|(?:SCHEMA|SCHEMAS)\\s+"?${schema}"?[\\s;]`, "i").test(sql));
    if (touched.length < 2) continue;
    spanning.add(name);
    if (!allowList.includes(name)) {
      violations.push({
        rule: RULE_MIGRATION_ISOLATION,
        file: join(migrationsDir, name, "migration.sql"),
        specifier: touched.join(", "),
        detail: `Migration ${name} changes tables in ${touched.length} app schemas (${touched.join(", ")}). Split it into one migration per app so a change in one app cannot rewrite another app's tables in the same step.`,
      });
    }
  }
  for (const entry of allowList) {
    if (!spanning.has(entry)) {
      violations.push({
        rule: RULE_STALE_ALLOW_LIST,
        file: join(migrationsDir, entry, "migration.sql"),
        specifier: entry,
        detail: "Allow-listed migration no longer spans two app schemas (or no longer exists). Remove it from MIGRATION_ISOLATION_ALLOW_LIST.",
      });
    }
  }
  return violations;
}

export async function collectAllViolations(options = {}) {
  const boundary = await collectBoundaryViolations(options);
  const modules = await collectModuleBoundaryViolations(options);
  const permission = await collectPermissionVocabularyViolations(options);
  const route = await collectRouteOwnershipViolations(options);
  const duplicate = await collectDuplicatePrimitiveViolations(options);
  const database = await collectDatabaseOwnershipViolations(options);
  const unscanned = await collectUnscannedFileViolations(options);
  const machinery = await collectDuplicateMachineryViolations(options);
  const clientCalls = await collectServerClientCallViolations(options);
  const migrations = await collectMigrationIsolationViolations(options);
  return { boundary, modules, permission, route, duplicate, database, unscanned, machinery, clientCalls, migrations };
}

async function main() {
  const projectRoot = process.cwd();
  let all;
  try {
    all = await collectAllViolations({ projectRoot });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  const rel = (p) => relative(projectRoot, p) || p;
  const sections = [
    ["Imports and layers", all.boundary],
    ["Module dependencies and state writer", all.modules],
    ["Permission vocabulary (SSOT)", all.permission],
    ["App route ownership", all.route],
    ["Duplicate display primitives", all.duplicate],
    ["Database ownership", all.database],
    ["Unscanned files", all.unscanned],
    ["Duplicated generic machinery", all.machinery],
    ["Server code calling client-module functions", all.clientCalls],
    ["Migration isolation", all.migrations],
  ];
  let count = 0;
  for (const [title, list] of sections) {
    if (list.length === 0) continue;
    console.error(`\nArchitecture boundaries — ${title}:`);
    for (const violation of list) {
      count += 1;
      console.error(`  [${violation.rule}] ${rel(violation.file)}`);
      if (violation.specifier) console.error(`    token:    ${violation.specifier}`);
      console.error(`    problem:  ${violation.detail}`);
    }
  }
  if (count > 0) {
    console.error(`\nArchitecture boundaries FAILED (${count} violation(s))`);
    process.exitCode = 1;
    return;
  }
  console.log("Architecture boundaries OK");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
