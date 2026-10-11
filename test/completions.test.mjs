import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletions, usageText, compact } from '../lib/core.mjs';

const spec = {
  name: 'demo',
  description: 'Demo command',
  actions: {
    on: { hint: '', description: 'enable' },
    mode: { hint: 'MODE', args: [{ values: ['rules', 'hybrid', 'learned'], hint: 'mode' }] },
    add: {
      hint: 'NAME [tier]',
      description: 'add one',
      args: [
        { values: ['alpha', 'beta'], hint: 'name', advance: true },
        {
          // Slot 1 can branch on what the user already typed in slot 0.
          provide: async ({ positional }) =>
            positional[0] === 'alpha'
              ? [{ value: 'fromAlpha', description: 'only for alpha' }]
              : [{ value: 'other' }],
          hint: 'tier',
          advance: true,
        },
      ],
      flags: { '--tools': { values: ['on', 'off'], hint: 'tool capable' } },
    },
    say: { hint: 'TEXT', args: [{ hint: 'free text' }], free: true },
  },
};
const complete = buildCompletions(spec);
const labels = (items) => (items ?? []).map((i) => i.label);
const values = (items) => (items ?? []).map((i) => i.value);

test('bare prefix lists every action', async () => {
  assert.deepEqual(labels(await complete('')).sort(), ['add', 'mode', 'on', 'say'].sort());
});

test('pi contract: value rewrites the whole argument text, label shows only the token', async () => {
  const items = await complete('mode hyb');
  assert.deepEqual(labels(items), ['hybrid']);
  assert.deepEqual(values(items), ['mode hybrid']);
  const nested = await complete('add alpha ');
  assert.deepEqual(labels(nested), ['fromAlpha']);
  assert.deepEqual(values(nested), ['add alpha fromAlpha ']);
});

test('enum completion with startsWith, substring and case-insensitive ranking', async () => {
  assert.deepEqual(labels(await complete('mode ')).sort(), ['hybrid', 'learned', 'rules']);
  assert.deepEqual(labels(await complete('mode LEA')), ['learned']);
  // Loose subsequence still matches, so `rn` reaches `learned`.
  assert.deepEqual(labels(await complete('mode rn')), ['learned']);
});

test('dynamic provider sees the tokens already typed', async () => {
  assert.deepEqual(labels(await complete('add ')).sort(), ['alpha', 'beta']);
  assert.deepEqual(labels(await complete('add alpha ')), ['fromAlpha']);
  assert.deepEqual(labels(await complete('add beta ')), ['other']);
});

test('flag values complete after the flag; flag names complete before it', async () => {
  assert.deepEqual(labels(await complete('add alpha --tools ')), ['on', 'off']);
  assert.deepEqual(values(await complete('add alpha --tools on')), ['add alpha --tools on']);
  assert.deepEqual(labels(await complete('add --')), ['--tools']);
  // A flag value does not consume a positional slot.
  assert.deepEqual(labels(await complete('add --tools on ')).sort(), ['alpha', 'beta']);
});

test('free text, unknown actions and unmatched tokens yield null', async () => {
  assert.equal(await complete('say hello world'), null);
  assert.equal(await complete('nope '), null);
  assert.equal(await complete('mode nope'), null);
});

test('completion never throws on pathological input', async () => {
  for (const input of [
    undefined,
    null,
    '   ',
    '\n',
    '--',
    'mode \u0000',
    'a'.repeat(4000),
    'add alpha 1 2 3 4 5',
  ])
    assert.doesNotThrow(async () => await complete(input), `failed for ${JSON.stringify(input)}`);
});

test('usage text documents each action with its argument shape', () => {
  const text = usageText('demo', spec);
  assert.match(text, /\/demo mode MODE/);
  assert.match(text, /\/demo add NAME \[tier\]\s+\[--tools tool capable\] — add one/);
  assert.match(text, /\/demo say TEXT/);
});

test('compact renders objects as scannable lines, not a 40-row JSON blob', () => {
  const tui = { mode: 'tui' };
  assert.equal(
    compact({ enabled: true, mode: 'hybrid', policy: 'balanced', classifier: true }, tui),
    'enabled: true\nmode: hybrid\npolicy: balanced\nclassifier: true',
  );
  assert.equal(compact(['a', 'b'], tui), 'a, b');
  assert.equal(
    compact({ secret: 'x', api_key: 'y' }, tui),
    'secret: [REDACTED]\napi_key: [REDACTED]',
  );
  assert.deepEqual(JSON.parse(compact({ a: 1 }, { mode: 'print' })), { a: 1 });
});
