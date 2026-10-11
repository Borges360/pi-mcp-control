import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  open,
  unlink,
  realpath,
  lstat,
  readdir,
} from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { resolve, join, relative, dirname, isAbsolute } from 'node:path';
import { spawn } from 'node:child_process';
import { parseDocument } from 'yaml';
export const VERSION = 1;
export const canonical = (value) => JSON.stringify(normalize(value));
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, normalize(v[k])]),
    );
  return v;
}
export const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : canonical(value))
    .digest('hex');
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const actor = () => userInfo().username;
export function redact(v) {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [
        k,
        /^(authorization|password|secret|api.?key|api.?secret|client.?secret|signing.?key|credentials|access.?token|refresh.?token|headers|env|prompt|raw)$/i.test(
          k,
        )
          ? '[REDACTED]'
          : redact(x),
      ]),
    );
  if (typeof v !== 'string') return v;
  return v
    .replace(
      /-----BEGIN [\w ]*PRIVATE KEY-----[\s\S]*?-----END [\w ]*PRIVATE KEY-----/g,
      '[REDACTED]',
    )
    .replace(/\b(?:sk-[\w-]{12,}|gh[pousr]_[\w]{12,}|github_pat_[\w]{12,})\b/g, '[REDACTED]')
    .replace(/\b(Bearer)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(
      /(--(?:api[-_]?key|token|password|secret)\s+)(?:"[^"]*"|'[^']*'|\S+)/gi,
      '$1[REDACTED]',
    )
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:/]+:[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED]')
    .replace(
      /\b([\w.-]*(?:key|token|password|secret)[\w.-]*\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,"';]+)/gi,
      '$1[REDACTED]',
    );
}
export function glob(pattern, text) {
  const p = String(pattern).replace(/\\/g, '/');
  let rx = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        i++;
        if (p[i + 1] === '/') {
          i++;
          rx += '(?:.*/)?';
        } else rx += '.*';
      } else rx += '[^/]*';
    } else if (c === '?') rx += '[^/]';
    else rx += c.replace(/[\\^$+?.()|{}\[\]]/g, '\\$&');
  }
  return new RegExp(`^${rx}$`).test(text.replace(/\\/g, '/'));
}
export function merge(a, b) {
  const out = structuredClone(a ?? {});
  for (const [k, v] of Object.entries(b ?? {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) throw Error('Unsafe config key');
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) ? merge(out[k], v) : structuredClone(v);
  }
  return out;
}
export async function yamlFile(path, optional = false) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if (optional && e.code === 'ENOENT') return {};
    throw e;
  }
  if (text.length > 1_000_000) throw Error('Config too large');
  const doc = parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length) throw Error(`Invalid YAML: ${doc.errors[0].message}`);
  return doc.toJS({ maxAliasCount: 20 }) ?? {};
}
export async function safePath(root, path, { existing = false } = {}) {
  if (typeof path !== 'string' || path.includes('\0') || isAbsolute(path))
    throw Error('Relative project path required');
  const base = await realpath(root),
    target = resolve(base, path);
  const rel = relative(base, target);
  if (
    rel === '..' ||
    rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(rel)
  )
    throw Error('Path outside project');
  let current = base;
  for (const part of rel.split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw Error('Symlink denied');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      if (existing) throw e;
      break;
    }
  }
  return target;
}
export async function processRun(
  command,
  args,
  { cwd, timeoutMs = 120000, signal, maxBytes = 2_000_000 } = {},
) {
  return new Promise((resolveResult) => {
    let child,
      timer,
      done = false,
      output = '',
      bytes = 0,
      error = null;
    const stop = (why) => {
      error = why;
      if (child?.pid) {
        if (process.platform === 'win32')
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
      }
      finish(null);
    };
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolveResult({ code, error, output: redact(output), digest: hash(output) });
    };
    const abort = () => stop('aborted');
    if (signal?.aborted) {
      finish(null);
      return;
    }
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      error = e.code ?? 'spawn';
      finish(null);
      return;
    }
    const data = (b) => {
      bytes += b.length;
      if (bytes <= maxBytes) output += b.toString('utf8');
      else stop('output-limit');
    };
    child.stdout.on('data', data);
    child.stderr.on('data', data);
    child.once('error', (e) => {
      error = e.code ?? 'spawn';
      finish(null);
    });
    child.once('close', finish);
    timer = setTimeout(() => stop('timeout'), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function git(root, args) {
  const r = await processRun('git', args, { cwd: root, timeoutMs: 15000 });
  if (r.code !== 0) throw Error(`Git failed (${args[0]})`);
  return r.output.trim();
}
export async function projectIdentity(cwd) {
  let root;
  try {
    root = await git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    root = cwd;
  }
  root = await realpath(root);
  return { root, projectId: hash(process.platform === 'win32' ? root.toLowerCase() : root) };
}
export function semanticSource(text) {
  const tokens = [];
  for (let i = 0; i < text.length; ) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let token = c;
      const quote = c;
      i++;
      while (i < text.length) {
        const next = text[i++];
        token += next;
        if (next.charCodeAt(0) === 92 && i < text.length) token += text[i++];
        else if (next === quote) break;
      }
      tokens.push(token);
      continue;
    }
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i + 2);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    const word = /^[\w$]+/.exec(text.slice(i));
    if (word) {
      tokens.push(word[0]);
      i += word[0].length;
    } else {
      tokens.push(c);
      i++;
    }
  }
  return canonical(tokens);
}
export async function snapshot(
  root,
  { allowedPaths = ['**'], ignorePaths = [], semantic = false } = {},
) {
  let commitHash;
  try {
    commitHash = await git(root, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    commitHash = 'unborn';
  }
  const result = await processRun(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root },
  );
  if (result.code !== 0) throw Error('Git repository required for evidence');
  const files = [...new Set(result.output.split('\0').filter(Boolean))]
    .filter((p) => allowedPaths.some((g) => glob(g, p)) && !ignorePaths.some((g) => glob(g, p)))
    .sort();
  const entries = [];
  for (const p of files) {
    const f = await safePath(root, p);
    try {
      const stat = await lstat(f);
      if (!stat.isFile() || stat.size > 8_000_000) throw Error('Non-file or oversized evidence');
      const data = await readFile(f);
      let text = data.toString('utf8');
      if (semantic && /\.(md|txt)$/i.test(p)) continue;
      if (semantic) text = semanticSource(text);
      entries.push([p, hash(semantic ? text : data.toString('base64')), stat.mode]);
    } catch (e) {
      if (e.code === 'ENOENT') entries.push([p, 'deleted']);
      else throw e;
    }
  }
  let indexHash = null;
  if (!semantic) {
    const staged = await processRun('git', ['ls-files', '--stage', '-z'], { cwd: root });
    if (staged.code !== 0) throw Error('Git index cannot be verified');
    const relevant = staged.output
      .split('\0')
      .filter(Boolean)
      .filter((line) => {
        const p = line.slice(line.indexOf('\t') + 1);
        return allowedPaths.some((g) => glob(g, p)) && !ignorePaths.some((g) => glob(g, p));
      });
    indexHash = hash(relevant);
  }
  return {
    commitHash,
    indexHash,
    workingTreeHash: semantic ? hash(entries) : hash({ entries, indexHash }),
    files: entries,
  };
}
export class FileStore {
  constructor(home) {
    this.home = home;
  }
  path(name) {
    if (!/^[a-z0-9_-]+$/.test(name)) throw Error('Invalid collection');
    return join(this.home, `${name}.jsonl`);
  }
  async rows(name) {
    try {
      const text = await readFile(this.path(name), 'utf8');
      return text
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const row = JSON.parse(l);
          if (row.schemaVersion != null && row.schemaVersion !== VERSION)
            throw Error('Unsupported journal schema');
          return row;
        });
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw Error(`Journal unreadable: ${name}`);
    }
  }
  async lock(fn) {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    const file = join(this.home, '.writer.lock');
    let h;
    for (let n = 0; n < 100; n++) {
      try {
        h = await open(file, 'wx', 0o600);
        await h.writeFile(String(process.pid));
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    if (!h) throw Error('State writer busy; retry (stale locks require manual recovery)');
    try {
      return await fn();
    } finally {
      await h.close();
      await unlink(file);
    }
  }
  async append(name, row) {
    return this.lock(async () => {
      const rows = await this.rows(name);
      if (rows.some((r) => r.id === row.id)) return false;
      await this.appendUnlocked(name, row);
      return true;
    });
  }
  async appendUnlocked(name, row) {
    const h = await open(this.path(name), 'a', 0o600);
    try {
      await h.writeFile(canonical(redact({ schemaVersion: VERSION, ...row })) + '\n');
      await h.sync();
    } finally {
      await h.close();
    }
  }
  async latest(name, id) {
    return (await this.rows(name)).filter((r) => r.entityId === id).at(-1);
  }
  async key() {
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    const f = join(this.home, '.approval-key');
    try {
      await writeFile(f, randomBytes(32), { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    return readFile(f);
  }
  async sign(data) {
    const payload = redact(data);
    return {
      payload,
      signature: createHmac('sha256', await this.key())
        .update(canonical(payload))
        .digest('hex'),
    };
  }
  async valid(record) {
    if (!record?.payload || !record.signature) return false;
    const signed = await this.sign(record.payload);
    const a = Buffer.from(signed.signature),
      b = Buffer.from(record.signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
export async function atomicJson(file, data) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + uid() + '.tmp';
  await writeFile(temp, canonical(redact(data)) + '\n', { mode: 0o600 });
  await rename(temp, file);
}
export const scopeOf = (ctx) => {
  const branch = ctx.sessionManager.getBranch();
  const task = [...branch]
    .reverse()
    .find((e) => e.type === 'custom' && e.customType === 'suite.task');
  return {
    sessionId: ctx.sessionManager.getSessionId(),
    branchId: ctx.sessionManager.getLeafId() ?? 'root',
    taskId: task?.data?.taskId ?? null,
    attemptId: task?.data?.attemptId ?? null,
  };
};
export function setTask(pi, taskId, attemptId = uid()) {
  if (!/^[\w-]{1,100}$/.test(taskId)) throw Error('Invalid task ID');
  pi.appendEntry('suite.task', { taskId, attemptId });
}
export function output(ctx, data, type = 'info') {
  const safe = redact(data);
  if (ctx.hasUI)
    ctx.ui.notify(typeof safe === 'string' ? safe : JSON.stringify(safe, null, 2), type);
  else process.stdout.write(JSON.stringify({ type: 'pi-suite', level: type, data: safe }) + '\n');
}
export async function timed(fn, timeoutMs, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Error('timeout')), timeoutMs);
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    if (controller.signal.aborted) throw controller.signal.reason ?? Error('aborted');
    return await Promise.race([
      fn(controller.signal),
      new Promise((_, reject) =>
        controller.signal.addEventListener(
          'abort',
          () => reject(controller.signal.reason ?? Error('aborted')),
          { once: true },
        ),
      ),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
export class Circuit {
  constructor({ threshold = 3, cooldownMs = 30000 } = {}) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.errors = 0;
    this.until = 0;
  }
  ready() {
    return Date.now() >= this.until;
  }
  success() {
    this.errors = 0;
    this.until = 0;
  }
  fail() {
    if (++this.errors >= this.threshold) this.until = Date.now() + this.cooldownMs;
  }
}
export function words(text) {
  const matches = text.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/g) ?? [];
  return matches.map((x) => (/^['"]/.test(x) ? x.slice(1, -1) : x));
}
export function validateConfig(config) {
  for (const section of [
    'modelEconomist',
    'acceptanceGate',
    'loopGuard',
    'costProfiler',
    'mcpControl',
  ])
    if (
      Object.hasOwn(config, section) &&
      (!config[section] || typeof config[section] !== 'object' || Array.isArray(config[section]))
    )
      throw Error(`Invalid configuration section: ${section}`);
  if (config.schemaVersion != null && config.schemaVersion !== 1)
    throw Error('Unsupported config schemaVersion');
  const m = config.modelEconomist;
  if (m) {
    if (
      m.mode != null &&
      !['off', 'manual', 'rules', 'jev', 'small-llm', 'hybrid', 'learned'].includes(m.mode)
    )
      throw Error('Invalid economist mode');
    if (m.policy != null && !['economy', 'balanced', 'quality', 'latency'].includes(m.policy))
      throw Error('Invalid economist policy');
    for (const field of ['timeoutMs', 'maxInputChars', 'maxOutputTokens'])
      if (
        m.classifier?.[field] != null &&
        (!Number.isFinite(m.classifier[field]) || m.classifier[field] <= 0)
      )
        throw Error('Invalid classifier limit');
  }
  const guard = config.loopGuard;
  if (
    guard &&
    ((guard.mode != null && !['warn', 'enforce'].includes(guard.mode)) ||
      (guard.repeatedIdenticalCalls != null &&
        (!Number.isInteger(guard.repeatedIdenticalCalls) || guard.repeatedIdenticalCalls < 2)))
  )
    throw Error('Invalid loop guard policy');
  const cost = config.costProfiler;
  if (cost) {
    for (const field of ['priceCatalogTtlHours', 'maxRequestOutputTokens'])
      if (cost[field] != null && (!Number.isFinite(cost[field]) || cost[field] <= 0))
        throw Error('Invalid cost profiler limit');
    for (const field of [
      'localEnergyUsdPerHour',
      'localDepreciationUsdPerHour',
      'opportunityUsdPerHour',
    ])
      if (cost[field] != null && (!Number.isFinite(cost[field]) || cost[field] < 0))
        throw Error('Invalid local cost rate');
  }
  if (cost)
    for (const b of Object.values(cost.budgets ?? {}))
      for (const k of ['softUsd', 'hardUsd'])
        if (b[k] != null && (!Number.isFinite(b[k]) || b[k] < 0))
          throw Error('Invalid financial limit');
  const mc = config.mcpControl;
  if (mc && mc.defaultUnknownTool != null && !['ask', 'deny'].includes(mc.defaultUnknownTool))
    throw Error('Invalid unknown MCP policy');
  const numeric = (object, field, min = 0, max = Infinity, integer = false) => {
    const v = object?.[field];
    if (
      v != null &&
      (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v)))
    )
      throw Error(`Invalid numeric policy: ${field}`);
  };
  for (const [object, fields] of [
    [m?.classifier, ['enabled', 'allowRemote']],
    [m?.fastPath, ['enabled', 'skipPaidClassifierForObviousTasks']],
    [config.acceptanceGate, ['autoVerifyOnCandidate', 'continueForPendingChecks']],
    [cost, ['capOutput', 'auditRequired', 'inputIncludesCache']],
    [mc, ['failClosedForMutation']],
  ])
    for (const field of fields)
      if (object?.[field] != null && typeof object[field] !== 'boolean')
        throw Error(`Invalid boolean policy: ${field}`);
  for (const section of [
    'modelEconomist',
    'acceptanceGate',
    'loopGuard',
    'costProfiler',
    'mcpControl',
  ])
    if (config[section]?.enabled != null && typeof config[section].enabled !== 'boolean')
      throw Error('Invalid enabled flag');
  if (m) {
    numeric(m, 'maxRetries', 0, 10, true);
    numeric(m, 'minRiskTier', 1, 10, true);
    numeric(m.classifier, 'maxCostUsdPerDecision', 0);
    numeric(m.fastPath, 'maxEscalations', 0, 5, true);
    if (m.classifier?.engine && !['auto', 'jev', 'small-llm'].includes(m.classifier.engine))
      throw Error('Invalid classifier engine');
    if (m.candidates != null && !Array.isArray(m.candidates))
      throw Error('Candidates must be an array');
    for (const candidate of m.candidates ?? [])
      if (typeof candidate !== 'string') {
        if (!candidate || typeof candidate.id !== 'string') throw Error('Candidate ID required');
        if (
          Object.keys(candidate).some(
            (k) =>
              ![
                'id',
                'tier',
                'tools',
                'health',
                'dataAllowed',
                'local',
                'priorFailureRate',
                'latencyMs',
              ].includes(k),
          )
        )
          throw Error('Candidate cannot override native transport/pricing');
        numeric(candidate, 'tier', 1, 10, true);
        numeric(candidate, 'latencyMs', 0);
        numeric(candidate, 'priorFailureRate', 0, 1);
      }
  }
  if (guard) {
    numeric(guard, 'noProgressTurns', 2, 100, true);
    numeric(guard, 'quarantineTtlSeconds', 1, 86400);
    numeric(guard, 'windowSize', 4, 10000, true);
    if (guard.policy && !['conservative', 'balanced', 'strict'].includes(guard.policy))
      throw Error('Invalid guard policy');
  }
  if (mc) {
    numeric(mc, 'exceptionTtlSeconds', 1, 86400);
    for (const profile of Object.values(mc.profiles ?? {})) {
      if (!profile || typeof profile !== 'object') throw Error('Invalid MCP profile');
      for (const field of ['allowTools', 'denyTools'])
        if (
          profile[field] != null &&
          (!Array.isArray(profile[field]) || profile[field].some((x) => typeof x !== 'string'))
        )
          throw Error('Invalid MCP tool patterns');
      numeric(profile.limits, 'timeoutSeconds', 1, 3600);
      numeric(profile.limits, 'maxCallsPerTask', 0, 100000, true);
      numeric(profile.limits, 'maxCallsPerMinute', 0, 100000, true);
      for (const server of Object.values(profile.servers ?? {})) {
        if (server.enabled != null && typeof server.enabled !== 'boolean')
          throw Error('Invalid server enabled flag');
        if (
          server.exposure &&
          !['direct', 'codemode', 'deferred', 'hidden'].includes(server.exposure)
        )
          throw Error('Invalid server exposure');
      }
    }
  }
  return config;
}
export function createRuntime(pi, source, defaults = {}) {
  let identity,
    store,
    config,
    context,
    lastCwd = null,
    lastTrusted = null;
  const pending = new Set();
  const home = process.env.PI_SUITE_HOME ?? join(homedir(), '.pi', 'agent', 'pi-suite');
  pi.on('tool_call', (event, ctx) => {
    const args = event.input ?? {},
      path =
        typeof args.path === 'string' ? args.path.split(String.fromCharCode(92)).join('/') : '';
    const protectedNames = ['pi-suite.yaml', 'mcp-profiles.yaml', 'config.yaml', '.approval-key'];
    if (['read', 'grep'].includes(event.toolName) && path.endsWith('/.approval-key'))
      return {
        block: true,
        reason: 'Approval signing keys are private and must never enter model context',
      };
    if (
      ['edit', 'write'].includes(event.toolName) &&
      ((protectedNames.some((n) => path.endsWith('/' + n)) &&
        (/(^|\/)\.pi\//.test(path) || path.includes('pi-suite'))) ||
        path.startsWith(home.split(String.fromCharCode(92)).join('/')))
    )
      return {
        block: true,
        reason:
          'Suite policies/state require a human command; model tools cannot edit authorization.',
      };
    if (
      ['bash', 'powershell'].includes(event.toolName) &&
      typeof args.command === 'string' &&
      /(?:pi-suite[\\\\/]|\.approval-key|\.pi[\\\\/]mcp-profiles\.yaml|\.pi[\\\\/]pi-suite\.yaml)/.test(
        args.command,
      )
    )
      return {
        block: true,
        reason: 'Suite configuration/state changes are restricted to the human control plane.',
      };
  });
  return {
    get store() {
      return store;
    },
    get config() {
      return config;
    },
    get root() {
      return identity?.root;
    },
    get projectId() {
      return identity?.projectId;
    },
    get ctx() {
      return context;
    },
    async init(ctx) {
      const trusted = ctx.isProjectTrusted();
      if (identity && config && lastCwd === ctx.cwd && lastTrusted === trusted) {
        context = ctx;
        return this;
      }
      context = ctx;
      config = null;
      const id = await projectIdentity(ctx.cwd);
      lastCwd = ctx.cwd;
      lastTrusted = trusted;
      identity = id;
      store = new FileStore(join(home, 'projects', id.projectId));
      const global = await yamlFile(join(home, 'config.yaml'), true);
      const local = ctx.isProjectTrusted()
        ? await yamlFile(join(id.root, '.pi', 'pi-suite.yaml'), true)
        : {};
      const candidate = merge(merge(merge(defaults, global), local), global.locked ?? {});
      validateConfig(candidate);
      if (
        candidate.suite?.storage?.type &&
        !['files', 'jsonl'].includes(candidate.suite.storage.type)
      )
        throw Error('Only JSON/JSONL file storage is supported; databases are disabled');
      config = candidate;
      return this;
    },
    async emit(kind, payload, id = uid()) {
      const s = scopeOf(context);
      const event = {
        schemaVersion: VERSION,
        id,
        eventId: id,
        kind,
        occurredAt: now(),
        projectId: identity.projectId,
        ...s,
        correlationId: payload.correlationId ?? id,
        source,
        payload: redact(payload),
      };
      if (await store.append('audit', event)) pi.events.emit('suite:event', event);
      return event;
    },
    listen(fn) {
      const unsubscribe = pi.events.on('suite:event', (e) => {
        if (
          e.projectId === identity?.projectId &&
          e.sessionId === context?.sessionManager.getSessionId()
        ) {
          const task = Promise.resolve()
            .then(() => fn(e))
            .catch((err) => {
              if (context) output(context, String(err.message), 'error');
            })
            .finally(() => pending.delete(task));
          pending.add(task);
        }
      });
      return unsubscribe;
    },
    async flush() {
      await Promise.allSettled([...pending]);
    },
    async confirm(ctx, title, detail) {
      return ctx.hasUI && (await ctx.ui.confirm(title, redact(detail)));
    },
    async dispose() {
      await this.flush();
      context = null;
      config = null;
      identity = null;
      store = null;
    },
  };
}
