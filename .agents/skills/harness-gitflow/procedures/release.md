# Procedimento: release

1. `harness gitflow audit --target <id>` — `develop` contém `main` e a árvore está limpa.
2. `harness gitflow ensure --type release --name <versão>` (ou `release/<versão>` a partir de `develop`).
3. Rode os testes do projeto e `harness doctor`; `harness release plan` prevê a versão.
4. Atualize CHANGELOG e a versão no arquivo nativo da stack.
5. PR `release/<versão>` → `main` e retorno a `develop`. Merge, tag e push só com pedido explícito.

## Critério de aceite

Release criado da base correta, testes verdes, CHANGELOG/versão atualizados e nenhum
push, tag ou merge em `main` feito pelo agente sem pedido.
