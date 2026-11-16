# Política de branches

## Nomes

- `feature/<slug>` — slug em minúsculas, `-` como separador (`codex/` é prefixo adicional).
- `release/<semver>` — ex.: `release/1.4.0`.
- `hotfix/<slug>`.

Normalização aplicada pelo harness: espaços viram `-`, caracteres fora de
`[A-Za-z0-9._/-]` viram `-`, hífens repetidos colapsam, bordas são removidas.
Nomes com `..` ou terminando em `.lock` são rejeitados.

## Bases e integração

| Tipo | Base | Integração |
| --- | --- | --- |
| feature | develop | PR → develop |
| release | develop | PR → main e retorno a develop |
| hotfix | main | PR → main e retorno a develop |

O workflow `gitflow.yml` (templates/workflows) recusa PR fora dessa tabela,
commits fora de Conventional Commits e qualquer workflow com deploy, aplicação de
infraestrutura, publicação de pacote ou credencial de deploy.

## FORK (`gitflow-upstream`)

`main` = espelho do `upstream` (sem commit próprio; `harness gitflow audit` mede
`mainOwnCommits`). `develop` nasce de `main`; trabalho próprio em `feature/`. A
publicação vai só para `publishRemote` do usuário; se ele não existir (ou for o
upstream), nada é publicado.

## Proteção remota

`main` e `develop`: PR obrigatório, sem force-push e sem exclusão; `enforce_admins`
falso preserva o break-glass humano. Reversão GitHub: `gh api -X DELETE
repos/<owner>/<repo>/branches/<branch>/protection`. Gitea: regra por branch com
push direto desligado e merge só pela conta humana; prova por regra-sonda.

## Publicação

`apply --push` publica apenas `develop` ausente e `feature/gitflow-workflows`.
Tag, release, merge e push em `main` continuam exigindo pedido explícito.
