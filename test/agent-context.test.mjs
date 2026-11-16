import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const normalize = (text) => text.replace(/\s+/gu, ' ').trim();

test('Pi MCP Control specialization and metadata match across clients', () => {
  const skill = read('.agents/skills/pi-mcp-control/SKILL.md');
  const cursorSkill = read('.cursor/skills/pi-mcp-control/SKILL.md');
  const metadata = read('.agents/skills/pi-mcp-control/metadata.yaml');
  const cursorMetadata = read('.cursor/skills/pi-mcp-control/metadata.yaml');
  assert.equal(cursorSkill, skill);
  assert.equal(cursorMetadata, metadata);
  for (const field of ['id: pi-mcp-control', 'owner: pi-mcp-control', 'version: 1.0.0', 'scope: "product-local; Pi, Codex and Cursor"']) {
    assert.ok(metadata.includes(field), field);
  }
});

test('product context stays local and preserves the authorization boundary', () => {
  const agents = read('AGENTS.md');
  const marker = agents.indexOf('<!-- harness:start -->');
  assert.ok(marker > 0);
  const preamble = agents.slice(0, marker);
  assert.ok(preamble.includes('.agents/skills/pi-mcp-control/SKILL.md'));
  assert.match(preamble, /Pi continua sendo o cliente MCP/u);
  assert.match(preamble, /não é sandbox/u);
  assert.match(preamble, /adoção do INTEIRO não está selecionada/u);
  assert.match(preamble, /Preserve o aviso\/licença/u);
});

test('security guidance matches the local policy implementation and README', () => {
  const skill = normalize(read('.agents/skills/pi-mcp-control/SKILL.md'));
  const policy = read('policy.mjs');
  const extension = read('extension.mjs');
  const readme = normalize(read('README.md'));
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.name, 'pi-mcp-control');
  assert.equal(packageJson.private, true);
  assert.match(policy, /developer-readonly/u);
  assert.match(policy, /strict: true/u);
  assert.match(extension, /deny outranks every grant/u);
  assert.match(readme, /mutations require explicit human approval/u);
  for (const phrase of [
    'Pi remains the MCP client',
    'This is not a sandbox',
    'deny outranks grants',
    'never waives approval for a mutation',
    'only to a server listed in `managedServers`',
    'Do not inspect or modify the user\'s real project/global Pi settings',
    'shared Harness metadata does not imply adoption',
  ]) assert.ok(skill.includes(phrase), phrase);
  assert.doesNotMatch(readme, /(?:uses|adopts)\s+(?:the\s+)?INTEIRO design system/iu);
  assert.match(readme, /INTEIRO mark has a separate notice/u);
});

test('menu, draft save, and cancellation guidance match the product surface', () => {
  const skill = normalize(read('.agents/skills/pi-mcp-control/SKILL.md'));
  const readme = normalize(read('README.md'));
  const extension = read('extension.mjs');
  assert.match(extension, /MCP control — \(vazio abre o painel\)/u);
  for (const phrase of [
    '`/mcpc` with no arguments opens the Pi-native dashboard',
    'Configuration and language edits are drafts until Ctrl+S',
    'Escape from a submenu returns to the dashboard',
    'first Escape warns and the second discards',
  ]) assert.ok(skill.includes(phrase), phrase);
  assert.match(readme, /Ctrl\+S to save staged changes/u);
  assert.match(readme, /first Escape warns and the second discards/u);
});
