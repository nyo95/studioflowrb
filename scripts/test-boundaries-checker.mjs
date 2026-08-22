import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  collectBoundaryViolations,
  RULE_APP_TO_OTHER_APP_INTERNAL,
  RULE_PLATFORM_TO_APP,
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

  "src/apps/alpha/same-app-relative.ts": `import { alphaRule } from "./domain/rule";\nexport const x = alphaRule;\n`,
  "src/apps/alpha/same-app-alias.ts": `import { alphaRule } from "@alpha/domain/rule";\nexport const y = alphaRule;\n`,
  "src/apps/alpha/app-to-platform.ts": `import { slug } from "@platform/utilities/slug";\nexport const s = slug;\n`,
  "src/apps/alpha/cross-app-public-alias.ts": `import { something } from "@beta/public";\nexport const p = something;\n`,
  "src/apps/alpha/cross-app-public-relative.ts": `import { something } from "../beta/public";\nexport const q = something;\n`,

  "src/apps/alpha/reject-domain.ts": `import { betaRule } from "@beta/domain/rule";\nexport const bad1 = betaRule;\n`,
  "src/apps/alpha/reject-application-catchall.ts": `import { useCase } from "@/apps/beta/application/use-case";\nexport const bad2 = useCase;\n`,
  "src/apps/alpha/reject-infrastructure-relative.ts": `import { betaDb } from "../beta/infrastructure/db";\nexport const bad3 = betaDb;\n`,
  "src/apps/alpha/reject-ui.ts": `import { Widget } from "@beta/ui/widget";\nexport const bad4 = Widget;\n`,
  "src/apps/alpha/reject-ui-dynamic.ts": `export async function load() {\n  return import("@beta/ui/widget");\n}\n`,
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
  return `${relative(projectRoot, violation.file).replaceAll("\\", "/")} | ${violation.rule} | ${violation.targetApp}/${violation.targetLayer}`;
}

const projectRoot = await mkdtemp(join(tmpdir(), "wo3-boundaries-"));
try {
  await writeTree(projectRoot, FILES);
  const violations = await collectBoundaryViolations({ projectRoot });
  const actualKeys = violations.map((v) => violationKey(projectRoot, v)).sort();

  const expectedKeys = [
    `src/apps/alpha/reject-domain.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/domain`,
    `src/apps/alpha/reject-application-catchall.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/application`,
    `src/apps/alpha/reject-infrastructure-relative.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/infrastructure`,
    `src/apps/alpha/reject-ui.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/apps/alpha/reject-ui-dynamic.ts | ${RULE_APP_TO_OTHER_APP_INTERNAL} | beta/ui`,
    `src/platform/core/auth.ts | ${RULE_PLATFORM_TO_APP} | alpha/public`,
  ].sort();

  assert.deepEqual(actualKeys, expectedKeys);

  const legalFiles = [
    "src/apps/alpha/same-app-relative.ts",
    "src/apps/alpha/same-app-alias.ts",
    "src/apps/alpha/app-to-platform.ts",
    "src/apps/alpha/cross-app-public-alias.ts",
    "src/apps/alpha/cross-app-public-relative.ts",
    "src/apps/beta/public/index.ts",
    "src/platform/utilities/slug/index.ts",
    "src/generated/prisma/must-be-ignored.ts",
  ];
  const flagged = new Set(violations.map((v) => relative(projectRoot, v.file)));
  for (const file of legalFiles) {
    assert.ok(!flagged.has(file), `legal fixture must not be flagged: ${file}`);
  }

  console.log("PASS boundary fixtures: 6 rejections + all legal cases pass");
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
