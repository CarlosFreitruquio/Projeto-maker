# Aqua — painel de pH

Site estático em português. Não precisa instalar dependências, compilar ou manter um servidor de aplicação.

## Abrir e publicar

- Para experimentar, abra `dist/index.html` em um navegador moderno. Algumas configurações do navegador podem restringir o armazenamento quando aberto como arquivo local.
- Para hospedar, envie **o conteúdo da pasta `dist`** à pasta pública de qualquer hospedagem estática. `index.html` deve estar na raiz publicada, junto de `style.css`, `data.js`, `app.js`, `water.js` e `favicon.svg`.
- O ZIP de entrega contém esses arquivos diretamente na raiz, prontos para envio. Funciona também dentro de uma subpasta porque os caminhos dos assets são relativos.
- Para compartilhar a demonstração em Sites, ajuste o acesso na interface de Sites. A publicação inicial é privada.

## Usar

A Fonte 01 começa com 12 leituras. Enquanto a simulação estiver ativa, uma nova amostra é recebida a cada cinco segundos. Ative **Segunda fonte** para acompanhar outro ponto de coleta: seu histórico começa com 12 amostras independentes. Ocultá-la preserva suas leituras e interrompe novas amostras simuladas nessa fonte.

Use **Adicionar leitura** para preencher um pH entre 0 e 14. Use **Colar dados** para colar uma coluna copiada de uma planilha, sem cabeçalho, com um valor por linha. Ponto e vírgula decimal são aceitos. Linhas vazias são ignoradas; corrija todas as linhas inválidas antes de importar. O destino pode ser escolhido na janela.

A média considera todos os registros da fonte, inclusive simulação, preenchimento e colagem. É a média aritmética dos números de pH recebidos, não uma média de concentração de íons nem uma classificação de potabilidade. O cálculo usa os valores completos; a interface exibe duas casas decimais. A paginação não altera a média.

Os dados ficam no armazenamento deste navegador e endereço, sem envio a um banco de dados ou sincronização entre computadores. Ao recarregar, os dados e a pausa são restaurados; não se criam amostras retroativas. Em caso de bloqueio ou falta de espaço, o rodapé informa que a sessão não está sendo salva. Dados em um endereço local não migram automaticamente para o endereço hospedado.

## Integração futura com sensor

`data.js` contém validação, média, modelo de dados e recebimento em lote. `app.js` contém armazenamento e interface; `water.js` contém apenas o fundo. Todo recebimento passa por `AquaData.receiveReadings`.

Um adaptador executado na página pode usar:

```js
window.Aqua.receiveReadings({
  sourceId: 'fonte-1', // ou 'fonte-2'
  values: [7.125, 7.2],
  origin: 'sensor',
  timestamp: new Date().toISOString()
});

window.Aqua.getSummary(); // contagem, média e última leitura das fontes visíveis
```

Cada registro guarda `id`, `sourceId`, `timestamp`, `ph` e `origin`. O lote é validado inteiro antes de alterar o histórico. Valores fora de 0–14, fontes desconhecidas e horários inválidos geram erro. `timestamp` é opcional; sem ele, usa-se o horário de inclusão. Para horários diferentes, envie lotes separados.

Pause a simulação antes de receber dados reais. A integração de hardware não está implementada; transporte, autenticação e eventual ponte/backend dependem do sensor. A interface não inclui credenciais nem presume conexão USB direta.

Há ferramentas WebMCP opcionais para leitura do resumo e inclusão de valores em navegadores compatíveis. Navegadores sem essa API continuam funcionando normalmente.

## Fundo e acessibilidade

Ambientação procedural de gruta costeira: rochas, cascatas, névoa, espuma, ondas e reflexos na água. Não usa imagens ou assets remotos. Shader WebGL com resolução máxima de 1280×800 e aproximadamente 30 quadros por segundo. A animação pausa com a aba oculta e fica estática com a preferência de movimento reduzido. Sem WebGL, o gradiente CSS mantém o fundo. O painel desktop foi projetado para 1366×768 ou maior; telas estreitas usam fluxo vertical para manter os controles acessíveis.
