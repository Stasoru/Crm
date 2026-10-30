/*
  Lado "isolado" da ponte: chama funções do WhatsApp (bridge-main.js) e
  recebe eventos. Uso: await WA.call('sendText', chatId, 'Olá').
*/
(function (g) {
  const OUT = 'fz-iso';
  const IN = 'fz-main';
  const pending = new Map();
  const listeners = {};
  let seq = 0;
  let ready = false;

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.data?.src !== IN) return;
    const d = ev.data;
    if (d.event) {
      if (d.event === 'ready') ready = true;
      (listeners[d.event] || []).forEach((fn) => { try { fn(d.data); } catch (e) { console.error(e); } });
      return;
    }
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    clearTimeout(p.timer);
    d.error ? p.reject(new Error(d.error)) : p.resolve(d.result);
  });

  function send(method, args, ms) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Tempo esgotado ao falar com o WhatsApp'));
      }, ms);
      pending.set(id, { resolve, reject, timer });
      window.postMessage({ src: OUT, id, method, args }, location.origin);
    });
  }

  const call = (method, ...args) => send(method, args, 120000);

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }

  // Espera o WhatsApp terminar de carregar
  async function waitReady(timeoutMs = 300000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (ready) return true;
      try {
        if (await send('isReady', [], 2000)) { ready = true; return true; }
      } catch { /* página ainda carregando */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  g.WA = { call, on, waitReady, isReady: () => ready };
})(globalThis);
