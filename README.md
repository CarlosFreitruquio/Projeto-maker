# Gota Limpa — Monitoramento de pH e Turbidez em Tempo Real

[![Publicar no GitHub Pages](https://github.com/seu-usuario/Projeto-maker/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/seu-usuario/Projeto-maker/actions/workflows/deploy-pages.yml)
[![Licença MIT](https://img.shields.io/badge/licença-MIT-blue.svg)](LICENSE)
[![Tecnologias](https://img.shields.io/badge/tecnologias-HTML5%20%7C%20CSS3%20%7C%20JS%20%7C%20WebGL%20%7C%20Node.js-cyan.svg)](#)

O **Gota Limpa** é um painel completo para monitoramento, análise e visualização de parâmetros de qualidade da água (pH e turbidez em NTU), com suporte a simulação procedimental em tempo real, integração direta com hardware (Arduino, ESP32 e microcontroladores) via **Web Serial API** e via **API REST**.

---

## 📁 Estrutura do Repositório

O projeto é organizado com separação completa entre a interface cliente e o servidor:

```text
Projeto-maker/
├── frontend/                     # Interface do usuário (Client-side)
│   ├── index.html                # Estrutura semântica e acessível do painel
│   ├── style.css                 # Folha de estilos, temas de água e layout responsivo
│   ├── app.js                    # Lógica da interface, eventos, Web Serial e paginação
│   ├── data.js                   # Módulo puro de validação, médias e dados
│   ├── water.js                  # Cenário procedural WebGL (gruta costeira com ondas e cascatas)
│   └── favicon.svg               # Ícone do projeto em SVG
├── backend/                      # Servidor e API de telemetria (Server-side)
│   ├── package.json              # Configurações do pacote Node.js
│   ├── server.js                 # Servidor HTTP nativo em Node.js com API REST e SSE
│   ├── server.py                 # Servidor alternativo em Python (biblioteca padrão)
│   └── README.md                 # Documentação detalhada dos endpoints da API
├── .github/
│   └── workflows/
│       └── deploy-pages.yml      # GitHub Actions para deploy contínuo no GitHub Pages
├── iniciar.bat                   # Script de inicialização automática em 1 clique (Windows)
└── README.md                     # Documentação geral do projeto
```

---

## ⚡ Início Rápido

### Opção 1: Inicialização em 1 Clique (Windows)
Dê um duplo clique no arquivo [`iniciar.bat`](file:///c:/Users/Deijiane%20Gomes/Documents/Arduino/Maker/MakerSite/Projeto-maker/iniciar.bat). Ele detecta automaticamente se há Node.js ou Python disponível:
- **Se houver Node.js:** Inicia o servidor backend na porta 3000 e abre `http://localhost:3000`.
- **Se houver Python:** Inicia o servidor HTTP na porta 8000 e abre `http://localhost:8000`.
- **Se nenhum estiver no PATH:** Abre `frontend/index.html` diretamente no navegador.

### Opção 2: Node.js (Servidor + API REST)
```bash
cd backend
npm start
```
Acesse `http://localhost:3000`. Não é necessário instalar nenhuma dependência externa.

### Opção 3: Python
```bash
cd backend
python server.py
# ou: python -m http.server 8000 --directory ../frontend
```
Acesse `http://localhost:3000` (ou `http://localhost:8000`).

### Opção 4: Apenas Frontend Estático
Abra [`frontend/index.html`](file:///c:/Users/Deijiane%20Gomes/Documents/Arduino/Maker/MakerSite/Projeto-maker/frontend/index.html) em qualquer navegador moderno.

---

## ✨ Funcionalidades Principais

1. **Monitoramento Multicanais de pH:**
   - Suporte a monitoramento de um ponto primário (**Fonte 01**) e secundário (**Segunda fonte**).
   - Classificação visual automática: **Ácida** (pH < 6.8), **Normal** (6.8 a 8.2) e **Básica** (pH > 8.2).
   - Cálculo contínuo da média aritmética do histórico.

2. **Monitoramento de Turbidez (NTU):**
   - Canal dedicado para leitura de turbidez em NTU.
   - Indicadores visuais de condição: **Normal** (≤ 5.0 NTU), **Moderada** (5.1 a 25.0 NTU) e **Elevada / Crítica** (> 25.0 NTU).
   - Histórico independente com paginação dinâmica.

3. **Conexão Direta com Sensores (Web Serial API):**
   - Clique em **Conectar sensor** no topo da página para emparelhar com a porta USB do Arduino/ESP32 diretamente pelo navegador (requer Chrome, Edge ou navegador Chromium via HTTPS ou localhost).
   - Taxa de transmissão padrão: `9600 baud`.

4. **Entrada Manual e Importação em Lote:**
   - Preenchimento individual de leitura.
   - Aba **Colar dados** para importação de colunas copiadas do Excel / Google Sheets com pré-visualização instantânea e detecção de linhas inválidas.

5. **Gruta Costeira Procedural (WebGL):**
   - Cenário com água em movimento, reflexos, espuma e cascatas gerado 100% via shaders WebGL procedural (`water.js`).
   - Sem requisições de imagens externas ou assets pesados.
   - Suporte a `prefers-reduced-motion` e pausa automática quando a aba está oculta.

6. **Persistência Local e Exportação:**
   - Armazenamento automático no `localStorage` do navegador.
   - Exportação de dados via API REST (`/api/export?format=csv`).

---

## 🔌 Integração com Arduino e Sensores

### 1. Envio Direto via USB (Web Serial API)
O navegador lê linhas de texto terminadas em `\n`. Os sensores podem enviar dados em dois formatos:

#### Formato CSV (Mais leve):
```text
PH,7.25,fonte-1
TURBIDITY,4.80
```

#### Formato JSON:
```json
{"ph": 7.25, "sourceId": "fonte-1"}
{"turbidity": 4.80}
```

#### Exemplo de Sketch Arduino:
```cpp
void setup() {
  Serial.begin(9600);
}

void loop() {
  // Substitua pela leitura real dos pinos analógicos (A0 / A1)
  float tensaoPH = analogRead(A0) * (5.0 / 1023.0);
  float ph = 3.5 * tensaoPH; // Fórmula calibrada do seu sensor
  
  float tensaoTurbidez = analogRead(A1) * (5.0 / 1023.0);
  float ntu = -1120.4 * sq(tensaoTurbidez) + 5742.3 * tensaoTurbidez - 4352.9;
  if (ntu < 0) ntu = 0;

  // Enviar para o painel via USB
  Serial.print("PH,");
  Serial.println(ph, 2);
  
  Serial.print("TURBIDITY,");
  Serial.println(ntu, 2);

  delay(5000);
}
```

### 2. Envio via Wi-Fi / Ethernet (API REST do Backend)
Dispositivos como **ESP32** ou **ESP8266** podem realizar requisições `POST http://<IP_DO_SERVIDOR>:3000/api/readings` enviando o payload JSON:
```json
{
  "sourceId": "fonte-1",
  "ph": 7.18,
  "turbidity": 4.80
}
```

---

## 🌐 Publicação no GitHub Pages

O deploy automatizado está configurado em [`.github/workflows/deploy-pages.yml`](file:///c:/Users/Deijiane%20Gomes/Documents/Arduino/Maker/MakerSite/Projeto-maker/.github/workflows/deploy-pages.yml):
1. No repositório no GitHub, acesse **Settings** > **Pages**.
2. Em **Build and deployment** > **Source**, selecione **GitHub Actions**.
3. A cada commit na branch `main`, o GitHub Actions publicará automaticamente os arquivos da pasta `frontend/`.

---

## 📊 Parâmetros de Referência da Água

| Parâmetro | Faixa Normal | Faixa de Alerta | Faixa Crítica | Observações |
| :--- | :--- | :--- | :--- | :--- |
| **pH** | 6.8 a 8.2 | < 6.8 (Ácida) | > 8.2 (Básica) | Padrão de potabilidade e consumo humano |
| **Turbidez (NTU)** | ≤ 5.0 NTU | 5.1 a 25.0 NTU | > 25.0 NTU | Água límpida x turvação suspensa |

---

## 📄 Licença
Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações.
