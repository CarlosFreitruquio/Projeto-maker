/**
 * Gota Limpa — Monitoramento de Turbidez de Água
 * Lógica da Interface, Web Serial API, Leituras Manuais e Hard Reset
 */

(function () {
  'use strict';

  const D = window.GotaLimpaTurbidityData;
  const STORAGE_KEY = 'GotaLimpa.turbidity.readings.v3';

  const $ = id => document.getElementById(id);

  const percentFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const decimalFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const voltageFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

  let state = {
    calib1: { percent: null, voltage: null, ntu: null, timestamp: null },
    calib2: { percent: null, voltage: null, ntu: null, timestamp: null },
    history: []
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state = {
          calib1: parsed.calib1 || state.calib1,
          calib2: parsed.calib2 || state.calib2,
          history: Array.isArray(parsed.history) ? parsed.history : []
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao restaurar dados:', e);
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { }
  }

  let serialPort = null;
  let serialReader = null;
  let serialBuffer = '';
  let toastTimer = null;
  let currentActivePoint = 1;
  let lastLiveVoltage = null;
  let isCapturing = false;

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('visible'); }, 3200);
  }

  function renderCard(pointNumber) {
    const data = pointNumber === 1 ? state.calib1 : state.calib2;
    const cardEl = $(`card-calib-${pointNumber}`);
    const percentEl = $(`percent-calib-${pointNumber}`);
    const badgeEl = $(`badge-calib-${pointNumber}`);
    const barEl = $(`bar-fill-${pointNumber}`);
    const markerEl = $(`marker-calib-${pointNumber}`);
    const voltageEl = $(`voltage-calib-${pointNumber}`);
    const ntuEl = $(`ntu-calib-${pointNumber}`);
    const timeEl = $(`time-calib-${pointNumber}`);

    if (!cardEl) return;

    const status = D.getTurbidityStatus(data.percent);

    cardEl.classList.remove('state-neutral', 'state-clean', 'state-warning', 'state-danger');
    cardEl.classList.add(status.cardClass);

    badgeEl.className = `badge ${status.badgeClass}`;
    badgeEl.textContent = status.label;

    if (data.percent !== null && Number.isFinite(data.percent)) {
      percentEl.innerHTML = `${percentFormat.format(data.percent)}<span class="metric-symbol">%</span>`;
      const clamped = Math.max(0, Math.min(100, data.percent));
      barEl.style.width = `${clamped}%`;
      markerEl.style.left = `${clamped}%`;
    } else {
      percentEl.innerHTML = `—<span class="metric-symbol">%</span>`;
      barEl.style.width = '0%';
      markerEl.style.left = '0%';
    }

    voltageEl.textContent = data.voltage !== null ? `${voltageFormat.format(data.voltage)} V` : '— V';
    ntuEl.textContent = data.ntu !== null ? `${decimalFormat.format(data.ntu)} NTU` : '— NTU';

    if (data.timestamp) {
      const dateObj = new Date(data.timestamp);
      timeEl.textContent = `${dateFormat.format(dateObj)} às ${timeFormat.format(dateObj)}`;
    } else {
      timeEl.textContent = 'Aguardando leitura';
    }
  }

  function renderHistory() {
    const listEl = $('history-list');
    const countEl = $('history-count');
    if (!listEl || !countEl) return;

    countEl.textContent = `${state.history.length} registro${state.history.length === 1 ? '' : 's'}`;

    if (state.history.length === 0) {
      listEl.innerHTML = `
        <li class="history-empty">
          <span class="empty-icon" aria-hidden="true">💧</span>
          <p>Nenhuma leitura registrada.</p>
          <small>Conecte o sensor e clique em Primeira ou Segunda Leitura.</small>
        </li>
      `;
      return;
    }

    listEl.replaceChildren();
    state.history.slice().reverse().forEach(item => {
      const status = D.getTurbidityStatus(item.percent);
      const li = document.createElement('li');
      li.className = 'history-item';
      const dateObj = new Date(item.timestamp);

      li.innerHTML = `
        <div class="history-item-left">
          <span class="history-status-dot ${status.dotClass}" title="${status.description}"></span>
          <div class="history-item-meta">
            <span class="history-item-source">${item.source || 'Leitura'}</span>
            <span class="history-item-time">${dateFormat.format(dateObj)} às ${timeFormat.format(dateObj)}</span>
          </div>
        </div>
        <div class="history-item-right">
          <span class="history-item-percent">${percentFormat.format(item.percent)}%</span>
          <span class="history-item-ntu">${item.voltage !== null ? voltageFormat.format(item.voltage) + ' V' : ''}</span>
        </div>
      `;
      listEl.appendChild(li);
    });
  }

  function addHistoryReading(percent, voltage, ntu, source = 'Leitura') {
    state.history.push({
      id: `reading-${Date.now()}`,
      percent: Number(percent),
      voltage: voltage !== null ? Number(voltage) : null,
      ntu: ntu !== null ? Number(ntu) : D.percentToNTU(percent),
      source,
      timestamp: new Date().toISOString()
    });
    if (state.history.length > 200) state.history.shift();
    saveState();
    renderHistory();
    $('last-sync-time').textContent = `Última leitura: ${timeFormat.format(new Date())}`;
  }

  // Captura contínua atualizando a tensão em tempo real para o modal e cards
  function handleSerialLine(line) {
    const parsed = D.parseSerialData(line);
    if (!parsed) return;

    if (parsed.voltage !== null) {
      lastLiveVoltage = parsed.voltage;
    } else if (parsed.percent !== null) {
      // Converte porcentagem estimada de volta para volts aproximados se necessário
      lastLiveVoltage = 4.2 - (parsed.percent / 100) * (4.2 - 1.5);
    }

    const modalVal = $('modal-live-value');
    if (modalVal && lastLiveVoltage !== null) {
      modalVal.textContent = `${voltageFormat.format(lastLiveVoltage)} V`;
    }
  }

  async function readSerialStream() {
    if (!serialPort?.readable) return;
    const decoder = new TextDecoder();
    try {
      serialReader = serialPort.readable.getReader();
      while (true) {
        const { value, done } = await serialReader.read();
        if (done) break;
        serialBuffer += decoder.decode(value, { stream: true });
        const lines = serialBuffer.split(/\r?\n/);
        serialBuffer = lines.pop() || '';
        lines.forEach(handleSerialLine);
      }
    } catch (err) { } finally {
      try { serialReader?.releaseLock(); } catch { }
      serialReader = null;
    }
  }

  async function disconnectSerial() {
    try { if (serialReader) await serialReader.cancel(); } catch { }
    try { if (serialPort) await serialPort.close(); } catch { }
    serialPort = null; serialReader = null;
    $('btn-connect').classList.remove('connected');
    $('connect-pulse').className = 'status-pulse disconnected';
    $('connect-label').textContent = 'Conectar Sensor';
    $('hardware-status-text').className = 'status-text-pill';
    $('hardware-status-text').textContent = 'Sensor desconectado';
    toast('Sensor desconectado.');
  }

  async function connectSerial() {
    if (serialPort) { await disconnectSerial(); return; }
    if (!('serial' in navigator)) {
      toast('Web Serial API não suportada neste navegador.');
      return;
    }
    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });
      $('btn-connect').classList.add('connected');
      $('connect-pulse').className = 'status-pulse connected';
      $('connect-label').textContent = 'Desconectar';
      $('hardware-status-text').className = 'status-text-pill connected';
      $('hardware-status-text').textContent = 'Sensor conectado · 9600 baud';
      toast('Sensor conectado com sucesso!');
      readSerialStream();
    } catch (err) {
      serialPort = null;
      if (err?.name !== 'NotFoundError') toast('Erro ao abrir porta serial.');
    }
  }

  // POP-UP COM CONTAGEM REGRESSIVA DE 5 SEGUNDOS
  function iniciarCapturaLeitura(pointNumber) {
    if (!serialPort) {
      toast('Conecte o sensor via USB antes de realizar a leitura.');
      return;
    }

    currentActivePoint = pointNumber;
    const dialog = $('calib-dialog');
    if (!dialog) return;

    $('modal-eyebrow').textContent = `CAPTURA · PONTO 0${pointNumber}`;
    $('modal-calib-title').textContent = pointNumber === 1 ? 'Primeira Leitura' : 'Segunda Leitura';

    const liveStatus = $('modal-live-status');
    const modalVal = $('modal-live-value');
    modalVal.textContent = lastLiveVoltage !== null ? `${voltageFormat.format(lastLiveVoltage)} V` : 'Aguardando...';
    liveStatus.textContent = 'Contagem: 5s';

    dialog.showModal();
    isCapturing = true;

    let segundos = 5;
    const timer = setInterval(() => {
      segundos--;
      if (segundos > 0) {
        liveStatus.textContent = `Contagem: ${segundos}s`;
      } else {
        clearInterval(timer);
        isCapturing = false;

        // Pega a leitura atualizada do sensor no momento exato do término
        const voltageFinal = lastLiveVoltage !== null ? lastLiveVoltage : 3.850;
        const percentFinal = D.calculatePercentFromVoltage(voltageFinal, state.calib1, state.calib2);
        const ntuFinal = D.percentToNTU(percentFinal);
        const now = new Date().toISOString();

        if (currentActivePoint === 1) {
          state.calib1 = { percent: percentFinal, voltage: voltageFinal, ntu: ntuFinal, timestamp: now };
          renderCard(1);
          addHistoryReading(percentFinal, voltageFinal, ntuFinal, 'Primeira Leitura');
          toast(`Primeira Leitura registrada: ${percentFormat.format(percentFinal)}%`);
        } else {
          state.calib2 = { percent: percentFinal, voltage: voltageFinal, ntu: ntuFinal, timestamp: now };
          renderCard(2);
          addHistoryReading(percentFinal, voltageFinal, ntuFinal, 'Segunda Leitura');
          toast(`Segunda Leitura registrada: ${percentFormat.format(percentFinal)}%`);
        }

        saveState();
        liveStatus.textContent = 'Registrado!';
        setTimeout(() => { dialog.close(); }, 800);
      }
    }, 1000);
  }

  // FUNÇÃO DE HARD RESET (Limpa cache, localStorage e recarrega a página)
  function hardResetSystem() {
    if (window.confirm('Tem certeza de que deseja reiniciar o sistema e apagar todos os dados salvos e histórico?')) {
      localStorage.clear(); // Apaga todo o cache e dados salvos
      sessionStorage.clear();
      window.location.reload(true); // Recarrega a página forçando limpeza
    }
  }

  function exportCSV() {
    if (state.history.length === 0) { toast('Histórico vazio.'); return; }
    let csv = 'ID,Origem,Porcentagem,Tensao,NTU,Data\r\n';
    state.history.forEach(i => {
      csv += `${i.id},"${i.source}",${i.percent},${i.voltage},${i.ntu},"${i.timestamp}"\r\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historico_turbidez.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearHistory() {
    if (state.history.length === 0) return;
    if (window.confirm('Deseja limpar o histórico?')) {
      state.history = [];
      saveState();
      renderHistory();
      toast('Histórico limpo.');
    }
  }

  // Eventos
  $('btn-connect').addEventListener('click', connectSerial);
  $('btn-header-calib-1').addEventListener('click', () => iniciarCapturaLeitura(1));
  $('btn-header-calib-2').addEventListener('click', () => iniciarCapturaLeitura(2));
  $('btn-card-calib-1').addEventListener('click', () => iniciarCapturaLeitura(1));
  $('btn-card-calib-2').addEventListener('click', () => iniciarCapturaLeitura(2));
  $('btn-export-csv').addEventListener('click', exportCSV);
  $('btn-clear-history').addEventListener('click', clearHistory);
  $('btn-hard-reset').addEventListener('click', hardResetSystem); // Evento do botão de reinício total

  renderCard(1);
  renderCard(2);
  renderHistory();

})();