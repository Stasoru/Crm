/* Painel de configurações: perfil, IA, webhooks, backup e dados */
(async function () {
  const { h, toast, confirm } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const { BACKUP_ITEMS, DEFAULTS, BRAND } = FZ_CONFIG;

  await S.ensureDefaults();
  const app = document.getElementById('app');

  const field = (label, input, help) => h('label', { class: 'f' }, h('span', {}, label), input, help ? h('small', { class: 'muted' }, help) : null);

  async function render() {
    const d = await S.getMany(['perfil', 'IA', 'webhook', 'backupAutomatico', 'useNotification', 'sendAfterWhatsAppOpens', 'vendas']);
    const vd = { ...DEFAULTS.vendas, ...d.vendas };

    /* Vendas */
    const meta = h('input', { type: 'number', step: '0.01', value: vd.meta || '' , placeholder: '0' });
    const diasParado = h('input', { type: 'number', min: 1, value: vd.diasParado });
    const esperaMin = h('input', { type: 'number', min: 0, value: vd.esperaMin });
    const chavePix = h('input', { value: vd.chavePix, placeholder: 'CPF, CNPJ, e-mail, celular (+55...) ou chave aleatória' });
    const nomePix = h('input', { value: vd.nomePix, placeholder: 'Nome do recebedor (como no banco)' });
    const cidadePix = h('input', { value: vd.cidadePix, placeholder: 'Cidade' });
    const posAtivo = h('input', { type: 'checkbox', checked: !!vd.posVendaAtivo });
    const posDias = h('input', { type: 'number', min: 1, value: vd.posVendaDias });
    const posMsg = h('textarea', { rows: 3 });
    posMsg.value = vd.posVendaMsg;
    const barra = h('input', { type: 'checkbox', checked: !!vd.barraFavoritas });
    const vendas = h('div', { class: 'panel' }, h('h2', {}, '💰 Vendas'),
      h('div', { class: 'row' }, field('Meta de vendas do mês (R$)', meta), field('Lead parado após (dias)', diasParado), field('Alertar cliente esperando após (min)', esperaMin)),
      h('h3', {}, 'PIX'),
      field('Chave PIX', chavePix, 'Usada no botão "Cobrar com PIX" para gerar o código copia e cola.'),
      h('div', { class: 'row' }, field('Nome do recebedor', nomePix), field('Cidade', cidadePix)),
      h('h3', {}, 'Pós-venda automático'),
      h('label', { class: 'row' }, posAtivo, ' Quando um pedido for marcado como "Entregue", enviar mensagem de pós-venda'),
      field('Depois de quantos dias', posDias),
      field('Mensagem', posMsg, 'Aceita {nome}, {primeiro_nome}, {saudacao}.'),
      h('label', { class: 'row' }, barra, ' Mostrar a barra de respostas favoritas acima da caixa de mensagem'),
      h('button', { class: 'btn primary', onclick: async () => {
        await S.set('vendas', { ...vd, meta: Number(meta.value) || 0, diasParado: Number(diasParado.value) || 3, esperaMin: Number(esperaMin.value) || 0,
          chavePix: chavePix.value.trim(), nomePix: nomePix.value.trim(), cidadePix: cidadePix.value.trim(),
          posVendaAtivo: posAtivo.checked, posVendaDias: Number(posDias.value) || 3, posVendaMsg: posMsg.value, barraFavoritas: barra.checked });
        toast('Preferências de vendas salvas.', 'ok');
      } }, 'Salvar'));

    /* Perfil */
    const nome = h('input', { value: d.perfil.nome || '', placeholder: 'Seu nome (usado pela IA)' });
    const perfil = h('div', { class: 'panel' }, h('h2', {}, '👤 Perfil do atendente'), field('Nome', nome),
      h('button', { class: 'btn primary', onclick: async () => { await S.update('perfil', (p) => ({ ...p, nome: nome.value })); toast('Perfil salvo.', 'ok'); } }, 'Salvar'));

    /* IA */
    const prov = h('select', {}, [['Gemini', 'Google Gemini'], ['GPT', 'OpenAI ChatGPT'], ['Groq', 'Groq']].map(([v, l]) => h('option', { value: v, selected: d.IA.activeIA === v }, l)));
    const kG = h('input', { type: 'password', value: d.IA.keyGemini || '', placeholder: 'AIza…' });
    const kO = h('input', { type: 'password', value: d.IA.keyGPT || '', placeholder: 'sk-…' });
    const kQ = h('input', { type: 'password', value: d.IA.keyGroq || '', placeholder: 'gsk_…' });
    const model = h('input', { value: d.IA.model || '', placeholder: 'padrão: gemini-2.5-flash / gpt-4o-mini / llama-3.3-70b-versatile' });
    const prompt = h('textarea', { rows: 4 });
    prompt.value = d.IA.prompt || '';
    const ia = h('div', { class: 'panel' }, h('h2', {}, '✨ Inteligência artificial'),
      h('p', { class: 'muted' }, 'Usada em "Sugerir resposta" e "Transcrever áudio". A chave fica salva só neste navegador e as chamadas vão direto para o provedor escolhido.'),
      field('Provedor ativo', prov), field('Chave Gemini', kG, 'Crie em aistudio.google.com'), field('Chave OpenAI', kO), field('Chave Groq', kQ, 'Crie em console.groq.com'),
      field('Modelo (opcional)', model), field('Instruções para a IA', prompt, 'Ex.: "Você vende roupas femininas, seja simpática, use emojis com moderação."'),
      h('button', { class: 'btn primary', onclick: async () => {
        await S.set('IA', { ...d.IA, activeIA: prov.value, keyGemini: kG.value.trim(), keyGPT: kO.value.trim(), keyGroq: kQ.value.trim(), model: model.value.trim(), prompt: prompt.value });
        toast('IA salva.', 'ok');
      } }, 'Salvar'),
      ' ',
      h('button', { class: 'btn', onclick: async () => {
        const r = await chrome.runtime.sendMessage({ message: 'AI', system: 'Responda em uma frase curta.', prompt: 'Diga "conexão ok".' });
        r.ok ? toast('IA respondeu: ' + r.data, 'ok') : toast(r.error, 'error');
      } }, 'Testar'));

    /* Webhooks */
    const hooksBox = h('div', {});
    const drawHooks = () => hooksBox.replaceChildren(...d.webhook.map((w, i) => h('div', { class: 'row', style: { margin: '6px 0' } },
      h('input', { type: 'checkbox', checked: !!w.ativo, onchange: (e) => { w.ativo = e.target.checked; } }),
      h('input', { value: w.url, style: { flex: 1 }, placeholder: 'https://seu-sistema.com/webhook', oninput: (e) => { w.url = e.target.value.trim(); } }),
      h('select', { onchange: (e) => { w.eventos = e.target.value ? [e.target.value] : []; } },
        [['', 'Todos os eventos'], ['mensagem_recebida', 'Mensagem recebida'], ['mensagem_enviada', 'Mensagem enviada']].map(([v, l]) => h('option', { value: v, selected: (w.eventos || [])[0] === v || (!v && !(w.eventos || []).length) }, l))),
      h('button', { class: 'btn sm danger', onclick: () => { d.webhook.splice(i, 1); drawHooks(); } }, '×'))));
    drawHooks();
    const webhook = h('div', { class: 'panel' }, h('h2', {}, '🔗 Webhooks'),
      h('p', { class: 'muted' }, 'Envia um POST em JSON para o seu sistema (n8n, Make, Zapier, CRM próprio) a cada mensagem enviada ou recebida no WhatsApp Web.'),
      hooksBox,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { d.webhook.push({ id: U.uid(), url: '', eventos: [], ativo: true }); drawHooks(); } }, '+ Webhook'),
        h('button', { class: 'btn primary', onclick: async () => {
          const origins = [...new Set(d.webhook.filter((w) => w.url).map((w) => { try { return new URL(w.url).origin + '/*'; } catch { return null; } }).filter(Boolean))];
          if (origins.length) {
            const ok = await chrome.permissions.request({ origins });
            if (!ok) toast('Sem permissão o envio pode ser bloqueado pelo navegador.', 'error');
          }
          await S.set('webhook', d.webhook.filter((w) => w.url));
          toast('Webhooks salvos.', 'ok');
        } }, 'Salvar')));

    /* Backup */
    const b = d.backupAutomatico;
    const bAtivo = h('input', { type: 'checkbox', checked: !!b.ativo });
    const bRec = h('select', {}, [['diario', 'Todo dia'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']].map(([v, l]) => h('option', { value: v, selected: b.recurrency === v }, l)));
    const bDate = h('input', { type: 'date', value: b.date });
    const bTime = h('input', { type: 'time', value: b.time });
    const fileIn = h('input', { type: 'file', accept: 'application/json', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const json = JSON.parse(await f.text());
        const dados = json.dados || json;
        const keys = Object.keys(dados).filter((k) => k in DEFAULTS);
        if (!keys.length) throw new Error('Arquivo sem dados reconhecidos.');
        if (!(await confirm(`Importar ${keys.length} módulo(s)? Os dados atuais destes módulos serão substituídos.`, 'Importar'))) return;
        const patch = {};
        for (const k of keys) patch[k] = dados[k];
        await chrome.storage.local.set(patch);
        toast('Backup importado.', 'ok');
        render();
      } catch (err) {
        toast('Erro ao importar: ' + err.message, 'error');
      }
    } });
    const backup = h('div', { class: 'panel' }, h('h2', {}, '💾 Backup'),
      h('label', { class: 'row' }, bAtivo, ' Backup automático ligado'),
      h('div', { class: 'row' }, field('Frequência', bRec), field('Próximo backup', bDate), field('Hora', bTime)),
      b.ultimo ? h('p', { class: 'muted' }, 'Último backup: ' + U.fmtDateTime(b.ultimo)) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => {
          await S.set('backupAutomatico', { ...b, ativo: bAtivo.checked, recurrency: bRec.value, date: bDate.value, time: bTime.value, items: BACKUP_ITEMS });
          toast('Backup automático salvo. O arquivo vai para a pasta Downloads.', 'ok');
        } }, 'Salvar'),
        h('button', { class: 'btn', onclick: async () => {
          const r = await chrome.runtime.sendMessage({ message: 'BACKUP_NOW' });
          r.ok ? toast('Backup baixado.', 'ok') : toast(r.error, 'error');
        } }, 'Baixar backup agora'),
        h('button', { class: 'btn', onclick: () => fileIn.click() }, 'Importar backup'), fileIn));

    /* Preferências */
    const prefs = h('div', { class: 'panel' }, h('h2', {}, '⚙️ Preferências'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!d.useNotification, onchange: (e) => S.set('useNotification', e.target.checked) }), ' Mostrar notificação do Chrome nos lembretes'),
      h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!d.sendAfterWhatsAppOpens, onchange: (e) => S.set('sendAfterWhatsAppOpens', e.target.checked) }), ' Enviar agendamentos atrasados quando o WhatsApp for aberto'),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn danger', onclick: async () => {
          if (!(await confirm('Apagar TODOS os dados do Beco WppSeller neste navegador? Faça um backup antes.', 'Apagar tudo'))) return;
          await chrome.storage.local.clear();
          await S.ensureDefaults();
          toast('Dados apagados.', 'ok');
          render();
        } }, 'Apagar todos os dados')),
      h('p', { class: 'muted' }, `${BRAND.name} v${chrome.runtime.getManifest().version}`));

    app.replaceChildren(vendas, perfil, ia, webhook, backup, prefs);
  }

  render();
})();
