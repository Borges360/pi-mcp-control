# Resolver jobs por projeto

Use o identificador de projeto em `harness.yaml` e leia `pipelines[]` para
resolver job, plataforma, arquivo fonte e finalidade. O inventário e o catálogo
da plataforma são a fonte da topologia; esta referência não mantém uma segunda
lista de jobs nem nomes de ambientes.

Comandos úteis, quando disponíveis pela integração configurada no projeto:

- `jenkins_job` — último build e histórico.
- `jenkins_build_status` — número, resultado, duração.
- `jenkins_console` — últimas linhas do log.
- `jenkins_validate_pipeline` — sintaxe declarativa; não publica nem dispara build.

Uma lista ou resposta local não comprova que a revisão está publicada ou ativa
no host. Registre separadamente a fonte local e a prova remota autorizada.
