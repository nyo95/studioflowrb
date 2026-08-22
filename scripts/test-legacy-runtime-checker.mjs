import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { collectLegacyRuntimeReferences, RULE_LEGACY_RUNTIME_REFERENCE } from "./check-legacy-runtime.mjs";

const FILES = {
  "package.json": `{\n  "name": "legacy-fixture",\n  "private": true\n}\n`,
  "tsconfig.json": `{\n  "compilerOptions": {\n    "paths": {\n      "@/*": ["./src/*"]\n    }\n  }\n}\n`,
  "next.config.mjs": `export default {\n  outputFileTracingRoot: "../studioflow/shared"\n};\n`,
  ".env.example": `# example env\nLEGACY_TOOLS_PATH=../studioflow/tools\nDATABASE_URL=postgres://localhost/studioflow_rebuild\n`,

  "src/apps/bq/offender.ts": `import { pricing } from "../../../../studioflow/pricing";\nexport const p = pricing;\n`,
  "src/apps/masterdata/intra-repo-sibling-shaped.ts": `import { something } from "../../studioflow/public";\nexport const s = something;\n`,
  "src/apps/masterdata/domain/clean.ts": `import { helper } from "./helper";\nexport const c = helper;\n`,
  "src/apps/masterdata/domain/helper.ts": `export const helper = () => "ok";\n`,
  "src/generated/prisma/must-be-ignored.ts": `import { legacy } from "../../studioflow/generated-legacy";\nexport const l = legacy;\n`,
};

async function writeTree(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content);
  }
}

const projectRoot = await mkdtemp(join(tmpdir(), "wo3-legacy-"));
try {
  await writeTree(projectRoot, FILES);
  const violations = await collectLegacyRuntimeReferences({ projectRoot });

  const actualKeys = violations
    .map((v) => `${relative(projectRoot, v.file).replaceAll("\\", "/")}:${v.line}`)
    .sort();
  const expectedKeys = [
    "src/apps/bq/offender.ts:1",
    "next.config.mjs:2",
    ".env.example:2",
  ].sort();

  assert.equal(violations.every((v) => v.rule === RULE_LEGACY_RUNTIME_REFERENCE), true);
  assert.deepEqual(actualKeys, expectedKeys);

  console.log("PASS legacy-runtime fixtures: source + config references rejected; intra-repo and generated files clean");
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
