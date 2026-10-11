# pi-mcp-control

Perfis e autorização MCP para **Pi 1.1.0 / Node >=20**. Mantém `/mcp` nativo e não cria outro cliente MCP. Interface `/mcpc` compacta; ferramentas novas pedem autorização ou são negadas, nunca recebem permissão por sugestão da LLM.

```sh
npm ci --ignore-scripts --legacy-peer-deps
pi -e ./index.ts
```

## Perfis e interface

`.pi/mcp-profiles.yaml` em projeto confiável: veja` examples/mcp-profiles.yaml`. Perfis developer-readonly, java-service, database-readonly, homelab-admin e incident-investigation. Sem allowlist de servidor não há acesso, mesmo que conectado nativamente.

`/mcpc status`,` catalog`,` profiles`,` use PROFILE`,` inspect SERVER`,` allow TOOL --scope task|project`,` deny TOOL --scope task|project`,` revoke TOOL`,` health`,` trace --last 20`,` help`.

Autocomplete de argumentos nativo, sempre a partir do estado real: `use` lista os perfis configurados marcando o ativo; `allow `/`deny` listam somente ferramentas MCP registradas agora (`mcp__servidor__ferramenta`) com a anotação de leitura/destrutividade; `--scope` explica o que cada escopo cobre; `inspect` lista os servidores declarados com fonte e total de ferramentas; `revoke` lista apenas grants ainda válidos. Um nome errado devolve as alternativas reais em vez de "Unknown MCP tool". `/mcpc` sem argumento dá o estado.

Deny > aprovação explícita > allow. Composição: confiança, servidor, perfil, allow/deny, hints **não verificados**, ambiente, risco, limites, TTL e circuito. Mutação/genérico/destruição exige aprovação por chamada exata; grant genérico de sessão não serve para mutações futuras. Production mutante é deny por padrão. Headless sem canal humano nega a ação. Confirmações mostram ferramenta/argumentos redigidos e risco.

Grants expiram por TTL, são isolados por projeto/tarefa/sessão e assinados/auditados em JSONL. Denies de projeto são persistidos. Política desconhecida ask/deny configurável. Limites por tarefa, janela de rate limit e circuito com cooldown após falhas. Timeout local cancela a operação Pi; não garante desfazer operação remota que já começou.

## Transporte nativo

Inventário combina os arquivos MCP nativos e `pi.getMcpServers()`, respeitando precedência.` mcp_servers_change` atualiza descoberta. O hook de autorização alcança direct/codemode/nested/resource tools. Troca de perfil ocorre somente idle; reconcile retira declarações não permitidas. Os **servidores dinâmicos que esta extensão possui** são registrados/removidos com API nativa, exposure codemode/deferred, timeout, allowlist de hosts/executáveis e confirmação humana para conectar. Arquivos nativos continuam fonte de transporte/credencial e não são sobrescritos.

Um servidor nativo desabilitado pelo perfil pode continuar fisicamente conectado: suas chamadas são negadas no pipeline. Para desconectar ou alterar exposição de transporte nativo, use `/mcp`. Health mostra disponibilidade de ferramentas/últimas falhas/circuito, não finge um ping bem-sucedido sem uma chamada real. Retries/reconnect de transporte são responsabilidade do cliente MCP nativo, não duplicados aqui.

## MCPHub e limites

O MCPHub local inspecionado usa `mcp_settings.json`, não uma API HTTP verificada. Catálogo opcional` type: mcphub-file`,` path`,` verifiedVersion` lê esse formato **somente com consentimento**. Retorna nomes/transportes sem credenciais; descoberta não instala nem conecta. Não há endpoints HTTP inventados.

Hints e regex não são sandbox/SQL parser. Chamadas por shell externo ou fora do pipeline do Pi não são cobertas; use credenciais read-only/OS para privilégio mínimo real. HMAC local detecta alterações, mas não autentica contra um processo com acesso à mesma chave. `npm test` cobre precedência, produção, trust, TTL/limites, URL/stdio, headless e nested. Integrações remotas precisam de teste com servidores autorizados do seu ambiente.

Instalar/remover: `pi install ./pi-mcp-control` /` pi remove ./pi-mcp-control`. **Sem banco de dados**.
