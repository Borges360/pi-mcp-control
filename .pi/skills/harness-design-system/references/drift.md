# Interpretar o driftScore

A auditoria varre arquivos de estilo/código (ignorando `node_modules`, `dist`,
`build`, `vendor`, `.next`, `target`, `public`, `storage`) e conta:

- ocorrências de hex (`#abc`, `#aabbcc`) e `rgb()/hsl()`;
- uso de `var(--...)` e de `--inteiro-*`.

`driftScore = min(100, round(amostrasHardcoded / arquivosLidos * 1000))`.

| Faixa | Veredito | Ação |
| --- | --- | --- |
| 0 | clean | nada |
| 1–19 | low-drift | corrigir pontualmente |
| 20–59 | medium-drift | abrir feature de adoção de tokens |
| 60+ | high-drift | projeto não adotou o design system; planejar migração |

## Limitações

- Cores em SVG, imagens e CSS-in-JS dinâmico podem escapar.
- `public/` é ignorado de propósito (assets buildados).
- O score é proporção, não severidade: um projeto pequeno com 3 cores pode
  pontuar alto. Sempre leia as amostras antes de concluir.
