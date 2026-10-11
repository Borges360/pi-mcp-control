import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fakePi } from '../test-support/fakes.mjs';
import mcpControl from '../extension.mjs';

const registry = [
  { name: 'mcp__harness__inventory', annotations: { readOnlyHint: true } },
  { name: 'mcp__harness__deploy', annotations: { destructiveHint: true } },
  { name: 'mcp__claude__think', annotations: {} },
  { name: 'read', annotations: { readOnlyHint: true } },
];

const setup = async (t, trusted = true) => {
  const dir = await mkdtemp(join(tmpdir(), 'mcpc-complete-'));
  const old = process.env.PI_SUITE_HOME;
  process.env.PI_SUITE_HOME = join(dir, 'state');
  t.after(async () => {
    process.env.PI_SUITE_HOME = old;
    await rm(dir, { recursive: true, force: true });
  });
  await mkdir(join(dir, '.pi'), { recursive: true });
  const f = fakePi(dir, []);
  f.ctx.isProjectTrusted = () => trusted;
  // The extension reads the live tool list at completion time, so this is faithful.
  f.pi.getAllTools = () => registry;
  mcpControl(f.pi);
  await f.emit('session_start');
  return { dir, f, cmd: [...f.commands.values()][0] };
};

test('/mcpc allow completes with the MCP tools that are actually registered', async (t) => {
  const { cmd } = await setup(t);
  const items = await cmd.getArgumentCompletions('allow ');
  assert.deepEqual(items.map((i) => i.label), [
    'mcp__harness__inventory',
    'mcp__harness__deploy',
    'mcp__claude__think',
  ]);
  // The annotation is what makes the choice safe, so it must be visible.
  assert.match(
    items.find((i) => i.label === 'mcp__harness__inventory').description,
    /read-only/,
  );
  assert.match(items.find((i) => i.label === 'mcp__harness__deploy').description, /destructive/);
  // Non-MCP tools are never offered here.
  assert.ok(!items.some((i) => i.label === 'read'));
});

test('/mcpc profiles and `use` list the configured profiles, marking the active one', async (t) => {
  const { f, cmd } = await setup(t);
  const items = await cmd.getArgumentCompletions('use ');
  assert.ok(items.length >= 1, 'default profiles must be selectable');
  assert.ok(
    items.every((i) => i.value.startsWith('use ')),
    'value must rewrite the whole argument text',
  );
  await f.command('mcpc', 'profiles');
  assert.match(f.notifications.at(-1), /active:/);
  assert.match(f.notifications.at(-1), /developer-readonly|Switch with/);
});

test('a bogus tool name is refused with the real alternatives, not "Unknown MCP tool"', async (t) => {
  const { f } = await setup(t);
  await assert.rejects(
    () => f.command('mcpc', 'allow mcp__nope__gone --scope project'),
    (e) => {
      assert.match(e.message, /mcp__nope__gone is not a registered MCP tool/);
      assert.match(e.message, /mcp__harness__inventory/);
      return true;
    },
  );
});
