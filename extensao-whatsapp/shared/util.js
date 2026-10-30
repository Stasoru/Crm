/*
  Funções utilitárias compartilhadas entre a página do WhatsApp e as páginas da extensão.
*/
(function (g) {
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

  // "5511999999999" -> "5511999999999@c.us"
  function toChatId(phoneOrId) {
    const s = String(phoneOrId || '').trim();
    if (s.includes('@')) return s;
    return onlyDigits(s) + '@c.us';
  }

  function phoneFromChatId(id) {
    return String(id || '').split('@')[0];
  }

  function formatPhone(p) {
    const d = onlyDigits(p);
    if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return d ? '+' + d : '';
  }

  function saudacao(d = new Date()) {
    const h = d.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  // Spintax: "{Olá|Oi|E aí}" escolhe uma opção aleatória
  function spin(text) {
    let out = text;
    let guard = 0;
    const re = /\{([^{}]*\|[^{}]*)\}/;
    while (re.test(out) && guard++ < 100) {
      out = out.replace(re, (_, opts) => {
        const list = opts.split('|');
        return list[Math.floor(Math.random() * list.length)];
      });
    }
    return out;
  }

  /*
    Variáveis disponíveis nas mensagens:
    {nome} {primeiro_nome} {telefone} {saudacao} {data} {hora}
  */
  function applyVars(text, ctx = {}) {
    const nome = ctx.nome || '';
    const now = new Date();
    const vars = {
      nome,
      primeiro_nome: nome.split(' ')[0] || '',
      telefone: ctx.telefone ? formatPhone(ctx.telefone) : '',
      saudacao: saudacao(now),
      data: now.toLocaleDateString('pt-BR'),
      hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
    const replaced = String(text || '').replace(/\{(nome|primeiro_nome|telefone|saudacao|data|hora)\}/gi, (_, k) => vars[k.toLowerCase()] ?? '');
    return spin(replaced);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

  function fmtDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function money(v) {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Valor para <input type="datetime-local"> a partir de uma data
  function toLocalInput(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fileToDataUrl(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // Próxima ocorrência de uma recorrência
  function nextOccurrence(iso, recorrencia) {
    const d = new Date(iso);
    if (recorrencia === 'diaria' || recorrencia === 'diario') d.setDate(d.getDate() + 1);
    else if (recorrencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (recorrencia === 'mensal') d.setMonth(d.getMonth() + 1);
    else return null;
    return d.toISOString();
  }

  g.FZ_UTIL = {
    uid, onlyDigits, toChatId, phoneFromChatId, formatPhone, saudacao, spin, applyVars,
    sleep, randInt, fmtDateTime, money, toLocalInput, fileToDataUrl, nextOccurrence
  };
})(globalThis);
