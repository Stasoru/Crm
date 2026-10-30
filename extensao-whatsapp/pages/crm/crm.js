/* CRM completo (kanban) - mesma base de dados usada na barra lateral do WhatsApp */
(async function () {
  const { h, form, confirm, toast, modal } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const $ = (s) => document.querySelector(s);

  await S.ensureDefaults();
  let crm = await S.get('crm');
  let busca = '';

  const save = async () => { await S.set('crm', crm); };

  function abrirConversa(chatId) {
    chrome.runtime.sendMessage({ message: 'OPEN_CHAT', chatId });
  }

  function filtrar(c) {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q) ||
      (c.etiquetas || []).some((t) => t.toLowerCase().includes(q));
  }

  function render() {
    const board = $('#board');
    board.replaceChildren();
    const ganhos = crm.cards.filter((c) => c.etapaId === 'ganho');
    const totalAberto = crm.cards.filter((c) => !['ganho', 'perdido'].includes(c.etapaId)).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const conv = crm.cards.length ? Math.round((100 * ganhos.length) / crm.cards.length) : 0;
    $('#resumo').replaceChildren(
      h('div', {}, h('b', {}, crm.cards.length), h('span', { class: 'muted' }, 'leads')),
      h('div', {}, h('b', {}, U.money(totalAberto)), h('span', { class: 'muted' }, 'em negociação')),
      h('div', {}, h('b', {}, U.money(ganhos.reduce((s, c) => s + (Number(c.valor) || 0), 0))), h('span', { class: 'muted' }, 'fechado')),
      h('div', {}, h('b', {}, conv + '%'), h('span', { class: 'muted' }, 'conversão')));

    for (const e of crm.etapas) {
      const cards = crm.cards.filter((c) => c.etapaId === e.id && filtrar(c));
      const total = cards.reduce((s, c) => s + (Number(c.valor) || 0), 0);
      const body = h('div', {
        class: 'col-body',
        ondragover: (ev) => { ev.preventDefault(); body.classList.add('over'); },
        ondragleave: () => body.classList.remove('over'),
        ondrop: async (ev) => {
          ev.preventDefault();
          body.classList.remove('over');
          const id = ev.dataTransfer.getData('text/plain');
          const c = crm.cards.find((x) => x.id === id);
          if (c && c.etapaId !== e.id) { c.etapaId = e.id; c.atualizadoEm = new Date().toISOString(); await save(); render(); }
        }
      }, cards.map((c) => h('div', {
        class: 'card', draggable: 'true',
        ondragstart: (ev) => ev.dataTransfer.setData('text/plain', c.id)
      },
        h('div', { class: 'nome' }, c.nome || 'Sem nome'),
        h('div', { class: 'tel' }, U.formatPhone(c.telefone)),
        c.valor ? h('div', { class: 'valor' }, U.money(c.valor)) : null,
        (c.etiquetas || []).length ? h('div', { class: 'tags' }, c.etiquetas.map((t) => h('span', {}, t))) : null,
        c.observacao ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, c.observacao) : null,
        h('div', { class: 'acoes' },
          c.chatId ? h('button', { class: 'btn sm primary', onclick: () => abrirConversa(c.chatId) }, 'WhatsApp') : null,
          h('button', { class: 'btn sm', onclick: () => editCard(c) }, 'Editar'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!(await confirm(`Remover ${c.nome || 'lead'} do funil?`))) return;
            crm.cards = crm.cards.filter((x) => x.id !== c.id); await save(); render();
          } }, 'Remover')))));

      board.append(h('section', { class: 'col' },
        h('div', { class: 'col-head', style: { borderColor: e.cor } }, h('b', {}, e.nome), h('small', {}, `${cards.length} lead(s) · ${U.money(total)}`)),
        body));
    }
  }

  async function editCard(c = null) {
    const v = await form(c ? 'Editar lead' : 'Novo lead', [
      { name: 'nome', label: 'Nome', value: c?.nome, required: true },
      { name: 'telefone', label: 'WhatsApp (DDI + DDD + número)', value: c?.telefone, placeholder: '5511999999999', required: true },
      { name: 'etapaId', label: 'Etapa', type: 'select', value: c?.etapaId || crm.etapas[0]?.id, options: crm.etapas.map((e) => [e.id, e.nome]) },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: c?.valor ?? '' },
      { name: 'etiquetas', label: 'Etiquetas (separe por vírgula)', value: (c?.etiquetas || []).join(', ') },
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 3, value: c?.observacao }
    ]);
    if (!v) return;
    const tel = U.onlyDigits(v.telefone);
    const data = { ...v, telefone: tel, etiquetas: v.etiquetas.split(',').map((s) => s.trim()).filter(Boolean), atualizadoEm: new Date().toISOString() };
    if (c) Object.assign(c, data, { chatId: c.chatId || U.toChatId(tel) });
    else crm.cards.push({ id: U.uid(), chatId: U.toChatId(tel), criadoEm: new Date().toISOString(), ...data });
    await save();
    render();
  }

  async function editEtapas() {
    const etapas = structuredClone(crm.etapas);
    const box = h('div', {});
    const draw = () => box.replaceChildren(
      ...etapas.map((e, i) => h('div', { class: 'fz-row' },
        h('input', { type: 'color', value: e.cor, oninput: (ev) => { e.cor = ev.target.value; } }),
        h('input', { class: 'fz-input', style: { flex: 1, width: 'auto' }, value: e.nome, oninput: (ev) => { e.nome = ev.target.value; } }),
        h('button', { class: 'fz-btn fz-btn-sm', disabled: i === 0, onclick: () => { [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; draw(); } }, '↑'),
        h('button', { class: 'fz-btn fz-btn-sm fz-btn-danger', onclick: () => {
          if (crm.cards.some((c) => c.etapaId === e.id)) return toast('Mova os leads desta etapa antes de excluir.', 'error');
          etapas.splice(i, 1); draw();
        } }, '×'))),
      h('button', { class: 'fz-btn', onclick: () => { etapas.push({ id: U.uid(), nome: 'Nova etapa', cor: '#64748b' }); draw(); } }, '+ Etapa'));
    draw();
    const ok = await modal('Etapas do funil', box, [{ label: 'Cancelar', value: () => false }, { label: 'Salvar', primary: true, value: () => true }]);
    if (ok) { crm.etapas = etapas; await save(); render(); }
  }

  function exportCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nome', 'Telefone', 'Etapa', 'Valor', 'Etiquetas', 'Observação', 'Criado em'].join(';')];
    for (const c of crm.cards) {
      lines.push([c.nome, c.telefone, crm.etapas.find((e) => e.id === c.etapaId)?.nome, c.valor, (c.etiquetas || []).join(', '), c.observacao, c.criadoEm].map(esc).join(';'));
    }
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: 'crm-fluxo-zap.csv' });
    a.click();
  }

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; render(); });
  $('#novoCard').onclick = () => editCard();
  $('#etapas').onclick = editEtapas;
  $('#csv').onclick = exportCsv;

  S.onChange(['crm'], async () => { crm = await S.get('crm'); render(); });
  render();
})();
