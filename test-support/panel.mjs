/**
 * Shared fixture for the `/mcpc` panel tests: a trusted project with a native
 * `.pi/mcp.json`, a fake host that exposes MCP tools for one server, and the fake TUI
 * wired through the `host` seam. Nothing here opens a socket or calls a model.
 */
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseDocument } from 'yaml';
import install from '../extension.mjs';
import { host } from '../menu.mjs';
import { fakeTui, withCustomUi } from './fake-tui.mjs';
import { fakePi } from './fakes.mjs';

export const CONFIG =
  'mcpControl:\n  enabled: true\n  defaultProfile: java-service\n  scope: { source: available, strict: true }\n';

export async function mcpEnv(
  t,
  {
    config = CONFIG,
    global = null,
    servers = { docs: { url: 'https://docs.internal/mcp' }, git: { command: 'git-mcp-server' } },
    tools = ['mcp__docs__search'],
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-panel-'));
  const state = await mkdtemp(join(tmpdir(), 'mcp-panel-state-'));
  const oldSuiteHome = process.env.PI_SUITE_HOME;
  const oldAgentDir = process.env.PI_AGENT_DIR;
  process.env.PI_SUITE_HOME = state;
  process.env.PI_AGENT_DIR = join(state, 'agent');
  await mkdir(process.env.PI_AGENT_DIR, { recursive: true });
  const savedHost = { tui: host.tui, agent: host.agent };
  t.after(async () => {
    if (oldSuiteHome === undefined) delete process.env.PI_SUITE_HOME;
    else process.env.PI_SUITE_HOME = oldSuiteHome;
    if (oldAgentDir === undefined) delete process.env.PI_AGENT_DIR;
    else process.env.PI_AGENT_DIR = oldAgentDir;
    host.tui = savedHost.tui;
    host.agent = savedHost.agent;
    await rm(dir, { recursive: true, force: true });
    await rm(state, { recursive: true, force: true });
  });
  execFileSync('git', ['init', dir], { stdio: 'ignore' });
  await mkdir(join(dir, '.pi'), { recursive: true });
  await writeFile(join(dir, '.pi', 'mcp.json'), JSON.stringify({ mcpServers: servers }));
  if (config) await writeFile(join(dir, '.pi', 'pi-suite.yaml'), config);
  if (global) await writeFile(join(state, 'config.yaml'), global);
  const tui = fakeTui();
  host.tui = tui.tuiPkg;
  host.agent = tui.agentPkg;
  const f = fakePi(dir);
  f.pi.getAllTools = () => tools.map((name) => ({ name, annotations: {} }));
  withCustomUi(f.ctx, tui);
  const command = (args) => f.command('mcpc', args);
  install(f.pi);
  await f.emit('session_start');
  return {
    dir,
    state,
    f,
    tui,
    command,
    settings: () => tui.created.settings[0],
    saved: async () =>
      (parseDocument(await readFile(join(dir, '.pi', 'pi-suite.yaml'), 'utf8')).toJS() ?? {})
        .mcpControl,
    file: async () => {
      try {
        return await readFile(join(dir, '.pi', 'pi-suite.yaml'), 'utf8');
      } catch {
        return '';
      }
    },
    open: async () => {
      const settled = { done: false };
      const running = command('')
        .then((r) => {
          settled.done = true;
          return r;
        })
        .catch((e) => {
          settled.done = true;
          throw e;
        });
      await waitFor(() => f.ctx.lastScreen || settled.done, 'abrir o painel (ou degradar)');
      return { running };
    },
  };
}

/** Waits on an observable effect, never on a number of ticks. */
export async function waitFor(predicate, what, ms = 4000) {
  const until = Date.now() + ms;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > until) throw Error(`timeout aguardando: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
