---
name: "harness-evolve"
description: "Evoluir o próprio harness a partir do uso: ler observações, detectar padrões (projetos mais usados, ferramentas frequentes, falhas recorrentes) e propor melhorias de skills, atalhos e gates. Use no fim de ciclos de trabalho, ao revisar o harness, quando o usuário perguntar 'o que aprendemos', 'como melhorar o harness', 'quais padrões aparecem', ou após uma falha repetida."
---
<!-- harness-managed -->
# Evoluir o harness

O harness registra observações em `.harness/observations.jsonl` (append-only).
`harness evolve` agrega e propõe melhorias. O harness **propõe**; o humano decide e edita `harness.yaml`.

## Sinais que geram proposta

- Projeto com muitas operações → merece atalho ou skill própria.
- Ferramenta muito chamada → cache, atalho ou skill dedicada.
- Muitas falhas por árvore suja → endurecer o gate de gitflow.
- Comando repetido fora do inventário → adicionar a `commands`.

## Fluxo

1. `harness evolve` para ver resumo e propostas.
2. Revise cada proposta; aceite, adapte ou descarte com o usuário.
3. Implemente a mudança em `harness.yaml` ou nas skills.
4. Registre a decisão na memória do hub, se ela estiver conectada.
5. Valide com `harness doctor` e `node --test`.

## Limites

- Nunca afrouxe um gate de segurança para reduzir atrito.
- Não promova uma proposta com base em poucas amostras.
- Metadados de uso não carregam segredo; não registre conteúdo sensível.

Leia `procedures/promote.md` para o ciclo de promoção de uma proposta.
