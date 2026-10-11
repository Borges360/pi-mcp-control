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
import { parseDocument, stringify } from 'yaml';
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
  if (ctx.hasUI) ctx.ui.notify(compact(safe, ctx), type);
  else process.stdout.write(JSON.stringify({ type: 'pi-suite', level: type, data: safe }) + '\n');
}

/**
 * Compact, scannable rendering for the terminal.
 * Pi toasts are single-line friendly; a 40-row JSON blob is unreadable there.
 * Full detail stays available in JSON/RPC modes and through the `json` action.
 */
export function compact(value, ctx, depth = 0) {
  if (ctx && ctx.mode !== 'tui' && ctx.mode !== 'rpc') return JSON.stringify(redact(value));
  if (value === null || value === undefined) return 'ok';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return 'none';
    if (value.length <= 3 && value.every((v) => typeof v !== 'object')) return value.join(', ');
    const head = value.slice(0, 6).map((v) => compact(v, null, depth + 1));
    return head.join(' | ') + (value.length > 6 ? ` (+${value.length - 6})` : '');
  }
  const entries = Object.entries(redact(value)).filter(([, v]) => v !== undefined);
  if (depth > 1) return entries.map(([k, v]) => `${k}=${compact(v, null, depth + 1)}`).join(' ');
  return entries
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${compact(v, null, depth + 1)}`)
    .concat(entries.length > 8 ? [`+${entries.length - 8} more`] : [])
    .join('\n');
}

/* ------------------------------------------------------------------ *\n   Argument completion (pi native: RegisteredCommand.getArgumentCompletions)
\* ------------------------------------------------------------------ */

const MAX_ITEMS = 15;

/** Rank `startsWith` above `includes` above loose subsequence; keep order stable. */
function rankMatches(candidates, query) {
  const q = query.toLowerCase();
  if (!q) return candidates;
  const score = (text) => {
    const t = text.toLowerCase();
    if (t.startsWith(q)) return 0;
    const at = t.indexOf(q);
    if (at >= 0) return 1;
    let i = 0;
    for (const ch of t) if (ch === q[i]) i++;
    return i === q.length ? 2 : -1;
  };
  return candidates
    .map((c, index) => ({ c, index, s: score(c.label ?? c.value) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s || a.index - b.index)
    .map((x) => x.c);
}

const toItems = (values) =>
  (values ?? [])
    .map((v) => (typeof v === 'string' || typeof v === 'number' ? { value: String(v) } : v))
    .filter((v) => v && typeof v.value === 'string');

/**
 * Declarative argument completion.
 *
 * spec = {
 *   actions: {
 *     mode: {
 *       hint: 'off|rules|hybrid',
 *       args: [{ values: [...]|provide: async (ctx) => [...] , hint, advance }],
 *       flags: { '--scope': { values: [...] } },
 *       free: 'text',            // last positional is free text -> no suggestions
 *     },
 *   },
 *   roots: [...] | async () => [...],   // first-word suggestions (subcommands)
 * }
 *
 * Returned function receives the whole argument text and must return items whose
 * `value` replaces that whole argument text (pi's applyCompletion contract), so
 * completed tokens are re-emitted as a prefix of every value.
 */
export function buildCompletions(spec, getState = () => ({})) {
  const actions = spec.actions ?? {};
  return async (argumentText) => {
    try {
      const raw = typeof argumentText === 'string' ? argumentText : '';
      if (raw.includes('\n')) return null;
      const parts = raw.replace(/^\s+/, '').split(/\s+/);
      const cur = parts[parts.length - 1] ?? '';
      const done = parts.slice(0, -1);
      const head = done.length ? done.join(' ') + ' ' : '';
      const isFlagToken = cur.startsWith('-');
      // Walk completed tokens: first bare token is the action, bare tokens after a
      // flag are that flag's value and do not occupy a positional slot.
      let action = null,
        positional = [],
        pendingFlag = null;
      for (const token of done) {
        if (token.startsWith('--')) {
          pendingFlag = token;
          continue;
        }
        if (pendingFlag) {
          pendingFlag = null;
          continue;
        }
        if (action === null) action = token;
        else positional.push(token);
      }
      const state = getState() ?? {};
      const items = [];
      const push = (choice, description, advance) => {
        if (typeof choice !== 'string' || !choice) return;
        items.push({
          value: head + choice + (advance && spec.autoAdvance !== false ? ' ' : ''),
          label: choice,
          ...(description ? { description } : {}),
        });
      };
      const slot = () => (pendingFlag && !isFlagToken ? actions[action]?.flags?.[pendingFlag] : null);
      /** Pi treats an empty array as "no suggestions"; return null explicitly. */
      const settle = () => {
        const matched = rankMatches(items, cur);
        return matched.length ? matched.slice(0, MAX_ITEMS) : null;
      };

      if (action === null) {
        const roots = typeof spec.roots === 'function' ? await spec.roots(state) : spec.roots;
        if (roots) for (const r of toItems(roots)) push(r.value, r.description, true);
        else
          // The row a human reads while choosing a subcommand: say what it does,
          // not which argument comes next.
          for (const [name, def] of Object.entries(actions))
            push(name, def.description ?? def.hint, true);
        return settle();
      }
      const def = actions[action];
      if (!def) return null;
      const flagSlot = slot();
      if (flagSlot) {
        const values = flagSlot.provide
          ? toItems(await flagSlot.provide({ ...state, action, positional, cur, done }))
          : toItems(flagSlot.values ?? []);
        for (const v of values) push(v.value, v.description ?? flagSlot.hint, false);
        return settle();
      }
      if (isFlagToken) {
        for (const [flag, f] of Object.entries(def.flags ?? {}))
          push(flag, f.description ?? f.hint, true);
        return settle();
      }
      const arg = (def.args ?? [])[positional.length];
      if (arg) {
        const values = arg.provide
          ? toItems(await arg.provide({ ...state, action, positional, cur, done }))
          : toItems(arg.values ?? []);
        for (const v of values) push(v.value, v.description ?? arg.hint, !!arg.advance);
        if (!values.length && arg.hint) return null;
        return settle();
      }
      // Extra positional: only offer flags, otherwise let pi do file completion.
      if (def.free || !Object.keys(def.flags ?? {}).length) return null;
      for (const [flag, f] of Object.entries(def.flags)) push(flag, f.description ?? f.hint, true);
      return settle();
    } catch {
      return null; // completion must never break the editor
    }
  };
}

/** One line per action, in authored order, with argument shape and description. */
export function usageText(name, spec, { footer } = {}) {
  const width = 38;
  const lines = Object.entries(spec.actions ?? {}).map(([action, def]) => {
    const args = def.hint
      ? [def.hint]
      : (def.args ?? []).map((a) => a.hint ?? a.values?.join('|') ?? '?');
    const flags = Object.entries(def.flags ?? {}).map(
      ([flag, s]) => `[${flag}${s.hint ? ` ${s.hint}` : ''}]`,
    );
    const usage = `/${name} ${action}${args.length ? ` ${args.join(' ')}` : ''}`.trimEnd();
    const tail = [...flags, def.description].filter(Boolean).join(' — ');
    return tail ? `${usage.padEnd(width)} ${tail}` : usage;
  });
  if (spec.aliases)
    for (const [alias, target] of Object.entries(spec.aliases))
      lines.push(`/${name} ${alias}`.padEnd(width) + ` (= ${target})`);
  return [`/${name} — ${spec.description ?? ''}`.trim(), ...lines]
    .concat(footer ? [footer] : [])
    .join('\n');
}

/**
 * Human control-plane config write. Model tools are blocked from these paths by
 * createRuntime's tool_call guard; this runs only from a user-typed command.
 * Writes are atomic and validated before landing.
 */
export async function yamlSave(path, value) {
  const text = stringify(value, { lineWidth: 0, null: 'plain' });
  if (text.length > 1_000_000) throw Error('Config too large');
  const tmp = `${path}.${process.pid}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, text, { mode: 0o600 });
  try {
    const handle = await open(tmp, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some Windows filesystems reject fsync on a read handle; the rename stays atomic.
  }
  await rename(tmp, path);
  return path;
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
    /** Where `save` would write, for transparent reporting. */
    get configFile() {
      return identity && context?.isProjectTrusted()
        ? join(identity.root, '.pi', 'pi-suite.yaml')
        : join(home, 'config.yaml');
    },
    /**
     * Persist a config subtree so a setting survives reload and, for the project
     * file, is reviewable in git. `patch` is deep-merged over the current section.
     * Returns the file written. Never touches another extension's section.
     */
    async save(section, patch, { global = false } = {}) {
      const target = global
        ? join(home, 'config.yaml')
        : identity && context?.isProjectTrusted()
          ? join(identity.root, '.pi', 'pi-suite.yaml')
          : join(home, 'config.yaml');
      const existing = await yamlFile(target, true);
      const next = merge(existing, { [section]: patch });
      validateConfig(next);
      await yamlSave(target, next);
      if (config) config = merge(config, { [section]: patch });
      return target;
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
