/*
  Service worker do Fluxo Zap.

  - Alarmes de 1, 5 e 30 minutos que acordam a aba do WhatsApp para disparar
    agendamentos, status, follow-ups e lembretes.
  - Lembretes (notificações) com contador no ícone.
  - Backup automático em arquivo .json.
  - Ponte para IA (Gemini / ChatGPT / Groq), transcrição de áudio e webhooks.
  - Abre as páginas internas (CRM, Fluxos, Painel).
*/
importScripts('shared/config.js', 'shared/storage.js', 'shared/util.js');

const { WHATSAPP_URL, BACKUP_ITEMS, BRAND } = FZ_CONFIG;
const S = FZ_STORE;

/* ---------------------------------------------------------------- abas */

function broadcastToWhatsApp(action, dados = {}) {
  chrome.tabs.query({ url: WHATSAPP_URL }, (tabs) => {
    for (const t of tabs) chrome.tabs.sendMessage(t.id, { action, dados }).catch(() => {});
  });
}

async function openOrFocusWhatsApp(reload = false) {
  const tabs = await chrome.tabs.query({ url: WHATSAPP_URL });
  if (tabs.length && tabs[0].id !== undefined) {
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (reload) chrome.tabs.reload(tabs[0].id);
    return tabs[0];
  }
  return chrome.tabs.create({ url: 'https://web.whatsapp.com' });
}

// Abre uma página interna, fechando cópias anteriores dela
async function openPage(name) {
  const url = chrome.runtime.getURL(`pages/${name}/index.html`);
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.windows.update(tabs[0].windowId, { focused: true });
    return chrome.tabs.update(tabs[0].id, { active: true });
  }
  return chrome.tabs.create({ url });
}

async function openChatInWhatsApp(chatId) {
  const tab = await openOrFocusWhatsApp();
  // Aguarda a aba responder (se acabou de ser criada o WhatsApp ainda está carregando)
  for (let i = 0; i < 30; i++) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'open_chat', dados: { chatId } });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

// Avisa as páginas internas quando a aba do WhatsApp é fechada
const tabUrls = new Map();
chrome.tabs.onUpdated.addListener((id, _info, tab) => { if (tab.url) tabUrls.set(id, tab.url); });
chrome.tabs.onRemoved.addListener((id) => {
  const url = tabUrls.get(id);
  tabUrls.delete(id);
  if (url && url.startsWith('https://web.whatsapp.com')) {
    chrome.runtime.sendMessage({ action: 'whatsIsClosed' }).catch(() => {});
  }
});

/* ------------------------------------------------------------- alarmes */

function ensureAlarms() {
  const list = [['One_Minute', 1], ['Five_Minutes', 5], ['Thirty_Minutes', 30]];
  for (const [name, period] of list) {
    chrome.alarms.get(name, (a) => { if (!a) chrome.alarms.create(name, { periodInMinutes: period }); });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'One_Minute':
      broadcastToWhatsApp('Update_Agendamento');
      broadcastToWhatsApp('Update_Status');
      await checkNotifications();
      await checkAutoBackup();
      break;
    case 'Five_Minutes':
      broadcastToWhatsApp('dispatch_timing_follow');
      break;
    case 'Thirty_Minutes':
      await trimReport();
      break;
  }
});

/* ------------------------------------------------------ lembretes */

// Considera vencido o lembrete que falta 2 minutos ou menos
function isDue(dateTime) {
  return new Date(dateTime).getTime() - Date.now() <= 120000;
}

async function checkNotifications() {
  const list = await S.get('notifications');
  const disparados = [];
  let unread = 0;
  for (const n of list) {
    if (!n.timeOut && isDue(`${n.date}T${n.time}`)) {
      n.timeOut = true;
      disparados.push(n);
    }
    if (n.timeOut && !n.read) unread++;
  }
  if (disparados.length) await S.set('notifications', list);
  await updateBadge(unread);

  const useNotification = await S.get('useNotification');
  for (const n of disparados) {
    if (useNotification) {
      chrome.notifications.create('lembrete:' + n.id, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: `${BRAND.name} - Lembrete`,
        message: `${n.titulo || 'Lembrete'}${n.nome ? ' - ' + n.nome : ''}`,
        priority: 2,
        requireInteraction: true
      });
    }
  }
  broadcastToWhatsApp('Update_Notificação', { update: list, dispart: disparados, tam: unread });
}

async function updateBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  await chrome.action.setBadgeText({ text: count ? String(count) : '' });
}

chrome.notifications.onClicked.addListener(async (nid) => {
  if (!nid.startsWith('lembrete:')) return;
  const id = nid.slice('lembrete:'.length);
  const list = await S.get('notifications');
  const n = list.find((x) => x.id === id);
  chrome.notifications.clear(nid);
  if (!n) return;
  n.read = true;
  await S.set('notifications', list);
  await updateBadge(list.filter((x) => x.timeOut && !x.read).length);
  if (n.chatId) openChatInWhatsApp(n.chatId);
  else openOrFocusWhatsApp();
});

/* ------------------------------------------------------------- backup */

async function buildBackup(items = BACKUP_ITEMS) {
  const data = await chrome.storage.local.get(items);
  return { app: BRAND.name, versao: BRAND.version, geradoEm: new Date().toISOString(), dados: data };
}

async function downloadBackup(items) {
  const json = JSON.stringify(await buildBackup(items));
  const url = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await chrome.downloads.download({ url, filename: `fluxo-zap-backup-${stamp}.json`, saveAs: false });
}

async function checkAutoBackup() {
  const cfg = await S.get('backupAutomatico');
  if (!cfg || !cfg.ativo) return;
  const due = new Date(`${cfg.date}T${cfg.time}`);
  if (Date.now() < due.getTime()) return;
  try {
    await downloadBackup(cfg.items);
  } catch (e) {
    console.error('[Fluxo Zap] Falha no backup automático', e);
  }
  // Calcula a próxima data a partir de hoje
  const next = new Date();
  const add = { diario: 1, semanal: 7, mensal: 30 }[cfg.recurrency] || 1;
  next.setDate(next.getDate() + add);
  cfg.date = next.toISOString().slice(0, 10);
  cfg.ultimo = new Date().toISOString();
  await S.set('backupAutomatico', cfg);
}

async function trimReport() {
  const rel = await S.get('relatorio');
  if (rel.length > 5000) await S.set('relatorio', rel.slice(-5000));
}

/* ---------------------------------------------------------------- IA */

const MODELS = { Gemini: 'gemini-2.5-flash', GPT: 'gpt-4o-mini', Groq: 'llama-3.3-70b-versatile' };

async function aiComplete({ system, prompt }) {
  const ia = await S.get('IA');
  const provider = ia.activeIA || 'Gemini';
  const model = ia.model || MODELS[provider];

  if (provider === 'Gemini') {
    if (!ia.keyGemini) throw new Error('Configure a chave do Gemini no Painel.');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ia.keyGemini },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Erro no Gemini');
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  }

  const isGroq = provider === 'Groq';
  const key = isGroq ? ia.keyGroq : ia.keyGPT;
  if (!key) throw new Error(`Configure a chave do ${provider} no Painel.`);
  const base = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Erro no ${provider}`);
  return j.choices?.[0]?.message?.content || '';
}

async function transcribe({ dataUrl, mime }) {
  const ia = await S.get('IA');
  const blob = await (await fetch(dataUrl)).blob();
  const provider = ia.activeIA || 'Gemini';

  if (provider === 'Gemini') {
    if (!ia.keyGemini) throw new Error('Configure a chave do Gemini no Painel.');
    const b64 = dataUrl.split(',')[1];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${ia.model || MODELS.Gemini}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': ia.keyGemini },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'Transcreva este áudio em português, apenas o texto falado, sem comentários.' },
            { inline_data: { mime_type: (mime || blob.type || 'audio/ogg').split(';')[0], data: b64 } }
          ]
        }]
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Erro no Gemini');
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  }

  const isGroq = provider === 'Groq';
  const key = isGroq ? ia.keyGroq : ia.keyGPT;
  if (!key) throw new Error(`Configure a chave do ${provider} no Painel.`);
  const fd = new FormData();
  fd.append('file', blob, 'audio.ogg');
  fd.append('model', isGroq ? 'whisper-large-v3' : 'whisper-1');
  fd.append('language', 'pt');
  const base = isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  const r = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'Erro na transcrição');
  return j.text || '';
}

/* ------------------------------------------------------------ webhook */

async function sendWebhook(evento, payload) {
  const hooks = await S.get('webhook');
  const targets = hooks.filter((h) => h.ativo && h.url && (!h.eventos?.length || h.eventos.includes(evento)));
  await Promise.all(targets.map(async (h) => {
    try {
      await fetch(h.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evento, enviadoEm: new Date().toISOString(), dados: payload })
      });
    } catch (e) {
      console.warn('[Fluxo Zap] Webhook falhou', h.url, e);
    }
  }));
}

/* ------------------------------------------------------------ mensagens */

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    switch (msg.message) {
      case 'CRM': return openPage('crm');
      case 'FLOW': return openPage('fluxo');
      case 'PAINEL': return openPage('painel');
      case 'OPEN_CHAT': return openChatInWhatsApp(msg.chatId);
      case 'AI': return aiComplete(msg);
      case 'TRANSCRIBE': return transcribe(msg);
      case 'WEBHOOK': return sendWebhook(msg.evento, msg.payload);
      case 'BACKUP_NOW': return downloadBackup(msg.items);
      case 'CHECK_NOTIFICATIONS': return checkNotifications();
      case 'READ_NOTIFICATION': {
        const list = await S.get('notifications');
        for (const n of list) if (!msg.id || n.id === msg.id) if (n.timeOut) n.read = true;
        await S.set('notifications', list);
        return updateBadge(list.filter((x) => x.timeOut && !x.read).length);
      }
    }
  };
  run().then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: String(e?.message || e) }));
  return true;
});

/* --------------------------------------------------- ciclo de vida */

chrome.action.onClicked.addListener(() => {
  ensureAlarms();
  openOrFocusWhatsApp(true);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await S.ensureDefaults();
  ensureAlarms();
  if (details.reason === 'install') openOrFocusWhatsApp(true);
});

chrome.runtime.onStartup.addListener(ensureAlarms);
ensureAlarms();
