/* Editor de fluxos: sequência de passos executada em uma conversa */
(async function () {
  const { h, confirm, toast } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const $ = (s) => document.querySelector(s);

  await S.ensureDefaults();
  let fluxo = await S.get('fluxo');
  let respostas = await S.get('respostasRapidas');
  let atual = fluxo.currentWorkflow && fluxo.workflows.some((w) => w.id === fluxo.currentWorkflow) ? fluxo.currentWorkflow : fluxo.workflows[0]?.id;

  const TIPOS = {
    texto: '💬 Mensagem de texto',
    midia: '📎 Arquivo (imagem, vídeo, áudio, PDF)',
    resposta: '⚡ Resposta rápida',
    digitando: '✍️ Mostrar "digitando…"',
    espera: '⏳ Esperar'
  };

  let timer;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => { fluxo.currentWorkflow = atual; await S.set('fluxo', fluxo); }, 300);
  };

  function renderLista() {
    $('#lista').replaceChildren(...fluxo.workflows.map((w) => h('div', {
      class: 'item' + (w.id === atual ? ' active' : ''),
      onclick: () => { atual = w.id; render(); }
    }, h('b', {}, w.nome), h('div', { class: 'muted' }, `${(w.passos || []).length} passo(s)`))));
    if (!fluxo.workflows.length) $('#lista').append(h('p', { class: 'muted' }, 'Nenhum fluxo ainda.'));
  }

  function renderPasso(w, p, i) {
    let corpo;
    if (p.tipo === 'texto') {
      corpo = h('textarea', { placeholder: '{saudacao}, {primeiro_nome}!', oninput: (e) => { p.texto = e.target.value; save(); } });
      corpo.value = p.texto || '';
    } else if (p.tipo === 'midia') {
      corpo = h('div', {},
        p.midia ? h('div', { class: 'muted' }, '📎 ', p.midia.nome) : h('div', { class: 'muted' }, 'Nenhum arquivo'),
        h('input', { type: 'file', onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          if (f.size > 16 * 1024 * 1024) return toast('Arquivo maior que 16 MB.', 'error');
          p.midia = { nome: f.name, tipo: f.type, dataUrl: await U.fileToDataUrl(f) };
          save(); render();
        } }),
        h('label', { class: 'f' }, h('span', {}, 'Legenda'), h('input', { value: p.legenda || '', oninput: (e) => { p.legenda = e.target.value; save(); } })),
        p.midia?.tipo?.startsWith('audio') ? h('label', {}, h('input', { type: 'checkbox', checked: !!p.midia.ptt, onchange: (e) => { p.midia.ptt = e.target.checked; save(); } }), ' Enviar como áudio gravado') : null);
    } else if (p.tipo === 'resposta') {
      corpo = h('select', { onchange: (e) => { p.respostaId = e.target.value; save(); } },
        h('option', { value: '' }, 'Escolha…'), respostas.map((r) => h('option', { value: r.id, selected: r.id === p.respostaId }, r.titulo)));
    } else {
      corpo = h('div', { class: 'row' }, h('input', { type: 'number', min: 1, value: p.segundos || 3, style: { width: '90px' }, oninput: (e) => { p.segundos = Number(e.target.value); save(); } }), h('span', { class: 'muted' }, 'segundos'));
    }
    const mover = (d) => { const j = i + d; if (j < 0 || j >= w.passos.length) return; [w.passos[i], w.passos[j]] = [w.passos[j], w.passos[i]]; save(); render(); };
    return h('div', { class: 'passo' },
      h('div', { class: 'n' }, i + 1),
      h('div', {}, h('div', { class: 'tipo' }, TIPOS[p.tipo]), corpo),
      h('div', { class: 'ctl' },
        h('button', { class: 'btn sm', onclick: () => mover(-1) }, '↑'),
        h('button', { class: 'btn sm', onclick: () => mover(1) }, '↓'),
        h('button', { class: 'btn sm danger', onclick: () => { w.passos.splice(i, 1); save(); render(); } }, '×')));
  }

  function render() {
    renderLista();
    const w = fluxo.workflows.find((x) => x.id === atual);
    const ed = $('#editor');
    if (!w) { ed.replaceChildren(h('p', { class: 'muted' }, 'Crie um fluxo para começar. Depois execute-o pela barra do WhatsApp, pelo robô ou por agendamento.')); return; }
    w.passos = w.passos || [];
    ed.replaceChildren(
      h('input', { class: 'nome', value: w.nome, oninput: (e) => { w.nome = e.target.value; save(); renderLista(); } }),
      w.passos.length ? w.passos.map((p, i) => renderPasso(w, p, i)) : h('p', { class: 'muted' }, 'Adicione passos abaixo.'),
      h('div', { class: 'add' }, Object.entries(TIPOS).map(([k, l]) => h('button', { class: 'btn sm', onclick: () => {
        w.passos.push({ id: U.uid(), tipo: k, segundos: k === 'espera' ? 5 : k === 'digitando' ? 3 : undefined });
        save(); render();
      } }, '+ ' + l))),
      h('div', { class: 'row', style: { marginTop: '16px' } },
        h('button', { class: 'btn', onclick: () => {
          const copia = structuredClone(w); copia.id = U.uid(); copia.nome = w.nome + ' (cópia)';
          fluxo.workflows.push(copia); atual = copia.id; save(); render();
        } }, 'Duplicar'),
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirm(`Excluir o fluxo "${w.nome}"?`))) return;
          fluxo.workflows = fluxo.workflows.filter((x) => x.id !== w.id); atual = fluxo.workflows[0]?.id; save(); render();
        } }, 'Excluir fluxo')));
  }

  $('#novo').onclick = () => {
    const w = { id: U.uid(), nome: 'Novo fluxo', passos: [{ id: U.uid(), tipo: 'texto', texto: '{saudacao}, {primeiro_nome}!' }], criadoEm: new Date().toISOString() };
    fluxo.workflows.push(w); atual = w.id; save(); render();
  };

  S.onChange(['respostasRapidas'], async () => { respostas = await S.get('respostasRapidas'); });
  render();
})();
