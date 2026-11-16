---
name: "harness-multi-project"
description: "Aplicar mudanças estruturais padronizadas em vários repositórios ao mesmo tempo (.editorconfig, .gitattributes, workflow de CI, bloco de AGENTS.md) e auditar divergências entre projetos. Use quando o usuário pedir para padronizar, propagar, aplicar em todos os projetos, manter consistência, atualizar CI de todos, ou criar/alterar arquivos que devem existir em vários repositórios."
---
<!-- harness-managed -->
# Mudança multi-projeto

Dois mecanismos, ambos com dry-run por padrão:

- `harness structure apply` — operações de arquivo declaradas em
  `harness.yaml` (`structural.operations`), escritas na árvore do projeto.
- `harness gitflow apply` — Git Flow e `.github/workflows/` por stack, gravados
  numa branch `feature/gitflow-workflows` por plumbing, sem tocar árvore/índice.

## Workflows por stack (REQ-GIT-04)

Templates em `templates/workflows/`: `secrets.yml` (gitleaks), `gitflow.yml`
(contribuição Git Flow + guarda sem deploy) e `config-<stack>.yml` (lint de
configuração: node, php-laravel, php-hybrid, java-maven, java-node, dotnet, infra,
docs). GitHub Actions cobre só segurança, configuração e contribuição; build,
suítes funcionais e deploy ficam no Jenkins (tarefa 06). Reconciliação por diff:
cria o ausente, atualiza o gerenciado (`harness:managed`) ou a cópia idêntica ao
template legado e preserva workflow personalizado. `harness ci workflows` falha se
qualquer workflow fizer deploy ou aplicar infraestrutura.

## Regras

- Dry-run primeiro e registre o plano (arquivo → ação por projeto).
- Autorização local vigente que cobre alvos e operação: prossiga sem repetir a
  pergunta; peça decisão só para escopo novo ou efeito remoto não autorizado.
- `skipped-exists`/`preserve-custom`: o arquivo é do produto; respeite.
- `managed-block` só substitui o trecho entre `<!-- harness:start -->` e `<!-- harness:end -->`.
- Leia os `guardrails` do projeto antes de alterar.
- Não commite em `main`/`develop`; árvore suja do usuário não é limpa nem stashada.
- FORK preserva workflows do upstream (sem `config.yml`); `estudo` recebe Git Flow,
  não a padronização de arquivos.

## Fluxo

1. `harness structure list` / `harness gitflow apply` sem `--write`.
2. Revise o relatório e `appliesTo`; preserve o trabalho existente.
3. Aplique com `--write` (e `--push` só quando a publicação estiver autorizada).
4. Rode `harness gitflow audit`, `harness ci workflows` e `harness baseline audit` depois.
5. PR por projeto (`harness gitflow pr`); prova de execução no host com `harness gitflow checks`.

Leia `references/operations.md` para o contrato de cada operação.
