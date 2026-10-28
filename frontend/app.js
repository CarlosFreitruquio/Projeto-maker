/**
 * Aqua — Monitoramento de Turbidez de Água
 * Lógica da Interface, Web Serial API, Calibração em Dois Pontos e Histórico
 * 100% livre de dados simulados (processamento exclusivamente de dados reais)
 */

(function(){
  'use strict';

  const D = window.AquaTurbidityData;
  const STORAGE_KEY = 'aqua.turbidity.calibration.v2';

  // Helper de seleção por ID
  const $ = id => document.getElementById(id);

  // Formatadores de Números e Horas
  const percentFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const decimalFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const voltageFormat = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });

  const timeFormat = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const dateFormat = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  });

  // Estado da Aplicação (Persistido no LocalStorage)
  let state = {
    calib1: {
      percent: null,
      voltage: null,
      ntu: null,
      timestamp: null
    },
    calib2: {
      percent: null,
      voltage: null,
      ntu: null,
      timestamp: null
    },
    history: []
  };

  // Carregar dados salvos
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object'){
        state = {
          calib1: parsed.calib1 || state.calib1,
          calib2: parsed.calib2 || state.calib2,
          history: Array.isArray(parsed.history) ? parsed.history : []
        };
      }
    }
  } catch(e) {
    console.warn('Não foi possível restaurar calibrações anteriores:', e);
  }

  function saveState(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {
      console.warn('Erro ao salvar no localStorage:', e);
    }
  }

  // Variáveis da Web Serial API
  let serialPort = null;
  let serialReader = null;
  let serialBuffer = '';
  let toastTimer = null;
  let currentModalPoint = 1;
  let lastLiveVoltage = null;

  // Notificação Toast Visual
  function toast(message){
    const el = $('toast');
    if(!el) return;
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('visible');
    }, 3200);
  }

  // Atualização Visual de um Card de Calibração (Ponto 1 ou Ponto 2)
  function renderCard(pointNumber){
    const data = pointNumber === 1 ? state.calib1 : state.calib2;
    const cardEl = $(`card-calib-${pointNumber}`);
    const percentEl = $(`percent-calib-${pointNumber}`);
    const badgeEl = $(`badge-calib-${pointNumber}`);
    const barEl = $(`bar-fill-${pointNumber}`);
    const markerEl = $(`marker-calib-${pointNumber}`);
    const voltageEl = $(`voltage-calib-${pointNumber}`);
    const ntuEl = $(`ntu-calib-${pointNumber}`);
    const timeEl = $(`time-calib-${pointNumber}`);

    if(!cardEl) return;

    const status = D.getTurbidityStatus(data.percent);

    // 1. Atualizar Cores Dinâmicas do Card (Transição suave 0.3s)
    cardEl.classList.remove('state-neutral', 'state-clean', 'state-warning', 'state-danger');
    cardEl.classList.add(status.cardClass);

    // 2. Atualizar Badge de Status
    badgeEl.className = `badge ${status.badgeClass}`;
    badgeEl.textContent = status.label;

    // 3. Atualizar Porcentagem e Barra
    if(data.percent !== null && Number.isFinite(data.percent)){
      const formattedPercent = percentFormat.format(data.percent);
      percentEl.innerHTML = `${formattedPercent}<span class="metric-symbol">%</span>`;
      
      const clampedPercent = Math.max(0, Math.min(100, data.percent));
      barEl.style.width = `${clampedPercent}%`;
      markerEl.style.left = `${clampedPercent}%`;
    } else {
      percentEl.innerHTML = `—<span class="metric-symbol">%</span>`;
      barEl.style.width = '0%';
      markerEl.style.left = '0%';
    }

    // 4. Métricas Técnicas
    voltageEl.textContent = data.voltage !== null ? `${voltageFormat.format(data.voltage)} V` : '— V';
    ntuEl.textContent = data.ntu !== null ? `${decimalFormat.format(data.ntu)} NTU` : '— NTU';
    
    if(data.timestamp){
      const dateObj = new Date(data.timestamp);
      timeEl.textContent = `${dateFormat.format(dateObj)} às ${timeFormat.format(dateObj)}`;
    } else {
      timeEl.textContent = 'Aguardando calibração';
    }
  }

  // Renderizar a Lista do Histórico Lateral (Coluna 3)
  function renderHistory(){
    const listEl = $('history-list');
    const countEl = $('history-count');
    if(!listEl || !countEl) return;

    countEl.textContent = `${state.history.length} registro${state.history.length === 1 ? '' : 's'}`;

    if(state.history.length === 0){
      listEl.innerHTML = `
        <li class="history-empty">
          <span class="empty-icon" aria-hidden="true">💧</span>
          <p>Nenhuma leitura registrada.</p>
          <small>Conecte o sensor ou execute uma calibração para iniciar.</small>
        </li>
      `;
      return;
    }

    listEl.replaceChildren();

    // Exibe os mais recentes primeiro
    state.history.slice().reverse().forEach(item => {
      const status = D.getTurbidityStatus(item.percent);
      const li = document.createElement('li');
      li.className = 'history-item';

      const dateObj = new Date(item.timestamp);
      const formattedTime = timeFormat.format(dateObj);
      const formattedDate = dateFormat.format(dateObj);

      li.innerHTML = `
        <div class="history-item-left">
          <span class="history-status-dot ${status.dotClass}" title="${status.description}"></span>
          <div class="history-item-meta">
            <span class="history-item-source">${item.source || 'Leitura Sensor'}</span>
            <span class="history-item-time">${formattedDate} às ${formattedTime}</span>
          </div>
        </div>
        <div class="history-item-right">
          <span class="history-item-percent">${percentFormat.format(item.percent)}%</span>
          <span class="history-item-ntu">${item.voltage !== null ? voltageFormat.format(item.voltage) + ' V' : decimalFormat.format(item.ntu) + ' NTU'}</span>
        </div>
      `;

      listEl.appendChild(li);
    });
  }

  // Adicionar Leitura ao Histórico e Atualizar UI
  function addHistoryReading(percent, voltage, ntu, source = 'Leitura Sensor'){
    const entry = {
      id: `reading-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      percent: Number(percent),
      voltage: voltage !== null ? Number(voltage) : null,
      ntu: ntu !== null ? Number(ntu) : D.percentToNTU(percent),
      source,
      timestamp: new Date().toISOString()
    };

    state.history.push(entry);
    // Limite máximo de 200 leituras no histórico para manter fluidez
    if(state.history.length > 200){
      state.history.shift();
    }

    saveState();
    renderHistory();

    const syncEl = $('last-sync-time');
    if(syncEl){
      syncEl.textContent = `Última leitura: ${timeFormat.format(new Date())}`;
    }
  }

  // Processar Linha de Dados Reais Vinda do Sensor Serial
  function handleSerialLine(line){
    const parsed = D.parseSerialData(line);
    if(!parsed) return;

    if(parsed.voltage !== null){
      lastLiveVoltage = parsed.voltage;
      const modalLiveVal = $('modal-live-value');
      if(modalLiveVal){
        modalLiveVal.textContent = `${voltageFormat.format(parsed.voltage)} V`;
      }
      const modalLiveTag = $('modal-live-status');
      if(modalLiveTag){
        modalLiveTag.textContent = 'Recebendo sinal estável';
        modalLiveTag.style.color = '#16A34A';
      }
    }

    // Se a mensagem especificar um ponto (P1 ou P2)
    if(parsed.point === 1 || parsed.point === 2){
      const p = parsed.point;
      const percent = parsed.percent !== null ? parsed.percent : D.calculatePercentFromVoltage(parsed.voltage, state.calib1, state.calib2);
      const voltage = parsed.voltage;
      const ntu = parsed.ntu !== null ? parsed.ntu : D.percentToNTU(percent);

      if(p === 1){
        state.calib1 = { percent, voltage, ntu, timestamp: new Date().toISOString() };
        renderCard(1);
      } else {
        state.calib2 = { percent, voltage, ntu, timestamp: new Date().toISOString() };
        renderCard(2);
      }

      saveState();
      addHistoryReading(percent, voltage, ntu, `Calibração Ponto ${p}`);
      toast(`Dados recebidos para Calibração ${p}: ${percentFormat.format(percent)}%`);
      return;
    }

    // Leitura contínua normal do sensor
    let calcPercent = parsed.percent;
    if(calcPercent === null && parsed.voltage !== null){
      calcPercent = D.calculatePercentFromVoltage(parsed.voltage, state.calib1, state.calib2);
    }

    if(calcPercent !== null && Number.isFinite(calcPercent)){
      const ntuVal = parsed.ntu !== null ? parsed.ntu : D.percentToNTU(calcPercent);
      
      // Atualizar o card ativo mais relevante ou o Ponto 2 (amostra em teste)
      state.calib2.percent = calcPercent;
      state.calib2.voltage = parsed.voltage !== null ? parsed.voltage : state.calib2.voltage;
      state.calib2.ntu = ntuVal;
      state.calib2.timestamp = new Date().toISOString();

      renderCard(2);
      addHistoryReading(calcPercent, parsed.voltage, ntuVal, 'Sensor Contínuo');
    }
  }

  // Leitura do Stream Serial
  async function readSerialStream(){
    if(!serialPort?.readable) return;
    const decoder = new TextDecoder();

    try {
      serialReader = serialPort.readable.getReader();
      while(true){
        const { value, done } = await serialReader.read();
        if(done) break;

        serialBuffer += decoder.decode(value, { stream: true });
        const lines = serialBuffer.split(/\r?\n/);
        serialBuffer = lines.pop() || '';

        lines.forEach(handleSerialLine);
      }
    } catch(err) {
      if(serialPort){
        console.warn('Conexão serial encerrada:', err);
        toast('Conexão serial encerrada.');
      }
    } finally {
      try { serialReader?.releaseLock(); } catch{}
      serialReader = null;
    }
  }

  // Desconectar Porta Serial
  async function disconnectSerial(){
    try {
      if(serialReader){
        await serialReader.cancel();
      }
    } catch{}

    try {
      if(serialReader){
        serialReader.releaseLock();
      }
    } catch{}
    serialReader = null;

    try {
      if(serialPort){
        await serialPort.close();
      }
    } catch{}
    serialPort = null;

    // Atualizar UI para Estado Desconectado
    $('btn-connect').classList.remove('connected');
    $('connect-pulse').className = 'status-pulse disconnected';
    $('connect-label').textContent = 'Conectar Sensor';
    
    const textPill = $('hardware-status-text');
    if(textPill){
      textPill.className = 'status-text-pill';
      textPill.textContent = 'Sensor desconectado';
    }

    toast('Sensor desconectado.');
  }

  // Conectar Porta Serial (Web Serial API)
  async function connectSerial(){
    if(serialPort){
      await disconnectSerial();
      return;
    }

    if(!('serial' in navigator)){
      toast('Este navegador não suporta a Web Serial API. Use o Google Chrome ou Microsoft Edge.');
      return;
    }

    try {
      serialPort = await navigator.serial.requestPort();
      await serialPort.open({ baudRate: 9600 });

      // Atualizar UI para Estado Conectado com Efeito Pulse Verde
      $('btn-connect').classList.add('connected');
      $('connect-pulse').className = 'status-pulse connected';
      $('connect-label').textContent = 'Desconectar';

      const textPill = $('hardware-status-text');
      if(textPill){
        textPill.className = 'status-text-pill connected';
        textPill.textContent = 'Sensor conectado · 9600 baud';
      }

      toast('Sensor conectado com sucesso via USB Serial!');
      readSerialStream();
    } catch(err) {
      serialPort = null;
      if(err?.name !== 'NotFoundError'){
        console.error('Falha na conexão serial:', err);
        toast('Não foi possível abrir a porta serial.');
      }
    }
  }

  // Abrir Modal de Calibração
  function openCalibModal(pointNumber){
    currentModalPoint = pointNumber;
    const dialog = $('calib-dialog');
    if(!dialog) return;

    $('modal-eyebrow').textContent = `CALIBRAÇÃO · PONTO 0${pointNumber}`;
    $('modal-calib-title').textContent = pointNumber === 1 ? 'Primeira Calibração (Água Limpa)' : 'Segunda Calibração (Amostra Turva)';
    $('modal-description').textContent = pointNumber === 1 
      ? 'Mergulhe o sensor na água de referência límpida (0% turbidez) e confirme o valor lido.'
      : 'Mergulhe o sensor na amostra padrão ou turva para registrar o segundo ponto da curva de calibração.';

    // Pré-preencher valores
    const currentCalib = pointNumber === 1 ? state.calib1 : state.calib2;
    $('modal-input-percent').value = currentCalib.percent !== null ? currentCalib.percent : (pointNumber === 1 ? '0.0' : '100.0');
    $('modal-input-voltage').value = lastLiveVoltage !== null ? lastLiveVoltage : (currentCalib.voltage !== null ? currentCalib.voltage : (pointNumber === 1 ? '4.150' : '2.500'));

    const modalLiveVal = $('modal-live-value');
    if(modalLiveVal){
      modalLiveVal.textContent = lastLiveVoltage !== null ? `${voltageFormat.format(lastLiveVoltage)} V` : '— V';
    }

    dialog.showModal();
    $('modal-input-percent').focus();
  }

  // Salvar Calibração do Modal
  function saveModalCalibration(){
    const percentInput = $('modal-input-percent').value.trim();
    const voltageInput = $('modal-input-voltage').value.trim();

    const percent = percentInput !== '' ? Number(percentInput.replace(',', '.')) : null;
    const voltage = voltageInput !== '' ? Number(voltageInput.replace(',', '.')) : null;

    if(percent === null || Number.isNaN(percent) || percent < 0 || percent > 100){
      toast('Informe uma porcentagem válida entre 0% e 100%.');
      return;
    }

    if(voltage !== null && (Number.isNaN(voltage) || voltage < 0 || voltage > 5.0)){
      toast('Informe uma tensão válida entre 0V e 5.0V.');
      return;
    }

    const ntu = D.percentToNTU(percent);
    const now = new Date().toISOString();

    if(currentModalPoint === 1){
      state.calib1 = { percent, voltage, ntu, timestamp: now };
      renderCard(1);
      toast(`Primeira Calibração registrada: ${percentFormat.format(percent)}%`);
      addHistoryReading(percent, voltage, ntu, 'Primeira Calibração');
    } else {
      state.calib2 = { percent, voltage, ntu, timestamp: now };
      renderCard(2);
      toast(`Segunda Calibração registrada: ${percentFormat.format(percent)}%`);
      addHistoryReading(percent, voltage, ntu, 'Segunda Calibração');
    }

    saveState();
    $('calib-dialog').close();
  }

  // Exportar Histórico para CSV Tabular
  function exportCSV(){
    if(state.history.length === 0){
      toast('Não há registros no histórico para exportar.');
      return;
    }

    let csvContent = 'ID,Origem,Porcentagem_Turbidez,Tensao_Volts,NTU_Estimado,Data_Hora\r\n';
    state.history.forEach(item => {
      const row = [
        item.id,
        `"${item.source || 'Sensor'}"`,
        item.percent,
        item.voltage !== null ? item.voltage : '',
        item.ntu !== null ? item.ntu : '',
        `"${item.timestamp}"`
      ];
      csvContent += row.join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aqua_turbidez_historico_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Histórico exportado com sucesso em CSV!');
  }

  // Limpar Histórico de Leituras
  function clearHistory(){
    if(state.history.length === 0) return;
    if(window.confirm('Tem certeza de que deseja limpar todo o histórico de leituras?')){
      state.history = [];
      saveState();
      renderHistory();
      toast('Histórico de leituras limpo.');
    }
  }

  // ============================================================
  // REGISTRO DE EVENTOS E INTERATIVIDADE
  // ============================================================

  // 1. Botão Conectar Sensor
  $('btn-connect').addEventListener('click', connectSerial);

  // 2. Botões de Ação do Header (Primeira e Segunda Calibração com espaçamento 12px)
  $('btn-header-calib-1').addEventListener('click', () => openCalibModal(1));
  $('btn-header-calib-2').addEventListener('click', () => openCalibModal(2));

  // 3. Botões de Ação nos Cards
  $('btn-card-calib-1').addEventListener('click', () => openCalibModal(1));
  $('btn-card-calib-2').addEventListener('click', () => openCalibModal(2));

  // 4. Modal de Calibração
  $('btn-modal-close').addEventListener('click', () => $('calib-dialog').close());
  $('btn-modal-cancel').addEventListener('click', () => $('calib-dialog').close());
  $('btn-modal-save').addEventListener('click', saveModalCalibration);

  // 5. Ações do Histórico (Exportar e Limpar)
  $('btn-export-csv').addEventListener('click', exportCSV);
  $('btn-clear-history').addEventListener('click', clearHistory);

  // Fechar modal ao clicar fora da caixa
  $('calib-dialog').addEventListener('click', e => {
    const rect = $('calib-dialog').getBoundingClientRect();
    if(
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ){
      $('calib-dialog').close();
    }
  });

  // Inicialização da Interface
  renderCard(1);
  renderCard(2);
  renderHistory();

})();
