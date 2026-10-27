/**
 * Aqua — Servidor Backend & API REST
 * 
 * Servidor HTTP em Node.js puro (sem dependências externas obrigatórias).
 * Funcionalidades:
 * - Entrega dos arquivos estáticos da pasta frontend/
 * - API REST para ingestão e consulta de leituras de sensores (pH e Turbidez)
 * - Server-Sent Events (SSE) para atualização em tempo real
 * - Suporte a payloads em JSON e formato CSV de microcontroladores (Arduino / ESP32)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const FRONTEND_DIR = path.resolve(__dirname, '..', 'frontend');
const MAX_HISTORY = 500;

// Tipos MIME para arquivos estáticos
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// Histórico de leituras em memória
const store = {
  startedAt: new Date().toISOString(),
  sources: {
    'fonte-1': [],
    'fonte-2': []
  },
  turbidity: []
};

// Clientes SSE conectados
const sseClients = new Set();

/**
 * Transmite evento SSE para todos os clientes conectados
 */
function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

/**
 * Adiciona leitura de pH com limite de histórico
 */
function addPhReading(sourceId, ph, origin = 'sensor', timestamp = new Date().toISOString()) {
  if (!store.sources[sourceId]) {
    store.sources[sourceId] = [];
  }
  const reading = {
    id: `${sourceId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sourceId,
    ph: Number(Number(ph).toFixed(3)),
    origin,
    timestamp
  };

  store.sources[sourceId].push(reading);
  if (store.sources[sourceId].length > MAX_HISTORY) {
    store.sources[sourceId].shift();
  }

  broadcastSSE('ph', reading);
  return reading;
}

/**
 * Adiciona leitura de turbidez com limite de histórico
 */
function addTurbidityReading(ntu, origin = 'sensor', timestamp = new Date().toISOString()) {
  const reading = {
    id: `turbidez-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ntu: Number(Number(ntu).toFixed(2)),
    origin,
    timestamp
  };

  store.turbidity.push(reading);
  if (store.turbidity.length > MAX_HISTORY) {
    store.turbidity.shift();
  }

  broadcastSSE('turbidity', reading);
  return reading;
}

/**
 * Calcula a média aritmética de uma lista de leituras
 */
function calculateMean(list, key) {
  if (!list || list.length === 0) return null;
  const sum = list.reduce((acc, item) => acc + item[key], 0);
  return Number((sum / list.length).toFixed(3));
}

/**
 * Utilitário para enviar respostas JSON
 */
function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

/**
 * Lê o corpo da requisição HTTP como texto
 */
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { // Limite de 1MB
        req.destroy();
        reject(new Error('Corpo da requisição excede o limite permitido (1MB).'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Roteador de arquivos estáticos (frontend/)
 */
function serveStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(FRONTEND_DIR, relativePath));

  // Proteção contra path traversal
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Proibido: Acesso fora do diretório público negado.');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Se não encontrou o arquivo estático, responde 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Arquivo não encontrado.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

/**
 * Cria o servidor HTTP
 */
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // Tratamento de CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // --- Rotas da API REST ---

  // 1. GET /api/status - Informações de saúde do servidor
  if (method === 'GET' && pathname === '/api/status') {
    sendJson(res, 200, {
      status: 'online',
      service: 'Aqua Water Monitoring API',
      version: '1.0.0',
      startedAt: store.startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      connectedClients: sseClients.size,
      counts: {
        fonte1: store.sources['fonte-1'].length,
        fonte2: store.sources['fonte-2'].length,
        turbidity: store.turbidity.length
      }
    });
    return;
  }

  // 2. GET /api/readings - Consulta leituras atuais e médias
  if (method === 'GET' && pathname === '/api/readings') {
    const f1 = store.sources['fonte-1'];
    const f2 = store.sources['fonte-2'];
    const turb = store.turbidity;

    sendJson(res, 200, {
      sources: {
        'fonte-1': {
          count: f1.length,
          mean: calculateMean(f1, 'ph'),
          last: f1.at(-1) || null,
          readings: f1.slice(-50)
        },
        'fonte-2': {
          count: f2.length,
          mean: calculateMean(f2, 'ph'),
          last: f2.at(-1) || null,
          readings: f2.slice(-50)
        }
      },
      turbidity: {
        count: turb.length,
        mean: calculateMean(turb, 'ntu'),
        last: turb.at(-1) || null,
        readings: turb.slice(-50)
      }
    });
    return;
  }

  // 3. POST /api/readings - Ingestão de dados de sensores (JSON ou CSV simples)
  if (method === 'POST' && pathname === '/api/readings') {
    try {
      const rawBody = (await readRequestBody(req)).trim();
      if (!rawBody) {
        sendJson(res, 400, { error: 'Corpo da requisição vazio.' });
        return;
      }

      const results = [];
      const now = new Date().toISOString();

      if (rawBody.startsWith('{') || rawBody.startsWith('[')) {
        // Formato JSON
        const data = JSON.parse(rawBody);
        const items = Array.isArray(data) ? data : [data];

        for (const item of items) {
          const timestamp = item.timestamp || now;
          const origin = item.origin || 'sensor';

          // Leitura de pH
          if (item.ph !== undefined && item.ph !== null) {
            const ph = Number(item.ph);
            if (Number.isFinite(ph) && ph >= 0 && ph <= 14) {
              const src = item.sourceId === 'fonte-2' ? 'fonte-2' : 'fonte-1';
              results.push(addPhReading(src, ph, origin, timestamp));
            } else {
              throw new Error(`Valor de pH inválido: ${item.ph} (deve ser entre 0 e 14).`);
            }
          }

          // Leitura de Turbidez
          if (item.turbidity !== undefined && item.turbidity !== null || item.ntu !== undefined && item.ntu !== null) {
            const ntu = Number(item.turbidity ?? item.ntu);
            if (Number.isFinite(ntu) && ntu >= 0) {
              results.push(addTurbidityReading(ntu, origin, timestamp));
            } else {
              throw new Error(`Valor de turbidez inválido: ${ntu} (deve ser ≥ 0 NTU).`);
            }
          }
        }
      } else {
        // Formato CSV / Linha de texto simples:
        // Ex.: PH,7.20,fonte-1 ou TURBIDITY,4.80 ou TURBIDEZ,4.80
        const lines = rawBody.split(/\r?\n/).filter(l => l.trim().length > 0);
        for (const line of lines) {
          const parts = line.split(',').map(s => s.trim());
          const type = parts[0].toUpperCase();

          if (type === 'PH') {
            const ph = Number(parts[1]?.replace(',', '.'));
            const sourceId = parts[2] === 'fonte-2' ? 'fonte-2' : 'fonte-1';
            const timestamp = parts[3] || now;
            if (Number.isFinite(ph) && ph >= 0 && ph <= 14) {
              results.push(addPhReading(sourceId, ph, 'sensor', timestamp));
            } else {
              throw new Error(`pH inválido na linha CSV: ${line}`);
            }
          } else if (type === 'TURBIDITY' || type === 'TURBIDEZ') {
            const ntu = Number(parts[1]?.replace(',', '.'));
            const timestamp = parts[2] || now;
            if (Number.isFinite(ntu) && ntu >= 0) {
              results.push(addTurbidityReading(ntu, 'sensor', timestamp));
            } else {
              throw new Error(`Turbidez inválida na linha CSV: ${line}`);
            }
          }
        }
      }

      sendJson(res, 201, {
        success: true,
        receivedCount: results.length,
        results
      });
    } catch (err) {
      sendJson(res, 400, {
        success: false,
        error: err.message
      });
    }
    return;
  }

  // 4. GET /api/stream - Server-Sent Events (SSE) para transmissão em tempo real
  if (method === 'GET' && pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Conectado ao feed Aqua SSE', timestamp: new Date().toISOString() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // 5. GET /api/export - Exportação de leituras em JSON ou CSV
  if (method === 'GET' && pathname === '/api/export') {
    const format = parsedUrl.query.format === 'csv' ? 'csv' : 'json';

    if (format === 'csv') {
      let csv = 'tipo,id,fonte_ou_sensor,valor,origem,timestamp\n';
      for (const [src, list] of Object.entries(store.sources)) {
        for (const item of list) {
          csv += `PH,${item.id},${src},${item.ph},${item.origin},${item.timestamp}\n`;
        }
      }
      for (const item of store.turbidity) {
        csv += `TURBIDEZ,${item.id},turbidez,${item.ntu},${item.origin},${item.timestamp}\n`;
      }
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="aqua-dados.csv"',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(csv);
      return;
    }

    sendJson(res, 200, store);
    return;
  }

  // 6. DELETE /api/readings - Limpar histórico
  if (method === 'DELETE' && pathname === '/api/readings') {
    store.sources['fonte-1'] = [];
    store.sources['fonte-2'] = [];
    store.turbidity = [];
    broadcastSSE('clear', { message: 'Histórico limpo' });
    sendJson(res, 200, { success: true, message: 'Histórico de leituras reiniciado.' });
    return;
  }

  // --- Roteamento padrão: Entrega dos arquivos estáticos do Frontend ---
  serveStaticFile(req, res, pathname);
});

// Inicialização do servidor
server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(` Servidor Aqua iniciado com sucesso!`);
  console.log(` Endereço local:  http://localhost:${PORT}`);
  console.log(` Frontend ativo:  ${FRONTEND_DIR}`);
  console.log(` Endpoints API:`);
  console.log(`   - Status:      http://localhost:${PORT}/api/status`);
  console.log(`   - Leituras:    http://localhost:${PORT}/api/readings`);
  console.log(`   - Stream SSE:  http://localhost:${PORT}/api/stream`);
  console.log(`   - Exportação:  http://localhost:${PORT}/api/export?format=csv`);
  console.log('====================================================');
});

// Encerramento limpo
function handleShutdown() {
  console.log('\nFinalizando servidor Aqua...');
  for (const client of sseClients) {
    try { client.end(); } catch {}
  }
  server.close(() => {
    console.log('Servidor encerrado.');
    process.exit(0);
  });
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

