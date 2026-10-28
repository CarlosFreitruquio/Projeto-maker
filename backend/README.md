# Gota Limpa — Backend & API REST

Este diretório contém o servidor de backend da plataforma **Gota Limpa**, responsável por:
1. **Entrega de Arquivos Estáticos:** Serve os arquivos do painel web localizados na pasta `frontend/`.
2. **API REST de Telemetria:** Recebe e armazena leituras de sensores de turbidez (NTU).
3. **Transmissão em Tempo Real:** Fornece um feed *Server-Sent Events* (`/api/stream`) para atualização instantânea dos clientes web.
4. **Integração com Hardware:** Aceita dados enviados via Wi-Fi/Ethernet por microcontroladores (ESP32, ESP8266, Raspberry Pi Pico W, Arduino Uno R4 WiFi).

---

## 🚀 Como Executar

### Opção 1: Node.js (Recomendado)
Não requer nenhuma dependência externa (utiliza módulos nativos do Node.js):

```bash
cd backend
npm start
# ou: node server.js
```

Para desenvolvimento com auto-reload (Node.js 18+):
```bash
npm run dev
```

Por padrão, o servidor escutará na porta **3000** (`http://localhost:3000`). Para alterar a porta, defina a variável de ambiente `PORT`:
```bash
PORT=8080 node server.js
```

---

### Opção 2: Python
Caso prefira o ecossistema Python, fornecemos um servidor equivalente (`server.py`) que também utiliza apenas a biblioteca padrão:

```bash
cd backend
python server.py
```

---

## 📡 Endpoints da API REST

### 1. `GET /api/status`
Retorna o estado de saúde do servidor, tempo de atividade e contagem de leituras armazenadas.

**Resposta de Exemplo (200 OK):**
```json
{
  "status": "online",
  "service": "Gota Limpa Water Monitoring API",
  "version": "1.0.0",
  "startedAt": "2026-10-27T23:00:00.000Z",
  "uptimeSeconds": 120,
  "connectedClients": 1,
  "counts": {
    "fonte1": 12,
    "fonte2": 0,
    "turbidity": 12
  }
}
```

---

### 2. `GET /api/readings`
Retorna as médias aritméticas, contagem e as últimas 50 amostras de cada fonte de pH e turbidez.

---

### 3. `POST /api/readings`
Ingestão de novas leituras enviadas por sensores.

#### Formato JSON
Envio de pH, turbidez ou ambos:
```json
{
  "sourceId": "fonte-1",
  "ph": 7.18,
  "turbidity": 4.85,
  "origin": "sensor"
}
```

Ou em lote:
```json
[
  { "sourceId": "fonte-1", "ph": 7.21 },
  { "turbidity": 5.10 }
]
```

#### Formato CSV (Ideal para microcontroladores simples)
Texto simples no corpo da requisição:
```text
PH,7.25,fonte-1
TURBIDITY,4.80
```

**Exemplo de envio via cURL:**
```bash
curl -X POST http://localhost:3000/api/readings \
  -H "Content-Type: application/json" \
  -d '{"sourceId": "fonte-1", "ph": 7.15, "turbidity": 4.9}'
```

---

### 4. `GET /api/stream` (Server-Sent Events)
Conexão persistente para receber eventos em tempo real enviados aos sensores. Cada novo `POST /api/readings` dispara um evento instantâneo para os navegadores conectados.

---

### 5. `GET /api/export?format=csv`
Baixa todo o histórico de leituras como arquivo `.csv` tabular compatível com Excel e Google Sheets.

---

## 🛠️ Exemplo de Envio via Arduino / ESP32 (HTTP POST)

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid = "SUA_REDE_WIFI";
const char* password = "SUA_SENHA_WIFI";
const char* serverUrl = "http://192.168.1.100:3000/api/readings";

void sendSensorData(float ph, float turbidity) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = String("{\"sourceId\":\"fonte-1\",\"ph\":") + ph + 
                         String(",\"turbidity\":") + turbidity + String("}");

    int httpResponseCode = http.POST(jsonPayload);
    http.end();
  }
}
```

