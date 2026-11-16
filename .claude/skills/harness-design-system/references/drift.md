# Interpretar o driftScore

A auditoria varre arquivos de estilo/código (ignorando `node_modules`, `dist`,
`build`, `vendor`, `.next`, `target`, `public`, `storage`) e conta:

- ocorrências de hex (`#abc`, `#aabbcc`) e `rgb()/hsl()`;
- uso de variáveis de design definidas pelo projeto.

`driftScore = min(100, round(amostrasHardcoded / arquivosLidos * 1000))`.

| Faixa | Veredito | Ação |
| --- | --- | --- |
| 0 | clean | nada |
| 1–19 | low-drift | corrigir pontualmente |
| 20–59 | medium-drift | revisar amostras e decidir se há uma iniciativa de adoção |
| 60+ | high-drift | revisar amostras e discutir a decisão; o score não prova adoção ou rejeição |

## Limitações

- Cores em SVG, imagens e CSS-in-JS dinâmico podem escapar.
- `public/` é ignorado de propósito (assets buildados).
- O score é proporção, não severidade: um projeto pequeno com 3 cores pode
  pontuar alto. Sempre leia as amostras antes de concluir.
