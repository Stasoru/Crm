/* CRM completo (kanban) - mesma base de dados usada na barra lateral do WhatsApp */
(async function () {
  const { h, form, confirm, toast, modal } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const $ = (s) => document.querySelector(s);

  await S.ensureDefaults();
  let crm = await S.get('crm');
  let busca = '';

  // Aplica a alteração sobre a versão mais recente salva (evita apagar mudanças feitas no WhatsApp)
  const mutate = async (fn) => { crm = await S.update('crm', fn); render(); };

  function abrirConversa(chatId) {
    chrome.runtime.sendMessage({ message: 'OPEN_CHAT', chatId });
  }

  let conversas = (await S.get('conversas')).lista || [];
  let atualizado = (await S.get('conversas')).atualizadoEm;
  let mostrarGrupos = false;
  try { mostrarGrupos = localStorage.getItem('crm-grupos') === '1'; } catch { /* sem localStorage */ }
  let limiteInbox = 150;

  function filtrar(c) {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q) ||
      (c.etiquetas || []).some((t) => t.toLowerCase().includes(q)) || (c.ultima || '').toLowerCase().includes(q);
  }

  // Liga um lead à conversa do WhatsApp (pelo id ou pelo telefone)
  function indexConversas() {
    const porId = new Map(), porTel = new Map();
    for (const c of conversas) { porId.set(c.id, c); if (c.telefone) porTel.set(c.telefone, c); }
    return { porId, porTel, de: (card) => porId.get(card.chatId) || (card.telefone && porTel.get(card.telefone)) || null };
  }

  const horaMsg = (t) => {
    if (!t) return '';
    const d = new Date(t * 1000);
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  async function soltar(data, etapaId) {
    const [tipo, id] = [data.slice(0, data.indexOf(':')), data.slice(data.indexOf(':') + 1)];
    const now = new Date().toISOString();
    if (tipo === 'card') {
      await mutate((d) => {
        if (!etapaId) { d.cards = d.cards.filter((x) => x.id !== id); return d; }
        const c = d.cards.find((x) => x.id === id);
        if (c && c.etapaId !== etapaId) { c.etapaId = etapaId; c.atualizadoEm = now; }
        return d;
      });
    } else if (tipo === 'chat' && etapaId) {
      const conv = conversas.find((c) => c.id === id);
      if (!conv) return;
      await mutate((d) => {
        if (!d.cards.some((x) => x.chatId === conv.id)) {
          d.cards.push({ id: U.uid(), chatId: conv.id, nome: conv.nome, telefone: conv.telefone, etapaId, valor: '', etiquetas: [], criadoEm: now, atualizadoEm: now });
        }
        return d;
      });
    }
  }

  function dropZone(etapaId) {
    const body = h('div', {
      class: 'col-body',
      ondragover: (ev) => { ev.preventDefault(); body.classList.add('over'); },
      ondragleave: () => body.classList.remove('over'),
      ondrop: async (ev) => { ev.preventDefault(); body.classList.remove('over'); await soltar(ev.dataTransfer.getData('text/plain'), etapaId); }
    });
    return body;
  }

  // Cartão compacto: nome + hora na 1ª linha, última mensagem na 2ª, valor/dias só se houver
  function cartao({ dragData, nome, conv, valor, dias, parado, chatId, onEdit }) {
    const nao = conv?.naoLidas || 0;
    return h('div', {
      class: 'card' + (nao ? ' nova' : ''), draggable: 'true', title: 'Clique para abrir no WhatsApp · arraste para mudar de etapa',
      ondragstart: (ev) => ev.dataTransfer.setData('text/plain', dragData),
      onclick: () => chatId && abrirConversa(chatId)
    },
      h('div', { class: 'l1' }, h('span', { class: 'nome' }, nome), h('span', { class: 'hora' }, horaMsg(conv?.t))),
      h('div', { class: 'l2' },
        h('span', { class: 'txt' }, conv ? (conv.fromMe ? 'Você: ' : '') + (conv.ultima || '') : ''),
        nao ? h('span', { class: 'nao' }, nao) : null),
      valor || dias ? h('div', { class: 'l3' },
        valor ? h('span', { class: 'valor' }, U.money(valor)) : null,
        dias ? h('span', { class: 'dias' + (parado ? ' parado' : '') }, `${dias}d`) : null) : null,
      onEdit ? h('button', { class: 'edit', title: 'Editar', onclick: (e) => { e.stopPropagation(); onEdit(); } }, '✎') : null);
  }

  function coluna({ titulo, cor, qtd, total, etapaId, cards, inbox }) {
    const body = dropZone(etapaId);
    body.append(...cards);
    if (!cards.length) body.append(h('div', { class: 'vazio' }, inbox ? 'Nenhuma conversa' : 'Solte aqui'));
    const col = h('section', { class: 'col' + (inbox ? ' inbox' : '') },
      h('div', { class: 'col-head' },
        h('span', { class: 'titulo' }, titulo), h('span', { class: 'qtd' }, qtd),
        total ? h('span', { class: 'total' }, U.money(total)) : null),
      body);
    col.style.setProperty('--cor', cor);
    return col;
  }

  function render() {
    const board = $('#board');
    const idx = indexConversas();
    const ganhos = crm.cards.filter((c) => c.etapaId === 'ganho');
    const totalAberto = crm.cards.filter((c) => !['ganho', 'perdido'].includes(c.etapaId)).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const conv = crm.cards.length ? Math.round((100 * ganhos.length) / crm.cards.length) : 0;
    $('#resumo').replaceChildren(
      h('span', {}, h('b', {}, crm.cards.length), ' no funil'),
      h('span', {}, h('b', {}, U.money(totalAberto)), ' em negociação'),
      h('span', {}, h('b', {}, U.money(ganhos.reduce((s, c) => s + (Number(c.valor) || 0), 0))), ' fechado'),
      h('span', {}, h('b', {}, conv + '%'), ' conversão'),
      h('span', { class: 'sync' }, atualizado ? `WhatsApp sincronizado ${U.ago(atualizado)}` : 'Abra o WhatsApp Web para puxar as conversas'));

    const noFunilId = new Set(crm.cards.map((c) => c.chatId));
    const noFunilTel = new Set(crm.cards.map((c) => c.telefone).filter(Boolean));
    const inbox = conversas.filter((c) => (mostrarGrupos || !c.isGroup) && !noFunilId.has(c.id) && !(c.telefone && noFunilTel.has(c.telefone)) && filtrar(c));
    const inboxCards = inbox.slice(0, limiteInbox).map((c) => cartao({
      dragData: 'chat:' + c.id, nome: c.nome || U.formatPhone(c.telefone) || 'Sem nome', conv: c, chatId: c.id
    }));
    if (inbox.length > limiteInbox) inboxCards.push(h('button', { class: 'mais', onclick: () => { limiteInbox += 150; render(); } }, `+ ${inbox.length - limiteInbox} conversas`));

    const cols = [coluna({ titulo: 'Conversas', cor: 'var(--primary)', qtd: inbox.length, etapaId: '', cards: inboxCards, inbox: true })];
    for (const e of crm.etapas) {
      const itens = crm.cards.filter((c) => c.etapaId === e.id && filtrar({ ...c, ultima: idx.de(c)?.ultima }))
        .map((c) => ({ c, cv: idx.de(c) }))
        .sort((a, b) => (b.cv?.t || new Date(b.c.atualizadoEm || 0).getTime() / 1000) - (a.cv?.t || new Date(a.c.atualizadoEm || 0).getTime() / 1000));
      const total = itens.reduce((s, x) => s + (Number(x.c.valor) || 0), 0);
      cols.push(coluna({
        titulo: e.nome, cor: e.cor, qtd: itens.length, total, etapaId: e.id,
        cards: itens.map(({ c, cv }) => {
          const dias = U.daysSince(c.atualizadoEm || c.criadoEm);
          return cartao({
            dragData: 'card:' + c.id, nome: c.nome || cv?.nome || U.formatPhone(c.telefone) || 'Sem nome', conv: cv, chatId: c.chatId,
            valor: Number(c.valor) || 0, dias, parado: dias >= 3 && !['ganho', 'perdido'].includes(c.etapaId), onEdit: () => editCard(c)
          });
        })
      }));
    }
    board.style.setProperty('--ncols', cols.length);
    board.replaceChildren(...cols);
  }

  async function editCard(c = null) {
    const v = await form(c ? 'Editar lead' : 'Novo lead', [
      { name: 'nome', label: 'Nome', value: c?.nome, required: true },
      { name: 'telefone', label: 'WhatsApp (DDI + DDD + número)', value: c?.telefone, placeholder: '5511999999999', required: true },
      { name: 'etapaId', label: 'Etapa', type: 'select', value: c?.etapaId || crm.etapas[0]?.id, options: crm.etapas.map((e) => [e.id, e.nome]) },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: c?.valor ?? '' },
      { name: 'etiquetas', label: 'Etiquetas (separe por vírgula)', value: (c?.etiquetas || []).join(', ') },
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 3, value: c?.observacao },
      ...(c ? [{ name: 'tirar', label: 'Tirar do funil (volta para Conversas)', type: 'checkbox' }] : [])
    ]);
    if (!v) return;
    if (v.tirar) { await mutate((d) => { d.cards = d.cards.filter((x) => x.id !== c.id); return d; }); return; }
    delete v.tirar;
    const tel = U.onlyDigits(v.telefone);
    const data = { ...v, telefone: tel, etiquetas: v.etiquetas.split(',').map((s) => s.trim()).filter(Boolean), atualizadoEm: new Date().toISOString() };
    await mutate((d) => {
      const x = c && d.cards.find((i) => i.id === c.id);
      if (x) Object.assign(x, data, { chatId: x.chatId || U.toChatId(tel) });
      else d.cards.push({ id: U.uid(), chatId: U.toChatId(tel), criadoEm: new Date().toISOString(), ...data });
      return d;
    });
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
    if (ok) await mutate((d) => { d.etapas = etapas; return d; });
  }

  function exportCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nome', 'Telefone', 'Etapa', 'Valor', 'Etiquetas', 'Observação', 'Criado em'].join(';')];
    for (const c of crm.cards) {
      lines.push([c.nome, c.telefone, crm.etapas.find((e) => e.id === c.etapaId)?.nome, c.valor, (c.etiquetas || []).join(', '), c.observacao, c.criadoEm].map(esc).join(';'));
    }
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: 'crm-beco-wppseller.csv' });
    a.click();
  }

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; render(); });
  $('#novoCard').onclick = () => editCard();
  $('#etapas').onclick = editEtapas;
  $('#csv').onclick = exportCsv;

  $('#grupos').checked = mostrarGrupos;
  $('#grupos').onchange = (e) => { mostrarGrupos = e.target.checked; try { localStorage.setItem('crm-grupos', mostrarGrupos ? '1' : '0'); } catch { /* ignora */ } render(); };
  $('#sync').onclick = async () => {
    const r = await chrome.runtime.sendMessage({ message: 'SYNC_CHATS' });
    if (r?.ok && r.data) toast('Buscando conversas no WhatsApp…', 'ok');
    else toast('Abra o WhatsApp Web (web.whatsapp.com) para buscar as conversas.', 'error');
  };

  // Não redesenha no meio de um arraste
  let arrastando = false;
  document.addEventListener('dragstart', () => { arrastando = true; });
  document.addEventListener('dragend', () => { arrastando = false; });
  S.onChange(['crm', 'conversas'], async (changes) => {
    if (changes.crm) crm = await S.get('crm');
    if (changes.conversas) { const c = await S.get('conversas'); conversas = c.lista || []; atualizado = c.atualizadoEm; }
    if (!arrastando) render();
  });
  render();
  // Pede uma sincronização ao abrir o CRM e atualiza o "há X min" a cada minuto
  chrome.runtime.sendMessage({ message: 'SYNC_CHATS' }).catch(() => {});
  setInterval(() => { if (!arrastando) render(); }, 60000);
})();
