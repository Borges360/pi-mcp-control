import {
  createRuntime,
  scopeOf,
  output,
  words,
  uid,
  now,
  hash,
  redact,
  merge,
  yamlFile,
  Circuit,
  actor,
  validateConfig,
  safePath,
} from './lib/core.mjs';
import { defaults, authorize, validateTransport, mcpName } from './policy.mjs';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
export default function mcpControl(pi) {
  const rt = createRuntime(pi, 'mcp', defaults);
  let selected = null,
    profile = null,
    scope = '',
    grants = [],
    denies = [],
    timers = new Map(),
    activity = new Map(),
    minute = [],
    counts = new Map(),
    changing = false,
    shuttingDown = false;
  const managed = new Set(),
    circuits = new Map();
  let inventory = [];
  const init = async (ctx) => {
    await rt.init(ctx);
    const next = `${rt.projectId}/${scopeOf(ctx).sessionId}`;
    if (scope !== next) {
      scope = next;
      grants = [];
      denies = [];
      selected = null;
      counts.clear();
      minute = [];
    }
    const config = rt.config.mcpControl;
    if (ctx.isProjectTrusted()) {
      const doc = await yamlFile(await safePath(rt.root, config.profilesFile), true);
      config.profiles = merge(config.profiles, doc.mcp?.profiles ?? doc.profiles ?? {});
      config.profiles = merge(config.profiles, rt.config.locked?.mcpControl?.profiles ?? {});
    }
    if (selected === null) {
      const saved = (await rt.store.rows('mcp-profiles')).at(-1);
      if (saved && (await rt.store.valid(saved.signed))) {
        const p = saved.signed.payload;
        if (
          p.configHash ===
          hash({ profiles: config.profiles, managedServers: config.managedServers })
        )
          selected = p.selected;
      }
    }
    validateConfig({ mcpControl: config });
    selected ??= config.defaultProfile;
    profile = config.profiles[selected];
    if (!profile) throw Error('Unknown MCP profile');
    const projectExceptions = new Map();
    for (const r of await rt.store.rows('mcp-exceptions'))
      if (!r.taskId && r.projectId === rt.projectId) projectExceptions.set(r.tool, r);
    for (const r of projectExceptions.values()) {
      if (r.kind === 'revoke') grants = grants.filter((g) => g.tool !== r.tool);
      else if (
        r.kind === 'allow' &&
        r.policyId === hash(profile) &&
        Date.parse(r.expiresAt) > Date.now() &&
        (await rt.store.valid(r.signed)) &&
        !grants.some((g) => g.tool === r.tool && g.expiresAt === r.expiresAt)
      )
        grants.push(r.signed.payload);
    }
  };
  const catalog = async (ctx) => {
    await init(ctx);
    const global = process.env.PI_AGENT_DIR ?? join(homedir(), '.pi', 'agent');
    let fileServers = {};
    for (const file of [
      join(global, 'mcp.json'),
      ...(ctx.isProjectTrusted() ? [join(rt.root, '.pi', 'mcp.json')] : []),
    ])
      try {
        const doc = JSON.parse(await readFile(file, 'utf8'));
        for (const [name, c] of Object.entries(doc.mcpServers ?? {}))
          fileServers[name] = c.command || c.url ? c : { ...fileServers[name], ...c };
      } catch (e) {
        if (e.code !== 'ENOENT') throw Error('Native MCP config unreadable');
      }
    const dynamic = Object.fromEntries(pi.getMcpServers().map((s) => [s.name, s.config]));
    const all = { ...dynamic, ...fileServers };
    inventory = Object.entries(all).map(([name, c]) => ({
      name,
      config: c,
      source: fileServers[name] ? 'native' : 'extension',
      tools: pi
        .getAllTools()
        .filter((t) => mcpName(t.name)?.server === name.replaceAll('-', '_'))
        .map((t) => t.name),
    }));
    return inventory;
  };
  const reconcile = async (ctx, confirmed = false) => {
    if (changing) return;
    changing = true;
    try {
      if (activity.size) throw Error('Cannot change MCP profile while calls are in flight');
      const config = rt.config.mcpControl;
      if (
        confirmed &&
        Object.keys(config.managedServers ?? {}).length &&
        !pi.getCommands?.().some((c) => c.name === 'mcp')
      )
        throw Error(
          'Enable native builtin:mcp before connecting managed servers; this extension is not a transport client',
        );
      const native = await catalog(ctx);
      for (const name of [...managed]) {
        pi.unregisterMcpServer(name);
        managed.delete(name);
      }
      if (confirmed)
        for (const [name, transport] of Object.entries(config.managedServers ?? {})) {
          const entry = profile.servers?.[name];
          if (!entry?.enabled || native.some((s) => s.name === name && s.source === 'native'))
            continue;
          validateTransport(transport, config);
          pi.registerMcpServer(name, {
            ...transport,
            timeout: profile.limits?.timeoutSeconds ?? 30,
            exposure: entry.exposure ?? 'codemode',
            toolExposure: entry.toolExposure ?? {},
          });
          managed.add(name);
        }
      const active = pi.getActiveTools();
      pi.setActiveTools(
        active.filter((name) => {
          const m = mcpName(name);
          if (!m) return true;
          const s = profile.servers?.[m.server];
          return s?.enabled === true && s.exposure === 'direct';
        }),
      );
      await rt.emit('mcp.profile_changed', {
        profile: selected,
        managed: [...managed],
        nativeServerOverrides:
          'authorization overlay; use native /mcp for transport exposure/disconnect',
      });
    } finally {
      changing = false;
    }
  };
  pi.on('session_start', async (_e, ctx) => {
    shuttingDown = false;
    await init(ctx);
    await catalog(ctx);
    const saved = (await rt.store.rows('mcp-profiles')).at(-1);
    await reconcile(
      ctx,
      !!saved &&
        (await rt.store.valid(saved.signed)) &&
        saved.signed.payload.configHash ===
          hash({
            profiles: rt.config.mcpControl.profiles,
            managedServers: rt.config.mcpControl.managedServers,
          }),
    );
  });
  // Do not claim ownership of native MCP: listening to mcp_servers_change informs catalog only.
  pi.on('mcp_servers_change', async (_e, ctx) => {
    if (!changing && !shuttingDown) await catalog(ctx);
  });
  pi.on('tool_call', async (e, ctx) => {
    if (!mcpName(e.toolName, e.input)) return;
    await init(ctx);
    const config = rt.config.mcpControl;
    if (!config.enabled) return;
    const parsed = mcpName(e.toolName, e.input),
      server = parsed.server ?? 'resources';
    const circuit = circuits.get(server) ?? new Circuit();
    circuits.set(server, circuit);
    const taskKey = scopeOf(ctx).taskId ?? scopeOf(ctx).sessionId;
    minute = minute.filter((n) => Date.now() - n < 60000);
    const records = await rt.store.rows('mcp-exceptions');
    const scopedDenies = records.filter(
      (r) =>
        r.projectId === rt.projectId &&
        r.kind === 'deny' &&
        (!r.taskId || r.taskId === scopeOf(ctx).taskId),
    );
    let decision = authorize({
      name: e.toolName,
      input: e.input,
      annotations: pi.getAllTools().find((t) => t.name === e.toolName)?.annotations ?? {},
      profile,
      config,
      trusted: ctx.isProjectTrusted(),
      grants,
      denies: [...denies, ...scopedDenies],
      scope: scopeOf(ctx),
      calls: counts.get(taskKey) ?? 0,
      rate: minute.length,
      circuitOpen: !circuit.ready(),
      transport: inventory.find((s) => s.name.replaceAll('-', '_') === server)?.config,
    });
    if (decision.decision === 'ask') {
      const detail = `${e.toolName}\n${JSON.stringify(redact(e.input)).slice(0, 1600)}\nRisk: ${decision.risk}`;
      const approved = await rt.confirm(ctx, 'Allow MCP call once?', detail);
      if (approved) {
        decision = {
          ...decision,
          decision: 'allow',
          approvedBy: actor(),
          approvalChannel: ctx.mode,
          reasonCodes: ['human-approved-exact-call'],
          expiresAt: new Date(Date.now() + 30000).toISOString(),
        };
      } else
        decision = {
          ...decision,
          decision: 'deny',
          reasonCodes: ['approval-unavailable-or-declined'],
        };
    }
    const audit = {
      ...decision,
      toolName: e.toolName,
      toolCallId: e.toolCallId,
      parentToolCallId: e.parentToolCallId ?? null,
      inputHash: hash(e.input),
      profile: selected,
    };
    await rt.emit(
      decision.decision === 'allow' ? 'mcp.tool_authorized' : 'mcp.tool_blocked',
      audit,
    );
    await rt.store.append('mcp-decisions', {
      id: decision.decisionId,
      ...scopeOf(ctx),
      ...audit,
      occurredAt: now(),
    });
    if (decision.decision !== 'allow')
      return { block: true, reason: `MCP policy: ${decision.reasonCodes.join(', ')}` };
    counts.set(taskKey, (counts.get(taskKey) ?? 0) + 1);
    minute.push(Date.now());
    activity.set(e.toolCallId, { server, start: Date.now() });
    timers.set(
      e.toolCallId,
      setTimeout(
        () => {
          circuit.fail();
          ctx.abort();
        },
        (profile.limits?.timeoutSeconds ?? 30) * 1000,
      ),
    );
  });
  pi.on('tool_result', async (e, ctx) => {
    const active = activity.get(e.toolCallId);
    if (!active) return;
    clearTimeout(timers.get(e.toolCallId));
    timers.delete(e.toolCallId);
    activity.delete(e.toolCallId);
    const circuit = circuits.get(active.server);
    e.isError ? circuit.fail() : circuit.success();
    await rt.emit('mcp.tool_finished', {
      toolCallId: e.toolCallId,
      server: active.server,
      isError: e.isError,
      failureCode: e.isError
        ? String(e.structuredContent?.code ?? e.details?.code ?? 'tool-error').slice(0, 64)
        : null,
      durationMs: Date.now() - active.start,
    });
  });
  pi.on('session_shutdown', async () => {
    shuttingDown = true;
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    activity.clear();
    for (const name of managed) pi.unregisterMcpServer(name);
    managed.clear();
    await rt.dispose();
  });
  pi.registerCommand('mcpc', {
    description: 'MCP: status | catalog | profiles | use | inspect | allow/deny | health | trace',
    handler: async (args, ctx) => {
      await init(ctx);
      const [action = 'status', ...rest] = words(args);
      const config = rt.config.mcpControl;
      if (action === 'profiles')
        return output(ctx, { active: selected, profiles: Object.keys(config.profiles) });
      if (action === 'use') {
        if (!config.profiles[rest[0]]) throw Error('Unknown profile');
        await ctx.waitForIdle();
        if (!(await rt.confirm(ctx, 'Switch MCP profile?', rest[0])))
          throw Error('Human approval required');
        selected = rest[0];
        profile = config.profiles[selected];
        grants = [];
        const signed = await rt.store.sign({
          selected,
          projectId: rt.projectId,
          configHash: hash({ profiles: config.profiles, managedServers: config.managedServers }),
          approvedAt: now(),
          approvedBy: actor(),
          approvalChannel: ctx.mode,
        });
        await rt.store.append('mcp-profiles', { id: uid(), signed });
        await reconcile(ctx, true);
        return output(ctx, { profile: selected });
      }
      if (action === 'allow' || action === 'deny') {
        const tool = rest[0],
          at = rest.indexOf('--scope'),
          level = at >= 0 ? rest[at + 1] : 'task';
        if (!pi.getAllTools().some((t) => t.name === tool) || !mcpName(tool))
          throw Error('Unknown MCP tool');
        if (!['task', 'project'].includes(level)) throw Error('Scope task|project');
        if (level === 'task' && !scopeOf(ctx).taskId)
          throw Error('Select a task with /cost task or /gate use first');
        if (
          !(await rt.confirm(
            ctx,
            `${action} MCP tool?`,
            `${tool}; ${level}; TTL ${config.exceptionTtlSeconds}s`,
          ))
        )
          throw Error('Human authorization required');
        const grant = {
          tool,
          projectId: rt.projectId,
          taskId: level === 'task' ? scopeOf(ctx).taskId : null,
          sessionId: level === 'task' ? scopeOf(ctx).sessionId : null,
          profile: selected,
          policyId: hash(profile),
          expiresAt: new Date(Date.now() + config.exceptionTtlSeconds * 1000).toISOString(),
          approvedBy: actor(),
          approvalChannel: ctx.mode,
          kind: action,
        };
        // Grants do not relax mutations; those still require exact per-call approval.
        if (action === 'allow') grants.push(grant);
        else denies.push(grant);
        const signed = await rt.store.sign(grant);
        await rt.store.append('mcp-exceptions', { id: uid(), ...grant, signed });
        return output(ctx, { tool, scope: level, expiresAt: grant.expiresAt, decision: action });
      }
      if (action === 'revoke') {
        grants = grants.filter((g) => g.tool !== rest[0]);
        const payload = {
          kind: 'revoke',
          tool: rest[0],
          projectId: rt.projectId,
          revokedAt: now(),
        };
        await rt.store.append('mcp-exceptions', {
          id: uid(),
          ...payload,
          signed: await rt.store.sign(payload),
        });
        return output(ctx, { revoked: rest[0] });
      }
      if (action === 'trace') {
        const at = rest.indexOf('--last'),
          n = Math.min(100, Math.max(1, Number(rest[at + 1]) || 20));
        return output(ctx, (await rt.store.rows('mcp-decisions')).slice(-n));
      }
      if (action === 'catalog' && config.catalog) {
        const c = config.catalog;
        if (c.type !== 'mcphub-file' || !c.verifiedVersion)
          throw Error('MCPHub API/schema not verified. Configure a verified mcphub-file catalog.');
        if (!(await rt.confirm(ctx, 'Read MCPHub catalog?', c.path)))
          throw Error('Catalog consent required');
        const file = await realpath(c.path);
        const data = JSON.parse(await readFile(file, 'utf8'));
        if (!data.mcpServers || typeof data.mcpServers !== 'object')
          throw Error('Unsupported MCPHub catalog schema');
        return output(ctx, {
          version: c.verifiedVersion,
          servers: Object.entries(data.mcpServers).map(([name, s]) => ({
            name,
            transport: s.url ? 'http' : 'stdio',
            trusted: false,
          })),
          note: 'Discovery only. No automatic installation or connection.',
        });
      }
      const all = await catalog(ctx);
      if (action === 'inspect')
        return output(
          ctx,
          all
            .filter((s) => s.name === rest[0])
            .map((s) => ({
              name: s.name,
              source: s.source,
              tools: s.tools,
              enabled: profile.servers?.[s.name]?.enabled === true,
              transport: s.config.url ? 'http' : 'stdio',
              exposure: s.config.exposure ?? 'codemode',
            })),
        );
      if (['health', 'status', 'catalog'].includes(action))
        return output(ctx, {
          profile: selected,
          servers: all.map((s) => ({
            name: s.name,
            source: s.source,
            toolCount: s.tools.length,
            health:
              circuits.get(s.name.replaceAll('-', '_'))?.ready() === false
                ? 'circuit-open'
                : s.tools.length
                  ? 'tools-available'
                  : 'unknown',
            managed: managed.has(s.name),
            enabled: profile.servers?.[s.name]?.enabled === true,
          })),
          grants: grants
            .filter((g) => Date.parse(g.expiresAt) > Date.now())
            .map((g) => ({ tool: g.tool, expiresAt: g.expiresAt })),
        });
      throw Error('Unknown /mcpc command');
    },
  });
}
