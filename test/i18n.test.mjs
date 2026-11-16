import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CATALOGS,
  LOCALES,
  catalogKeys,
  placeholderNames,
  readProjectLocale,
  translate,
  wrapPanelText,
  writeProjectLocale,
} from '../lib/i18n.mjs';

test('English and Brazilian Portuguese catalogs have identical keys and placeholders', () => {
  assert.deepEqual(LOCALES, ['en', 'pt-BR']);
  assert.deepEqual(catalogKeys('en'), catalogKeys('pt-BR'));
  for (const key of catalogKeys('en'))
    assert.deepEqual(
      placeholderNames(CATALOGS.en[key]),
      placeholderNames(CATALOGS['pt-BR'][key]),
      `${key} placeholders`,
    );
  assert.equal(translate('unknown-locale', 'saveSuccess'), CATALOGS.en.saveSuccess);
  assert.equal(translate('pt-BR', 'missing-key'), 'missing-key');
});

test('locale preference is isolated by trusted project and validates its schema', async (t) => {
  const parent = await mkdtemp(join(tmpdir(), 'pi-mcp-locale-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const first = join(parent, 'first');
  const second = join(parent, 'second');
  await mkdir(join(first, '.pi'), { recursive: true });
  await mkdir(join(second, '.pi'), { recursive: true });

  assert.deepEqual(await readProjectLocale({ root: first, trusted: true }), {
    locale: 'en',
    canPersist: true,
    issue: null,
    file: join(first, '.pi', 'pi-mcp-control.locale.json'),
  });
  await writeProjectLocale({ root: first, trusted: true, locale: 'pt-BR' });
  assert.deepEqual(await readProjectLocale({ root: first, trusted: true }), {
    locale: 'pt-BR',
    canPersist: true,
    issue: null,
    file: join(first, '.pi', 'pi-mcp-control.locale.json'),
  });
  await writeProjectLocale({ root: first, trusted: true, locale: 'en' });
  assert.equal((await readProjectLocale({ root: first, trusted: true })).locale, 'en', 'atomic replacement updates an existing preference');
  await writeProjectLocale({ root: first, trusted: true, locale: 'pt-BR' });
  assert.equal((await readProjectLocale({ root: second, trusted: true })).locale, 'en');

  const untrusted = await readProjectLocale({ root: first, trusted: false });
  assert.deepEqual(untrusted, { locale: 'en', canPersist: false, issue: null, file: null });
  await assert.rejects(
    writeProjectLocale({ root: first, trusted: false, locale: 'pt-BR' }),
    /Project trust is required/,
  );
  assert.deepEqual(JSON.parse(await readFile(join(first, '.pi', 'pi-mcp-control.locale.json'), 'utf8')), {
    schemaVersion: 1,
    locale: 'pt-BR',
  });

  await writeFile(join(first, '.pi', 'pi-mcp-control.locale.json'), '{"schemaVersion":1,"locale":"fr"}\n');
  assert.deepEqual(await readProjectLocale({ root: first, trusted: true }), {
    locale: 'en',
    canPersist: true,
    issue: 'invalid',
    file: join(first, '.pi', 'pi-mcp-control.locale.json'),
  });
  await writeFile(join(first, '.pi', 'pi-mcp-control.locale.json'), '{broken');
  assert.equal((await readProjectLocale({ root: first, trusted: true })).issue, 'unreadable');
});

test('text wrapping respects Unicode code points at the supported terminal widths', () => {
  const source = 'Painel MCP · português brasileiro · controle seguro 🎛️';
  for (const width of [40, 80, 120]) {
    const lines = wrapPanelText(source, width);
    assert.ok(lines.length > 0);
    assert.ok(lines.every((line) => Array.from(line).length <= width));
    assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(), source);
  }
  assert.throws(() => wrapPanelText('x', 0), /positive integer/);
});
