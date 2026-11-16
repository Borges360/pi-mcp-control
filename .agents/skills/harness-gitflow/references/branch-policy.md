# Política de branches

## Nomes

- `feature/<slug>` — slug em minúsculas, `-` como separador.
- `release/<semver>` — ex.: `release/1.4.0`.
- `hotfix/<slug>`.

Normalização aplicada pelo harness: espaços viram `-`, caracteres fora de
`[A-Za-z0-9._/-]` viram `-`, hífens repetidos colapsam, bordas são removidas.
Nomes com `..` ou terminando em `.lock` são rejeitados.

## Bases

| Tipo | Base | Alvo do finish |
| --- | --- | --- |
| feature | develop | develop |
| release | develop | develop (e main em release real) |
| hotfix | main | main |

## Publicação

Este harness **não publica**. Push, PR, tag e merge remoto são ações humanas
explícitas. O MCP apenas prepara o estado local e reporta.
