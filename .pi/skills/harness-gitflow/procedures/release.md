# Procedimento: release

1. `harness status` — `develop` limpo.
2. `harness gitflow ensure --type release --name <versão>`.
3. Rode os testes do projeto e `harness doctor`.
4. Atualize CHANGELOG e a versão.
5. Merge `--no-ff` em `develop` só com confirmação. Não faça push nem tag.

## Critério de aceite

Release criado, testes verdes, CHANGELOG atualizado e nenhum push feito pelo agente.
