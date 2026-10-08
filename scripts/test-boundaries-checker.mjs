import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import {
  collectAllViolations,
  collectBoundaryViolations,
  collectDatabaseOwnershipViolations,
  collectDuplicatePrimitiveViolations,
  collectUnscannedFileViolations,
  collectDuplicateMachineryViolations,
  collectServerClientCallViolations,
  collectMigrationIsolationViolations,
  RULE_MIGRATION_ISOLATION,
  RULE_SERVER_CALLS_CLIENT_FUNCTION,
  RULE_INTEGRATION_ROUTE_IMPORTS,
  RULE_DUPLICATE_MACHINERY,
  RULE_UNSCANNED_FILE,
  collectPermissionVocabularyViolations,
  collectRouteOwnershipViolations,
  RULE_APP_TO_OTHER_APP_INTERNAL,
  RULE_APP_TO_UI_ENGINE_INTERNAL,
  RULE_CORE_TO_INFRASTRUCTURE,
  RULE_CORE_TO_UI_ENGINE,
  RULE_DATABASE_OWNERSHIP,
  RULE_DOMAIN_TO_PERSISTENCE,
  RULE_DUPLICATE_PRIMITIVE,
  RULE_STALE_ALLOW_LIST,
  RULE_PERMISSION_VOCABULARY,
  RULE_PLATFORM_TO_APP,
  RULE_RAW_LEGACY_UI_CLASS,
  RULE_ROUTE_OWNERSHIP,
  RULE_SHELL_TO_APP_INTERNAL,
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

  // KB-037: an app-owned route group that is not under the app's own `/<app>`
  // root. Without PLATFORM_ROUTE_OWNERS these two files classified as "other"
  // and were skipped entirely, so neither the legal nor the illegal import was
  // ever examined.
  "src/app/(platform)/settings/general/beta-owned/page.tsx": `import { betaRule } from "@beta/domain/rule";\nexport const page = betaRule;\n`,
  "src/app/(platform)/settings/general/beta-owned/cross.tsx": `import { alphaRule } from "@alpha/domain/rule";\nexport const bad = alphaRule;\n`,
  "src/app/(platform)/settings/general/page.tsx": `import { betaRule } from "@beta/domain/rule";\nexport const unowned = betaRule;\n`,

  // Shell files (no app owns them) may reach an app only through public / runtime / route.
  "src/app/(platform)/settings/general/shell-public.tsx": `import { something } from "@beta/public";\nexport const ok1 = something;\n`,
  "src/app/(platform)/settings/general/shell-runtime.tsx": `import { betaService } from "@beta/runtime";\nexport const ok2 = betaService;\n`,
  "src/apps/beta/runtime.ts": `export const betaService = {};\n`,
  "src/application/coordinator.ts": `import { something } from "@beta/public";\nexport const ok3 = something;\n`,
  "src/application/bad-coordinator.ts": `import { betaDb } from "@beta/infrastructure/db";\nexport const bad = betaDb;\n`,

  // Route groups outside (platform) are owned by the app named in their first segment.
  "src/app/(document)/alpha/print/page.tsx": `import { alphaRule } from "@alpha/domain/rule";\nexport const doc = alphaRule;\n`,
  "src/app/(document)/alpha/print/cross.tsx": `import { betaRule } from "@beta/domain/rule";\nexport const bad = betaRule;\n`,

  // App domain code stays free of persistence (CORE.md "Layer access").
  "src/apps/alpha/domain/uses-generated.ts": `import type { PrismaClient } from "@/generated/prisma/client";\nexport type P = PrismaClient;\n`,
  "src/apps/alpha/domain/uses-package.ts": `import { Prisma } from "@prisma/client";\nexport const P = Prisma;\n`,
  "src/apps/alpha/domain/uses-generated.test.ts": `import type { PrismaClient } from "@/generated/prisma/client";\nexport type T = PrismaClient;\n`,

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
  const routeOwners = [{ path: "settings/general/beta-owned", app: "beta" }];
  const violations = await collectBoundaryViolations({ projectRoot, routeOwners });
  const actualKeys = violations.map((v) => violationKey(projectRoot, v)).sort();

  const expectedKeys = [
    `src/app/(platform)/alpha/route-cross.tsx | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/app/(platform)/settings/general/beta-owned/cross.tsx | ${RULE_APP_TO_OTHER_APP_INTERNAL} | alpha/domain`,
    `src/apps/alpha/legacy-class.tsx | ${RULE_RAW_LEGACY_UI_CLASS} | ui-card`,
    `src/app/(platform)/settings/general/page.tsx | ${RULE_SHELL_TO_APP_INTERNAL} | beta/domain`,
    `src/application/bad-coordinator.ts | ${RULE_SHELL_TO_APP_INTERNAL} | beta/infrastructure`,
    `src/app/(document)/alpha/print/cross.tsx | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/domain`,
    `src/apps/alpha/domain/uses-generated.ts | ${RULE_DOMAIN_TO_PERSISTENCE} | @/generated/prisma/client`,
    `src/apps/alpha/domain/uses-package.ts | ${RULE_DOMAIN_TO_PERSISTENCE} | @prisma/client`,
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
    "src/app/(platform)/settings/general/beta-owned/page.tsx",
    "src/app/(platform)/settings/general/shell-public.tsx",
    "src/app/(platform)/settings/general/shell-runtime.tsx",
    "src/application/coordinator.ts",
    "src/app/(document)/alpha/print/page.tsx",
    "src/apps/alpha/domain/uses-generated.test.ts",
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

  console.log(`PASS boundary fixtures: ${expectedKeys.length} rejections, legal cases clean, platform-only tree accepted`);
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
  "src/apps/ven/.fuse_hidden0001": `export const debris = 1;
`,
  "src/apps/ven/logo.png": "x",
  "src/apps/ven/row.tsx": `export function F() { const runRowAction = () => 1; return runRowAction; }
`,
  "src/apps/ven/row-baselined.tsx": `export function G() { const runRowAction = () => 2; return runRowAction; }
`,
  "src/apps/ven/generated/nested.ts": `export const f = new Intl.DateTimeFormat("id-ID");
`,
  "src/app/api/integrations/v1/legal/route.ts": `import { kit } from "@platform/core/integrations"; import { z } from "zod"; export const x = [kit, z];\n`,
  "src/app/api/integrations/v1/bad-prisma/route.ts": `import { PrismaClient } from "@prisma/client"; export const x = PrismaClient;\n`,
  "src/app/api/integrations/v1/bad-internal/route.ts": `import { Widget } from "@/apps/moon/ui/widget"; export const x = Widget;\n`,

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
      `src/app/api/integrations/v1/bad-prisma/route.ts | ${RULE_INTEGRATION_ROUTE_IMPORTS} | @prisma/client`,
      `src/app/api/integrations/v1/bad-internal/route.ts | ${RULE_INTEGRATION_ROUTE_IMPORTS} | @/apps/moon/ui/widget`,
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

  const duplicates = await collectDuplicatePrimitiveViolations({ projectRoot: foundationRoot, allowList: [] });
  assert.deepEqual(
    duplicates.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/ven/format.ts | ${RULE_DUPLICATE_PRIMITIVE} | Intl/toLocale date display`,
      `src/apps/ven/allowed.ts | ${RULE_DUPLICATE_PRIMITIVE} | Intl/toLocale date display`,
      `src/apps/ven/generated/nested.ts | ${RULE_DUPLICATE_PRIMITIVE} | Intl/toLocale date display`,
    ].sort(),
  );

  const duplicatesWithAllow = await collectDuplicatePrimitiveViolations({
    projectRoot: foundationRoot,
    allowList: ["src/apps/ven/allowed.ts"],
  });
  assert.deepEqual(
    duplicatesWithAllow.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/ven/format.ts | ${RULE_DUPLICATE_PRIMITIVE} | Intl/toLocale date display`,
      `src/apps/ven/generated/nested.ts | ${RULE_DUPLICATE_PRIMITIVE} | Intl/toLocale date display`,
    ],
  );

  const staleAllow = await collectDuplicatePrimitiveViolations({
    projectRoot: foundationRoot,
    allowList: ["src/apps/ven/allowed.ts", "src/apps/ven/deleted.ts"],
  });
  assert.ok(
    staleAllow.some((v) => violationKey(foundationRoot, v) === `src/apps/ven/deleted.ts | ${RULE_STALE_ALLOW_LIST} | src/apps/ven/deleted.ts`),
    "an allow-list entry pointing at a missing file must fail",
  );

  const unscanned = await collectUnscannedFileViolations({ projectRoot: foundationRoot });
  assert.deepEqual(
    unscanned.map((v) => violationKey(foundationRoot, v)).sort(),
    [`src/apps/ven/.fuse_hidden0001 | ${RULE_UNSCANNED_FILE} | .fuse_hidden0001`],
  );

  const machineryFixture = [{
    name: "runRowAction",
    pattern: /\bconst\s+runRowAction\b/,
    canonical: "shared hook",
    baseline: ["src/apps/ven/row-baselined.tsx", "src/apps/ven/gone.tsx"],
  }];
  const machinery = await collectDuplicateMachineryViolations({ projectRoot: foundationRoot, machinery: machineryFixture });
  assert.deepEqual(
    machinery.map((v) => violationKey(foundationRoot, v)).sort(),
    [
      `src/apps/ven/row.tsx | ${RULE_DUPLICATE_MACHINERY} | runRowAction`,
      `src/apps/ven/gone.tsx | ${RULE_STALE_ALLOW_LIST} | runRowAction`,
    ].sort(),
  );

  const combined = await collectAllViolations({ projectRoot: foundationRoot, allowList: [], machinery: machineryFixture });
  assert.equal(combined.boundary.length, boundary.length);
  assert.equal(combined.permission.length, permission.length);
  assert.equal(combined.route.length, route.length);
  assert.equal(combined.duplicate.length, duplicates.length);

  console.log("PASS foundation fixtures: import/layer rules, permission SSOT, route ownership, duplicate primitives");
} finally {
  await rm(foundationRoot, { recursive: true, force: true });
}
const DATABASE_FILES = {
  "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),
  "prisma/schema.prisma": "datasource db {\n  provider = \"postgresql\"\n  schemas  = [\"platform\", \"alpha\", \"beta\"]\n}\nmodel User {\n  id String @id\n  @@schema(\"platform\")\n}\nmodel AlphaThing {\n  id String @id\n  @@schema(\"alpha\")\n}\nmodel BetaWidget {\n  id String @id\n  @@schema(\"beta\")\n}\nmodel AlphaLink {\n  id String @id\n  thingId String\n  thing AlphaThing @relation(fields: [thingId], references: [id])\n  widgetId String\n  widget BetaWidget @relation(fields: [widgetId], references: [id])\n  ownerId String\n  owner User @relation(fields: [ownerId], references: [id])\n  @@schema(\"alpha\")\n}\n",

  "src/apps/alpha/own.ts": `export const ok = (db) => db.alphaThing.findMany();\n`,
  "src/apps/alpha/own-tx.ts": `export const ok = (tx) => tx.alphaThing.update({});\n`,
  "src/apps/alpha/own-raw.ts": "export const ok = (db) => db.$queryRaw`SELECT 1 FROM \"alpha\".\"alpha_thing\"`;\n",
  "src/apps/alpha/foreign-delegate.ts": `export const bad = (tx) => tx.betaWidget.update({});\n`,
  "src/apps/alpha/foreign-nested.ts": `export const bad = (ports) => ports.db.betaWidget.findMany();\n`,
  "src/apps/alpha/foreign-platform.ts": `export const bad = (db) => db.user.findMany();\n`,
  "src/apps/alpha/foreign-type.ts": `import { Prisma } from "@/generated/prisma/client";\nexport type W = Prisma.BetaWidgetWhereInput;\n`,
  "src/apps/alpha/foreign-raw.ts": "export const bad = (db) => db.$queryRaw`SELECT 1 FROM \"beta\".\"beta_widget\"`;\n",
  "src/apps/alpha/foreign-raw-string.ts": "export const SQL = 'SELECT 1 FROM \"platform\".\"AuditEvent\"';\n",
  "src/apps/alpha/comment-and-unrelated.ts": `// db.betaWidget is not touched here\nexport const note = "db.betaWidget";\nexport const other = (foo) => foo.betaWidget;\n`,
  "src/apps/alpha/foreign.test.ts": `export const seeded = (db) => db.betaWidget.create({});\n`,
  "src/app/(platform)/alpha/page.tsx": `export const page = (db) => db.alphaThing.findMany();\n`,
  "src/app/(platform)/alpha/bad-page.tsx": `export const bad = (prisma) => prisma.betaWidget.findMany();\n`,
  "src/platform/core/users.ts": `export const ok = (db) => db.user.findMany();\n`,
  "src/platform/core/leak.ts": `export const bad = (db) => db.alphaThing.findMany();\n`,
  "src/app/(platform)/account/session.ts": `export const ok = (prisma) => prisma.user.findMany();\n`,
  "src/app/(platform)/account/leak.ts": `export const bad = (prisma) => prisma.alphaThing.findMany();\n`,
  "src/apps/beta/own.ts": `export const ok = (db) => db.betaWidget.findMany();\n`,
};

const databaseRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-database-"));
try {
  await writeTree(databaseRoot, DATABASE_FILES);
  const database = await collectDatabaseOwnershipViolations({ projectRoot: databaseRoot });
  assert.deepEqual(
    database.map((v) => violationKey(databaseRoot, v)).sort(),
    [
      `prisma/schema.prisma | ${RULE_DATABASE_OWNERSHIP} | AlphaLink.widget -> BetaWidget`,
      `prisma/schema.prisma | ${RULE_DATABASE_OWNERSHIP} | AlphaLink.owner -> User`,
      `src/app/(platform)/account/leak.ts | ${RULE_DATABASE_OWNERSHIP} | prisma.alphaThing`,
      `src/app/(platform)/alpha/bad-page.tsx | ${RULE_DATABASE_OWNERSHIP} | prisma.betaWidget`,
      `src/apps/alpha/foreign-delegate.ts | ${RULE_DATABASE_OWNERSHIP} | tx.betaWidget`,
      `src/apps/alpha/foreign-nested.ts | ${RULE_DATABASE_OWNERSHIP} | db.betaWidget`,
      `src/apps/alpha/foreign-platform.ts | ${RULE_DATABASE_OWNERSHIP} | db.user`,
      `src/apps/alpha/foreign-raw-string.ts | ${RULE_DATABASE_OWNERSHIP} | "platform"."...`,
      `src/apps/alpha/foreign-raw.ts | ${RULE_DATABASE_OWNERSHIP} | "beta"."...`,
      `src/apps/alpha/foreign-type.ts | ${RULE_DATABASE_OWNERSHIP} | Prisma.BetaWidgetWhereInput`,
      `src/platform/core/leak.ts | ${RULE_DATABASE_OWNERSHIP} | db.alphaThing`,
    ].sort(),
  );

  const noSchemaRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-noschema-"));
  try {
    await writeTree(noSchemaRoot, {
      "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),
      "src/apps/alpha/x.ts": "export const x = (db) => db.betaWidget;\n",
    });
    assert.deepEqual(await collectDatabaseOwnershipViolations({ projectRoot: noSchemaRoot }), []);
  } finally {
    await rm(noSchemaRoot, { recursive: true, force: true });
  }

  console.log("PASS database ownership fixtures: foreign delegates, nested receivers, Prisma types, raw SQL schemas, cross-schema relations; own access, comments and tests clean");
} finally {
  await rm(databaseRoot, { recursive: true, force: true });
}

const CLIENT_CALL_FILES = {
  "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),
  "src/platform/ui_engine/client-helpers.tsx": `"use client";
export function getSlice(items) { return items; }
export const pageCount = (n) => n;
export function Widget() { return null; }
export function useThing() { return 1; }
export const LABEL = "x";
`,
  "src/platform/ui_engine/pure.ts": `export function pureSlice(items) { return items; }
`,
  "src/platform/ui_engine/index.ts": `export { getSlice, pageCount as pages, Widget, useThing, LABEL } from "./client-helpers";
export * from "./pure";
`,
  "src/app/(platform)/x/direct.tsx": `import { getSlice } from "@/platform/ui_engine/client-helpers";
export const bad = () => getSlice([]);
`,
  "src/app/(platform)/x/barrel.tsx": `import { getSlice } from "@/platform/ui_engine";
export const bad = () => getSlice([]);
`,
  "src/app/(platform)/x/renamed.tsx": `import { pages as countPages } from "@/platform/ui_engine";
export const bad = () => countPages(3);
`,
  "src/app/(platform)/x/component.tsx": `import { Widget, LABEL } from "@/platform/ui_engine";
export const ok = () => <Widget label={LABEL} />;
`,
  "src/app/(platform)/x/pure-ok.tsx": `import { pureSlice } from "@/platform/ui_engine";
export const ok = () => pureSlice([]);
`,
  "src/app/(platform)/x/type-only.tsx": `import type { getSlice } from "@/platform/ui_engine";
export type T = typeof getSlice;
`,
  "src/app/(platform)/x/client-caller.tsx": `"use client";
import { getSlice } from "@/platform/ui_engine";
export const ok = () => getSlice([]);
`,
  "src/app/(platform)/x/server.test.ts": `import { getSlice } from "@/platform/ui_engine";
export const ok = () => getSlice([]);
`,
};

const clientCallRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-clientcall-"));
try {
  await writeTree(clientCallRoot, CLIENT_CALL_FILES);
  const clientCalls = await collectServerClientCallViolations({ projectRoot: clientCallRoot });
  assert.deepEqual(
    clientCalls.map((v) => violationKey(clientCallRoot, v)).sort(),
    [
      `src/app/(platform)/x/barrel.tsx | ${RULE_SERVER_CALLS_CLIENT_FUNCTION} | getSlice from @/platform/ui_engine`,
      `src/app/(platform)/x/direct.tsx | ${RULE_SERVER_CALLS_CLIENT_FUNCTION} | getSlice from @/platform/ui_engine/client-helpers`,
      `src/app/(platform)/x/renamed.tsx | ${RULE_SERVER_CALLS_CLIENT_FUNCTION} | countPages from @/platform/ui_engine`,
    ].sort(),
  );
  console.log("PASS server-calls-client fixtures: direct, barrel and renamed calls flagged; components, constants, types, pure modules, client callers and tests clean");
} finally {
  await rm(clientCallRoot, { recursive: true, force: true });
}

const MIGRATION_FILES = {
  "tsconfig.json": JSON.stringify(TSCONFIG, null, 2),
  "prisma/schema/base.prisma": 'datasource db {\n  provider = "postgresql"\n  schemas  = ["platform", "alpha", "beta"]\n}\n',
  "prisma/schema/platform.prisma": 'model User {\n  id String @id\n  @@schema("platform")\n}\n',
  "prisma/schema/alpha.prisma": 'model AlphaThing {\n  id String @id\n  @@schema("alpha")\n}\nmodel AlphaLink {\n  id String @id\n  ownerId String\n  owner User @relation(fields: [ownerId], references: [id])\n  @@schema("alpha")\n}\n',
  "prisma/migrations/001_alpha_only/migration.sql": 'CREATE TABLE "alpha"."thing" ("id" TEXT);\n',
  "prisma/migrations/002_alpha_with_platform/migration.sql": 'INSERT INTO "platform"."RolePermission" SELECT 1;\nALTER TABLE "alpha"."thing" ADD COLUMN "x" TEXT;\n',
  "prisma/migrations/003_alpha_and_beta/migration.sql": 'ALTER TABLE "alpha"."thing" ADD COLUMN "y" TEXT;\nALTER TABLE "beta"."widget" ADD COLUMN "y" TEXT;\n',
  "prisma/migrations/004_old_spanning/migration.sql": 'ALTER TABLE "alpha"."thing" ADD COLUMN "z" TEXT;\nALTER TABLE "beta"."widget" ADD COLUMN "z" TEXT;\n',
  "prisma/migrations/005_no_longer_spanning/migration.sql": 'ALTER TABLE "beta"."widget" ADD COLUMN "w" TEXT;\n',
  "src/apps/alpha/own.ts": "export const ok = 1;\n",
};

const migrationRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-migrations-"));
try {
  await writeTree(migrationRoot, MIGRATION_FILES);
  const isolation = await collectMigrationIsolationViolations({ projectRoot: migrationRoot, allowList: ["004_old_spanning", "005_no_longer_spanning"] });
  assert.deepEqual(
    isolation.map((v) => `${relative(migrationRoot, v.file).split(sep).join("/")} | ${v.rule}`).sort(),
    [
      `prisma/migrations/003_alpha_and_beta/migration.sql | ${RULE_MIGRATION_ISOLATION}`,
      `prisma/migrations/005_no_longer_spanning/migration.sql | ${RULE_STALE_ALLOW_LIST}`,
    ].sort(),
  );
  // The folder-based schema is read too: a relation from an alpha model to a platform model is still a cross-schema foreign key.
  const folderDatabase = await collectDatabaseOwnershipViolations({ projectRoot: migrationRoot });
  assert.deepEqual(folderDatabase.map((v) => v.specifier), ["AlphaLink.owner -> User"]);
  console.log("PASS migration isolation fixtures: two app schemas rejected, platform alongside allowed, allow-list ratchet, folder-based Prisma schema read");
} finally {
  await rm(migrationRoot, { recursive: true, force: true });
}
