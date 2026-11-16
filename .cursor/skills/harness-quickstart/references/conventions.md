# Convenções de projeto

## Arquivos obrigatórios

- `README.md` — o que é, como rodar, como testar.
- `AGENTS.md` — arquivo canônico de agentes (o harness injeta um bloco gerenciado).
- `.editorconfig`, `.gitattributes`, `.gitignore`.
- `package.json` / `composer.json` / `*.sln` conforme o runtime.
- Entrada do projeto em `harness.yaml`.

## Campos do fragmento

```yaml
- id: meu-projeto
  name: Meu Projeto
  path: ../meu-projeto
  role: app            # app | design-system | platform | memory
  kind: node           # node | node-next | node-workspace | php-laravel | dotnet | infra | docs | php-node-hybrid
  runtime: node        # node | php | dotnet | powershell | none
  manager: npm         # npm | composer | dotnet
  remote: null         # ou url do git
  commands:
    install: npm ci
    test: npm test
    build: npm run build
```

## Checklist pós-criação

- [ ] `harness inventory` lista o projeto.
- [ ] `harness doctor` sem falhas de `path` ou `runtime`.
- [ ] `harness install` concluído no runtime usado.
- [ ] `main` e `develop` existem.
- [ ] primeiro CI verde.
