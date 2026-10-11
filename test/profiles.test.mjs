import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { authorize, validateTransport, defaultProfiles, defaults } from '../policy.mjs';
const profile = {
  ...defaultProfiles['developer-readonly'],
  servers: { docs: { enabled: true } },
  allowTools: ['mcp__docs__search'],
};
const args = {
  name: 'mcp__docs__search',
  input: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  profile,
  config: defaults.mcpControl,
  trusted: true,
};
test('profiles enforce deny over grants, production safety and trust', () => {
  assert.equal(authorize(args).decision, 'allow');
  assert.equal(authorize({ ...args, trusted: false }).decision, 'deny');
  assert.equal(authorize({ ...args, denies: [{ tool: args.name }] }).decision, 'deny');
  assert.equal(authorize({ ...args, name: 'mcp__unknown__read' }).decision, 'deny');
  assert.equal(
    authorize({
      ...args,
      annotations: { readOnlyHint: true },
      config: { ...args.config, environment: 'production' },
    }).decision,
    'deny',
  );
});
test('unknown asks, annotations alone never grant, exact scoped grants and rate limits', () => {
  assert.equal(authorize({ ...args, profile: { ...profile, allowTools: [] } }).decision, 'ask');
  assert.equal(authorize({ ...args, calls: 150 }).decision, 'deny');
  assert.equal(authorize({ ...args, rate: 60 }).decision, 'deny');
  assert.equal(authorize({ ...args, circuitOpen: true }).decision, 'deny');
  assert.equal(authorize({ ...args, name: 'read_mcp_resource', input: {} }).decision, 'deny');
});
test('URL/protocol/host/credential command and arbitrary shell denied', () => {
  assert.throws(
    () => validateTransport({ url: 'http://evil.com/mcp' }, { allowedHosts: ['evil.com'] }),
    /denied/,
  );
  assert.throws(
    () =>
      validateTransport(
        { command: 'bash', args: ['-c', 'something'] },
        { allowedExecutables: ['bash'] },
      ),
    /denied/,
  );
  assert.throws(
    () =>
      validateTransport(
        { url: 'https://safe.test/mcp', headers: { Authorization: '!get-secret' } },
        { allowedHosts: ['safe.test'] },
      ),
    /denied/,
  );
  assert.equal(
    validateTransport({ url: 'https://safe.test/mcp' }, { allowedHosts: ['safe.test'] }).url,
    'https://safe.test/mcp',
  );
});
