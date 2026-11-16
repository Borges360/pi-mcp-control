---
name: "harness-quickstart"
description: "Criar um novo projeto dentro dos padrões do harness: estrutura de diretórios, package.json, README, AGENTS.md, .editorconfig, .gitattributes, registro no inventory e instalação de skills. Use quando o usuário pedir para iniciar/criar/bootstrapar um projeto novo, padronizar um repositório vazio, ou quando um diretório novo precisar entrar no harness."
---
<!-- harness-managed -->
# Quick-start de projeto

O comando `harness quickstart` cria o esqueleto padrão e registra o projeto
diretamente na seção `projects` de `harness.yaml`.
Sem `--write`, o comando só mostra o plano.

## Passos

1. Confirme com o usuário: `id`, `name`, `path`, `kind`, `remote`.
2. `harness quickstart --id <id>` e apresente o plano.
3. Repita com `--write`.
4. `git init` + primeiro commit (o harness não commita por você).
5. Crie `main` e `develop` localmente, sem push.
6. `harness install --runtime <runtime> --target <id> --write`.
7. `harness doctor` para confirmar que o projeto entrou no inventário.

## Convenções obrigatórias

- `id` em `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- `AGENTS.md` na raiz como arquivo canônico de agentes.
- `commands` no fragmento de inventory (install, test, build, dev).
- `.editorconfig` e `.gitattributes` desde o primeiro commit.
- Segredos fora do git (`.env` no `.gitignore`).

Leia `references/conventions.md` para a lista completa.
