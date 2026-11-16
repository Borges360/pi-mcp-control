---
name: "harness-multi-project"
description: "Aplicar mudanças estruturais padronizadas em vários repositórios ao mesmo tempo (.editorconfig, .gitattributes, workflow de CI, bloco de AGENTS.md) e auditar divergências entre projetos. Use quando o usuário pedir para padronizar, propagar, aplicar em todos os projetos, manter consistência, atualizar CI de todos, ou criar/alterar arquivos que devem existir em vários repositórios."
---
<!-- harness-managed -->
# Mudança multi-projeto

Mudanças que devem valer em todos os repositórios são declaradas como operações
em `harness.yaml` (`structural.operations`) e aplicadas por
`harness structure apply`. Sem `--write`, o comando só mostra o plano.

## Regras

- Sempre `dryRun=true` primeiro e apresente o plano (arquivo → ação por projeto).
- `skipped-exists` significa que o arquivo já existe e `overwrite=false`: respeite.
- `managed-block` só substitui o trecho entre `<!-- harness:start -->` e
  `<!-- harness:end -->`; o resto do arquivo é do usuário.
- Nunca altere um projeto sem ler os `guardrails` dele.
- Mudança estrutural abre branch por projeto (`feature/`) — não commite direto.

## Fluxo

1. `harness structure list` para ver operações disponíveis.
2. `harness structure apply --operations ...` sem `--write`.
3. Revise o relatório; ajuste `appliesTo` se necessário.
4. Abra `feature/` em cada projeto afetado.
5. `harness structure apply --operations ... --write`.
6. Rode os testes declarados no inventário dos projetos alterados.
7. Commit por projeto; abra PR. Não publique sem pedido.

Leia `references/operations.md` para o contrato de cada operação.
