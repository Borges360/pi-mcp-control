---
name: "harness-gitflow"
description: "Aplicar o gitflow padronizado do harness: abrir feature/release/hotfix a partir da base correta, verificar pré-condições e finalizar branches localmente sem publicar. Use quando o usuário pedir para criar branch, iniciar tarefa versionada, preparar release, corrigir produção, revisar conformidade de branches, ou quando qualquer trabalho for alterar conteúdo versionado de um repositório."
---
<!-- harness-managed -->
# Gitflow padronizado

Git Flow é o modelo de TODOS os projetos do inventário (decisão fechada; não
substituir por porte, stack ou ciclo de release): `main` (estável/produção),
`develop` (integração), `feature/`, `release/` e `hotfix/`. Configuração em
`config/defaults.yaml` (`gitflow`) com override por projeto em `harness.yaml`.

- FORK: `strategy: gitflow-upstream`. `main` acompanha o remote `upstream` sem
  commit próprio; o trabalho do usuário entra por `develop`/`feature/`. PR só no
  fork do usuário (`publishRemote`), nunca no upstream de terceiros. O valor
  histórico `strategy: upstream` é lido como `gitflow-upstream`.
- `estudo` está no universo do Git Flow, embora fora da padronização de arquivos.
- `codex/` é prefixo adicional de feature (`featurePrefixes`); não substitui as famílias.
- Diagnóstico local não comprova proteção remota nem checks obrigatórios.

## Ciclo

- Implementação: `feature/<nome>` a partir de `develop`, PR para `develop`.
- Versão: `release/<versão>` a partir de `develop`, PR para `main` e retorno a `develop`.
- Correção de produção: `hotfix/<nome>` a partir de `main`, PR para `main` e retorno a `develop`.
- `develop` precisa conter `main`; divergência vira PR `main → develop`.

## Comandos

- `harness gitflow audit [--target id]` — bases, ancestralidade, hook, upstream do FORK.
- `harness gitflow ensure` — no workspace, sai de `main`/`develop` para `feature/`.
- `harness gitflow apply [--target ids] [--write] [--push]` — cria `develop` a
  partir de `main` (`git branch`, sem trocar checkout), instala o hook local
  (encadeia hook existente em `pre-commit.harness-chained`) e grava
  `feature/gitflow-workflows` por plumbing (índice temporário; árvore e índice do
  usuário intocados). `--push` publica `develop` só se ausente (= `main` remota) e a
  branch de workflows, sem force e nunca em `main`. Hook `pre-push` do produto é respeitado.
- `harness gitflow protect|pr|checks [--write]` — proteção de `main`/`develop`
  (PR obrigatório, sem force-push/exclusão, `enforce_admins=false`), PR rascunho
  para `develop` e checks do PR, pelo `gh` autenticado do usuário. Sem `gh`, o
  resultado é o pacote de comandos e reversão; Gitea fica para o operador.

## Guardas inegociáveis

- `startBranch` recusa árvore suja; `ensureWorkingBranch`/hook levam a árvore para a branch nova.
- Finalizar faz merge `--no-ff` local e pede confirmação. Não rode sem pedido.
- Nunca push forçado, rebase de histórico publicado, tag, exclusão remota ou merge
  em `main` sem pedido explícito. Não use `--no-verify` para contornar hook.
- Hook local não comprova bloqueio de push remoto: proteção no host tem prova própria.

Leia `references/branch-policy.md` (nomes, bases, proteção) e `procedures/release.md`.
