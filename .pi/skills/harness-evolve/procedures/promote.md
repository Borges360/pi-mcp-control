# Procedimento: promover uma proposta

1. `harness evolve` e escolha uma proposta com evidência suficiente.
2. A branch `feature/` abre sozinha se o trabalho começar em `main` ou `develop`.
3. Implemente a menor mudança que resolve:
   - nova entrada em `harness.yaml`;
   - novo template em `templates/structural/`;
   - ajuste de skill.
4. Atualize `CHANGELOG.md` do harness e a doc relevante.
5. `node --test` e `harness doctor`.
6. Merge local só com confirmação. Sem push.

## Critério de aceite

A mudança reduz o atrito medido, não quebra nenhum gate e está documentada.
