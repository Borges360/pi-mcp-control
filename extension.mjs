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
  usageText,
  buildCompletions,
} from './lib/core.mjs';
import { defaults, authorize, validateTransport, mcpName } from './policy.mjs';
import {
  FIELDS,
  EXPOSURES,
  applyField,
  fieldValues,
  c0,
  panelItems,
  panelTitle,
  panelChangeNote,
  panelDisplayValue,
  canonicalPanelValue,
  partitionServers,
  serverRows,
  grantRows,
  outOfScopeLines,
  runDashboard,
  provideHost,
} from './menu.mjs';
import { localeLabel, readProjectLocale, translate, writeProjectLocale } from './lib/i18n.mjs';
import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
export default function mcpControl(pi, injected = {}) {
  // The entry point imported the host modules statically and hands them here; a lazy
  // import inside the extension cannot resolve under pi's loader (see index.ts).
  provideHost(injected.tui, injected.agent);
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
    shuttingDown = false,
    projectLocale = 'en',
    localeIssue = null;
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
    const localeState = await readProjectLocale({ root: rt.root, trusted: ctx.isProjectTrusted() });
    projectLocale = localeState.locale;
    localeIssue = localeState.issue;
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
    // Scope (rule E): a tool of a server the profile declares but this session cannot
    // reach used to land in the same `ask` as a real authorization question, so "the
    // server is not connected" was indistinguishable from "this call needs your OK".
    // `available` names it and refuses with the fix; `declared` keeps the old question.
    const declaredEntry = profile.servers?.[server] ?? profile.servers?.[server.replaceAll('_', '-')];
    const reachable = inventory.some(
      (s) => s.name.replaceAll('-', '_') === server && (s.tools?.length ?? 0) > 0,
    );
    if (
      declaredEntry?.enabled === true &&
      !reachable &&
      (config.scope?.source ?? 'available') === 'available' &&
      config.scope?.strict !== false
    ) {
      const reason = `out-of-scope: server-not-connected:${server.replaceAll('_', '-')}`;
      await rt.store.append('mcp-decisions', {
        id: uid(),
        ...scopeOf(ctx),
        decision: 'deny',
        reasonCodes: [reason],
        toolName: e.toolName,
        toolCallId: e.toolCallId,
        profile: selected,
        occurredAt: now(),
      });
      return {
        block: true,
        reason: `${reason} — conecte com /mcpc connect ${server.replaceAll('_', '-')} (se for gerenciado) ou /mcpc servers no painel; nada foi autorizado`,
      };
    }
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
  const SCOPES = [
    { value: 'task', description: 'this task only, expires by TTL' },
    { value: 'project', description: 'every task in this project, expires by TTL' },
  ];
  /** MCP tool names actually registered right now (`mcp__server__tool`). */
  const mcpTools = () =>
    pi
      .getAllTools()
      .filter((t) => mcpName(t.name))
      .map((t) => ({
        value: t.name,
        label: t.name,
        description: [
          t.annotations?.readOnlyHint ? 'read-only' : t.annotations?.destructiveHint ? 'destructive' : 'write?',
          mcpName(t.name)?.server,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
  const profileNames = () => Object.keys(rt.config?.mcpControl?.profiles ?? {});
  const serverNames = async () => {
    if (!rt.ctx) return [];
    try {
      return (await catalog(rt.ctx)).map((s) => ({
        value: s.name,
        label: s.name,
        description: `${s.source} · ${s.tools.length} tool(s)`,
      }));
    } catch {
      return [];
    }
  };
  /** Text-command action → table field: one mapping for help, commands and panel. */
  const FIELD_ACTIONS = {
    profile: 'defaultProfile',
    unknown: 'defaultUnknownTool',
    mutation: 'failClosedForMutation',
    env: 'environment',
    ttl: 'exceptionTtl',
    scope: 'scopeSource',
    strict: 'scopeStrict',
  };

  const mcpcSpec = {
    name: 'mcpc',
    description: 'MCP profiles and per-call authorization',
    actions: {
      status: { hint: '', description: 'active profile, servers, live grants' },
      catalog: { hint: '', description: 'declared servers (no connection, no install)' },
      profiles: { hint: '', description: 'list configured profiles' },
      use: {
        hint: 'PROFILE',
        description: 'switch profile while idle (human approval)',
        args: [{ provide: async () => profileNames().map((p) => ({ value: p, label: p, description: p === selected ? 'active' : '' })), hint: 'profile' }],
      },
      inspect: {
        hint: 'SERVER',
        description: 'tools and source of one server',
        args: [{ provide: serverNames, hint: 'server' }],
      },
      allow: {
        hint: 'TOOL --scope task|project',
        description: 'authorize a read-only tool until TTL',
        args: [{ provide: mcpTools, hint: 'mcp tool', advance: true }],
        flags: {
          '--scope': { values: SCOPES, hint: 'task|project' },
        },
      },
      deny: {
        hint: 'TOOL --scope task|project',
        description: 'block a tool; deny outranks every grant',
        args: [{ provide: mcpTools, hint: 'mcp tool', advance: true }],
        flags: { '--scope': { values: SCOPES, hint: 'task|project' } },
      },
      revoke: {
        hint: 'TOOL',
        description: 'drop a session grant',
        args: [{ provide: async () => grants.filter((g) => Date.parse(g.expiresAt) > Date.now()).map((g) => g.tool), hint: 'granted tool' }],
      },
      health: { hint: '', description: 'availability, last failures, circuit state' },
      trace: {
        hint: '[--last N]',
        description: 'recent authorization decisions',
        flags: { '--last': { hint: 'count' } },
      },
      connect: {
        hint: 'SERVER',
        description: 'connect a server this extension manages',
        args: [{ provide: async () => Object.keys(rt.config?.mcpControl?.managedServers ?? {}), hint: 'managed server' }],
      },
      help: { hint: '', description: 'show this list' },
    },
  };
  for (const [action, field] of Object.entries(FIELD_ACTIONS))
    mcpcSpec.actions[action] = {
      hint: 'VALOR',
      description: FIELDS[field].hint,
      args: [
        {
          // Built from the table's defaults: completions must not read live config,
          // which does not exist until a session starts.
          values: fieldValues(field, c0()).map((v) => ({ value: String(v) })),
          hint: field,
        },
      ],
    };
  mcpcSpec.actions.on = { hint: '', description: 'ligar a mediação de autorização' };
  mcpcSpec.actions.off = { hint: '', description: 'parar de mediar (transporte nativo decide)' };
  mcpcSpec.actions['allow-exe'] = {
    hint: 'COMANDO',
    description: 'widening: binário liberado p/ servidores stdio deste projeto',
    args: [{ hint: 'comando' }],
  };
  mcpcSpec.actions['allow-host'] = {
    hint: 'HOST',
    description: 'widening: host liberado p/ servidores http deste projeto',
    args: [{ hint: 'host' }],
  };
  /* ------------------------------------------------------------------ *
   *  Panel and the single table-driven writer.
   * ------------------------------------------------------------------ */
  const conf = () => rt.config.mcpControl;
  const locked = () => rt.config.locked?.mcpControl ?? {};
  let pendingWidening = null;
  let declinedScopeHelp = false;

  /** What the declared stdio/http servers would need from the allowlists. */
  const declaredRequirements = () => {
    const executables = new Set();
    const hosts = new Set();
    for (const transport of Object.values(conf().managedServers ?? {})) {
      if (transport?.command) executables.add(String(transport.command));
      if (transport?.url) {
        try {
          hosts.add(new URL(transport.url).hostname);
        } catch {
          /* malformed url: validateTransport will name it */
        }
      }
    }
    // The native Pi config is also an operator declaration. Show the allowlist
    // requirements for these trusted project servers instead of hiding them from
    // the panel merely because they were not copied into managedServers.
    for (const server of inventory) {
      const transport = server.config ?? {};
      if (transport.command) executables.add(String(transport.command));
      if (transport.url) {
        try {
          hosts.add(new URL(transport.url).hostname);
        } catch {
          /* malformed url: validateTransport will name it */
        }
      }
    }
    return { declaredExecutables: [...executables], declaredHosts: [...hosts] };
  };

  const panelState = (ctx, c = conf()) => {
    const part = partitionServers(inventory, profile ?? c.profiles?.[c.defaultProfile] ?? {}, c);
    return {
      profile: selected,
      servers: inventory,
      reachable: part.reachable,
      outOfScope: part.outOfScope,
      source: part.source,
      strict: part.strict,
      grants: grants.filter((g) => Date.parse(g.expiresAt) > Date.now()),
      ...declaredRequirements(),
    };
  };

  const stateLines = (ctx, c = conf(), locale = 'en') => {
    const s = panelState(ctx, c);
    const lines = [
      translate(locale, 'stateLine', {
        enabled: c.enabled ? translate(locale, 'stateOn') : translate(locale, 'stateOff'),
        profile: s.profile ?? translate(locale, 'profileNone'),
        reachable: s.reachable.length,
        total: s.servers.length,
      }),
      translate(locale, 'scopeLine', {
        source: panelDisplayValue('scopeSource', s.source, locale),
        strict: translate(locale, s.strict ? 'valueStrictOn' : 'valueStrictOff'),
        servers: s.outOfScope.join(', ') || translate(locale, 'valueNone'),
      }),
      translate(locale, 'grantsLine', {
        grants: s.grants.map((g) => `${g.tool} (${translate(locale, 'grantUntil', {
          time: new Date(g.expiresAt).toISOString().slice(11, 19),
        })})`).join(', ') || translate(locale, 'valueNone'),
      }),
      translate(locale, 'policyLine', {
        unknown: translate(locale, c.defaultUnknownTool === 'deny' ? 'valueDeny' : 'valueAsk'),
        mutations: translate(locale, c.failClosedForMutation === false ? 'mutationAllowed' : 'mutationDenied'),
        environment: panelDisplayValue('environment', c.environment, locale),
        ttl: c.exceptionTtlSeconds,
      }),
    ];
    if (locale === projectLocale && localeIssue)
      lines.push(translate(locale, localeIssue === 'invalid' ? 'languageInvalid' : 'languageUnreadable'));
    return lines;
  };

  const writeField = async (ctx, id, value, { quiet = false } = {}) => {
    const state = panelState(ctx);
    const { patch, note } = applyField(conf(), id, value, { locked: locked(), state });
    let written;
    try {
      written = await rt.save('mcpControl', patch);
    } catch (error) {
      const line = `${note} · session only (save failed: ${error.message})`;
      if (quiet) return line;
      return output(ctx, line, 'warning');
    }
    if (quiet) return note;
    // The patch is merged into the live config as it is written; the next call already
    // sees it. `/reload` would only teach the user to distrust a command that worked.
    output(ctx, `${note}\nsalvo em ${written} · já em efeito`);
    return note;
  };

  /**
   * Widening an allowlist is two deliberate acts on the same row (and one explicit
   * confirmation in the command), and it is written to the project file: one repo must
   * not decide the binaries and hosts of every other one.
   */
  const widen = async (ctx, id, value) => {
    if (!ctx.isProjectTrusted())
      throw Error(
        `Widening exige projeto confiado: confie este repositório e repita (nada foi escrito).`,
      );
    return writeField(ctx, id, value, { quiet: true });
  };
  const wideningAct = async (ctx, id, value) => {
    if (String(value).startsWith('remove:'))
      return writeField(ctx, id, value, { quiet: true });
    if (pendingWidening !== value) {
      pendingWidening = value;
      return `⚠ NADA foi escrito — ${value.slice(4)} entra na allowlist deste projeto; escolha a mesma linha de novo para confirmar`;
    }
    pendingWidening = null;
    return widen(ctx, id, value).then((n) => `⚠ widening aplicado: ${n}`);
  };

  const switchProfile = async (ctx, name, locale = 'en') => {
    const c = conf();
    if (!c.profiles?.[name]) return translate(locale, 'profileNotConfigured', { profile: name });
    await ctx.waitForIdle?.();
    if (typeof ctx.ui.confirm === 'function' && ctx.hasUI) {
      const ok = await rt.confirm(ctx, translate(locale, 'profileSwitchQuestion'), name);
      if (!ok) return translate(locale, 'profileNotApproved');
    }
    selected = name;
    profile = c.profiles[name];
    grants = [];
    const signed = await rt.store.sign({
      selected,
      projectId: rt.projectId,
      configHash: hash({ profiles: c.profiles, managedServers: c.managedServers }),
      approvedAt: now(),
      approvedBy: actor(),
      approvalChannel: ctx.mode,
    });
    await rt.store.append('mcp-profiles', { id: uid(), signed });
    await reconcile(ctx, true);
    return translate(locale, 'profileSwitched', { profile: name });
  };

  const fallbackPanel = (ctx) =>
    output(ctx, [
      ...stateLines(ctx, conf(), projectLocale),
      '',
      translate(projectLocale, 'fallbackIntro'),
      '/mcpc status | catalog | profiles | use PROFILE | inspect SERVER | health | trace',
      '/mcpc allow TOOL --scope task | deny TOOL | revoke TOOL | connect SERVER',
    ].join('\n'));

  const openMenu = async (ctx) => {
    const c = conf();
    let draftConf = structuredClone(c);
    let draftPatch = {};
    let draftCount = 0;
    let previewLocale = projectLocale;
    let localeDirty = false;
    pendingWidening = null;
    const makeItems = () => {
      const state = panelState(ctx, draftConf);
      const next = panelItems({ conf: draftConf, locked: locked(), state, locale: previewLocale });
      next.splice(7, 0, {
        id: 'locale',
        label: translate(previewLocale, 'rowLanguage'),
        currentValue: localeLabel(previewLocale, previewLocale),
        values: ['en', 'pt-BR'].map((language) => localeLabel(previewLocale, language)),
        description: translate(previewLocale, 'rowLanguageDescription'),
      });
      return next;
    };
    const items = makeItems();
    const syncItems = () => {
      const next = makeItems();
      const byId = new Map(next.map((item) => [item.id, item]));
      for (const current of items) {
        const replacement = byId.get(current.id);
        if (!replacement) continue;
        for (const key of ['label', 'currentValue', 'values', 'description']) {
          if (key in replacement) current[key] = replacement[key];
          else delete current[key];
        }
      }
    };
    const hasPendingChanges = () => localeDirty || Object.keys(draftPatch).length > 0;
    const stageField = (id, value, update, target) => {
      const currentState = panelState(ctx, draftConf);
      const fieldState = id === 'serverActions'
        ? { ...currentState, server: target, profile: selected ?? draftConf.defaultProfile }
        : currentState;
      const canonicalValue = canonicalPanelValue(id, value, previewLocale);
      const { patch } = applyField(draftConf, id, canonicalValue, { locked: locked(), state: fieldState });
      draftPatch = merge(draftPatch, patch);
      draftConf = merge(draftConf, patch);
      draftCount += 1;
      const current = FIELDS[id].current(draftConf, fieldState);
      update(id, panelDisplayValue(id, current, previewLocale));
      syncItems();
      return { kind: 'draft', count: draftCount, note: panelChangeNote(id, canonicalValue, draftConf, fieldState, previewLocale) };
    };
    const onSave = async () => {
      if (!hasPendingChanges()) return { ok: false, note: translate(previewLocale, 'noUnsaved') };
      const changed = [];
      let mcpWritten = false;
      try {
        if (Object.keys(draftPatch).length) {
          validateConfig({ mcpControl: draftConf });
          const savedCount = draftCount;
          const written = await rt.save('mcpControl', draftPatch);
          changed.push(translate(previewLocale, 'mcpSettingsSaved', { count: savedCount, file: written }));
          mcpWritten = true;
          draftPatch = {};
          draftConf = structuredClone(conf());
          draftCount = 0;
          pendingWidening = null;
          syncItems();
        }
        if (localeDirty) {
          if (!ctx.isProjectTrusted()) throw new Error(translate(previewLocale, 'languageTrustRequired'));
          try {
            await writeProjectLocale({ root: rt.root, trusted: true, locale: previewLocale });
          } catch (error) {
            return {
              ok: false,
              partial: mcpWritten,
              changed,
              note: translate(previewLocale, 'languageSaveFailed', {
                error: String(error?.message ?? error).split('\n')[0],
              }),
            };
          }
          projectLocale = previewLocale;
          localeDirty = false;
          localeIssue = null;
          changed.push(translate(previewLocale, 'languageSaved', { language: localeLabel(previewLocale, previewLocale) }));
        }
        syncItems();
        return { ok: true, note: changed.join('\n'), changed };
      } catch (error) {
        return {
          ok: false,
          partial: mcpWritten,
          changed,
          note: translate(previewLocale, 'saveFailedDetail', {
            error: String(error?.message ?? error).split('\n')[0],
          }),
        };
      }
    };
    const onDiscard = () => {
      pendingWidening = null;
      draftConf = structuredClone(conf());
      draftPatch = {};
      draftCount = 0;
      previewLocale = projectLocale;
      localeDirty = false;
      syncItems();
    };
    const menus = {
      status: () => stateLines(ctx, draftConf, previewLocale),
      profiles: () =>
        Object.keys(draftConf.profiles ?? {}).map((name, i) => ({
          value: name,
          label: `${name === selected ? '* ' : i === 0 ? translate(previewLocale, 'serverRecommendation') : ''}${name}`,
          description: translate(previewLocale, 'profileDescription', {
            servers: Object.keys(draftConf.profiles[name].servers ?? {}).length,
            denies: draftConf.profiles[name].denyTools?.length ?? 0,
            default: translate(previewLocale, draftConf.defaultProfile === name ? 'defaultYes' : 'defaultNo'),
          }),
        })),
      servers: () => serverRows(panelState(ctx, draftConf), previewLocale),
      serverActions: (name) => {
        const rows = fieldValues('serverActions', draftConf, { server: name, profile: selected ?? draftConf.defaultProfile });
        return rows.map((value) => {
          const [op, , mode] = String(value).split(':');
          return {
            value,
            label:
              op === 'toggle'
                ? translate(previewLocale, 'actionEnableDisable', { server: name })
                : translate(previewLocale, 'actionExposure', { mode: panelDisplayValue('serverActions', mode, previewLocale) }),
            description:
              op === 'toggle'
                ? translate(previewLocale, 'actionChangesSession', {
                    state: translate(previewLocale, (draftConf.profiles?.[selected ?? draftConf.defaultProfile]?.servers ?? {})[name]?.enabled ? 'actionCurrentlyEnabled' : 'actionCurrentlyDisabled'),
                  })
                : mode === 'direct'
                  ? translate(previewLocale, 'exposureDirect')
                  : mode === 'hidden'
                    ? translate(previewLocale, 'exposureHidden')
                    : translate(previewLocale, 'exposureOnDemand'),
          };
        });
      },
      grants: () => grantRows(panelState(ctx, draftConf), previewLocale),
      outOfScope: () => outOfScopeLines(panelState(ctx, draftConf), previewLocale),
      executables: () => {
        const s = panelState(ctx, draftConf);
        const rows = [];
        for (const exe of draftConf.allowedExecutables ?? [])
          rows.push({ value: `remove:${exe}`, label: translate(previewLocale, 'remove', { value: exe }), description: translate(previewLocale, 'currentlyAllowed') });
        (s.declaredExecutables ?? []).forEach((exe, i) =>
          rows.push({
            value: `add:${exe}`,
            label: i === 0
              ? translate(previewLocale, 'recommendedAllow', { value: exe })
              : translate(previewLocale, 'allowValue', { value: exe }),
            description: translate(previewLocale, 'executableRequired'),
          }),
        );
        if (!rows.length)
          rows.push({ value: 'noop', label: translate(previewLocale, 'noSuggestions'), description: translate(previewLocale, 'noManagedStdio') });
        return rows;
      },
      hosts: () => {
        const s = panelState(ctx, draftConf);
        const rows = [];
        for (const host of draftConf.allowedHosts ?? [])
          rows.push({ value: `remove:${host}`, label: translate(previewLocale, 'remove', { value: host }), description: translate(previewLocale, 'currentlyAllowed') });
        (s.declaredHosts ?? []).forEach((host, i) =>
          rows.push({
            value: `add:${host}`,
            label: i === 0
              ? translate(previewLocale, 'recommendedAllow', { value: host })
              : translate(previewLocale, 'allowValue', { value: host }),
            description: translate(previewLocale, 'hostRequired'),
          }),
        );
        if (!rows.length)
          rows.push({ value: 'noop', label: translate(previewLocale, 'noSuggestions'), description: translate(previewLocale, 'noManagedHttp') });
        return rows;
      },
      help: () => [
        '/mcpc status | catalog | profiles | use PROFILE | inspect SERVER',
        '/mcpc allow TOOL --scope task|project | deny TOOL --scope task|project | revoke TOOL',
        '/mcpc health | trace --last N | scope available|declared | help',
        translate(previewLocale, 'helpConnectLine'),
        translate(previewLocale, 'helpAllowLine'),
      ],
    };
    const onChange = (id, value, update, target) => {
      if (id === 'locale') {
        const selectedLocale = ['en', 'pt-BR'].find((language) => localeLabel(previewLocale, language) === value);
        if (!selectedLocale) throw Error(translate(previewLocale, 'languageInvalid'));
        if (selectedLocale === 'pt-BR' && !ctx.isProjectTrusted()) {
          previewLocale = 'en';
          localeDirty = false;
          syncItems();
          return { kind: 'action', note: translate(previewLocale, 'languageTrustRequired') };
        }
        previewLocale = selectedLocale;
        localeDirty = previewLocale !== projectLocale;
        syncItems();
        return {
          kind: 'locale',
          dirty: hasPendingChanges(),
          count: draftCount,
          note: translate(previewLocale, localeDirty ? 'languagePreview' : 'languageUnchanged'),
        };
      }
      if (id === 'profile') return Promise.resolve(switchProfile(ctx, value, previewLocale));
      if (id === 'servers') {
        if (value === 'noop') return Promise.resolve(translate(previewLocale, 'noServerSuggestion'));
        // Two levels: the row carries the server and `navigateTo` opens its actions.
        const row = items.find((i) => i.id === 'serverRow');
        if (row) row.currentValue = value;
        return Promise.resolve(translate(previewLocale, 'selectedServer', { server: value }));
      }
      if (id === 'serverRow')
        return stageField('serverActions', value, update, target);
      if (id === 'grants') {
        if (value === 'noop') return Promise.resolve(translate(previewLocale, 'noGrantOpen'));
        const tool = value.slice(7);
        const before = grants.length;
        grants = grants.filter((g) => g.tool !== tool);
        return Promise.resolve(
          grants.length === before
            ? translate(previewLocale, 'noGrantForTool', { tool })
            : translate(previewLocale, 'grantRevoked', { tool }),
        );
      }
      if (id === 'status' || id === 'outOfScope' || id === 'help') return undefined;
      if (id === 'noop') return Promise.resolve(translate(previewLocale, 'noAction'));
      if (id === 'allowedExecutables' || id === 'allowedHosts') {
        if (String(value).startsWith('add:') && pendingWidening !== value) {
          pendingWidening = value;
          return Promise.resolve({ kind: 'action', note: translate(previewLocale, 'wideningConfirm') });
        }
        pendingWidening = null;
      }
      return stageField(id, value, update, target);
    };
    const opened = await runDashboard(
      {
        ctx,
        title: () => panelTitle(draftConf, panelState(ctx, draftConf), previewLocale),
        locale: () => previewLocale,
        items,
        onChange,
        onSave,
        onDiscard,
        menus,
      },
      // The submenu wrapper hands `target` = the row's own value; the per-server actions
      // read the server from the `serverRow` value, not from a module variable.
      { serverTarget: () => items.find((i) => i.id === 'serverRow')?.currentValue },
    );
    if (opened === false) return fallbackPanel(ctx);
    const changed = opened?.changed?.filter(Boolean) ?? [];
    const actions = opened?.actions?.filter(Boolean) ?? [];
    return output(
      ctx,
      changed.length
        ? translate(projectLocale, 'summarySaved', {
            count: changed.length,
            changes: changed.map((x) => `· ${x}`).join('\n'),
          })
        : opened?.discarded
          ? translate(projectLocale, 'summaryDiscarded')
          : actions.length
            ? translate(projectLocale, 'summaryActions', { actions: actions.join('\n') })
            : translate(projectLocale, 'summaryNoChanges'),
    );
  };


  pi.registerCommand('mcpc', {
    description:
      'MCP control — (vazio abre o painel) | status | catalog | profiles | use | inspect | allow | deny | revoke | health | trace | scope | help',
    getArgumentCompletions: buildCompletions(mcpcSpec),
    handler: async (args, ctx) => {
      await init(ctx);
      // An empty argument list is the panel; with arguments, the same table writes.
      if (!words(args).length) return ctx.hasUI ? openMenu(ctx) : fallbackPanel(ctx);
      const [action = 'status', ...rest] = words(args);
      const config = rt.config.mcpControl;
      if (action === 'help') return output(ctx, usageText('mcpc', mcpcSpec));
      if (action === 'on' || action === 'off') return writeField(ctx, 'enabled', action === 'on' ? 'on' : 'off');
      if (FIELD_ACTIONS[action]) return writeField(ctx, FIELD_ACTIONS[action], rest[0]);
      if (action === 'allow-exe' || action === 'allow-host') {
        const id = action === 'allow-exe' ? 'allowedExecutables' : 'allowedHosts';
        if (!rest[0])
          throw Error(
            `Uso: /mcpc ${action} <valor> · declarados: ${(declaredRequirements()[id === 'allowedHosts' ? 'declaredHosts' : 'declaredExecutables'] ?? []).join(', ') || 'nenhum'}`,
          );
        if (!(await rt.confirm(ctx, 'Confirmar widening de segurança?', `${rest[0]} → ${rt.configFile} (projeto)`)))
          throw Error(`Widening exige confirmação — nada foi escrito. Repita: /mcpc ${action} ${rest[0]}`);
        const note = await widen(ctx, id, `add:${rest[0]}`);
        return output(ctx, `${note} · salvo em ${rt.configFile} · já em efeito`);
      }
      if (action === 'profiles') {
        const names = profileNames();
        return output(
          ctx,
          `active: ${selected ?? 'none'}\n${names.map((p) => `  ${p === selected ? '*' : ' '} ${p}`).join('\n')}\nSwitch with /mcpc use <profile>`,
        );
      }
      if (action === 'use') {
        if (!config.profiles[rest[0]])
          throw Error(
            `Unknown profile "${rest[0]}". Configured: ${profileNames().join(', ') || 'none (add .pi/mcp-profiles.yaml)'}`,
          );
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
        const known = mcpTools().map((t) => t.value);
        if (!known.includes(tool))
          throw Error(
            tool
              ? `${tool} is not a registered MCP tool. Available: ${known.slice(0, 6).join(', ') || 'none — run /mcpc status'}${known.length > 6 ? ` (+${known.length - 6})` : ''}`
              : `allow|deny needs a TOOL. /mcpc allow <tool> (autocomplete lists ${known.length})`,
          );
        if (!['task', 'project'].includes(level))
          throw Error('Scope must be task or project');
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
        if (!rest[0])
          throw Error(
            `revoke needs a TOOL. Active grants: ${grants.filter((g) => Date.parse(g.expiresAt) > Date.now()).map((g) => g.tool).join(', ') || 'none'}`,
          );
        const before = grants.length;
        grants = grants.filter((g) => g.tool !== rest[0]);
        if (grants.length === before)
          throw Error(`${rest[0]} has no session grant to revoke.`);
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
      if (action === 'inspect') {
        if (!rest[0])
          throw Error(
            `inspect needs a SERVER. Declared: ${all.map((s) => s.name).join(', ') || 'none'}`,
          );
        const matches = all.filter((s) => s.name === rest[0]);
        if (!matches.length)
          throw Error(
            `Unknown server "${rest[0]}". Declared: ${all.map((s) => s.name).join(', ') || 'none'}`,
          );
        return output(
          ctx,
          matches.map((s) => ({
              name: s.name,
              source: s.source,
              tools: s.tools,
              enabled: profile.servers?.[s.name]?.enabled === true,
              transport: s.config.url ? 'http' : 'stdio',
              exposure: s.config.exposure ?? 'codemode',
            })),
        );
      }
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
      throw Error(`Unknown /mcpc ${action}\n${usageText('mcpc', mcpcSpec)}`);
    },
  });
}
