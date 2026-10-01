# AGENTS.md — RotaMoto Motoboy

## Identidade do projeto

Aplicativo web do motoboy/entregador do ecossistema RotaMoto.

## Baseline estável

A versão estável protegida deste repositório é:

- `v39.6-ui-mobile-fix2`

A tag `v39.6-ui-mobile-fix2` representa o baseline original e NÃO deve ser alterada, reescrita ou sobrescrita.

Antes de qualquer alteração:
- trabalhar em uma branch própria;
- preservar a tag do baseline;
- nunca usar `git reset --hard` ou reescrita de histórico para apagar trabalho existente sem autorização explícita.

## Regras de desenvolvimento

- Corrigir a causa raiz do problema.
- Não criar "camadas de correção", hacks ou workarounds quando a causa puder ser corrigida diretamente.
- Não fazer alterações não relacionadas ao objetivo da tarefa.
- Preservar funcionalidades existentes que não fazem parte da alteração solicitada.
- Manter código modular, legível e de fácil manutenção.
- Aplicar princípios SOLID e DRY quando apropriado.
- Evitar duplicação de lógica.
- Separar apresentação, lógica de negócio e acesso a dados sempre que a arquitetura permitir.

## Frontend

- Garantir funcionamento em desktop, tablet e mobile.
- Preservar comportamento responsivo existente ao modificar componentes.
- Não resolver problemas de layout apenas com regras CSS conflitantes ou overrides sucessivos.
- Corrigir HTML, CSS e JavaScript na origem do problema.
- Evitar overflow horizontal acidental.
- Garantir acessibilidade básica de controles, botões, formulários e navegação.

## Dados e persistência

O projeto deve permanecer compatível com uma estratégia local-first.

- Respeitar as limitações do IndexedDB.
- Não introduzir dependência desnecessária de armazenamento externo.
- Preparar estruturas de dados para futura sincronização com backend quando aplicável.
- Validar dados antes de persistir.
- Tratar erros de leitura, gravação e migração de dados.

## Segurança

- Nunca adicionar credenciais, tokens, senhas ou chaves privadas ao repositório.
- Validar e sanitizar entradas externas.
- Não confiar em dados provenientes do cliente.
- Evitar exposição de informações sensíveis em logs.
- Manter arquivos `.env` fora do Git; usar `.env.example` para documentação de configuração.

## Tratamento de erros

- Usar tratamento defensivo de exceções.
- Não deixar erros silenciosos quando puderem comprometer o funcionamento.
- Exibir mensagens compreensíveis ao usuário quando apropriado.
- Registrar informações técnicas úteis no desenvolvimento sem expor dados sensíveis.

## Testes

Antes de concluir uma alteração:

1. Verificar o diff.
2. Executar os testes existentes relacionados à alteração.
3. Verificar erros de JavaScript.
4. Verificar referências quebradas.
5. Testar os fluxos afetados.
6. Quando a alteração for visual, verificar desktop, tablet e mobile.

Não remover ou desativar testes apenas para fazer uma alteração passar.

## Git

- `main` representa a linha principal do projeto.
- Alterações devem ser feitas em branches específicas.
- Usar commits pequenos e descritivos.
- Não fazer force push.
- Não reescrever o histórico publicado sem autorização explícita.
- Não alterar a tag `v39.6-ui-mobile-fix2`.

## Regra de escopo

Modificar somente o que for necessário para atender à tarefa.

Antes de editar arquivos:
- identificar a causa;
- localizar os arquivos envolvidos;
- entender as dependências;
- verificar o comportamento existente.

Depois de editar:
- revisar `git diff`;
- confirmar que não existem alterações acidentais;
- executar os testes aplicáveis.

## Regra principal

Preservar a estabilidade do projeto.

Quando houver conflito entre uma mudança solicitada e uma funcionalidade existente, investigar primeiro a causa e apresentar o impacto antes de remover ou alterar comportamento existente.

## Browser Testing automatizado

O ambiente de browser testing compartilhado está em:

`~/projetos/browser-tests`

Ele fornece infraestrutura para o Codex executar testes reais nos aplicativos usando:

- Chromium instalado em `$PREFIX/lib/chromium/chrome`;
- Chrome DevTools Protocol (CDP);
- `chrome-remote-interface`;
- servidores HTTP temporários;
- screenshots e logs fora dos repositórios.

### Regra para alterações de frontend e fluxos

Quando uma alteração puder afetar comportamento visual, navegação, interação, formulários ou fluxo de negócio:

1. O Codex deve analisar a alteração e criar os testes de browser necessários para validá-la.
2. Os testes devem ser orientados pelo comportamento esperado, não por uma suíte fixa previamente criada.
3. O Codex deve executar o aplicativo no Chromium via CDP.
4. Deve verificar, quando aplicável:
   - erros JavaScript;
   - respostas HTTP 4xx/5xx;
   - navegação;
   - elementos esperados;
   - comportamento do fluxo;
   - responsividade;
   - screenshots.
5. Após corrigir problemas, deve executar novamente os testes relevantes.
6. Testes de browser podem ser criados temporariamente fora do repositório, em `~/projetos/browser-tests`.

### Execução autônoma

O Codex deve executar os testes de browser diretamente quando tiver acesso ao ambiente.

Não é obrigatório utilizar scripts de testes previamente existentes. O Codex deve criar, adaptar ou remover seus próprios testes conforme a necessidade da alteração.

O fluxo preferencial é:

`iniciar aplicação → iniciar Chromium/CDP → executar teste → coletar evidências → corrigir causa raiz → executar novamente → validar resultado`

Se o Chromium for encerrado pelo Android/Termux durante a execução, tratar isso como falha de infraestrutura/runtime e não modificar o código da aplicação para contornar o problema.

### Infraestrutura x testes

`~/projetos/browser-tests` é a infraestrutura compartilhada de browser testing.

Os testes de browser não fazem parte da aplicação e não devem ser adicionados ao código de produção.

Testes unitários, de contrato e de lógica pertencentes ao projeto continuam dentro dos respectivos repositórios.

Não usar Playwright diretamente neste ambiente Termux Android. O mecanismo suportado para browser automation é CDP através de `chrome-remote-interface`.
