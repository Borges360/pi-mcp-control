# Ferramentas

Git usa o CLI local do projeto aberto e o gitflow do harness. Jenkins e design vêm do MCPHub conforme os arquivos MCP do próprio repositório; memória é servida pelo ai-memory separado.

| Necessidade | Onde |
| --- | --- |
| Lista de projetos, caminho, comando, job | `harness inventory` e `harness.yaml` |
| Branch e árvore | `harness status` |
| Diagnóstico | `harness doctor` |
| Padronização em lote | `harness structure list`, depois `apply` sem `--write` |
| Git do projeto aberto | CLI local (`git`) e gitflow do harness |
| Jenkins e design | Integração e escopo declarados na configuração MCP do projeto |
| Ferramentas de produto | Configuração MCP do produto; use apenas a superfície selecionada |
| Memória | Servidor e escopo resolvidos pelo contrato do projeto e `.ai-memory.toml` |

## Ordem

1. Inventário, para saber o projeto.
2. Leitura (status, testes, console) antes de escrita.
3. Build remoto, deploy, push, merge ou publicação só com autorização específica para o destino e efeito; o pedido que os nomeia é essa autorização, sem nova confirmação.

## Sinais

- Árvore suja: resolva antes de abrir ou finalizar branch.
- `skipped-unmanaged`: o arquivo tem conteúdo do usuário; não sobrescreva sem autorização.

Não inclua endereços de serviço, nomes de credenciais ou rotas internas nesta
referência compartilhada. Leia a configuração do projeto quando a tarefa exigir
uma conexão. Memória usa escopo do projeto por padrão; `global` e `profile`
precisam de escolha explícita.
