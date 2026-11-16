# Convenções de projeto

## Arquivos gerados

- `README.md`, `AGENTS.md` (instrução canônica; o instalador acrescenta o bloco gerenciado).
- `.editorconfig`, `.gitattributes`, `.gitignore` (bloco `harness:versioned-instructions`
  mantém `.harness/project.json`, `project.mjs`, `install-manifest.json` e recibos rastreados).
- `.ai-memory.toml` (`workspace`/`project`/`server`, sem token).
- Manifesto nativo: `package.json` + lock, `composer.json`, `pom.xml`, `*.sln`/`*.csproj`.
- `.github/workflows/secrets.yml`, `gitflow.yml` e `config.yml` (stack).
- `.harness/` pelo instalador; hook `pre-commit` do Git Flow.

## Stacks e ciclo nativo

| Stack | kind | Ciclo | Toolchain |
| --- | --- | --- | --- |
| node | node | `npm ci && npm run lint && npm test && npm run build` | node/npm |
| pi-extension | node | `npm ci && npm run lint && npm test` | node/npm |
| php-laravel | php-laravel | `composer install && php artisan test` | PHP ≥ 8.3, Composer |
| php-hybrid | php-node-hybrid | `composer install && npm ci && composer test && npm run test:fast && npm run build` | PHP ≥ 8.3, Composer, node |
| java-maven | java-maven | `mvn -B verify` | Java 21, Maven |
| dotnet | dotnet | `dotnet test <Nome>.sln` | .NET SDK 8 |
| infra | infra | `npm test` (validação de manifestos; Secret literal recusado) | node |

## Campos do fragmento

```yaml
- id: meu-projeto
  # template: node@2 (sha …)
  name: "Meu Projeto"
  path: "../meu-projeto"
  role: app            # app | design-system | platform | memory | research | fork
  kind: node           # ver tabela; inventário aceita também node-next, node-workspace, java-node, ...
  runtime: node
  manager: npm
  remote: null
  memory: { workspace: homelab, project: meu-projeto }
  commands:
    install: "npm ci"
    test: "npm test"
  notApplicable:
    dev: "motivo"
```

## Checklist pós-criação

- [ ] `harness inventory` lista o projeto e `harness baseline audit --target <id>` sem erro.
- [ ] `node .harness/project.mjs verify` passa.
- [ ] `main`, `develop` e `feature/initial-scaffold` existem; hook instalado.
- [ ] Ciclo nativo executado; lacuna de toolchain registrada quando ausente.
