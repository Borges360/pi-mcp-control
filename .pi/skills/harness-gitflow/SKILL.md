---
name: "harness-gitflow"
description: "Aplicar o gitflow padronizado do harness: abrir feature/release/hotfix a partir da base correta, verificar pré-condições e finalizar branches localmente sem publicar. Use quando o usuário pedir para criar branch, iniciar tarefa versionada, preparar release, corrigir produção, revisar conformidade de branches, ou quando qualquer trabalho for alterar conteúdo versionado de um repositório."
---
<!-- harness-managed -->
# Gitflow padronizado

Modelo único para todos os projetos: `main` (produção), `develop` (integração),
`feature/`, `release/` e `hotfix/`. A configuração por projeto está no inventário
(`gitflow`), com `allowDirectPushToMain: false` por padrão.
Exceção aprovada: forks com `strategy: upstream` preservam o fluxo upstream.
Prefixos adicionais como `codex/` só valem quando declarados em `featurePrefixes`.
O diagnóstico local não comprova proteção remota nem checks obrigatórios.

## Ciclo

- Implementação comum: `feature/<nome>` a partir de `develop`.
- Preparação de versão: `release/<versão>` a partir de `develop`.
- Correção urgente de produção: `hotfix/<nome>` a partir de `main`.
- Neste repositório, edição com HEAD em `main` ou `develop` abre `feature/auto-<instante>` sozinha (`harness gitflow ensure`, `hooks/pre-commit` e o hook do Cursor). Não há push.

## Guardas inegociáveis

- Recusa árvore de trabalho suja ao abrir branch por `startBranch`. O modo automático (`ensureWorkingBranch`) leva a árvore suja para a branch nova, porque a alteração já começou.
- Recusa nome inválido e branch já existente.
- Finalizar faz merge `--no-ff` local e pede confirmação. Não rode isso sem pedido.
- Nunca push, rebase, tag, exclusão remota ou merge em `main` sem pedido explícito.

## Fluxo

1. `harness status` — veja a branch e se a árvore está limpa.
2. `harness gitflow ensure` se ainda estiver em `main` ou `develop`.
3. Trabalho, commits pequenos, já na branch de trabalho.
4. Merge local só depois de revisão e com confirmação explícita.

Leia `references/branch-policy.md` para regras de nome e `procedures/release.md`
para o ciclo de release.
