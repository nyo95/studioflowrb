import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  collectAllViolations,
  collectBoundaryViolations,
  collectDuplicatePrimitiveViolations,
  collectPermissionVocabularyViolations,
  collectRouteOwnershipViolations,
  RULE_APP_TO_OTHER_APP_INTERNAL,
  RULE_APP_TO_UI_ENGINE_INTERNAL,
  RULE_CORE_TO_INFRASTRUCTURE,
  RULE_CORE_TO_UI_ENGINE,
  RULE_DUPLICATE_PRIMITIVE,
  RULE_PERMISSION_VOCABULARY,
  RULE_PLATFORM_TO_APP,
  RULE_RAW_LEGACY_UI_CLASS,
  RULE_ROUTE_OWNERSHIP,
} from "./check-boundaries.mjs";

const TSCONFIG = {
  compilerOptions: {
    paths: {
      "@/*": ["./src/*"],
      "@platform/*": ["./src/platform/*"],
      "@alpha/*": ["./src/apps/alpha/*"],
      "@beta/*": ["./src/apps/beta/*"],
    },
  },
};

const FILES = {
  "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),

  "src/apps/alpha/domain/rule.ts": `export const alphaRule = "alpha";\n`,
  "src/apps/alpha/application/do.ts": `import { alphaRule } from "../domain/rule";\nexport const run = () => alphaRule;\n`,
  "src/apps/alpha/infrastructure/db.ts": `export const db = {};\n`,
  "src/apps/alpha/ui/button.ts": `import { alphaRule } from "@alpha/domain/rule";\nexport const Button = () => alphaRule;\n`,
  "src/apps/alpha/public/index.ts": `export {};\n`,

  "src/apps/beta/domain/rule.ts": `export const betaRule = "beta";\n`,
  "src/apps/beta/application/use-case.ts": `export const useCase = () => "beta";\n`,
  "src/apps/beta/infrastructure/db.ts": `export const betaDb = {};\n`,
  "src/apps/beta/ui/widget.ts": `export const Widget = () => "beta";\n`,
  "src/apps/beta/public/index.ts": `export {};\n`,

  "src/platform/core/auth.ts": `import { anything } from "@alpha/public";\nexport const auth = anything;\n`,
  "src/platform/utilities/normalization/index.ts": `export const normalize = (v: string) => v;\n`,
  "src/platform/utilities/slug/index.ts": `import { normalize } from "../normalization";\nexport const slug = (v: string) => normalize(v);\n`,
  "src/platform/core/ok.ts": `import { normalize } from "@platform/utilities/normalization";\nexport const n = normalize;\n`,
  "src/platform/core/guard.ts": `import { Text } from "@/platform/ui_engine";\nexport const g = Text;\n`,
  "src/platform/core/persist.ts": `import { storage } from "@/platform/infrastructure/storage";\nexport const s = storage;\n`,
  "src/platform/infrastructure/storage.ts": `export const storage = {};\n`,

  "src/apps/alpha/same-app-relative.ts": `import { alphaRule } from "./domain/rule";\nexport const x = alphaRule;\n`,
  "src/apps/alpha/same-app-alias.ts": `import { alphaRule } from "@alpha/domain/rule";\nexport const y = alphaRule;\n`,
  "src/apps/alpha/app-to-platform.ts": `import { slug } from "@platform/utilities/slug";\nexport const s = slug;\n`,
  "src/apps/alpha/cross-app-public-alias.ts": `import { something } from "@beta/public";\nexport const p = something;\n`,
  "src/apps/alpha/cross-app-public-relative.ts": `import { something } from "../beta/public";\nexport const q = something;\n`,
  "src/apps/alpha/index-ui.tsx": `import { Text } from "@/platform/ui_engine";\nexport const E = () => <span className="font-ui-mono animate-ui-spin">x</span>;\n`,
  "src/apps/alpha/deep-ui.ts": `import { Text } from "@/platform/ui_engine/components/button";\nexport const t = Text;\n`,
  "src/apps/alpha/legacy-class.tsx": `export const L = () => <div className="ui-card is-open">x</div>;\n`,

  "src/app/(platform)/alpha/route-page.tsx": `import { alphaRule } from "@alpha/domain/rule";\nexport const page = alphaRule;\n`,
  "src/app/(platform)/alpha/route-cross.tsx": `import { Widget } from "@beta/ui/widget";\nexport const bad = Widget;\n`,

  "src/apps/alpha/reject-domain.ts": `import { betaRule } from "@beta/domain/rule";\nexport const bad1 = betaRule;\n`,
  "src/apps/alpha/reject-application-catchall.ts": `import { useCase } from "@/apps/beta/application/use-case";\nexport const bad2 = useCase;\n`,
  "src/apps/alpha/reject-infrastructure-relative.ts": `import { betaDb } from "../beta/infrastructure/db";\nexport const bad3 = betaDb;\n`,
  "src/apps/alpha/reject-ui.ts": `import { Widget } from "@beta/ui/widget";\nexport const bad4 = Widget;\n`,
  "src/apps/alpha/reject-ui-dynamic.ts": `export async function load() {\n  return import("@beta/ui/widget");\n}\n`,
  "src/apps/alpha/reject-export-from.ts": `export { betaRule } from "@beta/domain/rule";\n`,
  "src/apps/alpha/reject-require.ts": `const useCase = require("@beta/application/use-case");\nexport const bad5 = useCase;\n`,
  "src/apps/alpha/reject-import-equals.ts": `import betaDb = require("../beta/infrastructure/db");\nexport const bad6 = betaDb;\n`,

  "src/apps/alpha/commented-imports.ts": `// import { betaRule } from "@beta/domain/rule";\n/* import { Widget } from "@beta/ui/widget"; */\nexport const clean1 = 1;\n`,
  "src/apps/alpha/import-like-strings.ts": `const doc = 'import { betaRule } from "@beta/domain/rule"';\nconst doc2 = "from '@beta/application/use-case'";\nconst doc3 = \`require("@beta/infrastructure/db")\`;\nconst doc4 = 'import "@beta/ui/widget"';\nconst doc5 = 'await import("@beta/domain/rule")';\nexport const docs = [doc, doc2, doc3, doc4, doc5];\n`,
  "src/generated/prisma/must-be-ignored.ts": `import { Widget } from "@beta/ui/widget";\nexport const ignored = Widget;\n`,
};

async function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content);
  }
}

function violationKey(projectRoot, violation) {
  const lane = violation.targetApp && violation.targetLayer ? `${violation.targetApp}/${violation.targetLayer}` : (violation.specifier ?? "");
  return `${relative(projectRoot, violation.file).replaceAll("\\", "/")} | ${violation.rule} | ${lane}`;
}

const projectRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-"));
try {
  await writeTree(projectRoot, FILES);
  const violations = await collectBoundaryViolations({ projectRoot });
  const actualKeys = violations.map((v) => violationKey(projectRoot, v)).sort();

  const expectedKeys = [
    `src/app/(platform)/alpha/route-cross.tsx | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/apps/alpha/legacy-class.tsx | ${RULE_RAW_LEGACY_UI_CLASS} | ui-card`,
    `src/apps/alpha/deep-ui.ts | ${RULE_APP_TO_UI_ENGINE_INTERNAL} | @/platform/ui_engine/components/button`,
    `src/apps/alpha/reject-domain.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/domain`,
    `src/apps/alpha/reject-application-catchall.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/application`,
    `src/apps/alpha/reject-infrastructure-relative.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/infrastructure`,
    `src/apps/alpha/reject-ui.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/apps/alpha/reject-ui-dynamic.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/apps/alpha/reject-export-from.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/domain`,
    `src/apps/alpha/reject-require.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/application`,
    `src/apps/alpha/reject-import-equals.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/infrastructure`,
    `src/platform/core/auth.ts | ${RULE_PLATFORM_TO_APP} | alpha/public`,
    `src/platform/core/guard.ts | ${RULE_CORE_TO_UI_ENGINE} | @/platform/ui_engine`,
    `src/platform/core/persist.ts | ${RULE_CORE_TO_INFRASTRUCTURE} | @/platform/infrastructure/storage`,
  ].sort();

  assert.deepEqual(actualKeys, expectedKeys);

  const legalFiles = [
    "src/app/(platform)/alpha/route-page.tsx",
    "src/apps/alpha/same-app-relative.ts",
    "src/apps/alpha/same-app-alias.ts",
    "src/apps/alpha/app-to-platform.ts",
    "src/apps/alpha/cross-app-public-alias.ts",
    "src/apps/alpha/cross-app-public-relative.ts",
    "src/apps/alpha/index-ui.tsx",
    "src/apps/alpha/commented-imports.ts",
    "src/apps/alpha/import-like-strings.ts",
    "src/apps/beta/public/index.ts",
    "src/platform/utilities/slug/index.ts",
    "src/platform/core/ok.ts",
    "src/platform/infrastructure/storage.ts",
    "src/generated/prisma/must-be-ignored.ts",
  ];
  const flagged = new Set(violations.map((v) => relative(projectRoot, v.file)));
  for (const file of legalFiles) {
    assert.ok(!flagged.has(file), `legal fixture must not be flagged: ${file}`);
  }

  const platformOnlyRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-platform-only-"));
  try {
    await writeTree(platformOnlyRoot, {
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["./src/*"], "@platform/*": ["./src/platform/*"] } },
      }),
      "src/platform/core/index.ts": "export const core = true;\n",
    });
    assert.deepEqual(await collectBoundaryViolations({ projectRoot: platformOnlyRoot }), []);
  } finally {
    await rm(platformOnlyRoot, { recursive: true, force: true });
  }

  console.log("PASS boundary fixtures: 14 rejections, legal cases clean, platform-only tree accepted");
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}

const FOUNDATION_FILES = {
  "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),

  "src/apps/sun/service.ts": `export const SUN_PERMISSIONS = { access: "sun.access", manage: "sun.manage" };\n`,
  "src/apps/sun/public/index.ts": `export { SUN_PERMISSIONS } from "../service";\nexport { SUN_ROUTES } from "./nav";\n`,
  "src/apps/sun/public/nav.ts": `export const SUN_ROUTES = { root: "/sun", projects: "/sun/projects" };\n`,
  "src/app/(platform)/sun/page.tsx": `import { something } from "@/apps/moon/public";\nexport const page = something;\n`,
  "src/app/(platform)/sun/bad.tsx": `import { Widget } from "@/apps/moon/ui/widget";\nexport const bad = Widget;\n`,

  "src/apps/moon/service.ts": `export const MOON_PERMISSIONS = { access: "moon.access", read: "moon.read", dup: "sun.access", foreign: "external.read", platformDup: "platform.settings.read" };\n`,
  "src/apps/moon/public/index.ts": `export { MOON_PERMISSIONS } from "../service";\n`,
  "src/apps/moon/ui/widget.ts": `export const Widget = () => "moon";\n`,
  "src/apps/moon/gate.ts": `import { hasAnyPermission } from "@platform/core/rbac/index";\nexport const gate = (g) => hasAnyPermission(g, ["moon.read", "moon.stray.read"]);\n`,
  "src/app/(platform)/moon/page.tsx": `export const page = "moon";\n`,

  "src/apps/ven/service.ts": `export const VEN_PERMISSIONS = { access: "ven.access", read: "ven.read" };\n`,
  "src/apps/ven/public/index.ts": `export { VEN_PERMISSIONS } from "../service";\nexport { VEN_ROUTES } from "./nav";\n`,
  "src/apps/ven/public/nav.ts": `import { VEN_PERMISSIONS } from "../service";\nexport const VEN_ROUTES = { root: "/ven", list: "/other/ven" };\n`,
  "src/app/(platform)/ven/page.tsx": `export const page = "ven";\n`,
  "src/apps/ven/deep.ts": `import { Text } from "@/platform/ui_engine/components/button";\nexport const t = Text;\n`,
  "src/apps/ven/legacy.tsx": `export const L = () => <div className="ui-card is-open">x</div>;\n`,
  "src/apps/ven/indexes.tsx": `import { Text } from "@/platform/ui_engine";\nexport const E = () => <span className="font-ui-mono">x</span>;\n`,
  "src/apps/ven/format.ts": `export const stamp = (d: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(d);\n`,
  "src/apps/ven/allowed.ts": `export const stamp = (d: Date) => new Intl.DateTimeFormat("en-CA", { dateStyle: "short" }).format(d);\n`,

  "src/app/app-registrations.ts": `import type { AppPermissionRegistrationInput } from "@platform/core/rbac/registry";\nimport { SUN_PERMISSIONS } from "@/apps/sun/public";\nimport { MOON_PERMISSIONS } from "@/apps/moon/public";\nimport { VEN_PERMISSIONS } from "@/apps/ven/public";\n\nexport const APP_REGISTRATIONS: readonly AppPermissionRegistrationInput[] = [\n  { appId: "sun", name: "Sun", rootPath: "/sun", permissions: Object.values(SUN_PERMISSIONS) },\n  { appId: "moon", name: "Moon", rootPath: "/moon", permissions: Object.values(MOON_PERMISSIONS) },\n  { appId: "ven", name: "Ven", rootPath: "/ven", permissions: Object.values(VEN_PERMISSIONS) },\n];\n`,

  "src/platform/core/rbac/index.ts": `export const UNUSED = true;\n`,
  "src/platform/core/rbac/registry.ts": `export const PLATFORM_PERMISSIONS = [ "platform.settings.read" ] as const;\n`,
  "src/platform/infrastructure/storage.ts": `export const storage = {};\n`,
  "src/platform/core/persist.ts": `import { storage } from "@/platform/infrastructure/storage";\nexport const s = storage;\n`,
  "src/platform/core/guard.ts": `import { Text } from "@/platform/ui_engine";\nexport const g = Text;\n`,
  "src/platform/core/ok.ts": `import { normalize } from "@platform/utilities/normalization";\nexport const n = normalize;\n`,
  "src/platform/utilities/normalization/index.ts": `export const normalize = (v: string) => v;\n`,
  "src/platform/ui_engine/index.ts": `export { };\nexport const Text = "Text";\n`,
};

const foundationRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-foundation-"));
try {
  await writeTree(foundationRoot, FOUNDATION_FILES);

  const boundary = await collectBoundaryViolations({ projectRoot: foundationRoot });
  assert.deepEqual(
    boundary.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/app/(platform)/sun/bad.tsx | ${RULE_APP_TO_OTHER_APP_INTERNAL} | moon/ui`,
      `src/apps/ven/deep.ts | ${RULE_APP_TO_UI_ENGINE_INTERNAL} | @/platform/ui_engine/components/button`,
      `src/apps/ven/legacy.tsx | ${RULE_RAW_LEGACY_UI_CLASS} | ui-card`,
      `src/platform/core/guard.ts | ${RULE_CORE_TO_UI_ENGINE} | @/platform/ui_engine`,
      `src/platform/core/persist.ts | ${RULE_CORE_TO_INFRASTRUCTURE} | @/platform/infrastructure/storage`,
    ].sort(),
  );

  const permission = await collectPermissionVocabularyViolations({ projectRoot: foundationRoot });
  assert.deepEqual(
    permission.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/moon/gate.ts | ${RULE_PERMISSION_VOCABULARY} | moon.stray.read`,
      `src/apps/moon/service.ts | ${RULE_PERMISSION_VOCABULARY} | platform.settings.read`,
      `src/apps/moon/service.ts | ${RULE_PERMISSION_VOCABULARY} | sun.access`,
      `src/apps/moon/service.ts | ${RULE_PERMISSION_VOCABULARY} | external.read`,
    ].sort(),
  );

  const route = await collectRouteOwnershipViolations({ projectRoot: foundationRoot });
  assert.deepEqual(
    route.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/moon/public/nav.ts | ${RULE_ROUTE_OWNERSHIP} | `,
      `src/apps/ven/public/nav.ts | ${RULE_ROUTE_OWNERSHIP} | /other/ven`,
      `src/apps/ven/public/nav.ts | ${RULE_ROUTE_OWNERSHIP} | ../service`,
    ].sort(),
  );

  const duplicates = await collectDuplicatePrimitiveViolations({ projectRoot: foundationRoot });
  assert.deepEqual(
    duplicates.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/ven/format.ts | ${RULE_DUPLICATE_PRIMITIVE} | new Intl.DateTimeFormat(...)`,
      `src/apps/ven/allowed.ts | ${RULE_DUPLICATE_PRIMITIVE} | new Intl.DateTimeFormat(...)`,
    ].sort(),
  );

  const duplicatesWithAllow = await collectDuplicatePrimitiveViolations({
    projectRoot: foundationRoot,
    allowList: ["src/apps/ven/allowed.ts"],
  });
  assert.deepEqual(
    duplicatesWithAllow.map((v) => violationKey(foundationRoot, v)).sort(),
    [`src/apps/ven/format.ts | ${RULE_DUPLICATE_PRIMITIVE} | new Intl.DateTimeFormat(...)`],
  );

  const combined = await collectAllViolations({ projectRoot: foundationRoot });
  assert.equal(combined.boundary.length, boundary.length);
  assert.equal(combined.permission.length, permission.length);
  assert.equal(combined.route.length, route.length);
  assert.equal(combined.duplicate.length, duplicates.length);

  console.log("PASS foundation fixtures: import/layer rules, permission SSOT, route ownership, duplicate primitives");
} finally {
  await rm(foundationRoot, { recursive: true, force: true });
}