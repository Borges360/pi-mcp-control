# Procedimento: diagnosticar falha no harness

1. `harness doctor` e identifique qual check está `ok: false`.
2. Se for `path:<id>`: o repositório pode ter sido movido. Corrija `harness.yaml`.
3. Se um comando falhar:
   - leia `stderr` antes de tentar de novo;
   - confirme que a dependência existe (node, docker, composer, dotnet);
   - verifique se o `cwd` é o projeto certo.
4. Se uma ferramenta do hub não aparecer no cliente, o ajuste é no `mcp.json` do runtime ou no MCPHub, não neste repositório.

## Critério de aceite

O check volta a `ok: true`, ou existe uma explicação com o próximo passo.
