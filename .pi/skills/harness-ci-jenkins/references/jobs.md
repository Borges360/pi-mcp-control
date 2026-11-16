# Mapa de jobs

| Job | Projeto | Namespace | Observação |
| --- | --- | --- | --- |
| `ids-dev` | IDS | dev | build + testes + deploy (ids.lab) |
| `sistemalux-dev` | sistemalux | dev | build + phpunit + scripts de banco + rollout |
| `interview-dev` | interview | dev | PostgreSQL; `RUN_DB_SCRIPTS` |
| `review-recorder-dev` | review-recorder | dev | build + testes |
| `ai-memory-dev` | ai-memory | dev | UI + deploy (memory.lab/web) |
| `revisor-dev` | revisor | dev | build + testes (.NET) |
| `publishsys-dev` | publishsys | dev | build + deploy |
| `clareza-dev` | clareza | dev | build + deploy |
| `mcphub-dev` | mcphub | dev | espelho da imagem upstream + deploy; adaptadores têm testes próprios |
| `lume-dev` | lume | dev | Java, frontend e deploy |
| `conhecerse-dev` | conhecerse | dev | Java, frontend, scans, migrações e deploy |
| `openbao-dev` | openbao | platform | espelho de imagem; não reinicia o cofre |
| `openbao-mcp-dev` | openbao | platform | testes com cofre efêmero + imagem; sem deploy automático |
| `deploy-publishsys` | publishsys | Hostinger | agente hostinger-agent |
| `deploy-sistemalux` | sistemalux | Hostinger | Teste/Homologação/Produção |

Catálogo canônico: `jenkies/pipelines/catalog.json`. Caminhos por produto em
`harness.yaml`, `pipelines`. Uma lista estática não comprova revisão publicada.

Comandos úteis (via MCPHub configurado no projeto):

- `jenkins_job` — último build e histórico.
- `jenkins_build_status` — número, resultado, duração.
- `jenkins_console` — últimas linhas do log.
- `jenkins_validate_pipeline` — sintaxe declarativa local contra o controller;
  exige adapter atualizado e autenticação válida, sem publicar ou disparar build.
