# Ferramentas

O harness não publica o Git MCP: cada cliente inicia o servidor local na raiz do projeto. Jenkins e design vêm do MCPHub conforme os arquivos MCP do próprio repositório; memória é servida pelo ai-memory separado.

| Necessidade | Onde |
| --- | --- |
| Lista de projetos, caminho, comando, job | `harness inventory` e `harness.yaml` |
| Branch e árvore | `harness status` |
| Diagnóstico | `harness doctor` |
| Padronização em lote | `harness structure list`, depois `apply` sem `--write` |
| Git do projeto aberto | MCP local configurado em `.mcp.json` (Claude), `.cursor/mcp.json`, `.pi/mcp.json` e `.codex/config.toml` |
| Jenkins e design do harness | MCPHub `endpoint de desenvolvimento do MCPHub definido na configuração local do projeto` |
| Ferramentas de produto | MCPHub `endpoint de design do MCPHub definido na configuração local do projeto` (somente INTEIRO) |
| Jenkins no repositório Jenkies | MCPHub `endpoint Jenkins do MCPHub definido na configuração local do projeto` (somente Jenkins) |
| Memória | ai-memory `servidor ai-memory definido no contrato local do projeto`, fora do MCPHub |

## Ordem

1. Inventário, para saber o projeto.
2. Leitura (status, testes, console) antes de escrita.
3. Confirmação antes de build, deploy, push ou merge.

## Sinais

- Árvore suja: resolva antes de abrir ou finalizar branch.
- `skipped-unmanaged`: o arquivo tem conteúdo do usuário; não sobrescreva sem autorização.
