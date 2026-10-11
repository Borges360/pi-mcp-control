import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import install from '../extension.mjs';
import { fakePi } from '../test-support/fakes.mjs';
test('headless denies unknown mutation; nested tool denied even after changing exposure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-runtime-'));
  const old = process.env.PI_SUITE_HOME;
  process.env.PI_SUITE_HOME = join(dir, 'state');
  try {
    await mkdir(join(dir, '.pi'));
    await writeFile(
      join(dir, '.pi', 'mcp-profiles.yaml'),
      'profiles:\n  developer-readonly:\n    servers:\n      docs:\n        enabled: true\n        exposure: codemode\n',
    );
    const f = fakePi(dir);
    f.ctx.hasUI = false;
    f.pi.getAllTools = () => [{ name: 'mcp__docs__unknown', annotations: {} }];
    install(f.pi);
    await f.emit('session_start');
    const r = await f.emit('tool_call', {
      toolCallId: 'parent/1',
      parentToolCallId: 'parent',
      toolName: 'mcp__docs__unknown',
      input: {},
    });
    assert.equal(r.block, true);
    await f.emit('session_shutdown');
  } finally {
    if (old === undefined) delete process.env.PI_SUITE_HOME;
    else process.env.PI_SUITE_HOME = old;
    await rm(dir, { recursive: true, force: true });
  }
});
