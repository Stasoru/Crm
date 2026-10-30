/*
  Roda no contexto da página do WhatsApp Web (world MAIN), junto com a
  biblioteca open source WA-JS (WPPConnect, Apache-2.0), que fica empacotada
  dentro da extensão em /lib (sem código remoto).

  Recebe pedidos do content script via window.postMessage e responde com o
  resultado. Também repassa eventos (nova mensagem, conversa ativa, pronto).
*/
(function () {
  const IN = 'fz-iso';
  const OUT = 'fz-main';
  const WPP = window.WPP;

  if (!WPP) {
    console.error('[Beco WppSeller] WA-JS não carregou');
    return;
  }

  const post = (data) => window.postMessage({ src: OUT, ...data }, location.origin);
  const idOf = (wid) => (wid && (wid._serialized || String(wid))) || '';

  function phoneOfChat(chat) {
    const id = chat?.id;
    if (id?.server === 'c.us') return id.user;
    const pn = chat?.contact?.phoneNumber;
    if (pn?.user) return pn.user;
    return '';
  }

  function serializeChat(chat) {
    if (!chat) return null;
    return {
      id: idOf(chat.id),
      nome: chat.formattedTitle || chat.name || chat.contact?.pushname || chat.contact?.name || '',
      telefone: phoneOfChat(chat),
      isGroup: !!chat.isGroup,
      naoLidas: chat.unreadCount || 0,
      t: chat.t || 0
    };
  }

  function serializeMsg(m) {
    if (!m) return null;
    const remote = m.id?.remote;
    return {
      id: idOf(m.id),
      chatId: idOf(remote),
      fromMe: !!m.id?.fromMe,
      body: m.type === 'chat' ? m.body || '' : m.caption || '',
      tipo: m.type,
      t: m.t,
      nome: m.notifyName || m.senderObj?.pushname || '',
      isGroup: remote?.server === 'g.us'
    };
  }

  function blobToDataUrl(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  const api = {
    isReady: () => !!WPP.isFullReady,

    activeChat: () => serializeChat(WPP.chat.getActiveChat()),

    async listChats(limit = 200) {
      const chats = await WPP.chat.list({ count: limit });
      return chats.map(serializeChat);
    },

    // Retorna o id válido de um número (ou null se não tiver WhatsApp)
    async checkNumber(phone) {
      const r = await WPP.contact.queryExists(phone + '@c.us');
      return r ? idOf(r.wid) : null;
    },

    async openChat(chatId) {
      return WPP.chat.openChatBottom(chatId);
    },

    // Abre conversa com um número que não está salvo nos contatos
    async openNumber(phone) {
      const r = await WPP.contact.queryExists(phone + '@c.us');
      if (!r) return null;
      const id = idOf(r.wid);
      await WPP.chat.find(id);
      await WPP.chat.openChatBottom(id);
      return id;
    },

    // Todas as conversas com a última mensagem, para o kanban do CRM
    async chatsForCrm(limit = 1000) {
      const chats = await WPP.chat.list({ count: limit });
      const out = [];
      for (const chat of chats) {
        const server = chat.id?.server;
        if (server === 'broadcast' || server === 'newsletter') continue;
        let last = null;
        try { last = chat.msgs?.last?.(); } catch { /* coleção não carregada */ }
        const m = last ? serializeMsg(last) : null;
        out.push({ ...serializeChat(chat), ultima: m ? (m.body || `[${m.tipo}]`) : '', fromMe: m ? m.fromMe : false, t: (m && m.t) || chat.t || 0 });
      }
      return out.sort((a, b) => b.t - a.t);
    },

    // Conversas cuja última mensagem é do cliente (ele está esperando resposta)
    async pendingReplies(limit = 80) {
      const chats = await WPP.chat.list({ count: limit });
      const out = [];
      for (const chat of chats) {
        if (chat.isGroup || chat.id?.server === 'broadcast' || chat.id?.server === 'newsletter') continue;
        let last = null;
        try { last = chat.msgs?.last?.(); } catch { /* coleção não carregada */ }
        if (!last) {
          try { [last] = await WPP.chat.getMessages(chat.id, { count: 1 }); } catch { /* ignora */ }
        }
        if (!last || last.id?.fromMe) continue;
        const m = serializeMsg(last);
        out.push({ ...serializeChat(chat), ultima: m.body || `[${m.tipo}]`, t: m.t });
      }
      return out.sort((a, b) => a.t - b.t);
    },

    async sendText(chatId, text) {
      const r = await WPP.chat.sendTextMessage(chatId, text, { createChat: true });
      return { id: idOf(r?.id) };
    },

    async sendFile(chatId, dataUrl, opts = {}) {
      const r = await WPP.chat.sendFileMessage(chatId, dataUrl, {
        type: opts.tipo || 'auto-detect',
        caption: opts.legenda || undefined,
        filename: opts.nome || undefined,
        isPtt: !!opts.ptt,
        createChat: true
      });
      return { id: idOf(r?.id) };
    },

    async setInputText(text, chatId) {
      await WPP.chat.setInputText(text, chatId);
      return true;
    },

    async markComposing(chatId, ms = 2000) {
      await WPP.chat.markIsComposing(chatId, ms);
      return true;
    },

    async getMessages(chatId, count = 20) {
      const list = await WPP.chat.getMessages(chatId, { count });
      return list.map(serializeMsg);
    },

    async lastAudio(chatId) {
      const list = await WPP.chat.getMessages(chatId, { count: 50 });
      const audio = [...list].reverse().find((m) => m.type === 'ptt' || m.type === 'audio');
      if (!audio) return null;
      const blob = await WPP.chat.downloadMedia(idOf(audio.id));
      return { id: idOf(audio.id), mime: blob.type, dataUrl: await blobToDataUrl(blob) };
    },

    async sendTextStatus(text, color) {
      await WPP.status.sendTextStatus(text, { backgroundColor: color || '#EFA528', font: 1 });
      return true;
    },

    async sendImageStatus(dataUrl, caption) {
      await WPP.status.sendImageStatus(dataUrl, { caption });
      return true;
    },

    myId: () => idOf(WPP.conn.getMyUserId())
  };

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window || ev.data?.src !== IN) return;
    const { id, method, args } = ev.data;
    if (!Object.prototype.hasOwnProperty.call(api, method)) {
      post({ id, error: 'Método desconhecido: ' + method });
      return;
    }
    try {
      const result = await api[method](...(args || []));
      post({ id, result });
    } catch (e) {
      post({ id, error: String(e?.message || e) });
    }
  });

  WPP.loader.onFullReady(() => {
    post({ event: 'ready' });
    WPP.on('chat.new_message', (msg) => {
      try { post({ event: 'new_message', data: serializeMsg(msg) }); } catch (e) { /* ignora */ }
    });
    WPP.on('chat.active_chat', (chat) => post({ event: 'active_chat', data: serializeChat(chat) }));
  });
})();
