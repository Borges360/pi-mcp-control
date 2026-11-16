---
name: "harness-ci-jenkins"
description: "Operar o Jenkins do homelab e as esteiras por projeto: listar jobs, disparar build, acompanhar status, ler console e publicar pipelines. Use quando o usuário mencionar Jenkins, Jenkinsfile, pipeline, deploy, CI, CD, build, job, esteira, hostinger-agent, ou publicar/atualizar pipeline."
---
<!-- harness-managed -->
# CI/CD com Jenkins

O Jenkins do homelab roda no cluster k3s (`jenkins.lab`), namespace `platform`.
Os jobs nascem do repositório `homelab/jenkins` (Gitea), sincronizado pelo
Deployment `jenkins-pipeline-sync`. O catálogo local fica em
`jenkies/pipelines/catalog.json`.

## Onde está o quê

- Esteiras de desenvolvimento: `deploy-<projeto>-dev.Jenkinsfile`, namespace `dev`.
- Deploys Hostinger: `deploy-sistemalux.Jenkinsfile` e `deploy-publishsys.Jenkinsfile`,
  agente `hostinger-agent`, porta SSH 65002.
- Fonte do Dockerfile de build: ConfigMaps (`<projeto>-dockerfile`).
- Segredos: Secret `platform/jenkins-lab-credentials` (JCasC). Nunca literal.

## Regras

- `DRY_RUN` não altera o servidor remoto; a primeira execução de um job recriado
  só aceita `DRY_RUN=true`.
- Falha de teste bloqueia publicação e deploy. `SKIP_TEST` só é aceito com `DRY_RUN=true` para diagnóstico.
- Jenkies é a fonte canônica da orquestração; comandos e testes ficam no produto.
- Use identidade por projeto e ambiente. O catálogo declara `deployment`; não amplie um Role compartilhado para incluir um produto novo.
- Nunca escreva segredo em Jenkinsfile, log ou `environment`.
- Disparar build e publicar pipeline são escrita: confirme com a pessoa antes.
- Use o MCP de Jenkins já conectado no hub. O job e a URL estão no inventário.

## Fluxo

1. No MCP de Jenkins do hub, localize o job declarado no inventário.
2. Resolva `pipelines[].sourceProject/file` no inventário e leia o Jenkinsfile canônico no Jenkies.
3. Status e console são leitura.
4. Propor a alteração; aplicar com confirmação.

Leia `references/jobs.md` para o mapa de jobs e `procedures/change-pipeline.md`
antes de alterar qualquer Jenkinsfile.

Validação declarativa (`jenkins_validate_pipeline`) verifica somente sintaxe;
build com testes e validação no ambiente continuam necessários. HTTP 401 ou
indisponibilidade são impedimentos, nunca aprovação. Consulte
`jenkies/docs/JENKINS-IDENTITIES.md` para a migração de identidades.
