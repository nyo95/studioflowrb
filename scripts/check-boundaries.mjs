import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

/**
 * App-owned files where a raw `Intl.DateTimeFormat` display primitive is
 * deliberately retained as a proven, recorded deferral (see
 * docs/UTILITY-INVENTORY.md). Paths are repo-relative with forward slashes.
 * Anything else matching the canonical pattern must use `formatInstant` from
 * "@platform/utilities/date".
 */
export const APP_DUPLICATE_PRIMITIVE_ALLOW_LIST = [
  "src/app/(platform)/bq/project-deletion-review.tsx",
  // Archived rebuild StudioFlow code — deactivated by SF-R1 (R8.71), custom formatters preserved as-is.
  "src/app/(platform)/studioflow/projects/_legacy_project_id/page.tsx",
  "src/app/(platform)/studioflow/projects/_legacy_project_id/files/page.tsx",
  "src/app/(platform)/studioflow/projects/_legacy_project_id/mom/[momId]/page.tsx",
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRECTORIES = new Set(["node_modules", ".next", "generated"]);

const PERMISSION_LITERAL_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)?$/;
const PERMISSION_CONSUMPTION_FUNCTIONS = new Set(["hasPermission", "hasAnyPermission", "hasAllPermissions", "requirePermission"]);
const LEGACY_UI_CLASS_PATTERN =
  /\b(?:ui-button|ui-btn|ui-card|ui-table|ui-input|ui-select|ui-toolbar|ui-dialog|ui-modal|ui-form|ui-menu|ui-nav|ui-tab|ui-badge|ui-pill|ui-switch|ui-radio|ui-checkbox|ui-dropdown|ui-accordion|ui-alert|ui-avatar|ui-breadcrumb|ui-pagination|ui-search|ui-stat|ui-progress|ui-stepper|ui-tag|ui-toggle|ui-tooltip)\b/;
const INT_DATETIME_FORMAT_PATTERN = /new\s+Intl\.DateTimeFormat\s*\(/;

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

export function routeLaneApp(filePath, projectRoot, apps) {
  const routePlatformRoot = join(resolve(projectRoot), "src", "app", "(platform)");
  if (!isInside(routePlatformRoot, filePath) && relative(routePlatformRoot, filePath) !== "") return null;
  const segments = relative(routePlatformRoot, filePath).split(sep);
  if (apps.includes(segments[0])) return segments[0];
  return null;
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
  const routeApp = routeLaneApp(targetPath, projectRoot, apps);
  if (routeApp) return { kind: "app", app: routeApp, layer: "route" };
  return { kind: "other" };
}

export function classifyImporter(filePath, projectRoot, apps) {
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
  const routeApp = routeLaneApp(filePath, root, apps);
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

function importDeclares(source, declaredName, fromModule) {
  for (const m of source.matchAll(/import\s*\{(?:[\s\S]*?)\}\s*from\s*["']([^"']+)["']/g)) {
    if (m[1] !== fromModule) continue;
    if (new RegExp(`\\b${declaredName}\\b`).test(m[0])) return true;
  }
  return false;
}

export async function collectBoundaryViolations({ projectRoot = process.cwd(), srcDir } = {}) {
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
    const importer = classifyImporter(file, projectRoot, apps);
    if (importer.kind !== "app" && importer.kind !== "platform") continue;
    const source = await readFile(file, "utf8");
    const importerCore =
      importer.kind === "platform" && isInside(platformRoot, file) && relative(platformRoot, file).split(sep)[0] === "core";

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

  for (const file of await walkSources(srcDir)) {
    if (allowed.has(file)) continue;
    const importer = classifyImporter(file, projectRoot, apps);
    if (importer.kind !== "app") continue;
    const source = await readFile(file, "utf8");
    if (INT_DATETIME_FORMAT_PATTERN.test(source)) {
      violations.push({
        rule: RULE_DUPLICATE_PRIMITIVE,
        file: file,
        specifier: "new Intl.DateTimeFormat(...)",
        detail: `App file uses the raw Intl.DateTimeFormat display primitive. Use the canonical "formatInstant" from "@platform/utilities/date"; converge or record an explicit deferral in docs/UTILITY-INVENTORY.md.`,
      });
    }
  }

  return violations;
}

export async function collectAllViolations(options = {}) {
  const boundary = await collectBoundaryViolations(options);
  const permission = await collectPermissionVocabularyViolations(options);
  const route = await collectRouteOwnershipViolations(options);
  const duplicate = await collectDuplicatePrimitiveViolations(options);
  return { boundary, permission, route, duplicate };
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
    ["Permission vocabulary (SSOT)", all.permission],
    ["App route ownership", all.route],
    ["Duplicate display primitives", all.duplicate],
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