---
name: "harness-design-system"
description: "Trabalhar com o design system INTEIRO (IDS): consultar tokens, auditar drift de cores/estilos hardcoded, vincular um projeto ao MCP do design system e verificar integridade. Use quando o usuário mencionar design system, INTEIRO, tokens, inteiro.css, `.inteiro`, tema, cores, acessibilidade visual, drift de estilo, ou pedir para aplicar o padrão visual em um projeto."
---
<!-- harness-managed -->
# Design system INTEIRO

O IDS (`C:\Users\felip\Desenvolvimento\IDS`) é a fonte da verdade. Publica
`@inteiro/*` (tokens, design-system, react, mcp, cli). Consumidores conhecidos:
marketing, review-recorder e revisor.

## Operações

Use o MCP do IDS (`defaults.designSystem.mcp` no inventário) para tokens,
status, auditoria de drift e vínculo. Este repositório não expõe `design_*`.

## Regras

- Mudança de token acontece **no IDS**, nunca no consumidor. Regenerar skills e
  demo depois (`npm run generate` no IDS).
- Prefira `var(--inteiro-*)` a valores literais.
- Antes de "corrigir" um consumidor, confirme se o token certo existe no IDS.
- Auditoria é heurística: reporte-a como sinal, não como veredito.

## Fluxo

1. Pelo MCP do IDS, veja status e integridade.
2. Audite o projeto alvo.
3. Se faltar vínculo, ligue pelo CLI do IDS.
4. Corrija drift dentro de uma `feature/`, com testes visuais quando houver.

Leia `references/drift.md` para interpretar o `driftScore`.
