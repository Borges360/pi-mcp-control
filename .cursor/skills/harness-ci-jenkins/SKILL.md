---
name: "harness-ci-jenkins"
description: "Operar integrações Jenkins declaradas por projeto: consultar jobs e pipelines, diagnosticar CI e planejar mudanças. Use para Jenkins, Jenkinsfile, pipeline, CI, CD, build ou deploy. Mudanças e operações remotas seguem autorização específica."
---
<!-- harness-managed -->
# CI/CD com Jenkins

Use `harness.yaml` para resolver a integração, o job, a finalidade e o arquivo
de pipeline de cada projeto. Leia o catálogo no repositório responsável pela
orquestração. Esta skill compartilhada não replica hostnames, identidades,
recursos, credenciais ou a lista de produtos.

## Onde está o quê

- Pipeline e destino: `pipelines[]` do projeto no inventário.
- Fonte canônica da orquestração: repositório indicado no inventário.
- Testes e comandos de build: repositório do produto.

## Regras

- `DRY_RUN` não altera o servidor remoto; a primeira execução de um job recriado
  só aceita `DRY_RUN=true`.
- Falha de teste bloqueia publicação e deploy. `SKIP_TEST` só é aceito com `DRY_RUN=true` para diagnóstico.
- O repositório de orquestração declarado no inventário é a fonte canônica; comandos e testes ficam no produto.
- Use identidade por projeto e ambiente. O catálogo declara `deployment`; não amplie um Role compartilhado para incluir um produto novo.
- Nunca escreva segredo em Jenkinsfile, log ou `environment`.
- Consulta de job/console é leitura. Disparar build, publicar pipeline ou fazer deploy exige autorização específica para o efeito e destino; autorização local não cobre essas ações.
- Use somente a integração já configurada e a identidade do projeto; não tente obter ou ampliar credenciais por esta skill.
- `harness ci audit` mostra o perfil de CI da stack e quais gates obrigatórios
  existem. Gate ausente, script inexistente no `package.json` ou stack estática
  nunca contam como aprovado; corrija no produto, não relaxe o perfil.

## Fluxo

1. Localize a integração e o job declarados no inventário.
2. Resolva `pipelines[].sourceProject/file` e leia o Jenkinsfile canônico no repositório indicado.
3. Status e console são leitura.
4. Propor uma alteração; aplicar somente dentro da autorização vigente.

Leia `references/jobs.md` para o mapa de jobs e `procedures/change-pipeline.md`
antes de alterar qualquer Jenkinsfile.

Validação declarativa (`jenkins_validate_pipeline`) verifica somente sintaxe;
build com testes e validação no ambiente continuam necessários. Erro de sessão,
autenticação ou indisponibilidade é impedimento, nunca aprovação. Não tente
resolver com nova credencial ou ampliação de privilégio sem decisão específica.
