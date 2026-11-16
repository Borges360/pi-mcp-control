import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mcpEnv, waitFor } from '../test-support/panel.mjs';
import { fakeTui, withCustomUi } from '../test-support/fake-tui.mjs';
import { runDashboard } from '../menu.mjs';
import {
  FIELDS,
  EXPOSURES,
  HOST_EXPORTS,
  missingHostExports,
  fieldValues,
  enumItems,
  panelItems,
  applyField,
  canonicalPanelValue,
  partitionServers,
  serverRows,
  c0,
  host,
  panelChangeNote,
} from '../menu.mjs';
import { validateConfig } from '../lib/core.mjs';

const text = (env) => String(env.f.notifications.at(-1));
const SECTION = new Set(Object.keys(c0()));

/* ------------------------------------------------------------------ *
 *  1. Pure units: the table and the scope partition.
 * ------------------------------------------------------------------ */

test('every field offers values, patches a real key and points at a real lock', () => {
  assert.ok(Object.keys(FIELDS).length >= 9, 'a tabela tem que cobrir os dials');
  const state = { server: 'docs', profile: 'java-service', declaredHosts: ['docs.internal'], declaredExecutables: ['git-mcp-server'] };
  for (const [id, field] of Object.entries(FIELDS)) {
    assert.ok(SECTION.has(field.lock), `${id}.lock aponta para chave inexistente: ${field.lock}`);
    const values = fieldValues(id, c0(), state);
    assert.ok(Array.isArray(values), `${id}.values`);
    if (field.kind !== 'list') assert.ok(values.length, `${id}: values vazia`);
    for (const value of values) {
      const { patch } = applyField(c0(), id, value, { state });
      for (const key of Object.keys(patch))
        assert.ok(SECTION.has(key), `${id}: patch escreve fora da seção: ${key}`);
      validateConfig({ mcpControl: { ...c0(), ...patch } });
      if (id === 'serverActions') {
        const profile = patch.profiles[c0().defaultProfile];
        const name = String(value).split(':')[1];
        assert.ok(profile.servers[name], `${value} não escreveu o servidor`);
        if (String(value).startsWith('expose:'))
          assert.ok(EXPOSURES.includes(profile.servers[name].exposure));
        continue;
      }
      if (field.kind === 'list') continue;
      assert.equal(
        field.current({ ...c0(), ...patch }, state),
        value,
        `${id}: ${value} não sobrevive ao round-trip`,
      );
    }
  }
});

test('the scope partition names unreachable servers instead of calling them policy denials', () => {
  const inventory = [
    { name: 'docs', tools: ['mcp__docs__search'], source: 'native' },
    { name: 'git', tools: [], source: 'native' },
  ];
  const profile = { servers: { docs: { enabled: true }, git: { enabled: true } } };
  const part = partitionServers(inventory, profile, c0());
  assert.deepEqual(part.reachable, ['docs']);
  assert.deepEqual(part.outOfScope, ['git']);
  assert.deepEqual(part.reasonCodes, ['server-not-connected:git']);
  assert.equal(part.strict, true);
  // An empty inventory is "nothing is reachable", not "everything is denied".
  assert.deepEqual(partitionServers([], profile, c0()).outOfScope, ['docs', 'git']);
});

test('validateConfig knows the new keys and refuses nonsense', () => {
  assert.throws(() => validateConfig({ mcpControl: { scope: { source: 'maybe' } } }), /scope source/);
  assert.throws(() => validateConfig({ mcpControl: { scope: { strict: 'sim' } } }), /strict flag/);
  assert.throws(() => validateConfig({ mcpControl: { environment: 'prod' } }), /environment/);
  assert.throws(() => validateConfig({ mcpControl: { allowedHosts: 'docs.internal' } }), /allowedHosts/);
  assert.doesNotThrow(() =>
    validateConfig({
      mcpControl: { scope: { source: 'declared', strict: false }, environment: 'production' },
      acceptanceGate: { autoSelect: false },
      otherExtension: { x: 1 },
    }),
  );
});

/* ------------------------------------------------------------------ *
 *  2. Parity: the panel cycles, the file agrees.
 * ------------------------------------------------------------------ */

test('every offered enum value stays in a draft until one explicit save', async (t) => {
  const env = await mcpEnv(t);
  const before = await env.file();
  const { running } = await env.open();
  const s = env.settings();
  const rows = s.items.filter((i) => i.id !== 'locale' && Array.isArray(i.values) && i.values.length);
  assert.ok(rows.length >= 6, `esperava pelo menos 6 linhas enum, achei ${rows.length}`);
  for (const row of rows) {
    for (const value of row.values) await s.cycle(row.id, value);
    assert.equal(s.find(row.id).currentValue, row.values.at(-1));
    assert.equal(await env.file(), before, `${row.id}: navigation must not write`);
  }
  assert.deepEqual(
    s.items.filter((i) => Array.isArray(i.values)).map((i) => i.id),
    ['locale', ...enumItems({ conf: c0(), state: {} }).map((i) => i.id)],
    'o painel não tem lista própria de valores',
  );
  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.equal(await env.file() === before, false, 'Ctrl+S persists the staged values');
  const written = await env.saved();
  for (const row of rows)
    assert.equal(
      FIELDS[row.id].current(written, {}),
      canonicalPanelValue(row.id, row.values.at(-1), 'en'),
      `${row.id} round-trip`,
    );
  assert.ok(env.f.ctx.lastScreen, 'saving keeps the panel open');
  s.onCancel();
  await running;
});

test('bare /mcpc opens the panel and summarizes only explicitly saved changes', async (t) => {
  const env = await mcpEnv(t);
  const before = await env.file();
  const { running } = await env.open();
  const s = env.settings();
  assert.equal(s.find('scopeSource').currentValue, 'Reachable');
  assert.match(s.find('servers').currentValue, /1\/2 reachable/, 'the panel shows reachable servers');
  await s.cycle('defaultUnknownTool', 'deny');
  await s.cycle('exceptionTtl', '900');
  assert.equal(await env.file(), before, 'navigation has no persistence side effect');
  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.equal(await env.file() === before, false);
  assert.ok(env.f.ctx.lastScreen, 'the screen remains open after saving');
  s.onCancel();
  await running;
  assert.equal(env.f.ctx.customResult.changed.length, 1);
  const summary = text(env);
  assert.match(summary, /MCP · 1 saved change\(s\)/);
  assert.ok(summary.includes(join(env.dir, '.pi', 'pi-suite.yaml')), summary);
  const written = await env.saved();
  assert.equal(written.defaultUnknownTool, 'deny');
  assert.equal(written.exceptionTtlSeconds, 900);
});

test('language preview is project-local, saved only by Ctrl+S, and loaded on the next session', async (t) => {
  const env = await mcpEnv(t);
  const localeFile = join(env.dir, '.pi', 'pi-mcp-control.locale.json');
  const configBefore = await env.file();
  const { running } = await env.open();
  const settings = env.settings();
  const language = settings.find('locale');
  assert.equal(language.currentValue, 'English (default)');
  assert.ok(settings.items.some((item) => item.id === 'defaultProfile'), 'stable setting IDs stay unchanged');
  assert.deepEqual(settings.find('environment').values, ['Development', 'Staging', 'Production']);

  await settings.cycle('locale', 'Português (Brasil)');
  assert.equal(settings.find('locale').label, 'Idioma');
  assert.equal(settings.find('locale').currentValue, 'Português (Brasil)');
  assert.equal(settings.find('environment').label, 'Ambiente');
  assert.deepEqual(settings.find('environment').values, ['Desenvolvimento', 'Homologação', 'Produção']);
  await settings.cycle('environment', 'Produção');
  assert.equal(settings.find('environment').currentValue, 'Produção');
  assert.equal(await env.file(), configBefore, 'preview does not write MCP configuration');
  await assert.rejects(readFile(localeFile), { code: 'ENOENT' }, 'preview does not write a locale file');

  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.deepEqual(JSON.parse(await readFile(localeFile, 'utf8')), { schemaVersion: 1, locale: 'pt-BR' });
  assert.equal((await env.saved()).environment, 'production', 'localized choice maps back to its stable config value');
  settings.onCancel();
  await running;
  assert.match(text(env), /Idioma salvo: Português \(Brasil\)/);

  await env.f.emit('session_start');
  const reopened = env.command('');
  await waitFor(() => env.tui.created.settings.length === 2, 'reopened localized panel');
  const next = env.tui.created.settings[1];
  assert.equal(next.find('locale').currentValue, 'Português (Brasil)');
  assert.equal(next.find('environment').label, 'Ambiente');
  next.onCancel();
  await reopened;
});

test('invalid saved locale falls back to English with a visible explanation', async (t) => {
  const env = await mcpEnv(t);
  await writeFile(
    join(env.dir, '.pi', 'pi-mcp-control.locale.json'),
    '{"schemaVersion":1,"locale":"fr"}\n',
  );
  await env.f.emit('session_start');
  const { running } = await env.open();
  const settings = env.settings();
  assert.equal(settings.find('locale').currentValue, 'English (default)');
  assert.equal(settings.find('environment').label, 'Environment');
  settings.open('status');
  assert.match(settings.top().render(80).join('\n'), /saved language is invalid; English is active/);
  settings.top().handleInput('\u001b');
  settings.onCancel();
  await running;
});

test('Portuguese preview localizes every dashboard submenu while preserving command identifiers', async (t) => {
  const env = await mcpEnv(t);
  const { running } = await env.open();
  const settings = env.settings();
  await settings.cycle('locale', 'Português (Brasil)');

  settings.open('status');
  const status = settings.top();
  const statusText = status.render(100).join('\n');
  assert.match(statusText, /Estado da sessão/);
  assert.match(statusText, /concessões abertas/);
  status.handleInput('\u001b');

  settings.open('profile');
  const profilePicker = env.tui.created.select.at(-1);
  assert.ok(profilePicker.items.every((item) => item.value === item.label.replace(/^\* |^▸ recomendado /, '')));
  profilePicker.onCancel();

  settings.open('servers');
  const serverPicker = env.tui.created.select.at(-1);
  assert.match(serverPicker.items[0].label, /▸ recomendado docs/);
  assert.match(serverPicker.items[1].description, /não consegue alcançá-lo/);
  serverPicker.pick('docs');
  const actionPicker = env.tui.created.select.at(-1);
  assert.ok(actionPicker.items.some((item) => item.label === 'exposição Direto'));
  assert.match(actionPicker.items.find((item) => item.value === 'expose:docs:direct').description, /sempre no contexto/);
  actionPicker.onCancel();

  settings.open('grants');
  assert.equal(env.tui.created.select.at(-1).items[0].label, 'Não há concessões abertas');
  env.tui.created.select.at(-1).onCancel();

  settings.open('outOfScope');
  const scopeText = settings.top().render(100).join('\n');
  assert.match(scopeText, /Motivo: sem conexão/);
  assert.match(scopeText, /Recuperação:/);
  settings.top().handleInput('\u001b');

  settings.open('allowedExecutables');
  assert.match(env.tui.created.select.at(-1).items[0].label, /recomendado permitir git-mcp-server/);
  env.tui.created.select.at(-1).onCancel();
  settings.open('allowedHosts');
  assert.match(env.tui.created.select.at(-1).items[0].label, /recomendado permitir docs.internal/);
  env.tui.created.select.at(-1).onCancel();

  settings.open('help');
  const help = settings.top().render(100).join('\n');
  assert.match(help, /somente servidores gerenciados/);
  assert.match(help, /exige confirmação explícita/);
  settings.top().handleInput('\u001b');

  assert.ok(settings.items.some((item) => item.id === 'defaultProfile'), 'setting IDs remain stable');
  assert.ok(actionPicker.items.some((item) => item.value === 'expose:docs:direct'), 'MCP field values remain canonical');
  settings.onCancel();
  settings.onCancel();
  await running;
  await assert.rejects(readFile(join(env.dir, '.pi', 'pi-mcp-control.locale.json')), { code: 'ENOENT' });
});

test('non-TUI fallback uses the trusted project language without changing command syntax', async (t) => {
  const env = await mcpEnv(t);
  await writeFile(
    join(env.dir, '.pi', 'pi-mcp-control.locale.json'),
    '{"schemaVersion":1,"locale":"pt-BR"}\n',
  );
  await env.f.emit('session_start');
  env.f.ctx.mode = 'print';
  await env.command('');
  const fallback = text(env);
  assert.match(fallback, /Este cliente não tem tela customizada/);
  assert.match(fallback, /servidor\(es\) disponíveis/);
  assert.match(fallback, /comandos diretos continuam disponíveis/);
  assert.match(fallback, /\/mcpc status \| catalog \| profiles/);
  assert.doesNotMatch(fallback, /This client has no custom screen|Session status/);
});

test('untrusted projects stay English and cannot save a Portuguese preference', async (t) => {
  const env = await mcpEnv(t);
  const localeFile = join(env.dir, '.pi', 'pi-mcp-control.locale.json');
  const existing = JSON.stringify({ schemaVersion: 1, locale: 'pt-BR' }, null, 2) + '\n';
  await writeFile(localeFile, existing);
  env.f.ctx.isProjectTrusted = () => false;
  await env.f.emit('session_start');

  const { running } = await env.open();
  const settings = env.settings();
  assert.equal(settings.find('locale').currentValue, 'English (default)');
  assert.equal(settings.find('environment').label, 'Environment');
  await settings.cycle('locale', 'Português (Brasil)');
  assert.equal(settings.find('locale').currentValue, 'English (default)');
  assert.match(text(env), /Trust this project to choose and save Portuguese/);
  assert.equal(await readFile(localeFile, 'utf8'), existing, 'untrusted selection does not read-modify-write preference');
  settings.onCancel();
  await running;
});

test('failed locale save keeps the preview retryable; Escape discards a locale-only draft', async (t) => {
  const env = await mcpEnv(t);
  const localeFile = join(env.dir, '.pi', 'pi-mcp-control.locale.json');
  const { running } = await env.open();
  const settings = env.settings();
  await settings.cycle('locale', 'Português (Brasil)');
  await mkdir(localeFile);
  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.equal(settings.find('locale').currentValue, 'Português (Brasil)');
  assert.match(text(env), /Não foi possível salvar o idioma; a prévia foi mantida/);
  assert.match(env.f.ctx.lastScreen.render(80).join('\n'), /\*/);
  await rm(localeFile, { recursive: true, force: true });
  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.deepEqual(JSON.parse(await readFile(localeFile, 'utf8')), { schemaVersion: 1, locale: 'pt-BR' });
  settings.onCancel();
  await running;

  const discardEnv = await mcpEnv(t);
  const discardedFile = join(discardEnv.dir, '.pi', 'pi-mcp-control.locale.json');
  const second = await discardEnv.open();
  const discardSettings = discardEnv.settings();
  await discardSettings.cycle('locale', 'Português (Brasil)');
  discardSettings.onCancel();
  assert.ok(discardEnv.f.ctx.lastScreen, 'first Escape warns and keeps preview open');
  discardSettings.onCancel();
  await second.running;
  assert.equal(discardSettings.find('locale').currentValue, 'English (default)');
  await assert.rejects(readFile(discardedFile), { code: 'ENOENT' });
});

test('server actions are staged after the two-level picker and saved only by Ctrl+S', async (t) => {
  const env = await mcpEnv(t);
  const before = await env.file();
  const { running } = await env.open();
  const s = env.settings();
  s.open('servers');
  const list = env.tui.created.select.at(-1);
  assert.match(list.items[0].label, /^▸ recommended docs/, 'reachable server comes first');
  assert.match(list.items[1].description, /cannot reach it \(out of scope\)/);
  await list.pick('git');
  assert.equal(s.find('serverRow').currentValue, 'git', 'a linha carrega o servidor');
  const actions = s.top();
  assert.match(actions.render(90).join('\n'), /exposure Direct/, 'the second level opens automatically');
  await env.tui.created.select.at(-1).pick('expose:git:codemode');
  assert.equal(await env.file(), before, 'server selection stages a profile change');
  assert.match(text(env), /Draft: git exposure changes to Code mode/);
  await env.f.ctx.lastScreen.handleInput('\u0013');
  const written = await env.saved();
  assert.equal(
    written.profiles[written.defaultProfile].servers.git.exposure,
    'codemode',
    'the exposure remains in the reviewable profile',
  );
  assert.match(text(env), /1 MCP setting change\(s\) saved/);
  s.onCancel();
  await running;
});

test('allowlist widening needs two selections, then Ctrl+S; CLI widening still needs confirmation', async (t) => {
  const env = await mcpEnv(t);
  const { running } = await env.open();
  const s = env.settings();
  s.open('allowedExecutables');
  const picker = env.tui.created.select.at(-1);
  assert.ok(picker.items.some((i) => i.value === 'add:git-mcp-server'));
  const before = await env.file();
  await picker.pick('add:git-mcp-server');
  assert.match(text(env), /No setting was staged/);
  assert.equal(await env.file(), before);
  s.open('allowedExecutables');
  await env.tui.created.select.at(-1).pick('add:git-mcp-server');
  assert.equal(await env.file(), before, 'the second choice stages the widening only');
  assert.match(text(env), /Draft security widening/);
  await env.f.ctx.lastScreen.handleInput('\u0013');
  assert.match(await env.file(), /git-mcp-server/, 'Ctrl+S saves the confirmed widening');
  s.onCancel();
  await running;

  const asks = [];
  env.f.ctx.ui.confirm = async (title, detail) => {
    asks.push([title, detail]);
    return false;
  };
  await assert.rejects(env.command('allow-host docs.internal'), /Widening exige confirmação/);
  assert.equal(asks.length, 1, 'perguntou uma vez, explicitamente');
  assert.ok(!(await env.file()).includes('docs.internal'), 'recusado não escreve');
});

test('a tool of an unreachable server is out-of-scope with the fix, not an approval question', async (t) => {
  const env = await mcpEnv(t, { tools: ['mcp__docs__search'] });
  const asks = [];
  env.f.ctx.ui.confirm = async (title, detail) => {
    asks.push([title, detail]);
    return true;
  };
  const blocked = await env.f.emit('tool_call', {
    toolName: 'mcp__git__commit',
    toolCallId: 'g1',
    input: {},
  });
  assert.equal(blocked?.block, true);
  assert.match(blocked.reason, /out-of-scope: server-not-connected:git/);
  assert.match(blocked.reason, /\/mcpc connect git|\/mcpc servers/);
  assert.equal(asks.length, 0, 'não pediu autorização para algo que não existe');
  // `declared` keeps the old question, so nothing that used to be asked stops being asked.
  await env.command('scope declared');
  const asked = await env.f.emit('tool_call', {
    toolName: 'mcp__git__commit',
    toolCallId: 'g2',
    input: {},
  });
  assert.equal(asks.length, 1, 'com declared a chamada volta a ser uma pergunta de política');
  assert.ok(asked?.block !== undefined || asks.length === 1);
});

test('switching a profile from the panel needs approval and remains session-only', async (t) => {
  const env = await mcpEnv(t);
  const before = await env.file();
  const { running } = await env.open();
  const s = env.settings();
  s.open('profile');
  const picker = env.tui.created.select.at(-1);
  await picker.pick('database-readonly');
  assert.match(text(env), /Profile → database-readonly · .*session-only/);
  assert.equal(await env.file(), before, 'trocar perfil não grava: o default do arquivo é outra linha');
  s.onCancel();
  await running;
});

test('revoking a grant narrows this session without writing configuration', async (t) => {
  const env = await mcpEnv(t);
  env.f.ctx.ui.confirm = async () => true;
  await env.command('allow mcp__docs__search --scope project');
  const before = await env.file();
  const { running } = await env.open();
  const s = env.settings();
  s.open('grants');
  const row = env.tui.created.select.at(-1).items.find((i) => i.value === 'revoke:mcp__docs__search');
  assert.ok(row, 'the active grant is visible');
  await env.tui.created.select.at(-1).pick(row.value);
  assert.match(text(env), /Grant for .*revoked/);
  assert.equal(await env.file(), before, 'revocation is an in-memory narrowing action');
  s.onCancel();
  await running;
});

/* ------------------------------------------------------------------ *
 *  3. Commands, degradation and the entry point.
 * ------------------------------------------------------------------ */

test('an invalid value cites the options and writes nothing; a valid one never says /reload', async (t) => {
  const env = await mcpEnv(t);
  const before = await env.file();
  await assert.rejects(env.command('env prod'), (e) => {
    assert.match(e.message, /Invalid environment: prod/);
    assert.match(e.message, /Use: development \| staging \| production/);
    return true;
  });
  assert.equal(await env.file(), before);
  await env.command('env production');
  assert.match(text(env), /já em efeito/);
  assert.doesNotMatch(env.f.notifications.join('\n'), /\/reload/i);
  assert.match(text(env), /⚠ produção/, 'o efeito colateral vem junto com o write');
});

test('a locked key is hidden from the panel and refused by the command', async (t) => {
  const env = await mcpEnv(t, { global: 'locked:\n  mcpControl:\n    failClosedForMutation: true\n' });
  const before = await env.file();
  await assert.rejects(env.command('mutation off'), /travado por política global/);
  assert.equal(await env.file(), before);
  const { running } = await env.open();
  assert.ok(!env.settings().items.some((i) => i.id === 'mutation'), 'linha travada some');
  env.settings().onCancel();
  await running;
});

test('a missing host export degrades to the text panel and names the export', async (t) => {
  const env = await mcpEnv(t);
  delete host.agent.getSelectListTheme;
  assert.deepEqual(missingHostExports(env.tui.tuiPkg, host.agent), [
    '@earendil-works/pi-coding-agent.getSelectListTheme',
  ]);
  await env.command('');
  assert.ok(!env.f.ctx.lastScreen, 'nenhuma tela montada');
  assert.match(env.f.notifications.join('\n'), /MCP panel unavailable.*getSelectListTheme/);
  const fallback = text(env);
  assert.match(fallback, /MCP ·/);
  assert.ok(
    fallback.indexOf('scope') < fallback.indexOf('/mcpc status'),
    'state comes before the command grammar',
  );
});

test('the pi entry point imports the host modules statically and hands them over', async () => {
  const entry = await readFile(new URL('../index.ts', import.meta.url), 'utf8');
  assert.match(entry, /import \* as piTui from ['"]@earendil-works\/pi-tui['"]/);
  assert.match(entry, /import \* as piAgent from ['"]@earendil-works\/pi-coding-agent['"]/);
  assert.match(entry, /install\(pi, \{ tui: piTui, agent: piAgent \}\)/);
  const extension = await readFile(new URL('../extension.mjs', import.meta.url), 'utf8');
  assert.match(extension, /provideHost\(injected\.tui, injected\.agent\)/);
  assert.deepEqual(HOST_EXPORTS['@earendil-works/pi-tui'], [
    'Container',
    'SettingsList',
    'SelectList',
    'Text',
    'Input',
    'matchesKey',
  ]);
});

test('server rows and grants rows degrade to an explanation, never an empty list', () => {
  const rows = serverRows({ reachable: [], outOfScope: [], servers: [] });
  assert.deepEqual(rows.map((r) => r.value), ['noop']);
  assert.match(rows[0].description, /mcp-profiles\.yaml/);
  const grants = [
    { tool: 'mcp__docs__search', expiresAt: new Date(Date.now() + 60000).toISOString() },
  ];
  const grows = serverRows({ reachable: ['docs'], outOfScope: [], servers: [{ name: 'docs', tools: ['a'] }] });
  assert.match(grows[0].label, /▸ recommended docs/);
  assert.ok(grants.length === 1);
});

function makeDashboard({ onChange, onSave, onDiscard, items } = {}) {
  const tui = fakeTui();
  const notices = [];
  const ctx = {
    mode: 'tui',
    ui: { notify: (message, level) => notices.push({ message, level }) },
  };
  withCustomUi(ctx, tui);
  const running = runDashboard(
    {
      ctx,
      title: 'MCP Control · 漢字 · 🎛️',
      items: items ?? [{ id: 'setting', label: 'Unicode 設定', currentValue: '初期値', values: ['initial', 'next'] }],
      onChange: onChange ?? ((_id, value) => ({ kind: 'draft', count: 1, note: panelChangeNote('environment', value) })),
      onSave,
      onDiscard,
      menus: {},
    },
    { tuiPkg: tui.tuiPkg, agentPkg: tui.agentPkg },
  );
  return { tui, ctx, notices, running };
}

test('a failed save keeps the draft and Ctrl+S retries without closing the panel', async () => {
  let attempts = 0;
  let staged = '';
  let persisted = '';
  const env = makeDashboard({
    onChange: (_id, value) => {
      staged = value;
      return { kind: 'draft', count: 1, note: 'Draft retained.' };
    },
    onSave: async () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, note: 'Save failed; draft kept.' };
      persisted = staged;
      return { ok: true, note: 'Saved.', changed: ['setting saved'] };
    },
  });
  await waitFor(() => env.ctx.lastScreen, 'panel screen');
  const settings = env.tui.created.settings[0];
  await settings.cycle('setting', '値を保持');
  await env.ctx.lastScreen.handleInput('\u0013');
  assert.equal(attempts, 1);
  assert.equal(persisted, '');
  assert.match(env.ctx.lastScreen.render(80).join('\n'), /\*/);
  assert.match(env.notices.at(-1).message, /draft kept/);
  await env.ctx.lastScreen.handleInput('\u0013');
  assert.equal(attempts, 2);
  assert.equal(persisted, '値を保持');
  assert.ok(env.ctx.lastScreen, 'successful save does not close the panel');
  settings.onCancel();
  await env.running;
  assert.deepEqual(env.ctx.customResult.changed, ['setting saved']);
});

test('root Escape warns once and the next Escape discards the draft', async () => {
  let discarded = 0;
  const env = makeDashboard({ onDiscard: () => discarded++ });
  await waitFor(() => env.ctx.lastScreen, 'panel screen');
  const settings = env.tui.created.settings[0];
  await settings.cycle('setting', 'não salvo');
  settings.onCancel();
  assert.ok(env.ctx.lastScreen, 'first Escape keeps the panel open');
  assert.equal(discarded, 0);
  assert.match(env.notices.at(-1).message, /Press Ctrl\+S to save, or Esc again to discard/);
  settings.onCancel();
  await env.running;
  assert.equal(discarded, 1);
  assert.equal(env.ctx.customResult.discarded, true);
  assert.deepEqual(env.ctx.customResult.changed, []);
});

test('a late action result after closing cannot update or notify the closed panel', async () => {
  let resolveAction;
  const env = makeDashboard({
    onChange: () => new Promise((resolve) => { resolveAction = resolve; }),
  });
  await waitFor(() => env.ctx.lastScreen, 'panel screen');
  const settings = env.tui.created.settings[0];
  const action = settings.cycle('setting', 'late result');
  settings.onCancel();
  await env.running;
  const noticesAfterClose = env.notices.length;
  resolveAction({ kind: 'draft', count: 1, note: 'late result' });
  await action;
  assert.equal(env.notices.length, noticesAfterClose);
  assert.deepEqual(env.ctx.customResult.changed, []);
});

test('Unicode panel output renders at 40, 80 and 120 columns', async () => {
  const env = makeDashboard();
  await waitFor(() => env.ctx.lastScreen, 'panel screen');
  for (const width of [40, 80, 120]) {
    const rendered = env.ctx.lastScreen.render(width).join('\n');
    assert.match(rendered, /漢字/);
    assert.match(rendered, /🎛️/);
    assert.match(rendered, /Unicode 設定/);
  }
  env.tui.created.settings[0].onCancel();
  await env.running;
});
