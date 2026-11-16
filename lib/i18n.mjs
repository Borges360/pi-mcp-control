import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export const LOCALES = Object.freeze(['en', 'pt-BR']);

const EN = Object.freeze({
  localeEnglish: 'English (default)',
  localePortuguese: 'Português (Brasil)',
  rowLanguage: 'Language',
  rowLanguageDescription: 'Dashboard language; saved only for this trusted project.',
  languageTrustRequired: 'Trust this project to choose and save Portuguese. English remains active.',
  languageInvalid: 'The saved language is invalid; English is active until you choose a language.',
  languageUnreadable: 'The saved language could not be read; English is active.',
  languagePreview: 'Language preview changed. Press Ctrl+S to save.',
  languageUnchanged: 'Language preference matches the saved value.',
  languageSaved: 'Language saved: {language}.',
  languageSaveFailed: 'Language could not be saved; the preview remains available. {error}',
  panelTitle: 'MCP Control · {enabled} · profile {profile} · {reachable}/{total} reachable · {grants} grant(s)',
  stateOn: 'ON',
  stateOff: 'off',
  profileNone: 'none',
  stateLine: 'MCP · {enabled} · profile {profile} · {reachable}/{total} server(s) reachable',
  scopeLine: 'scope {source} (strict {strict}) · out of scope: {servers}',
  grantsLine: 'open grants: {grants}',
  policyLine: 'policy: unknown tools → {unknown} · unapproved mutations → {mutations} · environment {environment} · grant TTL {ttl}s',
  mutationAllowed: 'allowed',
  mutationDenied: 'denied',
  grantUntil: 'until {time}',
  valueStrictOn: 'on',
  valueStrictOff: 'off',
  valueNone: 'none',
  valueOn: 'On',
  valueOff: 'Off',
  valueAsk: 'Ask',
  valueDeny: 'Deny',
  valueDevelopment: 'Development',
  valueStaging: 'Staging',
  valueProduction: 'Production',
  valueAvailable: 'Reachable',
  valueDeclared: 'Declared',
  valueDirect: 'Direct',
  valueCodemode: 'Code mode',
  valueDeferred: 'On demand',
  valueHidden: 'Hidden',
  valueEnabled: 'enabled',
  valueDisabled: 'disabled',
  countServers: '{count} server(s)',
  countReachable: '{reachable}/{total} reachable',
  countToolsReachable: '{count} tool(s) · reachable',
  serverOutOfScope: 'declared by the profile, but this session cannot reach it (out of scope)',
  countActive: '{count} active',
  countOutside: '{count} server(s)',
  countAllowed: '{count} allowed',
  profileDescription: '{servers} server(s) · {denies} deny rule(s) · file default: {default}',
  serverRecommendation: '▸ recommended ',
  grantRecommendation: '▸ recommended ',
  defaultYes: 'yes',
  defaultNo: 'no',
  rowStatus: 'Session status',
  rowStatusDescription: '{servers} server(s) · {grants} open grant(s)',
  rowProfile: 'Session profile',
  rowProfileDescription: 'Switching requires approval and clears session grants; it does not edit the config file.',
  rowServers: 'Servers',
  rowServersDescription: 'Choose a server to enable it or change its exposure.',
  rowServerRow: 'Server actions',
  rowServerRowDescription: 'The actions list opens after you choose a server.',
  rowGrants: 'Open grants',
  rowGrantsDescription: 'Revocation is always allowed because it narrows access.',
  rowOutOfScope: 'Out of scope',
  rowOutOfScopeDescription: 'Servers declared by the profile that this session cannot reach.',
  rowHelp: 'Command-line help',
  rowHelpDescription: 'Direct commands and autocomplete remain available.',
  rowAllowedExecutables: 'Allowed executables',
  rowAllowedExecutablesDescription: 'Managed stdio servers may use only explicitly allowed binaries; adding one requires two selections.',
  rowAllowedHosts: 'Allowed hosts',
  rowAllowedHostsDescription: 'Managed HTTP/SSE servers may reach only explicitly allowed hosts.',
  rowEnabled: 'MCP mediation',
  rowEnabledDescription: 'Turns profile-based authorization on or off; off leaves decisions to native MCP.',
  rowDefaultProfile: 'Default profile',
  rowDefaultProfileDescription: 'Profile selected for future sessions; separate from the active session profile.',
  rowDefaultUnknownTool: 'Unknown tools',
  rowDefaultUnknownToolDescription: 'Choose whether tools outside the profile allow/deny lists ask or fail closed.',
  rowFailClosedForMutation: 'Mutation approval',
  rowFailClosedForMutationDescription: 'Controls whether write/remove calls without explicit approval are denied.',
  rowEnvironment: 'Environment',
  rowEnvironmentDescription: 'Applies profile restrictions for development, staging, or production.',
  rowExceptionTtl: 'Grant lifetime',
  rowExceptionTtlDescription: 'How long an /mcpc allow exception remains valid before another approval is needed.',
  rowScopeSource: 'Server scope',
  rowScopeSourceDescription: 'Choose whether scope follows reachable servers or every server declared by the profile.',
  rowScopeStrict: 'Strict scope',
  rowScopeStrictDescription: 'Keep unreachable servers denied, or let them fall back to an approval question.',
  rowServerActions: 'Selected server',
  rowServerActionsDescription: 'Change a server in the default profile; the saved profile remains reviewable in Git.',
  panelUnavailable: 'MCP panel unavailable: {reason}',
  missingExports: 'Missing host exports: {exports} — this Pi does not expose the custom screen required by this panel.',
  navigationHint: '↑↓ move · Enter choose · Esc back',
  navigationHintWithKeys: '{up}/{down} move · {choose} choose · {back} back',
  back: 'back',
  panelMainHint: 'Ctrl+S saves changes · Esc returns or closes.',
  saveInProgress: 'A configuration save is in progress; wait for it to finish.',
  saveWait: 'Saving configuration… please wait.',
  unsavedWarning: 'Unsaved changes · Ctrl+S saves · Esc again discards.',
  unsavedNotify: 'Unsaved changes. Press Ctrl+S to save, or Esc again to discard.',
  discarded: 'Unsaved changes discarded.',
  noUnsaved: 'No unsaved changes.',
  savingUnavailable: 'Saving is unavailable; the draft is still available.',
  savingUnavailableNotify: 'Saving is unavailable; the draft was kept.',
  actionFailed: 'Action failed: {error}',
  saving: 'Saving configuration…',
  saveFailed: 'Save failed; your draft was kept. Try Ctrl+S again.',
  saveFailedDetail: 'Save failed; draft kept. {error}',
  saveSuccess: 'Configuration saved.',
  panelRemainsOpen: '{message} · panel remains open.',
  draftCount: '{count} unsaved change(s) · Ctrl+S saves · Esc twice discards.',
  headingStatus: 'Session status',
  headingProfile: 'Session profile · switching requires approval and clears grants',
  headingServers: 'Servers · choose one to enable or change exposure (the next level opens automatically)',
  headingServerActions: 'Actions for {server}',
  headingGrants: 'Open grants · revocation narrows access and does not edit the config file',
  headingOutOfScope: 'Out of scope',
  headingExecutables: 'Executables · adding one widens security (choose the same row twice)',
  headingHosts: 'Hosts · adding one widens security (choose the same row twice)',
  headingHelp: 'Command-line help',
  serverNoSelection: 'no server selected',
  actionEnableDisable: 'enable/disable {server}',
  actionExposure: 'exposure {mode}',
  actionCurrentlyEnabled: 'currently enabled',
  actionCurrentlyDisabled: 'currently disabled',
  actionChangesSession: '{state} · changes what this session can call',
  exposureDirect: 'tools always in context (higher context cost)',
  exposureHidden: 'hidden from the model; no tool can call it',
  exposureOnDemand: 'available on demand',
  remove: 'remove {value}',
  currentlyAllowed: 'currently allowed',
  recommendedAllow: '▸ recommended allow {value}',
  executableRequired: 'a declared managed server requires this binary',
  hostRequired: 'a managed server points to this host',
  noSuggestions: 'No suggestions',
  noManagedStdio: 'No managedServers entry is declared.',
  noManagedHttp: 'No managed HTTP server is declared.',
  noServerDeclared: 'No server declared',
  addServerProfile: 'Add a server to .pi/mcp-profiles.yaml.',
  noOpenGrants: 'No open grants',
  grantCommandHint: '/mcpc allow <tool> creates one.',
  noDeclaredOutOfScope: 'No declared server is outside this session scope.',
  outOfScopeSummary: '{count} server(s) declared by the profile but unreachable in this session: {servers}',
  outOfScopeReason: 'Reason: no connection/tools — out of scope, not denied by policy.',
  scopeStrictLine: 'Scope {source} · strict {strict}',
  outOfScopeRecovery: 'Recovery: /mcpc connect SERVER (managed only), edit the project profile, or switch profiles.',
  profileSwitchQuestion: 'Switch MCP profile?',
  profileNotConfigured: 'Profile {profile} is not configured here.',
  profileNotApproved: 'Not approved · profile and grants remain unchanged.',
  profileSwitched: 'Profile → {profile} · session grants cleared · this change is session-only; no config file was written.',
  noServerSuggestion: 'No server is declared.',
  selectedServer: 'Selected server: {server}',
  selectedValue: '{id} → {value}',
  revoke: 'revoke {tool}',
  grantExpiresAt: 'expires at {time}',
  noGrantOpen: 'No open grants.',
  noGrantForTool: '{tool} had no open grant.',
  grantRevoked: 'Grant for {tool} revoked · access narrowed; no config file was written.',
  noAction: 'Nothing to do.',
  wideningConfirm: 'No setting was staged. Choose the same row again to stage this security widening.',
  summarySaved: 'MCP · {count} saved change(s)\n{changes}',
  mcpSettingsSaved: '{count} MCP setting change(s) saved to {file}',
  allowValue: 'allow {value}',
  helpConnectLine: '/mcpc connect SERVER · managed servers only',
  helpAllowLine: '/mcpc allow-exe VALUE | allow-host VALUE · explicit confirmation required',
  summaryDiscarded: 'MCP · Unsaved changes discarded.',
  summaryActions: '{actions}',
  summaryNoChanges: 'MCP · No changes were made in the panel.',
  fallbackIntro: 'This client has no custom screen; direct commands remain available:',
  fallbackSavedPath: 'Saved to {file}',
  fieldDraft: 'Draft {field}: {value}. Press Ctrl+S to save.',
  serverDraftToggle: 'Draft: {server} enabled state changes. Press Ctrl+S to save.',
  serverDraftEnabled: 'Draft: {server} is enabled in the default profile. Press Ctrl+S to save.',
  serverDraftExposure: 'Draft: {server} exposure changes to {mode}. Press Ctrl+S to save.',
  wideningDraft: 'Draft security widening: {value} will be allowed after Ctrl+S.',
  removeDraft: 'Draft: {value} will be removed from the allowlist after Ctrl+S.',
});

const PT = Object.freeze({
  localeEnglish: 'English (padrão)',
  localePortuguese: 'Português (Brasil)',
  rowLanguage: 'Idioma',
  rowLanguageDescription: 'Idioma do painel, salvo somente neste projeto confiável.',
  languageTrustRequired: 'Confie neste projeto para escolher e salvar português. O inglês continua ativo.',
  languageInvalid: 'O idioma salvo é inválido; o inglês fica ativo até você escolher outro.',
  languageUnreadable: 'Não foi possível ler o idioma salvo; o inglês fica ativo.',
  languagePreview: 'Prévia do idioma alterada. Pressione Ctrl+S para salvar.',
  languageUnchanged: 'A preferência de idioma é igual ao valor salvo.',
  languageSaved: 'Idioma salvo: {language}.',
  languageSaveFailed: 'Não foi possível salvar o idioma; a prévia foi mantida. {error}',
  panelTitle: 'Controle MCP · {enabled} · perfil {profile} · {reachable}/{total} disponíveis · {grants} concessão(ões)',
  stateOn: 'ATIVO',
  stateOff: 'desativado',
  profileNone: 'nenhum',
  stateLine: 'MCP · {enabled} · perfil {profile} · {reachable}/{total} servidor(es) disponíveis',
  scopeLine: 'escopo {source} (estrito {strict}) · fora do escopo: {servers}',
  grantsLine: 'concessões abertas: {grants}',
  policyLine: 'política: ferramentas desconhecidas → {unknown} · mutações sem aprovação → {mutations} · ambiente {environment} · validade {ttl}s',
  mutationAllowed: 'permitidas',
  mutationDenied: 'negadas',
  grantUntil: 'até {time}',
  valueStrictOn: 'sim',
  valueStrictOff: 'não',
  valueNone: 'nenhum',
  valueOn: 'Ativado',
  valueOff: 'Desativado',
  valueAsk: 'Perguntar',
  valueDeny: 'Negar',
  valueDevelopment: 'Desenvolvimento',
  valueStaging: 'Homologação',
  valueProduction: 'Produção',
  valueAvailable: 'Disponíveis',
  valueDeclared: 'Declarados',
  valueDirect: 'Direto',
  valueCodemode: 'Modo de código',
  valueDeferred: 'Sob demanda',
  valueHidden: 'Oculto',
  valueEnabled: 'ativado',
  valueDisabled: 'desativado',
  countServers: '{count} servidor(es)',
  countReachable: '{reachable}/{total} disponíveis',
  countToolsReachable: '{count} ferramenta(s) · disponível(is)',
  serverOutOfScope: 'declarado pelo perfil, mas esta sessão não consegue alcançá-lo (fora do escopo)',
  countActive: '{count} ativo(s)',
  countOutside: '{count} servidor(es)',
  countAllowed: '{count} permitidos',
  profileDescription: '{servers} servidor(es) · {denies} regra(s) de bloqueio · padrão no arquivo: {default}',
  serverRecommendation: '▸ recomendado ',
  grantRecommendation: '▸ recomendado ',
  defaultYes: 'sim',
  defaultNo: 'não',
  rowStatus: 'Estado da sessão',
  rowStatusDescription: '{servers} servidor(es) · {grants} concessão(ões) aberta(s)',
  rowProfile: 'Perfil da sessão',
  rowProfileDescription: 'A troca exige aprovação e remove concessões da sessão; não altera o arquivo de configuração.',
  rowServers: 'Servidores',
  rowServersDescription: 'Escolha um servidor para ativá-lo ou alterar sua exposição.',
  rowServerRow: 'Ações do servidor',
  rowServerRowDescription: 'A lista de ações abre depois que você escolhe um servidor.',
  rowGrants: 'Concessões abertas',
  rowGrantsDescription: 'A revogação é sempre permitida porque reduz o acesso.',
  rowOutOfScope: 'Fora do escopo',
  rowOutOfScopeDescription: 'Servidores do perfil que esta sessão não consegue alcançar.',
  rowHelp: 'Ajuda de comandos',
  rowHelpDescription: 'Comandos diretos e autocomplete continuam disponíveis.',
  rowAllowedExecutables: 'Executáveis permitidos',
  rowAllowedExecutablesDescription: 'Servidores stdio gerenciados só podem usar binários explicitamente permitidos; adicionar exige duas seleções.',
  rowAllowedHosts: 'Hosts permitidos',
  rowAllowedHostsDescription: 'Servidores HTTP/SSE gerenciados só podem alcançar hosts explicitamente permitidos.',
  rowEnabled: 'Mediação MCP',
  rowEnabledDescription: 'Ativa ou desativa a autorização por perfil; desativada, o MCP nativo decide.',
  rowDefaultProfile: 'Perfil padrão',
  rowDefaultProfileDescription: 'Perfil das próximas sessões; separado do perfil ativo nesta sessão.',
  rowDefaultUnknownTool: 'Ferramentas desconhecidas',
  rowDefaultUnknownToolDescription: 'Define se ferramentas fora das listas permitir/bloquear perguntam ou falham fechadas.',
  rowFailClosedForMutation: 'Aprovação de mutações',
  rowFailClosedForMutationDescription: 'Define se chamadas de escrita/remoção sem aprovação explícita são negadas.',
  rowEnvironment: 'Ambiente',
  rowEnvironmentDescription: 'Aplica as restrições do perfil para desenvolvimento, homologação ou produção.',
  rowExceptionTtl: 'Validade da concessão',
  rowExceptionTtlDescription: 'Por quanto tempo uma exceção /mcpc allow vale antes de pedir nova aprovação.',
  rowScopeSource: 'Escopo dos servidores',
  rowScopeSourceDescription: 'Escolhe se o escopo segue servidores alcançáveis ou todos os declarados pelo perfil.',
  rowScopeStrict: 'Escopo estrito',
  rowScopeStrictDescription: 'Mantém servidores inalcançáveis bloqueados ou pergunta se quer aprová-los.',
  rowServerActions: 'Servidor selecionado',
  rowServerActionsDescription: 'Altera o servidor no perfil padrão; o perfil salvo continua revisável no Git.',
  panelUnavailable: 'Painel MCP indisponível: {reason}',
  missingExports: 'Exports ausentes no host: {exports} — este Pi não oferece a tela customizada necessária para o painel.',
  navigationHint: '↑↓ mover · Enter escolher · Esc voltar',
  navigationHintWithKeys: '{up}/{down} mover · {choose} escolher · {back} voltar',
  back: 'voltar',
  panelMainHint: 'Ctrl+S salva alterações · Esc volta ou fecha.',
  saveInProgress: 'Há um salvamento de configuração em andamento; aguarde.',
  saveWait: 'Salvando configuração… aguarde.',
  unsavedWarning: 'Alterações sem salvar · Ctrl+S salva · Esc novamente descarta.',
  unsavedNotify: 'Há alterações sem salvar. Ctrl+S salva; pressione Esc novamente para descartar.',
  discarded: 'Alterações sem salvar descartadas.',
  noUnsaved: 'Não há alterações sem salvar.',
  savingUnavailable: 'O salvamento está indisponível; o rascunho continua disponível.',
  savingUnavailableNotify: 'O salvamento está indisponível; o rascunho foi mantido.',
  actionFailed: 'A ação falhou: {error}',
  saving: 'Salvando configuração…',
  saveFailed: 'Falha ao salvar; o rascunho foi mantido. Tente Ctrl+S novamente.',
  saveFailedDetail: 'Falha ao salvar; rascunho mantido. {error}',
  saveSuccess: 'Configuração salva.',
  panelRemainsOpen: '{message} · o painel continua aberto.',
  draftCount: '{count} alteração(ões) sem salvar · Ctrl+S salva · Esc duas vezes descarta.',
  headingStatus: 'Estado da sessão',
  headingProfile: 'Perfil da sessão · a troca exige aprovação e remove concessões',
  headingServers: 'Servidores · escolha um para ativar ou alterar exposição (o próximo nível abre automaticamente)',
  headingServerActions: 'Ações para {server}',
  headingGrants: 'Concessões abertas · revogar reduz acesso e não altera o arquivo',
  headingOutOfScope: 'Fora do escopo',
  headingExecutables: 'Executáveis · adicionar amplia a segurança (escolha a mesma linha duas vezes)',
  headingHosts: 'Hosts · adicionar amplia a segurança (escolha a mesma linha duas vezes)',
  headingHelp: 'Ajuda de comandos',
  serverNoSelection: 'nenhum servidor selecionado',
  actionEnableDisable: 'ativar/desativar {server}',
  actionExposure: 'exposição {mode}',
  actionCurrentlyEnabled: 'atualmente ativado',
  actionCurrentlyDisabled: 'atualmente desativado',
  actionChangesSession: '{state} · altera o que esta sessão pode chamar',
  exposureDirect: 'ferramentas sempre no contexto (maior custo de contexto)',
  exposureHidden: 'oculto do modelo; nenhuma ferramenta pode chamá-lo',
  exposureOnDemand: 'disponível sob demanda',
  remove: 'remover {value}',
  currentlyAllowed: 'atualmente permitido',
  recommendedAllow: '▸ recomendado permitir {value}',
  executableRequired: 'um servidor gerenciado declarado exige este binário',
  hostRequired: 'um servidor gerenciado aponta para este host',
  noSuggestions: 'Nenhuma sugestão',
  noManagedStdio: 'Não há servidor em managedServers declarado.',
  noManagedHttp: 'Não há servidor HTTP gerenciado declarado.',
  noServerDeclared: 'Nenhum servidor declarado',
  addServerProfile: 'Adicione um servidor a .pi/mcp-profiles.yaml.',
  noOpenGrants: 'Não há concessões abertas',
  grantCommandHint: '/mcpc allow <tool> cria uma.',
  noDeclaredOutOfScope: 'Nenhum servidor declarado está fora do escopo desta sessão.',
  outOfScopeSummary: '{count} servidor(es) do perfil não podem ser alcançados nesta sessão: {servers}',
  outOfScopeReason: 'Motivo: sem conexão/ferramentas — fora do escopo, não negado pela política.',
  scopeStrictLine: 'Escopo {source} · estrito {strict}',
  outOfScopeRecovery: 'Recuperação: /mcpc connect SERVER (somente gerenciados), edite o perfil do projeto ou troque de perfil.',
  profileSwitchQuestion: 'Trocar o perfil MCP?',
  profileNotConfigured: 'O perfil {profile} não está configurado aqui.',
  profileNotApproved: 'Não aprovado · perfil e concessões permanecem inalterados.',
  profileSwitched: 'Perfil → {profile} · concessões da sessão removidas · esta mudança vale só para a sessão; nenhum arquivo foi escrito.',
  noServerSuggestion: 'Nenhum servidor declarado.',
  selectedServer: 'Servidor selecionado: {server}',
  selectedValue: '{id} → {value}',
  revoke: 'revogar {tool}',
  grantExpiresAt: 'expira às {time}',
  noGrantOpen: 'Não há concessões abertas.',
  noGrantForTool: '{tool} não tinha concessão aberta.',
  grantRevoked: 'Concessão de {tool} revogada · acesso reduzido; nenhum arquivo foi escrito.',
  noAction: 'Nada a fazer.',
  wideningConfirm: 'Nenhuma opção foi registrada. Escolha a mesma linha novamente para registrar esta ampliação de segurança.',
  summarySaved: 'MCP · {count} alteração(ões) salva(s)\n{changes}',
  mcpSettingsSaved: '{count} alteração(ões) de configuração MCP salva(s) em {file}',
  allowValue: 'permitir {value}',
  helpConnectLine: '/mcpc connect SERVER · somente servidores gerenciados',
  helpAllowLine: '/mcpc allow-exe VALUE | allow-host VALUE · exige confirmação explícita',
  summaryDiscarded: 'MCP · alterações sem salvar descartadas.',
  summaryActions: '{actions}',
  summaryNoChanges: 'MCP · nenhuma alteração foi feita no painel.',
  fallbackIntro: 'Este cliente não tem tela customizada; comandos diretos continuam disponíveis:',
  fallbackSavedPath: 'Salvo em {file}',
  fieldDraft: 'Rascunho de {field}: {value}. Pressione Ctrl+S para salvar.',
  serverDraftToggle: 'Rascunho: o estado de {server} será alterado. Pressione Ctrl+S para salvar.',
  serverDraftEnabled: 'Rascunho: {server} será ativado no perfil padrão. Pressione Ctrl+S para salvar.',
  serverDraftExposure: 'Rascunho: a exposição de {server} mudará para {mode}. Pressione Ctrl+S para salvar.',
  wideningDraft: 'Ampliação de segurança em rascunho: {value} será permitido após Ctrl+S.',
  removeDraft: 'Rascunho: {value} será removido da lista de permissões após Ctrl+S.',
});

export const CATALOGS = Object.freeze({ en: EN, 'pt-BR': PT });

export function translate(locale, key, values = {}) {
  const template = CATALOGS[locale]?.[key] ?? EN[key];
  if (typeof template !== 'string') return key;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export function localeLabel(locale, selected) {
  return translate(locale, selected === 'pt-BR' ? 'localePortuguese' : 'localeEnglish');
}

export function catalogKeys(locale = 'en') {
  return Object.keys(CATALOGS[locale] ?? EN).sort();
}

export function placeholderNames(template) {
  return [...String(template).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

export function wrapPanelText(text, width) {
  if (!Number.isInteger(width) || width < 1) throw new RangeError('width must be a positive integer');
  const output = [];
  for (const sourceLine of String(text).split('\n')) {
    const words = sourceLine.split(/\s+/u).filter(Boolean);
    let line = '';
    for (const word of words) {
      const chars = Array.from(word);
      if (chars.length > width) {
        if (line) output.push(line);
        for (let i = 0; i < chars.length; i += width) output.push(chars.slice(i, i + width).join(''));
        line = '';
        continue;
      }
      if (!line) line = word;
      else if (Array.from(line).length + 1 + chars.length <= width) line += ' ' + word;
      else {
        output.push(line);
        line = word;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

export async function readProjectLocale({ root, trusted }) {
  if (!trusted || typeof root !== 'string' || !root)
    return { locale: 'en', canPersist: false, issue: null, file: null };
  const file = join(resolve(root), '.pi', 'pi-mcp-control.locale.json');
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed?.schemaVersion !== 1 || !LOCALES.includes(parsed.locale))
      return { locale: 'en', canPersist: true, issue: 'invalid', file };
    return { locale: parsed.locale, canPersist: true, issue: null, file };
  } catch (error) {
    if (error?.code === 'ENOENT') return { locale: 'en', canPersist: true, issue: null, file };
    return { locale: 'en', canPersist: true, issue: 'unreadable', file };
  }
}

export async function writeProjectLocale({ root, trusted, locale, signal }) {
  if (!trusted || typeof root !== 'string' || !root)
    throw new Error('Project trust is required to save a project language preference.');
  if (!LOCALES.includes(locale)) throw new Error('Unsupported language preference.');
  if (signal?.aborted) throw signal.reason ?? new Error('Operation canceled');
  const file = join(resolve(root), '.pi', 'pi-mcp-control.locale.json');
  const temp = file + '.' + randomUUID() + '.tmp';
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  try {
    await writeFile(temp, JSON.stringify({ schemaVersion: 1, locale }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    if (signal?.aborted) throw signal.reason ?? new Error('Operation canceled');
    await rename(temp, file);
    return file;
  } finally {
    await unlink(temp).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}
