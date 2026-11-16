# Procedimento: alterar um Jenkinsfile

1. Resolva o Jenkinsfile canônico no Jenkies pelo inventário; leia os comandos e testes no produto. Não mantenha uma segunda orquestração no produto.
2. Abra uma branch `feature/<nome>` (nunca edite em main). Neste harness, o gitflow automático faz isso se o HEAD estiver em `main` ou `develop`.
3. Regras obrigatórias do arquivo:
   - checkout com `github-ssh` e known_hosts;
   - agente correto (`hostinger-agent` quando for Hostinger);
   - falha de teste bloqueia publicação e deploy; `SKIP_TEST` exige `DRY_RUN=true`;
   - identidade de implantação exclusiva do projeto/ambiente, com nomes de recursos explícitos no catálogo;
   - `DRY_RUN` não altera remoto;
   - segredo só via Secret/`MYSQL_PWD`/`PGPASSWORD`.
4. Rode `jenkins-rbac.py --check` quando houver implantação K3s, valide a sintaxe declarativa e os gates reais do produto. Não trate validação sintática como teste do pipeline.
5. Abra PR; não faça push/merge sem pedido explícito.
6. Depois do merge, publique o pipeline pelo MCP de Jenkins do hub, com confirmação.
7. Confira o job; a primeira execução fica com `DRY_RUN=true`.

## Critério de aceite

Job presente, última execução `SUCCESS` com `DRY_RUN`, e nenhuma credencial em claro.
