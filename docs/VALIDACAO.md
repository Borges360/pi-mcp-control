# Validação da suíte v0.2.0

## Evidência local

Ambiente executado: Windows, Node 24.14.0, Pi 1.1.0.

| Pacote | Testes passando |
| --- | ---: |
| pi-model-economist | 13 |
| pi-acceptance-gate | 10 |
| pi-loop-guard | 6 |
| pi-cost-profiler | 7 |
| pi-mcp-control | 5 |
| Total | 41 |

Comando em cada diretório: `npm test` (`node --test`).

No diretório pi-cost-profiler:

```sh
node scripts/smoke-pi.mjs /caminho/instalado/pi-coding-agent/dist/cli.js
node scripts/smoke-dispatch.mjs /caminho/instalado/pi-coding-agent/dist/cli.js
```

Resultados:

```json
{"piStartup":"passed","commands":["economist","gate","guard","cost","mcpc"],"providerCalls":0}
{"nativeDispatch":"passed","billingPrecedence":"passed","hardBudgetBeforeDispatch":"passed","remoteCalls":0}
```

O primeiro teste inicializa os cinco pacotes juntos no runtime real em RPC, sem prompt de modelo. O segundo usa um provedor local determinístico, pelo dispatch real do Pi, para verificar contabilidade e negação preventiva. Nenhum deles faz chamada remota/paga.

## Fronteiras da validação

- Jev e small-LLM: adaptadores testados com doubles, JSON inválido, indisponibilidade, timeout e redação. Não houve autenticação/cobrança real nestes testes.
- MCP: autorização, trust, limites, precedência, URLs, stdio e nested calls testados localmente. Servidores remotos de produção não foram acionados.
- MCPHub local: esquema `mcp_settings.json` confirmado por inspeção de metadados (`mcpServers`, 3 entradas). Adaptador de arquivo, com consentimento, sem supor uma API HTTP não verificada.
- Benchmark: replay reproduzível de registros medidos fornecidos, não uma campanha paga com 60–100 tarefas. Não há alegação de economia medida.
- CI Windows/Linux e Node 20/22/24: workflow criado; não executado remotamente nesta sessão.
- Verificadores Maven/Gradle/Go/infra dependem dos executáveis e contratos reais do projeto. Testes locais de processo/checkers usaram Node.

## Armazenamento

Exclusivamente JSON/JSONL, arquivos protegidos de assinatura e exports atômicos. Nenhum banco de dados, driver SQL, SQLite, serviço de banco ou ORM. Coleções têm schemaVersion e recusa de versões incompatíveis. Falhas de política são fail-closed; falhas de observabilidade informativa são reportadas sem fabricar métricas.

HMAC local detecta adulteração; não substitui isolamento do SO ou autenticação de uma organização. O mesmo vale para regex/hints MCP e estimativas de orçamento: limitações específicas estão nos READMEs.
