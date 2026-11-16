---
name: "harness-design-system"
description: "Trabalhar com um design system explicitamente selecionado: consultar tokens, auditar drift e verificar integridade. Use quando o usuário pedir uma tarefa de design system, tokens, tema, cores ou acessibilidade visual; não infira adoção de metadados ou dependências."
---
<!-- harness-managed -->
# Design system

O projeto fonte e os clientes disponíveis são os declarados no `harness.yaml`.
Selecione o projeto e a superfície antes da consulta. Metadados ou dependências
herdadas não comprovam adoção nem autorizam aplicar uma identidade visual.

## Operações

Use a integração declarada para o projeto fonte apenas quando a tarefa pedir
essa superfície. Uma regra ou skill instalada não concede permissão de vínculo.

## Regras

- Mudança de token acontece na fonte declarada, nunca no consumidor. Atualize
  artefatos derivados conforme o procedimento da fonte selecionada.
- Prefira os tokens da superfície adotada a valores literais.
- Antes de alterar um consumidor, confirme a adoção explícita e se o token certo
  existe na fonte selecionada.
- Auditoria é heurística: reporte-a como sinal, não como veredito.

## Fluxo

1. Confirme projeto e superfície selecionados.
2. Consulte status e integridade pela integração declarada.
3. Audite apenas o projeto alvo autorizado.
4. Só altere vínculo com autorização explícita para esse projeto e superfície.
5. Corrija drift dentro de uma branch de trabalho, com testes visuais quando houver.

Leia `references/drift.md` para interpretar o `driftScore`.
