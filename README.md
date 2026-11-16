# Pi MCP Control

Profiles and per-call authorization for MCP tools available to Pi Coding Agent.

**Package:** `pi-mcp-control` · **version:** `0.3.0` · **private:** `true`

**Status:** local development package. The manifest is private and no npm registry publication or availability is claimed. The local package preview is not a publication.

**Compatibility:** Node.js `>=20` and Pi Coding Agent, Pi AI, and Pi TUI peer dependencies declared as `*`. An offline synthetic-host smoke used Pi CLI `1.4.0`; it does not certify the full peer-version range.

## English

### What it does

Pi MCP Control applies local profiles and authorization rules to MCP tools exposed in a Pi session. Pi remains the MCP client and owns native server configuration, credentials, and connections. This extension does not create another MCP client.

The `/mcpc` command opens a Pi-native dashboard in the TUI. It shows the active profile, reachable and out-of-scope servers, open grants, and policy settings. In a non-TUI context it prints a text status fallback; the direct commands remain available.

### Install

Load the checkout for one Pi invocation from the extension directory:

~~~sh
pi -e ./index.ts
~~~

To add a local checkout to a destination project's Pi settings, run this from that project and replace the path with the checkout location:

~~~sh
pi install /path/to/pi-mcp-control -l
~~~

Pi's project-local install writes to that project's `.pi/settings.json`. Neither command uses the npm registry. The npm package is private; registry installation is not available or verified by this README.

For local validation, `npm test` runs the unit suite and `npm pack --dry-run --json` previews the allowed package files without creating a tarball or publishing. The recorded offline run passed 31/31 unit tests. Use an existing dependency tree: the current `package-lock.json` still says `0.2.0` and omits a peer dependency present in `package.json`, so a clean `npm ci` was not verified here.

### Use

Run `/mcpc` with no arguments to open the dashboard. It starts in English. On a trusted project, use the **Language** row to preview English or Brazilian Portuguese; Ctrl+S saves that preference locally for this project. The preference is stored in `.pi/pi-mcp-control.locale.json`, separate from MCP policy. An untrusted project remains in English. Use the arrow keys to navigate, Enter to choose, Ctrl+S to save staged changes, and Escape to return or close. Configuration and language edits remain drafts until Ctrl+S; a failed save keeps the remaining draft for retry. Escape in a submenu returns to the dashboard. If the dashboard has unsaved changes, the first Escape warns and the second discards them. Profile switching remains a separate approved, session-only action; revoking a grant narrows session access. Adding an executable or host requires choosing the same row twice, then saving with Ctrl+S. Pi's current theme and terminal components render the panel.

Direct commands include:

~~~text
/mcpc status
/mcpc catalog
/mcpc profiles
/mcpc use PROFILE
/mcpc inspect SERVER
/mcpc allow TOOL --scope task|project
/mcpc deny TOOL --scope task|project
/mcpc revoke TOOL
/mcpc health
/mcpc trace --last 20
/mcpc connect SERVER
/mcpc help
~~~

`connect` applies only to a server declared in `managedServers`. `allow-exe` and `allow-host` widen project allowlists and require deliberate confirmation. In a non-TUI context, operations that require human approval fail closed.

### Configuration and state

For a trusted project, `mcpControl` settings are read from and saved to `.pi/pi-suite.yaml`. The default profiles file is `.pi/mcp-profiles.yaml`; [examples/mcp-profiles.yaml](examples/mcp-profiles.yaml) shows the supported profile shape. An untrusted project uses the global Pi Suite configuration instead of writing project settings. The default global root is `~/.pi/agent/pi-suite`, and `PI_SUITE_HOME` can override it.

Defaults enable mediation, select `developer-readonly`, ask about unknown tools, fail closed for mutations, use a strict `available` session scope, and expire exception grants after 300 seconds. A task-scoped grant requires an active task. Deny rules outrank grants; an allow grant applies only within its chosen scope and does not waive per-call approval for a mutation.

Signed records and audit rows use local JSON/JSONL storage under `~/.pi/agent/pi-suite/projects/`. No database is used. Do not copy credentials into profiles or examples; native MCP configuration remains in Pi's own configuration files.

### Language

The panel starts in English and falls back to English if the saved preference is invalid or unreadable. In a trusted project, its **Language** row previews English or Brazilian Portuguese, and Ctrl+S saves the choice in `.pi/pi-mcp-control.locale.json` for that project only. An untrusted project stays in English. Changing the dashboard language does not translate command names, configuration keys, profile/server names, or MCP protocol values.

### Privacy and security

Read-only tools can follow the active profile; mutations require explicit human approval. A deny outranks an allow. Profile switching waits for Pi to become idle, asks for approval when a UI is available, and closes session grants. Expanding an executable or host allowlist is a security-widening action and requires confirmation.

The extension mediates calls that pass through Pi's MCP authorization pipeline. It is not a sandbox and does not cover shell tools or MCP calls made outside that pipeline. Timeout and circuit handling are local controls; they cannot guarantee rollback of a remote operation that has already started. A local HMAC detects changes to signed records but does not authenticate against another process running with access to the same local key.

The optional MCPHub catalog reads a previously verified `mcp_settings.json` file only after consent. It reports server names and transports; it does not install or connect servers and does not assume an HTTP MCPHub API.

### Troubleshooting and limits

Start with `/mcpc status`, `/mcpc profiles`, `/mcpc inspect SERVER`, or `/mcpc health`. `/mcpc trace --last 20` shows recent local authorization decisions. See [the profile example](examples/mcp-profiles.yaml) and [the validation notes](docs/VALIDACAO.md).

The manifest currently declares `npm run smoke` as `node scripts/smoke-panel.mjs`, but that file is absent from this checkout. That script was not run; the Pi 1.4.0 smoke recorded separately used the real loader and TUI with a synthetic offline host. No live MCP server, provider, model, or network request was part of that smoke.

The repository does not currently declare a software license in `package.json` or provide a `LICENSE` file. Confirm the software license with the maintainers before redistribution. The INTEIRO mark has a separate notice at [docs/assets/INTEIRO-MARK-LICENSE.txt](docs/assets/INTEIRO-MARK-LICENSE.txt).

### License

The software license is not declared in the current package. The INTEIRO mark's attribution and license are separate and included with the mark.

## Português (Brasil)

### O que faz

O Pi MCP Control aplica perfis locais e regras de autorização às ferramentas MCP disponíveis em uma sessão do Pi Coding Agent. O Pi continua como cliente MCP e mantém a configuração, as credenciais e as conexões dos servidores nativos. Esta extensão não cria outro cliente MCP.

O comando `/mcpc` abre um painel com componentes nativos do Pi. Ele mostra o perfil ativo, servidores alcançáveis e fora do escopo, liberações abertas e configurações da política. Fora do TUI, o comando apresenta um resumo em texto; os comandos diretos continuam disponíveis.

### Instalação

Para carregar o checkout em uma única execução do Pi, dentro do diretório da extensão:

~~~sh
pi -e ./index.ts
~~~

Para adicionar um checkout local às configurações de um projeto de destino, execute no projeto e substitua o caminho pelo local do checkout:

~~~sh
pi install /caminho/para/pi-mcp-control -l
~~~

A instalação local do Pi grava em `.pi/settings.json` do projeto de destino. Nenhum dos comandos usa o registry npm. O pacote npm é privado; este README não afirma que existe publicação ou disponibilidade no registry.

Para validar localmente, `npm test` executa a suíte unitária e `npm pack --dry-run --json` pré-visualiza os arquivos permitidos do pacote sem criar tarball ou publicar. A execução offline registrada passou em 31/31 testes unitários. Use uma árvore de dependências já instalada: o `package-lock.json` atual ainda indica `0.2.0` e não inclui uma dependência peer presente em `package.json`; um `npm ci` limpo não foi verificado aqui.

### Uso

Execute `/mcpc` sem argumentos para abrir o painel. Ele começa em inglês. Em um projeto confiável, use a linha **Idioma** para pré-visualizar inglês ou português brasileiro; Ctrl+S salva a preferência localmente para esse projeto. A preferência fica em `.pi/pi-mcp-control.locale.json`, separada da política MCP. Um projeto não confiável permanece em inglês. Use as setas para navegar, Enter para escolher, Ctrl+S para salvar alterações em rascunho e Escape para voltar ou fechar. Alterações de configuração e idioma ficam em rascunho até Ctrl+S; uma falha mantém o rascunho restante para nova tentativa. Escape em um submenu volta ao painel. Se houver mudanças não salvas, o primeiro Escape avisa e o segundo descarta. A troca de perfil continua sendo uma ação separada, aprovada e limitada à sessão; revogar um grant reduz o acesso da sessão. Para adicionar um executável ou host, escolha a mesma linha duas vezes e depois salve com Ctrl+S. A tela usa o tema e os componentes de terminal do Pi.

Comandos diretos:

~~~text
/mcpc status
/mcpc catalog
/mcpc profiles
/mcpc use PERFIL
/mcpc inspect SERVIDOR
/mcpc allow FERRAMENTA --scope task|project
/mcpc deny FERRAMENTA --scope task|project
/mcpc revoke FERRAMENTA
/mcpc health
/mcpc trace --last 20
/mcpc connect SERVIDOR
/mcpc help
~~~

`connect` só funciona para um servidor declarado em `managedServers`. `allow-exe` e `allow-host` ampliam as allowlists do projeto e exigem confirmação deliberada. Fora do TUI, operações que exigem aprovação humana falham de forma fechada.

### Configuração e estado

Em um projeto confiável, as configurações `mcpControl` são lidas de e salvas em `.pi/pi-suite.yaml`. O arquivo padrão de perfis é `.pi/mcp-profiles.yaml`; [examples/mcp-profiles.yaml](examples/mcp-profiles.yaml) mostra o formato aceito. Um projeto não confiável usa a configuração global do Pi Suite em vez de gravar configurações no projeto. A raiz global padrão é `~/.pi/agent/pi-suite`, que pode ser alterada por `PI_SUITE_HOME`.

Os padrões ativam a mediação, selecionam `developer-readonly`, perguntam sobre ferramentas desconhecidas, falham de forma fechada para mutações, usam escopo de sessão estrito `available` e expiram liberações excepcionais após 300 segundos. Uma liberação no escopo de tarefa exige uma tarefa ativa. Regras deny têm precedência sobre grants; um grant allow vale somente no escopo escolhido e não dispensa aprovação por chamada para mutações.

Registros assinados e linhas de auditoria usam armazenamento local JSON/JSONL em `~/.pi/agent/pi-suite/projects/`. Não há banco de dados. Não copie credenciais para perfis ou exemplos; a configuração MCP nativa continua nos arquivos do próprio Pi.

### Idioma

O painel começa em inglês e usa o inglês se a preferência salva for inválida ou não puder ser lida. Em um projeto confiável, a linha **Idioma** permite pré-visualizar inglês ou português brasileiro; Ctrl+S salva a escolha em `.pi/pi-mcp-control.locale.json`, somente para aquele projeto. Projetos não confiáveis permanecem em inglês. A troca do idioma do painel não traduz nomes de comandos, chaves de configuração, nomes de perfis/servidores nem valores do protocolo MCP.

### Privacidade e segurança

Ferramentas somente de leitura seguem o perfil ativo; mutações exigem aprovação humana explícita. Deny tem precedência sobre allow. A troca de perfil espera o Pi ficar ocioso, pede aprovação quando há interface e encerra grants da sessão. Ampliar a allowlist de executáveis ou hosts é uma ação de aumento de permissão e requer confirmação.

A extensão media chamadas que passam pelo pipeline de autorização MCP do Pi. Ela não é um sandbox e não cobre ferramentas de shell nem chamadas MCP feitas fora desse pipeline. Timeout e circuito são controles locais; não garantem reversão de uma operação remota que já começou. Um HMAC local detecta alterações nos registros assinados, mas não autentica contra outro processo que tenha acesso à mesma chave local.

O catálogo MCPHub opcional lê um arquivo `mcp_settings.json` previamente verificado somente após consentimento. Ele informa nomes e transportes de servidores; não instala nem conecta servidores e não presume uma API HTTP do MCPHub.

### Diagnóstico e limites

Comece por `/mcpc status`, `/mcpc profiles`, `/mcpc inspect SERVIDOR` ou `/mcpc health`. `/mcpc trace --last 20` mostra decisões locais recentes de autorização. Consulte o [exemplo de perfis](examples/mcp-profiles.yaml) e as [notas de validação](docs/VALIDACAO.md).

O manifesto declara `npm run smoke` como `node scripts/smoke-panel.mjs`, mas esse arquivo não existe neste checkout. O script não foi executado; o smoke Pi 1.4.0 registrado separadamente usou o loader e o TUI reais com um host sintético offline. Esse smoke não fez chamada a servidor MCP, provedor, modelo ou rede.

O repositório ainda não declara licença de software em `package.json` nem fornece um arquivo `LICENSE`. Confirme a licença do software com os mantenedores antes de redistribuir. A marca INTEIRO tem aviso separado em [docs/assets/INTEIRO-MARK-LICENSE.txt](docs/assets/INTEIRO-MARK-LICENSE.txt).

### Licença

A licença do software não está declarada no pacote atual. A atribuição e a licença da marca INTEIRO são separadas e acompanham a marca.
