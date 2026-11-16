---
name: "harness-operate"
description: "Operar o harness pessoal multi-projeto: descobrir projetos, checar estado, rodar testes, subir ambiente de desenvolvimento e diagnosticar ambiente. Use quando a tarefa envolver mais de um repositório, quando não se souber em qual projeto mexer, ao iniciar sessão de trabalho amplo, ou quando o usuário citar 'todos os projetos', 'meus projetos', 'harness', 'ambiente', 'rodar testes', 'subir dev'."
---
<!-- harness-managed -->
# Operar o harness

O harness é o control-plane dos projetos registrados no inventário.
A topologia canônica vive exclusivamente em `harness.yaml`.
Não adivinhe caminhos, comandos ou jobs: leia do inventário.
Quando aberto diretamente num projeto, comece por
`node .harness/project.mjs describe`. O contrato informa `sourceRoot`, comandos,
guardrails e escopo de memória; `node .harness/project.mjs verify` verifica as
cópias instaladas. Sem workspace, use o contrato instalado e informe sua versão;
não confunda ausência da fonte com ausência do projeto nem amplie permissões.

## Ordem de leitura

1. `harness inventory` — lista id, papel, tipo, caminho e job de cada projeto.
2. Leia o projeto no `harness.yaml` — comandos, gitflow, jenkins, memória, design system, guardrails.
3. `harness status` — branch e limpeza; `harness gitflow audit` separa nome, bases,
   upstream e divergência. Proteções remotas exigem consulta ao host.
   `harness ci audit` mostra o perfil de CI da stack e os gates obrigatórios;
   gate ausente não é sucesso.
4. Só então execute o comando declarado em `commands` daquele projeto.

## Regras de execução

- Nunca invente comando: use a chave declarada em `commands` no inventário.
  Comando fora do inventário exige justificativa e autorização compatível; não repita confirmação para ação local já coberta.
- Testes e dev-env podem ser longos: informe timeout e reporte duração.
- Antes de tocar em vários projetos, rode `harness structure apply` sem `--write`
  e registre o plano. Se a autorização vigente cobrir os alvos e a operação, aplique
  sem pedir confirmação repetida.
- Leia os `guardrails` do projeto antes de qualquer escrita. Eles são a política local.

## Fluxo canônico

1. Entender o pedido e mapear para um `id` do inventário. Pedido claro é entrada suficiente: não exija tarefa, JSON ou grant prévios para ação local comum.
2. Leia o projeto no inventário para carregar comandos e guardrails.
3. `harness status` para saber onde a árvore está.
4. Executar read-only primeiro (testes, lint, auditoria).
5. Aplicar somente dentro da autorização vigente; pedir decisão para escopo novo ou efeito remoto não coberto pelo pedido.
6. Registrar decisões na memória somente com pedido ou autorização explícita. Use escopo do projeto por padrão; global/profile exigem escolha explícita.

## Leitura obrigatória

- Leia `references/mcp-tools.md` antes de escolher uma ferramenta.
- Leia `procedures/diagnose.md` quando algo não funcionar.
