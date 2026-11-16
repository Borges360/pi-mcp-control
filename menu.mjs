/**
 * The `/mcpc` panel.
 *
 * Authorization questions are the same three questions: which profile is active, which
 * servers can this session actually reach, and what did I grant that is still open. The
 * screen answers them first and lets the dials be moved in place — including the
 * per-server switches, which are a two-level flow (`navigateTo` opens the actions of the
 * server you picked, exactly as the host component does it).
 *
 * Rows derive from `FIELDS`, one exported table (rule B). A value the table refuses can
 * not appear on the screen, because the screen does not keep its own lists.
 *
 * The host modules are not imported here: `index.ts` imports them statically and calls
 * `provideHost()`, because a dynamic `await import('@earendil-works/pi-tui')` inside an
 * extension is resolved by Node and cannot resolve under pi's loader.
 */
import { defaults, defaultProfiles } from './policy.mjs';
import { translate } from './lib/i18n.mjs';

/** How a server's tools reach the model. `direct` is the only one that is always in context. */
export const EXPOSURES = ['direct', 'codemode', 'deferred', 'hidden'];
/** Environments, with what each one promises. */
export const ENVIRONMENTS = ['development', 'staging', 'production'];

const serverKey = (name) => String(name ?? '').replace(/[^a-z0-9_-]/gi, '_');

/** One table for every writable knob of `mcpControl`. */
export const FIELDS = {
  enabled: {
    label: 'Controle MCP',
    lock: 'enabled',
    values: ['on', 'off'],
    current: (c) => (c.enabled ? 'on' : 'off'),
    patch: (v) => ({ enabled: v === 'on' }),
    note: (v) =>
      v === 'on' ? 'autorização mediada por perfil' : '⚠ desligado: nada é mediado — o transporte nativo decide sozinho',
    hint: 'off não desconecta servidores; só para de autorizar',
  },
  defaultProfile: {
    label: 'Perfil default',
    lock: 'defaultProfile',
    // Candidates are the profiles that exist in this project's config — never a list the
    // panel invents, because a name that does not resolve is a silent "profile: none".
    values: (c) => Object.keys(c.profiles ?? defaultProfiles),
    current: (c) => c.defaultProfile ?? 'developer-readonly',
    patch: (v) => ({ defaultProfile: v }),
    note: (v) => `novo perfil default: ${v} (sessões futuras)`,
    hint: 'o perfil das próximas sessões; trocar AGORA é "Perfil desta sessão"',
  },
  defaultUnknownTool: {
    label: 'Ferramenta desconhecida',
    lock: 'defaultUnknownTool',
    values: ['ask', 'deny'],
    current: (c) => c.defaultUnknownTool ?? 'ask',
    patch: (v) => ({ defaultUnknownTool: v }),
    note: (v) => (v === 'deny' ? 'desconhecida é negada sem perguntar' : 'desconhecida pergunta'),
    hint: 'o que fazer com uma ferramenta fora de allowTools/denyTools',
  },
  failClosedForMutation: {
    label: 'Mutação sem aprovação',
    lock: 'failClosedForMutation',
    values: ['on', 'off'],
    current: (c) => (c.failClosedForMutation === false ? 'off' : 'on'),
    patch: (v) => ({ failClosedForMutation: v === 'on' }),
    note: (v) =>
      v === 'off' ? '⚠ mutação sem aprovação explícita passa: o padrão é negar' : 'mutação sem aprovação é negada',
    hint: 'liga/desliga o fail-closed de escrita/remoção',
  },
  environment: {
    label: 'Ambiente',
    lock: 'environment',
    values: ENVIRONMENTS,
    current: (c) => c.environment ?? 'development',
    patch: (v) => ({ environment: v }),
    note: (v) =>
      v === 'production'
        ? '⚠ produção: actions de produção ficam negadas pelos perfis que declaram productionActions: deny'
        : `ambiente ${v}`,
    hint: 'afeta as restrições de produção dos perfis',
  },
  exceptionTtl: {
    label: 'Validade da exceção',
    lock: 'exceptionTtlSeconds',
    values: ['60', '300', '900', '3600'],
    current: (c) => String(c.exceptionTtlSeconds ?? 300),
    patch: (v) => ({ exceptionTtlSeconds: Number(v) }),
    note: (v) => `autorizações de /mcpc allow valem ${v}s`,
    hint: 'quanto uma liberação vive antes de pedir de novo',
  },
  scopeSource: {
    label: 'Escopo de servidores',
    lock: 'scope',
    values: ['available', 'declared'],
    current: (c) => c.scope?.source ?? 'available',
    patch: (v) => ({ scope: { source: v } }),
    note: (v) =>
      v === 'available'
        ? 'escopo = o que a sessão alcança; servidor não conectado aparece out-of-scope'
        : 'declared: cobra o que o perfil declara, mesmo sem conexão (pergunta em vez de nomear)',
    hint: 'não muda nenhuma autorização já concedida',
  },
  scopeStrict: {
    label: 'Escopo estrito',
    lock: 'scope',
    values: ['on', 'off'],
    current: (c) => (c.scope?.strict === false ? 'off' : 'on'),
    patch: (v) => ({ scope: { strict: v === 'on' } }),
    note: (v) =>
      v === 'on'
        ? 'fora do escopo é negado com o motivo na linha'
        : '⚠ fora do escopo vira pergunta — o agente pode aprovar às cegas',
    hint: 'on mantém a recusa; off degrada para o comportamento antigo',
  },
  serverActions: {
    label: 'Servidor selecionado',
    lock: 'profiles',
    kind: 'list',
    listKey: 'profiles',
    accepts: (v) => /^(toggle|expose):[a-z0-9_-]{1,64}(:[a-z]+)?$/i.test(String(v)),
    // The rows are for the server the previous level selected (`state.server`).
    values: (c, state = {}) => {
      const name = state.server;
      if (!name) return [];
      const entry = (c.profiles?.[state.profile ?? c.defaultProfile]?.servers ?? {})[name];
      return [
        `toggle:${name}`,
        ...EXPOSURES.map((mode) => `expose:${name}:${mode}`),
        ...(entry ? [] : [`enable:${name}`]),
      ];
    },
    current: (c, state = {}) =>
      state.server
        ? `${state.server}: ${(c.profiles?.[state.profile ?? c.defaultProfile]?.servers ?? {})[state.server]?.enabled ? 'enabled' : 'disabled'}`
        : 'no server',
    patch: (v, c) => {
      const [op, name, mode] = String(v).split(':');
      const profileName = c.defaultProfile ?? 'developer-readonly';
      const profile = c.profiles?.[profileName] ?? {};
      const servers = { ...(profile.servers ?? {}) };
      const entry = { ...(servers[name] ?? {}) };
      if (op === 'toggle') entry.enabled = !(entry.enabled === true);
      else if (op === 'enable') entry.enabled = true;
      else if (op === 'expose') entry.exposure = mode;
      else throw Error(`ação de servidor desconhecida: ${v}`);
      servers[name] = entry;
      return { profiles: { [profileName]: { ...profile, servers } } };
    },
    note: (v) => {
      const [op, name, mode] = String(v).split(':');
      if (op === 'toggle') return `⚠ ${name} mudou de ativo/inativo no perfil — muda o que a sessão pode chamar`;
      if (op === 'enable') return `${name} ativado no perfil`;
      return `${name}: ferramentas agora em ${mode} (${mode === 'direct' ? 'sempre no contexto' : 'só quando a sessão alcança'})`;
    },
    hint: 'escreve no perfil default, que é revisável em git',
  },
  allowedExecutables: {
    label: 'Executáveis allowlisted',
    lock: 'allowedExecutables',
    kind: 'list',
    listKey: 'allowedExecutables',
    accepts: (v) => /^(add|remove):[\w.:@/-]{1,64}$/.test(String(v)),
    values: (c, state = {}) => [
      ...(c.allowedExecutables ?? []).map((x) => `remove:${x}`),
      ...(state.declaredExecutables ?? []).filter((x) => !(c.allowedExecutables ?? []).includes(x)).map((x) => `add:${x}`),
    ],
    current: (c) => `${(c.allowedExecutables ?? []).length} allowed`,
    patch: (v, c) => {
      const [op, exe] = String(v).split(':');
      const list = c.allowedExecutables ?? [];
      return {
        allowedExecutables: op === 'add' ? [...new Set([...list, exe])] : list.filter((x) => x !== exe),
      };
    },
    note: (v) =>
      String(v).startsWith('add:')
        ? `⚠ widening: ${v.slice(4)} poderá ser usado por servidores stdio deste projeto`
        : `${v.slice(7)} voltou a ser recusado`,
    hint: 'transporte stdio de servidor gerenciado; widening pede a mesma linha duas vezes',
  },
  allowedHosts: {
    label: 'Hosts allowlisted',
    lock: 'allowedHosts',
    kind: 'list',
    listKey: 'allowedHosts',
    accepts: (v) => /^(add|remove):[\w.:@/-]{1,120}$/.test(String(v)),
    values: (c, state = {}) => [
      ...(c.allowedHosts ?? []).map((x) => `remove:${x}`),
      ...(state.declaredHosts ?? []).filter((x) => !(c.allowedHosts ?? []).includes(x)).map((x) => `add:${x}`),
    ],
    current: (c) => `${(c.allowedHosts ?? []).length} allowed`,
    patch: (v, c) => {
      const [op, host] = String(v).split(':');
      const list = c.allowedHosts ?? [];
      return { allowedHosts: op === 'add' ? [...new Set([...list, host])] : list.filter((x) => x !== host) };
    },
    note: (v) =>
      String(v).startsWith('add:')
        ? `⚠ widening: a sessão poderá alcançar ${v.slice(4)}`
        : `${v.slice(7)} saiu da allowlist`,
    hint: 'transporte http/sse de servidor gerenciado',
  },
};

export const c0 = () => defaults.mcpControl;

/** Value list of a field, always through the table (never a copy of it). */
export function fieldValues(id, conf = c0(), state = {}) {
  const field = FIELDS[id];
  if (!field) throw Error(`campo desconhecido: ${id}`);
  return typeof field.values === 'function' ? field.values(conf ?? c0(), state) : field.values;
}

/** The one writer: lock, membership, patch. Panel and commands share it. */
export function applyField(conf, id, value, { locked = {}, state = {} } = {}) {
  const field = FIELDS[id];
  if (!field) throw Error(`campo desconhecido: ${id}`);
  if (Object.hasOwn(locked, field.lock))
    throw Error(`mcpControl.${field.lock} está travado por política global.`);
  const allowed = fieldValues(id, conf, state);
  if (!allowed.includes(value) && !(field.accepts?.(value) ?? false))
    throw Error(`Invalid ${id}: ${value}\nUse: ${allowed.join(' | ') || '(nada a oferecer agora)'}`);
  return { patch: field.patch(value, conf), note: field.note(value, conf), id, value };
}

/** Enum rows from the table, minus locked keys, in table order. */
const fieldKey = (id, suffix = '') => `row${id[0].toUpperCase()}${id.slice(1)}${suffix}`;

const VALUE_KEYS = Object.freeze({
  enabled: { on: 'valueOn', off: 'valueOff' },
  failClosedForMutation: { on: 'valueOn', off: 'valueOff' },
  scopeStrict: { on: 'valueStrictOn', off: 'valueStrictOff' },
  defaultUnknownTool: { ask: 'valueAsk', deny: 'valueDeny' },
  environment: { development: 'valueDevelopment', staging: 'valueStaging', production: 'valueProduction' },
  scopeSource: { available: 'valueAvailable', declared: 'valueDeclared' },
  serverActions: { direct: 'valueDirect', codemode: 'valueCodemode', deferred: 'valueDeferred', hidden: 'valueHidden' },
});

export function panelDisplayValue(id, value, locale = 'en') {
  if (id === 'serverActions') {
    const match = String(value).match(/^(.+): (enabled|disabled)$/);
    if (match) return `${match[1]}: ${translate(locale, match[2] === 'enabled' ? 'valueEnabled' : 'valueDisabled')}`;
  }
  const key = VALUE_KEYS[id]?.[String(value)];
  if (key) return translate(locale, key);
  if (id === 'allowedExecutables' || id === 'allowedHosts') {
    const count = Number.parseInt(String(value), 10);
    if (Number.isInteger(count)) return translate(locale, 'countAllowed', { count });
  }
  return String(value);
}

export function canonicalPanelValue(id, value, locale = 'en') {
  const candidates = VALUE_KEYS[id];
  if (candidates)
    for (const [canonical, key] of Object.entries(candidates))
      if (value === translate(locale, key) || value === canonical) return canonical;
  return value;
}

/** Enum rows from the table, minus locked keys, in table order. */
export function enumItems({ conf, locked = {}, state = {}, locale = 'en' }) {
  return Object.entries(FIELDS)
    .filter(([, field]) => field.kind !== 'list')
    .filter(([id]) => !Object.hasOwn(locked, FIELDS[id].lock))
    .map(([id, field]) => ({
      id,
      label: translate(locale, fieldKey(id)),
      currentValue: panelDisplayValue(id, field.current(conf, state), locale),
      values: fieldValues(id, conf, state).map((value) => panelDisplayValue(id, value, locale)),
      description: translate(locale, fieldKey(id, 'Description')),
    }));
}

/** Membership rows (the two allowlists). */
export function listItems(conf, { locked = {}, state = {}, locale = 'en' } = {}) {
  return Object.entries(FIELDS)
    .filter(([, field]) => field.kind === 'list')
    .filter(([id]) => !Object.hasOwn(locked, FIELDS[id].lock))
    .map(([id, field]) => ({
      id,
      label: translate(locale, fieldKey(id)),
      currentValue: field.current(conf, state),
      submenu: true,
      description: fieldValues(id, conf, state).length
        ? translate(locale, fieldKey(id, 'Description'))
        : `${translate(locale, fieldKey(id, 'Description'))} · ${translate(locale, 'noSuggestions')} · /mcpc allow-host <value>`,
    }));
}

/** English-first explanation for a panel draft; direct CLI messages retain their established wording. */
export function panelChangeNote(id, value, _conf, _state, locale = 'en') {
  if (id === 'serverActions') {
    const [action, name, mode] = String(value).split(':');
    if (action === 'toggle') return translate(locale, 'serverDraftToggle', { server: name });
    if (action === 'enable') return translate(locale, 'serverDraftEnabled', { server: name });
    return translate(locale, 'serverDraftExposure', { server: name, mode: panelDisplayValue('serverActions', mode, locale) });
  }
  if (id === 'allowedExecutables' || id === 'allowedHosts') {
    const adding = String(value).startsWith('add:');
    return adding
      ? translate(locale, 'wideningDraft', { value: String(value).slice(4) })
      : translate(locale, 'removeDraft', { value: String(value).slice(7) });
  }
  return translate(locale, 'fieldDraft', {
    field: translate(locale, fieldKey(id)),
    value: panelDisplayValue(id, value, locale),
  });
}

/** The decision/observation rows: what the session is doing, not what is configured. */
export function stateItems(state, locale = 'en') {
  return [
    {
      id: 'status',
      label: translate(locale, 'rowStatus'),
      currentValue: state.profile ?? translate(locale, 'profileNone'),
      submenu: true,
      description: translate(locale, 'rowStatusDescription', {
        servers: state.servers?.length ?? 0,
        grants: state.grants?.length ?? 0,
      }),
    },
    {
      id: 'profile',
      label: translate(locale, 'rowProfile'),
      currentValue: state.profile ?? translate(locale, 'profileNone'),
      submenu: true,
      description: translate(locale, 'rowProfileDescription'),
    },
    {
      id: 'servers',
      label: translate(locale, 'rowServers'),
      currentValue: translate(locale, 'countReachable', {
        reachable: state.reachable?.length ?? 0,
        total: state.servers?.length ?? 0,
      }),
      submenu: true,
      description: translate(locale, 'rowServersDescription'),
    },
    {
      id: 'serverRow',
      label: translate(locale, 'rowServerRow'),
      currentValue: '—',
      submenu: true,
      description: translate(locale, 'rowServerRowDescription'),
    },
    {
      id: 'grants',
      label: translate(locale, 'rowGrants'),
      currentValue: translate(locale, 'countActive', { count: state.grants?.length ?? 0 }),
      submenu: true,
      description: translate(locale, 'rowGrantsDescription'),
    },
    {
      id: 'outOfScope',
      label: translate(locale, 'rowOutOfScope'),
      currentValue: translate(locale, 'countOutside', { count: state.outOfScope?.length ?? 0 }),
      submenu: true,
      description: translate(locale, 'rowOutOfScopeDescription'),
    },
    {
      id: 'help',
      label: translate(locale, 'rowHelp'),
      currentValue: '—',
      submenu: true,
      description: translate(locale, 'rowHelpDescription'),
    },
  ];
}

export function panelItems({ conf, locked = {}, state, locale = 'en' }) {
  return [
    ...stateItems(state, locale),
    ...listItems(conf, { locked, state, locale }),
    ...enumItems({ conf, locked, state, locale }),
  ];
}

export function panelTitle(conf, state, locale = 'en') {
  return translate(locale, 'panelTitle', {
    enabled: conf.enabled ? translate(locale, 'stateOn') : translate(locale, 'stateOff'),
    profile: state.profile ?? '—',
    reachable: state.reachable?.length ?? 0,
    total: state.servers?.length ?? 0,
    grants: state.grants?.length ?? 0,
  });
}

/** Which of the declared servers this session can actually reach (rule E). */
export function partitionServers(inventory = [], profile = {}, config = c0()) {
  const declared = Object.keys(profile.servers ?? {});
  // Reachable = the profile enables it **and** this session actually sees tools for
  // it. Enabled-but-unconnected is a scope fact, not a policy denial.
  const reachable = inventory
    .filter((s) => profile.servers?.[s.name]?.enabled === true && (s.tools?.length ?? 0) > 0)
    .map((s) => s.name);
  const outOfScope = declared.filter(
    (name) => !inventory.some((s) => s.name === name && (s.tools?.length ?? 0) > 0),
  );
  return {
    declared,
    reachable,
    outOfScope,
    strict: config.scope?.strict !== false,
    source: config.scope?.source ?? 'available',
    reasonCodes: outOfScope.map((n) => `server-not-connected:${n}`),
  };
}

/** Rows of the `servers` level: every declared/known server, reachable ones first. */
export function serverRows(state, locale = 'en') {
  const rows = [];
  const push = (name, ok) =>
    rows.push({
      value: name,
      label: `${rows.length === 0 ? translate(locale, 'serverRecommendation') : ''}${name}`,
      description: ok
        ? translate(locale, 'countToolsReachable', {
            count: state.servers.find((s) => s.name === name)?.tools?.length ?? 0,
          })
        : translate(locale, 'serverOutOfScope'),
    });
  for (const name of state.reachable ?? []) push(name, true);
  for (const name of state.outOfScope ?? []) if (!(state.reachable ?? []).includes(name)) push(name, false);
  if (!rows.length)
    rows.push({ value: 'noop', label: translate(locale, 'noServerDeclared'), description: translate(locale, 'addServerProfile') });
  return rows;
}

/** Rows of the `grants` level. */
export function grantRows(state, locale = 'en') {
  const rows = (state.grants ?? []).map((g, i) => ({
    value: `revoke:${g.tool}`,
    label: `${i === 0 ? translate(locale, 'grantRecommendation') : ''}${translate(locale, 'revoke', { tool: g.tool })}`,
    description: translate(locale, 'grantExpiresAt', { time: new Date(g.expiresAt).toISOString().slice(11, 19) }),
  }));
  if (!rows.length)
    rows.push({ value: 'noop', label: translate(locale, 'noOpenGrants'), description: translate(locale, 'grantCommandHint') });
  return rows;
}

/** Human lines for the `outOfScope` screen. */
export function outOfScopeLines(state, locale = 'en') {
  const rows = state.outOfScope ?? [];
  if (!rows.length) return [translate(locale, 'noDeclaredOutOfScope')];
  return [
    translate(locale, 'outOfScopeSummary', { count: rows.length, servers: rows.join(', ') }),
    translate(locale, 'outOfScopeReason'),
    translate(locale, 'scopeStrictLine', {
      source: panelDisplayValue('scopeSource', state.source, locale),
      strict: translate(locale, state.strict ? 'valueStrictOn' : 'valueStrictOff'),
    }),
    translate(locale, 'outOfScopeRecovery'),
  ];
}

/** Test seam: the host modules the entry point imported statically. */
export const host = { tui: undefined, agent: undefined };

/**
 * Wire `index.ts`'s static imports into the seam. Static import at the entry point is
 * the only path that resolves under pi's jiti loader; the lazy import in
 * `runDashboard` is a fallback for direct `extension.mjs` loads only.
 */
export function provideHost(tui, agent) {
  if (tui) host.tui = tui;
  if (agent) host.agent = agent;
  return host;
}

/**
 * Which export the screen needs, and from which package. `Container`/`SettingsList`/
 * `SelectList`/`Text`/`Input` are pi-tui (`pi-tui/dist/index.d.ts:32`);
 * `DynamicBorder`, the list themes and the key helpers are pi-coding-agent
 * (`pi-coding-agent/dist/index.d.ts:36-37`). In the economist `DynamicBorder` was
 * destructured off pi-tui, arrived `undefined`, and `new DynamicBorder(...)` threw
 * inside the `ctx.ui.custom()` factory: no menu for the user, 49 green tests, because
 * the fake repeated the wrong provenance. `scripts/smoke-panel.mjs` checks this table
 * against the installed host.
 */
export const HOST_EXPORTS = {
  '@earendil-works/pi-tui': ['Container', 'SettingsList', 'SelectList', 'Text', 'Input', 'matchesKey'],
  '@earendil-works/pi-coding-agent': [
    'DynamicBorder',
    'getSettingsListTheme',
    'getSelectListTheme',
  ],
};
/** Used when present, literal fallbacks when not (same package as above). */
export const OPTIONAL_EXPORTS = {
  '@earendil-works/pi-coding-agent': ['keyHint', 'keyText'],
};

/** Name the exports the host does not actually provide (a missing module is all of them). */
export function missingHostExports(tuiPkg, agentPkg) {
  const mods = {
    '@earendil-works/pi-tui': tuiPkg,
    '@earendil-works/pi-coding-agent': agentPkg,
  };
  return Object.entries(HOST_EXPORTS).flatMap(([name, exports]) =>
    exports.filter((key) => typeof mods[name]?.[key] !== 'function').map((key) => `${name}.${key}`),
  );
}

function why(error) {
  return String(error?.code ?? error?.message ?? error).split('\n')[0];
}

/** Degradation is allowed; silence is not. Returns false so the caller prints state. */
function degrade(ctx, reason, locale = 'en') {
  try {
    ctx?.ui?.notify?.(translate(locale, 'panelUnavailable', { reason }), 'warning');
  } catch {
    // A broken notify must not replace the reason with a second error.
  }
  return false;
}

/**
 * Show the panel. `deps` = `{ ctx, title, items, onChange, menus }`; `onChange(id,
 * value, update, target)` returns the note (or a promise of it) shown to the user.
 * Returns `false` when the host cannot run a custom screen, so the caller falls back
 * to the text panel — which leads with state, never with a grammar dump.
 */
export async function runDashboard(deps, injection = {}) {
  const { ctx, items, onChange, onSave, onDiscard, menus } = deps;
  const locale = () => (typeof deps.locale === 'function' ? deps.locale() : deps.locale ?? 'en');
  const t = (key, values) => translate(locale(), key, values);
  const getTitle = () => (typeof deps.title === 'function' ? deps.title() : deps.title ?? 'MCP Control');
  if (ctx.mode !== 'tui' || typeof ctx.ui.custom !== 'function') return false;
  let tuiPkg = injection.tuiPkg ?? host.tui,
    agentPkg = injection.agentPkg ?? host.agent;
  if (!tuiPkg) {
    try {
      tuiPkg = await import('@earendil-works/pi-tui');
    } catch (error) {
      return degrade(ctx, `@earendil-works/pi-tui unavailable (${why(error)})`, locale());
    }
  }
  if (!agentPkg) {
    try {
      agentPkg = await import('@earendil-works/pi-coding-agent');
    } catch (error) {
      return degrade(ctx, `@earendil-works/pi-coding-agent unavailable (${why(error)})`, locale());
    }
  }
  const missing = missingHostExports(tuiPkg, agentPkg);
  if (missing.length)
    return degrade(
      ctx,
      t('missingExports', { exports: missing.join(', ') }),
      locale(),
    );
  const { Container, SettingsList, SelectList, Text, Input, matchesKey } = tuiPkg;
  const { DynamicBorder, getSettingsListTheme, getSelectListTheme, keyHint, keyText } = agentPkg;
  const savedChanges = [];
  const actions = [];
  let discarded = false;
  let pendingTarget = null;
  await ctx.ui.custom((tuiRef, theme, keybindings, done) => {
    let active = true;
    let dirty = false;
    let saveInFlight = false;
    let escapeWarned = false;
    let draftCount = 0;
    const cancel = (data) => keybindings?.matches?.(data, 'tui.select.cancel') === true;
    const navHint = () => `  ${t('navigationHintWithKeys', {
      up: typeof keyText === 'function' ? keyText('tui.select.up') : '↑',
      down: typeof keyText === 'function' ? keyText('tui.select.down') : '↓',
      choose: typeof keyText === 'function' ? keyText('tui.select.confirm') : 'Enter',
      back: typeof keyText === 'function' ? keyText('tui.select.cancel') : 'Esc',
    })}`;
    const backHint = () => `  ${typeof keyHint === 'function' ? keyHint('tui.select.cancel', t('back')) : `Esc ${t('back')}`}`;
    const box = new Container();
    box.addChild(new DynamicBorder((str) => theme.fg('accent', str)));
    const titleText = new Text('', 1, 0);
    const setTitle = () => {
      const title = `${getTitle()}${dirty ? ' *' : ''}`;
      titleText.setText(theme.fg('accent', theme.bold ? theme.bold(title) : title));
    };
    setTitle();
    box.addChild(titleText);
    const statusText = new Text('', 1, 0);
    const renderStatus = (message) => {
      statusText.setText(theme.fg('dim', message));
      tuiRef.requestRender();
    };
    const notify = (message, level = 'info') => {
      if (!active) return;
      try {
        ctx.ui.notify?.(message, level);
      } catch {
        // A failed notification must not break the panel.
      }
    };
    const finish = () => {
      if (!active) return;
      active = false;
      done({ changed: savedChanges, actions, discarded });
    };
    const escapeRoot = () => {
      if (saveInFlight) {
        renderStatus(t('saveWait'));
        notify(t('saveInProgress'), 'warning');
        return;
      }
      if (dirty && !escapeWarned) {
        escapeWarned = true;
        renderStatus(t('unsavedWarning'));
        notify(t('unsavedNotify'), 'warning');
        return;
      }
      if (dirty) {
        discarded = true;
        onDiscard?.();
        renderStatus(t('discarded'));
        notify(t('discarded'), 'info');
      }
      finish();
    };
    const list = new SettingsList(
      items,
      Math.min(items.length, 12),
      getSettingsListTheme(),
      async (id, value) => {
        try {
          const outcome = await onChange(
            id,
            value,
            (target, replacement) => list.updateValue(target, replacement),
            pendingTarget,
          );
          if (!active) return outcome?.note ?? outcome;
          const result = outcome && typeof outcome === 'object' ? outcome : { kind: 'action', note: outcome };
          const message = result.note ?? t('selectedValue', { id, value });
          if (result.kind === 'draft') {
            dirty = true;
            escapeWarned = false;
            draftCount = result.count ?? draftCount + 1;
            setTitle();
            renderStatus(t('draftCount', { count: draftCount }));
          } else if (result.kind === 'locale' || result.kind === 'clean') {
            dirty = result.dirty ?? result.kind === 'locale';
            draftCount = result.count ?? (dirty ? draftCount : 0);
            escapeWarned = false;
            setTitle();
            renderStatus(message);
          } else if (message) {
            actions.push(message);
            renderStatus(message);
          }
          notify(message, result.level ?? 'info');
          tuiRef.requestRender();
          return message;
        } catch (error) {
          if (!active) return undefined;
          const message = t('actionFailed', { error: String(error?.message ?? error).split('\n')[0] });
          renderStatus(message);
          notify(message, 'warning');
          return undefined;
        }
      },
      escapeRoot,
    );
    const saveDraft = async () => {
      if (!active || saveInFlight) return;
      if (!dirty) {
        renderStatus(t('noUnsaved'));
        notify(t('noUnsaved'));
        return;
      }
      if (typeof onSave !== 'function') {
        renderStatus(t('savingUnavailable'));
        notify(t('savingUnavailableNotify'), 'warning');
        return;
      }
      saveInFlight = true;
      renderStatus(t('saving'));
      try {
        const result = await onSave();
        if (!active) return;
        if (!result?.ok) {
          if (result?.partial && result.changed?.length) savedChanges.push(...result.changed);
          const message = result?.note ?? t('saveFailed');
          renderStatus(message);
          notify(message, 'warning');
          return;
        }
        const message = result.note ?? t('saveSuccess');
        savedChanges.push(...(result.changed ?? [result.summary ?? message]));
        dirty = false;
        draftCount = 0;
        escapeWarned = false;
        setTitle();
        renderStatus(t('panelRemainsOpen', { message }));
        notify(message);
      } catch (error) {
        if (!active) return;
        const message = t('saveFailedDetail', { error: String(error?.message ?? error).split('\n')[0] });
        renderStatus(message);
        notify(message, 'warning');
      } finally {
        saveInFlight = false;
        if (active) tuiRef.requestRender();
      }
    };
    const frame = (heading) => {
      const inner = new Container();
      inner.addChild(new Text(theme.fg('accent', heading), 1, 0));
      return inner;
    };
    /** A searchable list inside a submenu; esc returns to the main screen. */
    const screen = (heading, rows, onPick, onClose) => {
      const inner = frame(heading);
      const select = new SelectList(rows || [], Math.min(rows?.length || 1, 8), getSelectListTheme());
      select.onSelect = (item) => onPick(item.value);
      select.onCancel = () => onClose();
      inner.addChild(select);
        inner.addChild(new Text(theme.fg('dim', navHint().trim()), 1, 0));
      return {
        render: (width) => inner.render(width),
        invalidate: () => inner.invalidate(),
        handleInput: (data) => {
          select.handleInput(data);
          tuiRef.requestRender();
        },
      };
    };
    const textScreen = (heading, lines, onClose) => {
      const inner = frame(heading);
      for (const line of (lines ?? [t('noSuggestions')]).flatMap((l) => String(l).split('\n')))
        inner.addChild(new Text(theme.fg('muted', `  ${line}`), 0, 0));
      inner.addChild(new Text(theme.fg('dim', backHint().trim()), 1, 0));
      return {
        render: (width) => inner.render(width),
        invalidate: () => inner.invalidate(),
        handleInput: (data) => {
          if (cancel(data)) onClose();
        },
      };
    };
    const panels = {
      status: (_c, close) => textScreen(t('headingStatus'), menus.status(), () => close()),
      profile: (_c, close) =>
        screen(
          t('headingProfile'),
          menus.profiles(),
          (value) => close(value),
          () => close(),
        ),
      servers: (_c, close) =>
        screen(
          t('headingServers'),
          menus.servers(),
          (value) => {
            if (value === 'noop') return close(value);
            // `navigateTo` re-selects AND activates the target
            // (`settings-list.js:222-233`): the actions list opens by itself, and the
            // `serverRow` row carries which server those actions belong to.
            const row = items.find((i) => i.id === 'serverRow');
            if (row) row.currentValue = value;
            return close(undefined, { navigateTo: 'serverRow' });
          },
          () => close(),
        ),
      serverRow: (current, close) =>
        screen(
          t('headingServerActions', { server: current ?? t('serverNoSelection') }),
          menus.serverActions(current),
          (value) => close(value),
          () => close(),
        ),
      grants: (_c, close) =>
        screen(
          t('headingGrants'),
          menus.grants(),
          (value) => close(value),
          () => close(),
        ),
      outOfScope: (_c, close) =>
        textScreen(t('headingOutOfScope'), menus.outOfScope(), () => close()),
      allowedExecutables: (_c, close) =>
        screen(
          t('headingExecutables'),
          menus.executables(),
          (value) => close(value),
          () => close(),
        ),
      allowedHosts: (_c, close) =>
        screen(
          t('headingHosts'),
          menus.hosts(),
          (value) => close(value),
          () => close(),
        ),
      help: (_c, close) => textScreen(t('headingHelp'), menus.help(), () => close()),
    };
    for (const item of items) {
      if (item.submenu !== true) continue;
      const panel = panels[item.id];
      if (!panel) continue;
      item.submenu = (currentValue, close) => {
        // Pass the selected row value through so server actions use the server picked above.
        pendingTarget = currentValue === '—' ? undefined : currentValue;
        return panel(currentValue === '—' ? undefined : currentValue, close);
      };
    }
    box.addChild(list);
    box.addChild(statusText);
    renderStatus(t('panelMainHint'));
    box.addChild(new DynamicBorder((str) => theme.fg('accent', str)));
    return {
      render: (width) => box.render(width),
      invalidate: () => box.invalidate(),
      handleInput: (data) => {
        if (matchesKey(data, 'ctrl+s')) return saveDraft();
        list.handleInput(data);
        tuiRef.requestRender();
      },
    };
  });
  return { changed: savedChanges, actions, discarded };
}
