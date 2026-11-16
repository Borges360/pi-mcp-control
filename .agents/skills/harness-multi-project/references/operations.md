# Operações estruturais

Cada operação em `harness.yaml` tem:

| Campo | Significado |
| --- | --- |
| `id` | identificador estável |
| `template` | arquivo em `templates/structural/` ou `templates/workflows/` (relativo ao harness) |
| `target` | caminho no projeto |
| `appliesTo` | ids de projeto (`*` = todos, exceto `standardization: false`) |
| `mode` | `copy` (padrão) ou `managed-block` |
| `overwrite` | permite sobrescrever arquivo existente |

Placeholders: `{{project}}`, `{{name}}` e `__DEPLOY_GUARD_PATTERN__` (padrão único de
`packages/core/ci.mjs`).

## Status possíveis

- `would-create` / `written`
- `would-overwrite` / `updated-block`
- `skipped-exists` — arquivo já existe, sem overwrite
- `missing-template` — template ausente no harness
- `missing-path` / `unknown-project` — inventário inconsistente
- `excluded-by-operator` — projeto fora da padronização de arquivos

## `harness gitflow apply`

Por projeto: `develop` (criada de `main` se ausente), `hook` (installed, chained,
already-installed, versioned-hooks-path), `workflows` (created, updated,
already-current; itens create/update-managed/preserve-custom/unchanged) e, com
`--push`, `push-develop`/`push-workflows` (pushed, exists-remote, already-remote,
failed, remote-unreachable). `pending` lista o que exige humano ou outro efeito.

## Adicionar uma operação

1. Crie o template em `templates/structural/<id>` (ou `templates/workflows/`).
2. Declare a operação em `harness.yaml` sob `structural.operations`.
3. `harness structure list` para validar e `harness structure apply --operations <id>` (dry-run).
