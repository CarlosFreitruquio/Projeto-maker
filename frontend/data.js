/**
 * Aqua — Módulo de Dados e Calibração de Turbidez
 * Funções puras de cálculo, interpolação de calibração e classificação de qualidade.
 */
(function(root){
  'use strict';

  /**
   * Classifica a condição da água com base na porcentagem de turbidez (0% a 100%)
   * Regras especificadas:
   * - 0% a 30%: Baixa Turbidez (Água Limpa) -> "Estável"
   * - 31% a 60%: Média Turbidez (Atenção)    -> "Atenção"
   * - 61% a 100%: Alta Turbidez (Crítico)    -> "Perigo"
   */
  function getTurbidityStatus(percent){
    if(percent === null || percent === undefined || Number.isNaN(percent)){
      return {
        type: 'neutral',
        label: 'Sem Leitura',
        cardClass: 'state-neutral',
        badgeClass: 'badge-neutral',
        dotClass: '',
        description: 'Aguardando dados do sensor'
      };
    }

    const value = Math.max(0, Math.min(100, Number(percent)));

    if(value <= 30.0){
      return {
        type: 'clean',
        label: 'Estável',
        cardClass: 'state-clean',
        badgeClass: 'badge-clean',
        dotClass: 'dot-clean',
        description: 'Água Limpa (0% a 30%)'
      };
    }

    if(value <= 60.0){
      return {
        type: 'warning',
        label: 'Atenção',
        cardClass: 'state-warning',
        badgeClass: 'badge-warning',
        dotClass: 'dot-warning',
        description: 'Média Turbidez (31% a 60%)'
      };
    }

    return {
      type: 'danger',
      label: 'Perigo',
      cardClass: 'state-danger',
      badgeClass: 'badge-danger',
      dotClass: 'dot-danger',
      description: 'Alta Turbidez (61% a 100%)'
    };
  }

  /**
   * Converte tensão analógica (V) em Porcentagem de Turbidez
   * utilizando os 2 pontos de calibração calibrados pelo usuário.
   */
  function calculatePercentFromVoltage(voltage, calib1, calib2){
    if(voltage === null || voltage === undefined) return null;
    const v = Number(voltage);
    if(!Number.isFinite(v)) return null;

    // Se temos os dois pontos de calibração com tensões distintas
    if(calib1 && calib2 && Number.isFinite(calib1.voltage) && Number.isFinite(calib2.voltage)){
      const v1 = calib1.voltage;
      const p1 = calib1.percent;
      const v2 = calib2.voltage;
      const p2 = calib2.percent;

      if(Math.abs(v1 - v2) > 0.001){
        // Interpolação linear entre os dois pontos
        const slope = (p2 - p1) / (v2 - v1);
        const calculated = p1 + slope * (v - v1);
        return Math.max(0, Math.min(100, Number(calculated.toFixed(1))));
      }
    }

    // Curva empírica padrão de sensores analógicos de turbidez (5V = 0%, 2.5V ou menos = 100%)
    const defaultPercent = ((4.2 - v) / (4.2 - 2.5)) * 100;
    return Math.max(0, Math.min(100, Number(defaultPercent.toFixed(1))));
  }

  /**
   * Converte Porcentagem de Turbidez em valor estimado em NTU
   * (Escala de 0 a 1000 NTU proporcional)
   */
  function percentToNTU(percent){
    if(percent === null || percent === undefined) return null;
    const p = Math.max(0, Math.min(100, Number(percent)));
    // Mapeamento proporcional: 0% = ~0 NTU, 100% = ~1000 NTU (não-linear suave)
    const ntu = (p / 100) * 800;
    return Number(ntu.toFixed(1));
  }

  /**
   * Interpreta uma linha de texto serial vinda do Arduino / ESP32
   * Suporta formatos:
   * - JSON: {"percent": 12.5, "voltage": 4.12, "ntu": 25.0}
   * - CSV: "PERCENT,12.5" ou "VOLTAGE,4.12" ou "TURBIDITY,15.2"
   * - Ponto direto: "P1,12.5,4.15" ou "P2,85.0,2.60"
   * - Número puro: "4.12" ou "12.5"
   */
  function parseSerialData(line){
    const clean = String(line).trim();
    if(!clean) return null;

    // 1. Formato JSON
    if(clean.startsWith('{') && clean.endsWith('}')){
      try{
        const data = JSON.parse(clean);
        return {
          percent: data.percent !== undefined ? Number(data.percent) : null,
          voltage: data.voltage !== undefined ? Number(data.voltage) : null,
          ntu: data.ntu !== undefined ? Number(data.ntu) : null,
          point: data.point || null
        };
      }catch{
        return null;
      }
    }

    // 2. Formato CSV / Comma Separated
    const parts = clean.split(',').map(s => s.trim());
    if(parts.length >= 2){
      const header = parts[0].toUpperCase();
      const val = Number(parts[1].replace(',', '.'));

      if(Number.isFinite(val)){
        if(header === 'PERCENT' || header === 'PORCENTAGEM' || header === 'TURBIDITY' || header === 'TURBIDEZ'){
          return { percent: val, voltage: null, ntu: null, point: null };
        }
        if(header === 'VOLTAGE' || header === 'VOLT' || header === 'TENSAO'){
          return { percent: null, voltage: val, ntu: null, point: null };
        }
        if(header === 'P1'){
          const volt2 = parts[2] ? Number(parts[2].replace(',', '.')) : null;
          return { percent: val, voltage: volt2, ntu: null, point: 1 };
        }
        if(header === 'P2'){
          const volt2 = parts[2] ? Number(parts[2].replace(',', '.')) : null;
          return { percent: val, voltage: volt2, ntu: null, point: 2 };
        }
      }
    }

    // 3. Número único
    const directNum = Number(clean.replace(',', '.'));
    if(Number.isFinite(directNum)){
      // Se for menor ou igual a 5.0, tipicamente é tensão em Volts
      if(directNum <= 5.0){
        return { percent: null, voltage: directNum, ntu: null, point: null };
      }
      // Se for maior que 5.0, tipicamente é porcentagem
      return { percent: directNum, voltage: null, ntu: null, point: null };
    }

    return null;
  }

  const api = {
    getTurbidityStatus,
    calculatePercentFromVoltage,
    percentToNTU,
    parseSerialData
  };

  root.AquaTurbidityData = api;

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
