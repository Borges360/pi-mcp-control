/**
 * Exercise the /mcpc panel through the Pi 1.4.0 extension loader and real TUI modules.
 * This is offline: the temporary project has no MCP servers and no credentials, and
 * the smoke only opens, renders, and closes the panel without saving configuration.
 */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { piExtensions } from './pi-module.mjs';
import { fakePi } from '../test-support/fakes.mjs';

const ESC = '\x1b';
const stripAnsi = (value) => String(value).replace(/\x1b\[[0-9;]*m/g, '');

async function waitFor(predicate, label, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function installedPiEntry() {
  const releases = join(homedir(), '.pi', 'agent', 'install', 'releases');
  const versions = await readdir(releases).catch(() => []);
  const candidates = [
    process.env.PI_CODING_AGENT_ENTRY,
    ...versions.sort().reverse().map((version) =>
      join(releases, version, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js'),
    ),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = String(candidate).replace(/[\\/]$/, '');
    const entry = /[\\/]index\.js$/.test(normalized) ? normalized : join(normalized, 'index.js');
    try {
      await readFile(entry);
      return entry;
    } catch {
      // Try the next locally installed release.
    }
  }
  throw new Error('Installed pi-coding-agent not found; set PI_CODING_AGENT_ENTRY');
}

function explicitPiEntry() {
  const index = process.argv.indexOf('--pi-entry');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const explicitEntry = explicitPiEntry();
  const { loadExtensions, createExtensionRuntime } = await piExtensions(explicitEntry);
  const loaded = await loadExtensions(
    [join(process.cwd(), 'index.ts')],
    process.cwd(),
    undefined,
    createExtensionRuntime(),
  );
  if (loaded.errors?.length) {
    throw new Error(`Pi loader rejected the extension: ${loaded.errors.map((e) => e.error ?? e).join('; ')}`);
  }
  const command = loaded.extensions
    .flatMap((extension) => [...extension.commands.values()])
    .find((entry) => entry.name === 'mcpc');
  if (!command) throw new Error('Pi loader did not register /mcpc');

  const entry = explicitEntry ?? (await installedPiEntry());
  const hostPath = entry.replace(/[\\/]index\.js$/, '');
  const agent = await import(pathToFileURL(entry).href);
  if (!agent?.getSettingsListTheme || !agent?.getSelectListTheme || !agent?.DynamicBorder) {
    throw new Error('Set PI_CODING_AGENT_ENTRY to the installed Pi 1.4.0 dist/index.js');
  }
  const tuiPath = join(hostPath, '..', '..', 'pi-tui', 'dist', 'index.js');
  const tui = await import(pathToFileURL(tuiPath).href);
  if (!tui.SettingsList || !tui.Container || !tui.Text || !tui.getKeybindings) {
    throw new Error('The installed pi-tui module is missing required panel components');
  }

  const dir = await mkdtemp(join(tmpdir(), 'pi-mcpc-smoke-'));
  const oldSuiteHome = process.env.PI_SUITE_HOME;
  const oldAgentDir = process.env.PI_AGENT_DIR;
  process.env.PI_SUITE_HOME = join(dir, 'state');
  process.env.PI_AGENT_DIR = join(dir, 'agent');
  await mkdir(process.env.PI_AGENT_DIR, { recursive: true });
  try {
    execFileSync('git', ['init', '--quiet', dir], { stdio: 'ignore' });
    await mkdir(join(dir, '.pi'), { recursive: true });
    await writeFile(join(dir, '.pi', 'pi-suite.yaml'), 'mcpControl:\n  enabled: true\n');
    const fake = fakePi(dir);
    fake.ctx.mode = 'tui';
    fake.pi.getAllTools = () => [];
    fake.pi.getMcpServers = () => [];
    let screen;
    let resolveScreen;
    const closed = new Promise((resolve) => (resolveScreen = resolve));
    const themeModule = await import(pathToFileURL(join(hostPath, 'modes', 'interactive', 'theme', 'theme.js')).href);
    themeModule.initTheme?.();
    const theme = themeModule.theme;
    const keybindings = tui.getKeybindings();
    fake.ctx.ui.custom = (factory) => {
      screen = factory({ requestRender() {} }, theme, keybindings, resolveScreen);
      return closed;
    };
    const configPath = join(dir, '.pi', 'pi-suite.yaml');
    const before = await readFile(configPath, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });

    const running = command.handler('', fake.ctx);
    await waitFor(() => Boolean(screen), 'the real /mcpc panel');
    for (const width of [40, 80, 120]) {
      const rows = screen.render(width).map(stripAnsi);
      if (!rows.some((row) => /MCP Control/i.test(row))) {
        throw new Error(`/mcpc panel did not render its title at ${width} columns`);
      }
      if (typeof tui.visibleWidth === 'function' && rows.some((row) => tui.visibleWidth(row) > width)) {
        throw new Error(`/mcpc panel overflowed at ${width} columns`);
      }
    }
    screen.handleInput(ESC);
    const summary = await closed;
    await running;
    const after = await readFile(configPath, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (after !== before) throw new Error('Opening and closing the panel changed project configuration');
    console.log('Pi 1.4.0 loader: PASS');
    console.log('Real pi-tui render at 40/80/120 columns: PASS');
    console.log(`Escape closes without saving: PASS (${summary?.changed?.length ?? 0} saved changes)`);
    console.log('MCP/network/model effects: none');
  } finally {
    if (oldSuiteHome === undefined) delete process.env.PI_SUITE_HOME;
    else process.env.PI_SUITE_HOME = oldSuiteHome;
    if (oldAgentDir === undefined) delete process.env.PI_AGENT_DIR;
    else process.env.PI_AGENT_DIR = oldAgentDir;
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('Pi MCP Control smoke failed:', error?.stack ?? error);
  process.exitCode = 1;
});
