# Gota Limpa — Painel de Monitoramento de pH e Turbidez

Painel web em português para monitoramento de qualidade da água em tempo real, desenvolvido para projetos Maker, Arduino e feiras de ciências. Não precisa compilar dependências para rodar o cliente web.

---

## Estrutura do Projeto

- **`frontend/`**: Contém a aplicação web estática (`index.html`, `style.css`, `app.js`, `data.js`, `water.js`, `favicon.svg`).
- **`backend/`**: Servidor Node.js / Python com API REST e Server-Sent Events para ingestão de telemetria de sensores.
- **`.github/workflows/deploy-pages.yml`**: Fluxo de automação do GitHub Pages para deploy contínuo da pasta `frontend/`.
- **`iniciar.bat`**: Script de inicialização automática em um clique para Windows.
- **`README.md`**: Guia técnico completo do projeto.

---

## Como Abrir e Publicar

1. **Executar Localmente:**
   - Dê um duplo clique em `iniciar.bat` na raiz do projeto.
   - Ou abra diretamente `frontend/index.html` em qualquer navegador moderno.
   - Ou inicie o backend com Node.js (`cd backend && npm start`) ou Python (`cd backend && python server.py`).

2. **Publicação no GitHub Pages:**
   - O repositório está configurado com GitHub Actions via `.github/workflows/deploy-pages.yml`.
   - Ao enviar alterações para a branch `main`, a pasta `frontend/` é publicada automaticamente no GitHub Pages.

---

## Como Usar o Painel

- **Fontes de pH:** A Fonte 01 começa com 12 leituras simuladas. É possível ativar a **Segunda fonte** para acompanhar outro ponto de coleta independente.
- **Painel de Turbidez:** Acompanhamento de turbidez em NTU, com classificação visual (Normal: ≤ 5 NTU, Moderada: 5 a 25 NTU, Elevada: > 25 NTU).
- **Adicionar Leituras:** Use o botão **Adicionar leitura** ou **Adicionar turbidez** para preenchimento manual ou use a aba **Colar dados** para importar colunas copiadas de planilhas eletrônicas.
- **Conectar Sensor (USB):** Clique em **Conectar sensor** no cabeçalho para conectar o Arduino via porta serial (Web Serial API a 9600 baud). A simulação pausa automaticamente durante a conexão de hardware.
- **Persistência:** Os dados ficam salvos no `localStorage` deste navegador.
