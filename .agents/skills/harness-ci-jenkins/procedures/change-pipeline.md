# Procedimento: alterar um Jenkinsfile

1. Resolva o arquivo canônico de pipeline e o projeto responsável em `harness.yaml`; leia os comandos e testes no produto. Não mantenha uma segunda orquestração no produto.
2. Leia o estado e o gitflow do repositório antes de editar; preserve alterações existentes e não presuma comportamento de hooks.
3. Regras obrigatórias do arquivo:
   - checkout e agente conforme a configuração autorizada do destino;
   - falha de teste bloqueia publicação e deploy; `SKIP_TEST` exige `DRY_RUN=true`;
   - identidade de implantação exclusiva do projeto/ambiente, com recursos declarados no catálogo;
   - `DRY_RUN` não altera remoto;
   - credenciais usadas por referência ao mecanismo aprovado; não leia nem imprima valores.
4. Execute apenas verificações locais declaradas e necessárias. Validação sintática não substitui os gates reais do produto.
5. Push, PR, merge, publicação e execução de job exigem autorização específica para o efeito e destino.
6. Se uma execução remota for autorizada, use o modo seguro definido pelo projeto e verifique o resultado e a saúde.

## Critério de aceite

Job presente, última execução `SUCCESS` com `DRY_RUN`, e nenhuma credencial em claro.
