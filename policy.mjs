import { glob, hash, uid, now } from './lib/core.mjs';
export const defaultProfiles = {
  'developer-readonly': {
    servers: {},
    allowTools: [],
    denyTools: ['mcp__*__delete*', 'mcp__*__deploy*', 'mcp__*__destroy*'],
    approval: { mutation: 'always', readOnly: 'never' },
    limits: { timeoutSeconds: 30, maxCallsPerTask: 150, maxCallsPerMinute: 60 },
    restrictions: { productionActions: 'deny' },
  },
  'java-service': {
    servers: {
      docs: { enabled: true, exposure: 'deferred' },
      git: { enabled: true, exposure: 'codemode' },
    },
    allowTools: ['mcp__docs__search*'],
    denyTools: ['mcp__*__delete*', 'mcp__*__deploy*'],
    approval: { mutation: 'always', readOnly: 'never' },
    limits: { timeoutSeconds: 30, maxCallsPerTask: 150 },
  },
  'database-readonly': {
    servers: { database: { enabled: true, exposure: 'codemode' } },
    allowTools: [],
    denyTools: ['mcp__*__delete*', 'mcp__*__drop*', 'mcp__*__execute*'],
    approval: { mutation: 'always', readOnly: 'never' },
    restrictions: { productionActions: 'deny' },
    limits: { timeoutSeconds: 30, maxCallsPerTask: 150 },
  },
  'homelab-admin': {
    servers: {
      jenkins: { enabled: true, exposure: 'deferred' },
      proxmox: { enabled: true, exposure: 'codemode' },
    },
    allowTools: [],
    denyTools: ['mcp__*__destroy*'],
    approval: { mutation: 'always', readOnly: 'never' },
    restrictions: { productionActions: 'deny' },
    limits: { timeoutSeconds: 30, maxCallsPerTask: 150 },
  },
  'incident-investigation': {
    servers: {
      logs: { enabled: true, exposure: 'deferred' },
      docs: { enabled: true, exposure: 'deferred' },
    },
    allowTools: [],
    denyTools: ['mcp__*__delete*', 'mcp__*__deploy*', 'mcp__*__write*'],
    approval: { mutation: 'always', readOnly: 'never' },
    restrictions: { productionActions: 'deny' },
    limits: { timeoutSeconds: 30, maxCallsPerTask: 150 },
  },
};
export const defaults = {
  mcpControl: {
    enabled: true,
    defaultProfile: 'developer-readonly',
    defaultUnknownTool: 'ask',
    failClosedForMutation: true,
    profilesFile: '.pi/mcp-profiles.yaml',
    profiles: defaultProfiles,
    allowedExecutables: [],
    allowedHosts: [],
    environment: 'development',
    exceptionTtlSeconds: 300,
    managedServers: {},
    catalog: null,
  },
};
export function mcpName(name, input = {}) {
  const match = /^mcp__(.*?)__(.+)$/.exec(name);
  if (match) return { server: match[1], tool: match[2] };
  if (['read_mcp_resource', 'list_mcp_resources', 'list_mcp_resource_templates'].includes(name))
    return { server: input.server ?? null, tool: name, resource: true };
  return null;
}
export function validateTransport(config, { allowedHosts = [], allowedExecutables = [] } = {}) {
  if (config.url) {
    const url = new URL(config.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      !allowedHosts.includes(url.hostname) ||
      (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw Error('MCP URL/protocol/host denied');
  } else if (config.command) {
    const executable = config.command.split(/[\\/]/).at(-1);
    if (
      /^(bash|sh|cmd|powershell|pwsh)(?:\.exe)?$/i.test(executable) ||
      config.args?.some(
        (a) =>
          /^-(?:e|p|c|r)(?:[^-]|$)/.test(a) ||
          /^--(?:eval|print|command|shell|loader|import|require|password|api-key|token|secret)(?:=|$)/.test(
            a,
          ),
      )
    )
      throw Error(
        'MCP interpreter/credential arguments denied; use trusted scripts and environment credentials',
      );
    if (
      !allowedExecutables.includes(config.command) ||
      /[;&|`\r\n]/.test(config.command) ||
      config.args?.some((a) => /[\r\n\0]/.test(a)) ||
      /^(bash|sh|cmd(?:\.exe)?|powershell|pwsh)$/i.test(config.command)
    )
      throw Error('MCP stdio executable denied');
  } else throw Error('MCP transport required');
  if (
    Object.values(config.headers ?? {}).some((v) => typeof v !== 'string' || v.startsWith('!')) ||
    Object.values(config.env ?? {}).some((v) => typeof v !== 'string' || v.startsWith('!'))
  )
    throw Error('Credential shell commands denied for managed servers');
  return config;
}
export function authorize({
  name,
  input = {},
  annotations = {},
  profile,
  config,
  trusted = true,
  grants = [],
  denies = [],
  scope = {},
  calls = 0,
  rate = 0,
  circuitOpen = false,
  transport = null,
}) {
  const parsed = mcpName(name, input);
  if (!parsed) return { decision: 'outside-scope' };
  const reasons = [];
  if (!trusted) reasons.push('project-untrusted');
  const servers = parsed.server ? [parsed.server] : Object.keys(profile.servers ?? {});
  if (!parsed.server && parsed.resource) reasons.push('unscoped-resource-discovery');
  for (const server of servers) {
    const entry = profile.servers?.[server] ?? profile.servers?.[server.replaceAll('_', '-')];
    if (!entry || entry.enabled === false) reasons.push('server-disabled-or-not-allowlisted');
  }
  if (
    (profile.denyTools ?? []).some((p) => glob(p, name)) ||
    denies.some((d) => glob(d.tool, name) && (!d.expiresAt || Date.parse(d.expiresAt) > Date.now()))
  )
    reasons.push('explicit-deny');
  if (calls >= (profile.limits?.maxCallsPerTask ?? 150)) reasons.push('task-call-limit');
  if (rate >= (profile.limits?.maxCallsPerMinute ?? 60)) reasons.push('rate-limit');
  if (circuitOpen) reasons.push('circuit-open');
  if (transport?.url) {
    const u = new URL(transport.url);
    const hosts = profile.restrictions?.allowedHosts;
    if (hosts && !hosts.includes(u.hostname)) reasons.push('restricted-host');
  }
  const destructive =
    /\b(DROP|TRUNCATE|DELETE FROM|ALTER TABLE|GRANT|REVOKE)\b/i.test(JSON.stringify(input)) ||
    /(?:^|_)(delete|drop|destroy|deploy|publish|remove|shutdown|wipe)(?:_|$)/i.test(parsed.tool);
  const mutation =
    destructive ||
    annotations.destructiveHint === true ||
    annotations.readOnlyHint !== true ||
    annotations.openWorldHint !== false;
  if (
    config.environment === 'production' &&
    mutation &&
    profile.restrictions?.productionActions !== 'ask'
  )
    reasons.push('production-mutation-denied');
  const grant = grants.find(
    (g) =>
      g.tool === name &&
      Date.parse(g.expiresAt) > Date.now() &&
      (!g.taskId || g.taskId === scope.taskId) &&
      (!g.sessionId || g.sessionId === scope.sessionId) &&
      (!g.inputHash || g.inputHash === hash(input)),
  );
  let decision;
  if (reasons.length) decision = 'deny';
  else if (
    destructive ||
    (mutation && (config.failClosedForMutation || profile.approval?.mutation === 'always'))
  )
    decision = grant?.inputHash ? 'allow' : 'ask';
  else if (grant) decision = 'allow';
  else if (
    (profile.allowTools ?? []).some((p) => glob(p, name)) &&
    annotations.readOnlyHint === true &&
    profile.approval?.readOnly === 'never'
  )
    decision = 'allow';
  else decision = config.defaultUnknownTool === 'deny' ? 'deny' : 'ask';
  return {
    decision,
    policyId: hash(profile),
    decisionId: uid(),
    reasonCodes: reasons.length
      ? reasons
      : [
          decision === 'ask'
            ? 'human-approval-required'
            : decision === 'deny'
              ? 'unknown-tool-denied'
              : 'explicit-policy-allow',
        ],
    expiresAt: grant?.expiresAt,
    approvedBy: grant?.approvedBy,
    risk: destructive ? 'critical' : mutation ? 'high' : 'low',
    server: parsed.server,
  };
}
// Legacy deterministic helper retained. Full authorization uses profiles above.
export function decide(name, input, approved = false) {
  if (!mcpName(name, input)) return 'outside-scope';
  if (
    /__(delete|drop|destroy|deploy|publish|remove|shutdown|reset|wipe)/i.test(name) ||
    /\b(DROP|TRUNCATE|DELETE FROM|ALTER TABLE|GRANT|REVOKE)\b/i.test(JSON.stringify(input ?? {}))
  )
    return 'deny';
  if (
    /__(build|write|execute|run|query|update|create|insert|modify)/i.test(name) ||
    /\b(UPDATE|INSERT INTO|CREATE TABLE|EXEC|CALL)\b/i.test(JSON.stringify(input ?? {}))
  )
    return 'ask';
  return approved ? 'allow' : 'ask';
}
