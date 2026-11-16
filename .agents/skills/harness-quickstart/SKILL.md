---
name: "harness-quickstart"
description: "Criar um novo projeto dentro dos padrões do harness: estrutura de diretórios, package.json, README, AGENTS.md, .editorconfig, .gitattributes, registro no inventory e instalação de skills. Use quando o usuário pedir para iniciar/criar/bootstrapar um projeto novo, padronizar um repositório vazio, ou quando um diretório novo precisar entrar no harness."
---
<!-- harness-managed -->
# Quick-start de projeto

`harness quickstart --id <id> --kind <stack>` renderiza `templates/stacks/<stack>`
(+ `_common`), registra a entrada em `harness.yaml` com a versão do template
(`# template: <stack>@<versão> (sha …)`), inicia Git Flow (`main` com commit inicial
vazio, `develop` e `feature/initial-scaffold`), instala o hook e o contrato
`.harness`. Sem `--write`, só mostra o plano.

Stacks: `node`, `pi-extension`, `php-laravel`, `php-hybrid` (alias
`php-node-hybrid`), `java-maven`, `dotnet`, `infra`. Outra stack é recusada com
mensagem explícita. Cada template traz comandos nativos, testes, AGENTS mínimo com
referência ao workspace, `.ai-memory.toml` sem segredo, `.gitignore` que mantém o
contrato `.harness` rastreado e `.github/workflows/` sem build/deploy.

## Passos

1. Resolva pelo contexto `id`, `name`, `path`, stack e destino; pergunte só o que faltar.
2. `harness quickstart --id <id> --kind <stack>` e revise o plano.
3. Aplique com `--write` sob a autorização vigente.
4. Rode o ciclo nativo indicado no README do projeto (o lockfile Composer nasce no `composer install`).
5. Primeiro commit em `feature/initial-scaffold` (o harness não commita os arquivos por você).
6. `harness install --runtime pi,cursor,claude --target <id>` para os demais clientes.
7. `harness baseline audit --target <id>` e `harness doctor`.

## Garantias

- Colisão de ID/caminho, link no caminho e destino com conteúdo alheio são recusados sem escrita.
- Retomada: rodada interrompida é recompletada só com arquivos ausentes; conteúdo
  idêntico ao template é aceito; segunda invocação equivalente é no-op.
- Falha reverte inventário e remove só o que o próprio run criou.
- Sem branding INTEIRO; design system só com `--design-system` explícito.
- Repositório remoto, proteção, job Jenkins e memória remota não são criados aqui.

Leia `references/conventions.md` para a lista completa.
