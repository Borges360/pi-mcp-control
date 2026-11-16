# Operações estruturais

Cada operação em `harness.yaml` tem:

| Campo | Significado |
| --- | --- |
| `id` | identificador estável |
| `template` | arquivo em `templates/structural/` (relativo ao harness) |
| `target` | caminho no projeto |
| `appliesTo` | ids de projeto |
| `mode` | `copy` (padrão) ou `managed-block` |
| `overwrite` | permite sobrescrever arquivo existente |

Placeholders no template: `{{project}}` e `{{name}}`.

## Status possíveis

- `would-create` / `written`
- `would-overwrite` / `updated-block`
- `skipped-exists` — arquivo já existe, sem overwrite
- `missing-template` — template ausente no harness
- `missing-path` / `unknown-project` — inventário inconsistente

## Adicionar uma operação

1. Crie o template em `templates/structural/<id>`.
2. Declare a operação em `harness.yaml` sob `structural.operations`.
3. Rode `harness structure list` para validar.
4. `harness structure apply --operations <id> --dry-run`.
