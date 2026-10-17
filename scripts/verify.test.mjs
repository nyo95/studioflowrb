import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { gateCommands, parseOptions, runCommand } from './verify.mjs';
import { selectTests } from './test-selection.mjs';

test('gates reject missing scope and cannot turn a high gate into targeted tests', () => {
  for (const args of [[], ['--tier', 'unknown'], ['--tier', 'medium'], ['--tier', 'low', '--tests'], ['--tier', 'high', '--tests', 'x'], ['--tier', 'low', '--timeout-minutes', '0']]) {
    assert.throws(() => parseOptions(args));
  }
  const commands = gateCommands(parseOptions(['--tier', 'high']));
  assert.deepEqual(commands.map((c) => c.name), ['boundaries', 'legacy-runtime', 'whitespace', 'staged-whitespace', 'typecheck', 'lint', 'tests', 'generate', 'build']);
  assert.deepEqual(commands.find((c) => c.name === 'tests').args, ['scripts/run-tests.mjs']);
  const medium = gateCommands(parseOptions(['--tier', 'medium', '--tests', 'scripts/verify.test.mjs', '--build', '--e2e']));
  assert.ok(medium.some((c) => c.name === 'build'));
  assert.equal(medium.at(-1).name, 'e2e');
});

test('test selection preserves full discovery and refuses missing files/empty discovery', () => {
  const files = ['src/a.test.ts', 'src/[id]/b.test.ts', 'scripts/verify.test.mjs'];
  assert.deepEqual(selectTests(files, []), files.map((file) => normalize(file)));
  assert.deepEqual(selectTests(files, ['src/[id]/b.test.ts']), [normalize('src/[id]/b.test.ts')]);
  assert.throws(() => selectTests(files, ['src/typo.test.ts']));
  assert.throws(() => selectTests([], []));
});

test('artifacts preserve full output, counts and failure status; hung commands time out', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'studioflow-verify-'));
  try {
    const command = (source) => ({ executable: process.execPath, args: ['-e', source] });
    const passed = await runCommand(command('console.log("# tests 3\\n# pass 2\\n# fail 0\\n# skipped 1")'), join(directory, 'pass.log'), 5000);
    assert.equal(passed.status, 'PASSED');
    assert.equal(passed.counts.tests, 3);
    assert.equal(passed.counts.skipped, 1);
    const skipped = await runCommand({ ...command('console.log("# tests 3\\n# pass 2\\n# fail 0\\n# skipped 1")'), name: 'tests' }, join(directory, 'skipped.log'), 5000);
    assert.equal(skipped.status, 'FAILED');
    const empty = await runCommand({ ...command('console.log("# tests 0\\n# pass 0\\n# fail 0")'), name: 'tests' }, join(directory, 'empty.log'), 5000);
    assert.equal(empty.status, 'FAILED');
    const e2e = await runCommand({ ...command('console.log("3 passed (1.2s)")'), name: 'e2e' }, join(directory, 'e2e.log'), 5000);
    assert.equal(e2e.status, 'PASSED');
    assert.equal(e2e.counts.tests, 3);
    const verbose = await runCommand(command('console.log("x".repeat(100000)); console.log("END")'), join(directory, 'verbose.log'), 5000);
    assert.ok((await readFile(verbose.log, 'utf8')).length > 100000);
    const failed = await runCommand(command('console.error("failure detail"); process.exit(7)'), join(directory, 'fail.log'), 5000);
    assert.equal(failed.exitCode, 7);
    assert.equal(failed.status, 'FAILED');
    assert.match(await readFile(failed.log, 'utf8'), /failure detail/);
    const missing = await runCommand({ executable: join(directory, 'missing-executable'), args: [] }, join(directory, 'missing.log'), 5000);
    assert.equal(missing.status, 'FAILED');
    const timeout = await runCommand(command('setInterval(() => {}, 1000)'), join(directory, 'timeout.log'), 100);
    assert.equal(timeout.status, 'TIMEOUT');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
