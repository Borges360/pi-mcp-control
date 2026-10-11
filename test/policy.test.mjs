import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decide } from '../policy.mjs';
test('deny takes precedence over grant, unknown asks, non-MCP outside scope', () => {
  assert.equal(decide('mcp__jenkins__deploy', {}, true), 'deny');
  assert.equal(decide('mcp__db__query', { sql: 'DROP TABLE users' }, true), 'deny');
  assert.equal(decide('mcp__docs__search', {}, false), 'ask');
  assert.equal(decide('mcp__docs__search', {}, true), 'allow');
  assert.equal(decide('mcp__db__query', { sql: 'UPDATE users SET admin=1' }, true), 'ask');
  assert.equal(decide('mcp__jenkins__build', {}, true), 'ask');
  assert.equal(decide('bash', { command: 'x' }, false), 'outside-scope');
});
