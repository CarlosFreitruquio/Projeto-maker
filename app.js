(function(){
  'use strict';

  const D=window.AquaData;
  const KEY='aqua.ph.history.v1';

  const $=id=>document.getElementById(id);

  const decimal=new Intl.NumberFormat('pt-BR',{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });

  const integer=new Intl.NumberFormat('pt-BR');

  const clock=new Intl.DateTimeFormat('pt-BR',{
    hour:'2-digit',
    minute:'2-digit',
    second:'2-digit'
  });

  const date=new Intl.DateTimeFormat('pt-BR',{
    day:'2-digit',
    month:'2-digit'
  });

  const pages={
    'fonte-1':1,
    'fonte-2':1
  };

  let state;
  let storageWarning='';
  let mode='manual';
  let toastTimer;
  let pageSize=6;
  let resizeFrame;

  let serialPort=null;
  let serialReader=null;
  let serialBuffer='';

  try{
    const raw=localStorage.getItem(KEY);

    state=raw
      ? D.restoreState(raw)
      : D.seedState();

  }catch{
    state=D.seedState();
    storageWarning=
      'Histórico anterior indisponível · sessão reiniciada';
  }

  function save(){
    try{
      localStorage.setItem(
        KEY,
        JSON.stringify(state)
      );

      $('storage-status').textContent=
        storageWarning ||
        'Histórico salvo neste navegador';

    }catch{
      $('storage-status').textContent=
        'Sem salvamento · mantenha esta aba aberta';
    }
  }

  function toast(message){
    $('toast').textContent=message;
    $('toast').classList.add('visible');

    clearTimeout(toastTimer);

    toastTimer=setTimeout(
      ()=>$('toast').classList.remove('visible'),
      3200
    );
  }

  function sourceMarkup(source,index){
    return `
      <section class="panel"
               data-source="${source.id}"
               aria-labelledby="title-${source.id}">

        <div class="panel-header">

          <div class="source-name">

            <span class="source-symbol"
                  aria-hidden="true">

              <svg viewBox="0 0 24 24"
                   fill="none"
                   stroke="currentColor"
                   stroke-width="1.5">

                <path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z"/>
                <path d="M8 16c3 2 5-2 8 0"/>

              </svg>

            </span>

            <div>
              <h2 id="title-${source.id}">
                Fonte 0${index+1}
              </h2>

              <p class="source-description">
                Ponto de coleta 0${index+1}
              </p>
            </div>

          </div>

          <span class="source-index">
            0${index+1}
          </span>

        </div>

        <div class="stats">

          <div>
            <span class="metric-label">
              Média de pH
            </span>

            <div class="mean-value">
              <span data-mean>—</span>
              <span class="metric-unit">pH</span>
            </div>

            <div class="scale" aria-hidden="true">
              <div class="scale-track ph-scale"></div>
              <span class="scale-marker"></span>

              <div class="scale-labels">
                <span>0</span>
                <span>7</span>
                <span>14</span>
              </div>
            </div>
          </div>

          <div class="stat-small">
            <span class="metric-label">
              Última leitura
            </span>

            <strong data-last>—</strong>
            <small data-last-time></small>
          </div>

          <div class="stat-small">
            <span class="metric-label">
              Amostras
            </span>

            <strong data-count>0</strong>
            <small>no histórico</small>
          </div>

        </div>

        <div class="history-heading">
          <h3>Histórico de leituras</h3>
          <span>Mais recentes primeiro</span>
        </div>

        <div class="table-container">

          <table aria-label="Leituras de pH da Fonte 0${index+1}">

            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Horário</th>
                <th scope="col">Origem</th>
                <th scope="col">pH</th>
              </tr>
            </thead>

            <tbody></tbody>

          </table>

        </div>

        <div class="table-bottom">

          <span data-range></span>

          <div class="pagination">

            <button class="icon-button"
                    data-action="previous"
                    aria-label="Página anterior da Fonte 0${index+1}">
              ‹
            </button>

            <span class="page-text"
                  data-page></span>

            <button class="icon-button"
                    data-action="next"
                    aria-label="Próxima página da Fonte 0${index+1}">
              ›
            </button>

          </div>

        </div>

        <div class="panel-actions">

          <button class="button primary"
                  data-action="manual">
            <span class="plus" aria-hidden="true">+</span>
            Adicionar leitura
          </button>

          <button class="button secondary"
                  data-action="paste">
            <span class="paste-icon" aria-hidden="true"></span>
            Colar dados
          </button>

        </div>

      </section>
    `;
  }

  function renderSource(id,animate=false){
    const source=state.sources.find(
      s=>s.id===id
    );

    const panel=document.querySelector(
      `[data-source="${id}"]`
    );

    if(!panel) return;

    const readings=source.readings;
    const average=D.mean(readings);
    const last=readings.at(-1);

    const pageCount=Math.max(
      1,
      Math.ceil(readings.length/pageSize)
    );

    pages[id]=Math.min(
      pages[id],
      pageCount
    );

    panel.querySelector(
      '[data-mean]'
    ).textContent=
      average===null
        ? '—'
        : decimal.format(average);

    panel.querySelector(
      '.scale-marker'
    ).style.left=
      (average===null
        ? 50
        : average/14*100)+'%';

    panel.querySelector(
      '[data-last]'
    ).textContent=
      last
        ? decimal.format(last.ph)
        : '—';

    panel.querySelector(
      '[data-last-time]'
    ).textContent=
      last
        ? clock.format(
            new Date(last.timestamp)
          )
        : '';

    panel.querySelector(
      '[data-count]'
    ).textContent=
      integer.format(readings.length);

    const offset=
      (pages[id]-1)*pageSize;

    const visible=
      readings
        .slice()
        .reverse()
        .slice(
          offset,
          offset+pageSize
        );

    const body=panel.querySelector('tbody');

    body.replaceChildren();

    const origins={
      simulado:'Simulação',
      manual:'Manual',
      colado:'Colagem',
      sensor:'Sensor'
    };

    visible.forEach((reading,i)=>{
      const tr=document.createElement('tr');

      if(
        animate &&
        i===0 &&
        pages[id]===1
      ){
        tr.className='new-row';
      }

      const n=document.createElement('td');

      n.textContent=
        String(
          readings.length-offset-i
        ).padStart(2,'0');

      const t=document.createElement('td');
      const time=document.createElement('time');
      const day=document.createElement('small');

      time.dateTime=reading.timestamp;
      time.textContent=
        clock.format(
          new Date(reading.timestamp)
        );

      day.textContent=
        date.format(
          new Date(reading.timestamp)
        );

      time.append(day);
      t.append(time);

      const o=document.createElement('td');

      o.className='origin';
      o.textContent=
        origins[reading.origin];

      const p=document.createElement('td');

      p.textContent=
        decimal.format(reading.ph);

      tr.append(
        n,
        t,
        o,
        p
      );

      body.append(tr);
    });

    panel.querySelector(
      '[data-range]'
    ).textContent=
      readings.length
        ? `${offset+1}–${Math.min(
            offset+pageSize,
            readings.length
          )} de ${integer.format(
            readings.length
          )}`
        : 'Sem leituras';

    panel.querySelector(
      '[data-page]'
    ).textContent=
      `${pages[id]} / ${pageCount}`;

    panel.querySelector(
      '[data-action="previous"]'
    ).disabled=
      pages[id]===1;

    panel.querySelector(
      '[data-action="next"]'
    ).disabled=
      pages[id]===pageCount;
  }

  function renderTurbidity(animate=false){
    const readings=
      state.turbidityReadings;

    const average=
      D.meanTurbidity(readings);

    const last=
      readings.at(-1);

    const pageCount=Math.max(
      1,
      Math.ceil(
        readings.length/pageSize
      )
    );

    const panel=
      $('turbidity-panel');

    const page=Math.min(
      Number(
        panel.dataset.page||1
      ),
      pageCount
    );

    panel.dataset.page=
      String(page);

    $('turbidity-mean').textContent=
      average===null
        ? '—'
        : decimal.format(average);

    $('turbidity-last').textContent=
      last
        ? decimal.format(last.ntu)
        : '—';

    $('turbidity-last-time').textContent=
      last
        ? clock.format(
            new Date(last.timestamp)
          )
        : '';

    $('turbidity-count').textContent=
      integer.format(
        readings.length
      );

    $('turbidity-marker').style.left=
      (
        average===null
          ? 10
          : Math.min(
              100,
              average/100*100
            )
      )+'%';

    const offset=
      (page-1)*pageSize;

    const visible=
      readings
        .slice()
        .reverse()
        .slice(
          offset,
          offset+pageSize
        );

    const body=
      $('turbidity-body');

    body.replaceChildren();

    const origins={
      simulado:'Simulação',
      manual:'Manual',
      sensor:'Sensor'
    };

    visible.forEach((reading,i)=>{
      const tr=document.createElement('tr');

      if(
        animate &&
        i===0 &&
        page===1
      ){
        tr.className='new-row';
      }

      const n=document.createElement('td');

      n.textContent=
        String(
          readings.length-offset-i
        ).padStart(2,'0');

      const t=document.createElement('td');
      const time=document.createElement('time');
      const day=document.createElement('small');

      time.dateTime=
        reading.timestamp;

      time.textContent=
        clock.format(
          new Date(
            reading.timestamp
          )
        );

      day.textContent=
        date.format(
          new Date(
            reading.timestamp
          )
        );

      time.append(day);
      t.append(time);

      const o=document.createElement('td');

      o.className='origin';
      o.textContent=
        origins[reading.origin];

      const v=document.createElement('td');

      v.textContent=
        decimal.format(
          reading.ntu
        )+' NTU';

      tr.append(
        n,
        t,
        o,
        v
      );

      body.append(tr);
    });

    $('turbidity-range').textContent=
      readings.length
        ? `${offset+1}–${Math.min(
            offset+pageSize,
            readings.length
          )} de ${integer.format(
            readings.length
          )}`
        : 'Sem leituras';

    $('turbidity-page').textContent=
      `${page} / ${pageCount}`;

    $('turbidity-prev').disabled=
      page===1;

    $('turbidity-next').disabled=
      page===pageCount;
  }

  function resizeTables(){
    const box=
      document.querySelector(
        '.table-container'
      );

    if(!box) return;

    const available=
      box.clientHeight-30;

    pageSize=Math.max(
      3,
      Math.min(
        12,
        Math.floor(
          available/37
        )
      )
    );

    document
      .querySelectorAll(
        '.table-container'
      )
      .forEach(el=>{
        el.style.setProperty(
          '--row-height',
          Math.max(
            24,
            Math.min(
              48,
              Math.floor(
                available/pageSize
              )-1
            )
          )+'px'
        );
      });

    state.sources.forEach(
      s=>renderSource(s.id)
    );

    renderTurbidity();
  }

  function updateControls(){
    $('second-source').checked=
      state.secondSource;

    $('simulation').setAttribute(
      'aria-pressed',
      String(state.running)
    );

    $('simulation-label').textContent=
      state.running
        ? 'Pausar simulação'
        : 'Retomar simulação';

    $('simulation')
      .querySelector('.pause-icon')
      .textContent=
        state.running
          ? 'Ⅱ'
          : '▷';

    $('live-label').textContent=
      state.running
        ? 'Nova leitura a cada 5 s'
        : 'Simulação pausada';

    $('live-dot').classList.toggle(
      'paused',
      !state.running
    );
  }

  function renderPanels(){
    const container=$('panels');

    container.classList.toggle(
      'dual',
      state.secondSource
    );

    if(!container.children.length){
      container.innerHTML=
        sourceMarkup(
          state.sources[0],
          0
        );
    }

    const second=
      container.querySelector(
        '[data-source="fonte-2"]'
      );

    if(
      state.secondSource &&
      !second
    ){
      container.insertAdjacentHTML(
        'beforeend',
        sourceMarkup(
          state.sources[1],
          1
        )
      );
    }

    if(
      !state.secondSource &&
      second
    ){
      second.remove();
    }

    updateControls();
    resizeTables();
  }

  function add(
    sourceId,
    values,
    origin,
    timestamp
  ){
    const added=
      D.receiveReadings(
        state,
        sourceId,
        values,
        origin,
        timestamp
      );

    save();
    renderSource(
      sourceId,
      true
    );

    return added;
  }

  function addTurbidity(
    values,
    origin,
    timestamp
  ){
    const added=
      D.receiveTurbidity(
        state,
        values,
        origin,
        timestamp
      );

    save();
    renderTurbidity(true);

    return added;
  }

  function setMode(next){
    mode=next;

    ['manual','paste']
      .forEach(m=>{
        const active=
          m===mode;

        $(m+'-tab')
          .setAttribute(
            'aria-selected',
            String(active)
          );

        $(m+'-tab').tabIndex=
          active
            ? 0
            : -1;

        $(m+'-panel')
          .hidden=!active;
      });

    $('entry-error')
      .textContent='';

    $('ph-input')
      .removeAttribute(
        'aria-invalid'
      );

    updatePreview();
  }

  function updatePreview(){
    const parsed=
      D.parseColumn(
        $('paste-input').value
      );

    const preview=
      $('paste-preview');

    preview.replaceChildren();

    preview.classList.toggle(
      'invalid',
      parsed.invalid.length>0
    );

    if(
      !parsed.readings.length &&
      !parsed.invalid.length
    ){
      preview.textContent=
        'A prévia aparece aqui antes de importar.';
    }else{
      const summary=
        document.createElement('div');

      summary.className=
        'preview-summary';

      summary.textContent=
        `${parsed.readings.length} leitura(s) válida(s)`+
        (
          parsed.readings.length
            ? ` · média ${decimal.format(
                D.mean(
                  parsed.readings.map(
                    ph=>({ph})
                  )
                )
              )}`
            : ''
        );

      preview.append(summary);

      if(parsed.readings.length){
        const values=
          document.createElement('div');

        values.textContent=
          parsed.readings
            .slice(0,8)
            .map(
              ph=>decimal.format(ph)
            )
            .join(' · ')+
          (
            parsed.readings.length>8
              ? ' …'
              : ''
          );

        preview.append(values);
      }

      parsed.invalid
        .slice(0,6)
        .forEach(item=>{
          const line=
            document.createElement(
              'div'
            );

          line.className=
            'preview-invalid';

          line.textContent=
            `Linha ${item.line}: “${item.value.slice(
              0,
              50
            )}” — informe um pH entre 0 e 14.`;

          preview.append(line);
        });

      if(parsed.invalid.length>6){
        const more=
          document.createElement(
            'div'
          );

        more.className=
          'preview-invalid';

        more.textContent=
          `E mais ${
            parsed.invalid.length-6
          } linha(s) inválida(s).`;

        preview.append(more);
      }
    }

    $('submit-entry').textContent=
      mode==='manual'
        ? 'Adicionar leitura'
        : `Importar${
            parsed.readings.length
              ? ' '+parsed.readings.length
              : ''
          } leitura${
            parsed.readings.length===1
              ? ''
              : 's'
          }`;

    $('submit-entry').disabled=
      mode==='paste' &&
      (
        !parsed.readings.length ||
        parsed.invalid.length>0
      );
  }

  function openEntry(id,nextMode){
    $('target-source')
      .querySelector(
        'option[value="fonte-2"]'
      )
      .disabled=
        !state.secondSource;

    $('target-source').value=id;

    $('ph-input').value='';
    $('paste-input').value='';

    setMode(nextMode);

    $('entry-dialog').showModal();

    (
      nextMode==='manual'
        ? $('ph-input')
        : $('paste-input')
    ).focus();
  }

  $('panels').addEventListener(
    'click',
    event=>{
      const button=
        event.target.closest(
          'button[data-action]'
        );

      if(!button) return;

      const id=
        button.closest(
          '.panel'
        ).dataset.source;

      const action=
        button.dataset.action;

      if(
        action==='manual' ||
        action==='paste'
      ){
        openEntry(
          id,
          action
        );
      }else{
        pages[id]+=
          action==='next'
            ? 1
            : -1;

        renderSource(id);
      }
    }
  );

  $('second-source')
    .addEventListener(
      'change',
      ()=>{
        state.secondSource=
          $('second-source').checked;

        save();
        renderPanels();
      }
    );

  $('simulation')
    .addEventListener(
      'click',
      ()=>{
        state.running=
          !state.running;

        save();
        updateControls();
      }
    );

  $('close-dialog')
    .addEventListener(
      'click',
      ()=>$('entry-dialog').close()
    );

  ['manual','paste']
    .forEach(m=>
      $(m+'-tab')
        .addEventListener(
          'click',
          ()=>setMode(m)
        )
    );

  document
    .querySelector('.entry-tabs')
    .addEventListener(
      'keydown',
      event=>{
        if([
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End'
        ].includes(event.key)){
          event.preventDefault();

          setMode(
            event.key==='Home'
              ? 'manual'
              : event.key==='End'
                ? 'paste'
                : mode==='manual'
                  ? 'paste'
                  : 'manual'
          );

          $(mode+'-tab').focus();
        }
      }
    );

  $('paste-input')
    .addEventListener(
      'input',
      ()=>{
        $('entry-error')
          .textContent='';

        updatePreview();
      }
    );

  $('ph-input')
    .addEventListener(
      'input',
      ()=>{
        $('entry-error')
          .textContent='';

        $('ph-input')
          .removeAttribute(
            'aria-invalid'
          );
      }
    );

  $('entry-form')
    .addEventListener(
      'submit',
      event=>{
        event.preventDefault();

        try{
          let values;

          if(mode==='manual'){
            const value=
              D.parsePH(
                $('ph-input').value
              );

            if(value===null){
              $('ph-input')
                .setAttribute(
                  'aria-invalid',
                  'true'
                );

              throw new Error(
                'Informe um pH válido entre 0 e 14.'
              );
            }

            values=[value];

          }else{
            const parsed=
              D.parseColumn(
                $('paste-input').value
              );

            if(parsed.invalid.length){
              throw new Error(
                'Corrija as linhas inválidas antes de importar.'
              );
            }

            if(!parsed.readings.length){
              throw new Error(
                'Cole ao menos uma leitura.'
              );
            }

            values=
              parsed.readings;
          }

          const id=
            $('target-source').value;

          if(
            id==='fonte-2' &&
            !state.secondSource
          ){
            throw new Error(
              'Ative a segunda fonte antes de adicionar leituras.'
            );
          }

          pages[id]=1;

          add(
            id,
            values,
            mode==='manual'
              ? 'manual'
              : 'colado'
          );

          $('entry-dialog').close();

          toast(
            `${
              values.length===1
                ? 'Leitura adicionada'
                : values.length+' leituras importadas'
            } · média atualizada`
          );

        }catch(error){
          $('entry-error')
            .textContent=
              error.message;
        }
      }
    );

  $('turbidity-prev')
    .addEventListener(
      'click',
      ()=>{
        const p=
          Number(
            $('turbidity-panel')
              .dataset.page||1
          );

        $('turbidity-panel')
          .dataset.page=
            String(
              Math.max(
                1,
                p-1
              )
            );

        renderTurbidity();
      }
    );

  $('turbidity-next')
    .addEventListener(
      'click',
      ()=>{
        const p=
          Number(
            $('turbidity-panel')
              .dataset.page||1
          );

        $('turbidity-panel')
          .dataset.page=
            String(p+1);

        renderTurbidity();
      }
    );

  async function disconnectSerial(){
    try{
      if(serialReader){
        await serialReader.cancel();
      }
    }catch{}

    try{
      if(serialReader){
        serialReader.releaseLock();
      }
    }catch{}

    serialReader=null;

    try{
      if(serialPort){
        await serialPort.close();
      }
    }catch{}

    serialPort=null;

    $('sensor-connect')
      .textContent=
        'Conectar sensor';

    $('sensor-status')
      .textContent=
        'Sensor não conectado';
  }

  function handleSerialLine(line){
    const clean=line.trim();

    if(!clean) return;

    try{

      if(clean.startsWith('{')){
        const data=
          JSON.parse(clean);

        if(
          D.parseTurbidity(
            data.turbidity
          )!==null
        ){
          addTurbidity(
            [
              D.parseTurbidity(
                data.turbidity
              )
            ],
            'sensor',
            data.timestamp
          );
        }

        if(
          D.parsePH(data.ph)!==null
        ){
          const sourceId=
            data.sourceId ||
            'fonte-1';

          add(
            sourceId,
            [
              D.parsePH(data.ph)
            ],
            'sensor',
            data.timestamp
          );
        }

        return;
      }

      const parts=
        clean
          .split(',')
          .map(v=>v.trim());

      const type=
        parts[0].toUpperCase();

      if(
        type==='TURBIDITY' ||
        type==='TURBIDEZ'
      ){
        const value=
          D.parseTurbidity(
            parts[1]
          );

        if(value!==null){
          addTurbidity(
            [value],
            'sensor',
            parts[2] ||
              new Date().toISOString()
          );

          toast(
            'Nova leitura de turbidez recebida'
          );
        }

      }else if(type==='PH'){

        const value=
          D.parsePH(
            parts[1]
          );

        const sourceId=
          parts[2] ||
          'fonte-1';

        if(value!==null){
          add(
            sourceId,
            [value],
            'sensor',
            parts[3] ||
              new Date().toISOString()
          );

          toast(
            'Nova leitura de pH recebida'
          );
        }
      }

    }catch(error){
      console.warn(
        'Linha serial ignorada:',
        error
      );
    }
  }

  async function readSerial(){
    if(!serialPort?.readable){
      return;
    }

    const decoder=
      new TextDecoder();

    try{

      serialReader=
        serialPort.readable.getReader();

      while(true){

        const {
          value,
          done
        }=
          await serialReader.read();

        if(done) break;

        serialBuffer+=
          decoder.decode(
            value,
            {stream:true}
          );

        const lines=
          serialBuffer.split(
            /\r?\n/
          );

        serialBuffer=
          lines.pop() || '';

        lines.forEach(
          handleSerialLine
        );
      }

    }catch(error){

      if(serialPort){
        toast(
          'A conexão serial foi encerrada.'
        );
      }

    }finally{

      try{
        serialReader?.releaseLock();
      }catch{}

      serialReader=null;
    }
  }

  async function connectSerial(){

    if(serialPort){
      await disconnectSerial();
      return;
    }

    if(!('serial' in navigator)){
      toast(
        'Este navegador não oferece Web Serial.'
      );

      return;
    }

    if(!window.isSecureContext){
      toast(
        'Conexão serial exige uma página HTTPS ou localhost.'
      );

      return;
    }

    try{

      serialPort=
        await navigator.serial.requestPort();

      await serialPort.open({
        baudRate:9600
      });

      state.running=false;

      save();
      updateControls();

      $('sensor-connect')
        .textContent=
          'Desconectar sensor';

      $('sensor-status')
        .textContent=
          'Sensor conectado · 9600 baud';

      toast(
        'Sensor conectado. Simulação pausada.'
      );

      readSerial();

    }catch(error){

      serialPort=null;

      if(
        error?.name!=='NotFoundError'
      ){
        toast(
          'Não foi possível conectar ao sensor.'
        );
      }
    }
  }

  $('sensor-connect')
    .addEventListener(
      'click',
      connectSerial
    );

  window.addEventListener(
    'resize',
    ()=>{
      cancelAnimationFrame(
        resizeFrame
      );

      resizeFrame=
        requestAnimationFrame(
          resizeTables
        );
    }
  );

  setInterval(
    ()=>{
      if(
        !state.running ||
        document.hidden ||
        serialPort
      ){
        return;
      }

      state.sources
        .filter(
          (s,i)=>
            i===0 ||
            state.secondSource
        )
        .forEach(
          (source,index)=>{
            const lastSimulation=
              source.readings.findLast(
                r=>r.origin==='simulado'
              );

            const center=
              index===0
                ? 7.17
                : 6.86;

            const anchor=
              lastSimulation?.ph ??
              center;

            const ph=
              Number(
                Math.min(
                  14,
                  Math.max(
                    0,
                    anchor*.75+
                    center*.25+
                    (Math.random()-.5)*.15
                  )
                ).toFixed(3)
              );

            add(
              source.id,
              [ph],
              'simulado'
            );
          }
        );

      const lastT=
        state.turbidityReadings.findLast(
          r=>r.origin==='simulado'
        );

      const anchor=
        lastT?.ntu ?? 5;

      const ntu=
        Number(
          Math.max(
            0,
            anchor*.8+
            5*.2+
            (Math.random()-.5)*.8
          ).toFixed(2)
        );

      addTurbidity(
        [ntu],
        'simulado'
      );

    },
    5000
  );

  window.Aqua={

    receiveReadings({
      sourceId,
      values,
      origin='sensor',
      timestamp
    }){
      return add(
        sourceId,
        values,
        origin,
        timestamp
      );
    },

    receiveTurbidity({
      values,
      origin='sensor',
      timestamp
    }){
      return addTurbidity(
        values,
        origin,
        timestamp
      );
    },

    getSummary(){
      return state.sources
        .filter(
          (s,i)=>
            i===0 ||
            state.secondSource
        )
        .map(s=>({
          sourceId:s.id,
          count:s.readings.length,
          mean:D.mean(
            s.readings
          ),
          last:
            s.readings.at(-1) ||
            null
        }));
    },

    getTurbiditySummary(){
      return {
        count:
          state.turbidityReadings.length,

        mean:
          D.meanTurbidity(
            state.turbidityReadings
          ),

        last:
          state.turbidityReadings.at(-1) ||
          null
      };
    }
  };

  renderPanels();
  renderTurbidity();
  save();

  const context=
    document.modelContext;

  if(context?.registerTool){

    const lifecycle=
      new AbortController();

    window.addEventListener(
      'pagehide',
      ()=>lifecycle.abort(),
      {once:true}
    );

    const definitions=[

      {
        name:'read_ph_summary',
        description:
          'Read the count, arithmetic mean and last reading of each visible water source.',
        inputSchema:{
          type:'object',
          properties:{},
          additionalProperties:false
        },
        annotations:{
          readOnlyHint:true
        },
        execute:
          ()=>window.Aqua.getSummary()
      },

      {
        name:'read_turbidity_summary',
        description:
          'Read the count, arithmetic mean and last turbidity reading in NTU.',
        inputSchema:{
          type:'object',
          properties:{},
          additionalProperties:false
        },
        annotations:{
          readOnlyHint:true
        },
        execute:
          ()=>window.Aqua.getTurbiditySummary()
      },

      {
        name:'add_ph_readings',
        description:
          'Add one or more pH readings to an active water source.',
        inputSchema:{
          type:'object',
          properties:{
            sourceId:{
              type:'string',
              enum:[
                'fonte-1',
                'fonte-2'
              ]
            },
            values:{
              type:'array',
              items:{
                type:'number',
                minimum:0,
                maximum:14
              },
              minItems:1
            }
          },
          required:[
            'sourceId',
            'values'
          ],
          additionalProperties:false
        },
        annotations:{
          readOnlyHint:false
        },
        execute(input){

          if(
            !input ||
            !Array.isArray(input.values) ||
            input.values.some(
              v=>typeof v!=='number'
            ) ||
            ![
              'fonte-1',
              'fonte-2'
            ].includes(
              input.sourceId
            ) ||
            (
              input.sourceId==='fonte-2' &&
              !state.secondSource
            )
          ){
            throw new Error(
              'Informe uma fonte ativa e valores de pH numéricos.'
            );
          }

          add(
            input.sourceId,
            input.values,
            'manual'
          );

          return window.Aqua
            .getSummary()
            .find(
              s=>
                s.sourceId===
                input.sourceId
            );
        }
      },

      {
        name:'add_turbidity_readings',
        description:
          'Add one or more turbidity readings in NTU.',
        inputSchema:{
          type:'object',
          properties:{
            values:{
              type:'array',
              items:{
                type:'number',
                minimum:0
              },
              minItems:1
            }
          },
          required:['values'],
          additionalProperties:false
        },
        annotations:{
          readOnlyHint:false
        },
        execute(input){

          if(
            !input ||
            !Array.isArray(input.values) ||
            input.values.some(
              v=>
                typeof v!=='number' ||
                v<0
            )
          ){
            throw new Error(
              'Informe valores de turbidez em NTU.'
            );
          }

          addTurbidity(
            input.values,
            'manual'
          );

          return window.Aqua
            .getTurbiditySummary();
        }
      }

    ];

    definitions.forEach(
      tool=>{
        try{
          Promise
            .resolve(
              context.registerTool(
                tool,
                {
                  signal:
                    lifecycle.signal
                }
              )
            )
            .catch(()=>{});
        }catch{}
      }
    );
  }

})();