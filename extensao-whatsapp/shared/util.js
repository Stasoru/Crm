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

  // Dias inteiros desde uma data ISO
  function daysSince(iso) {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  // "há 5 min", "há 2 h", "há 3 dias"
  function ago(tsOrIso) {
    const t = typeof tsOrIso === 'number' ? (tsOrIso < 1e12 ? tsOrIso * 1000 : tsOrIso) : new Date(tsOrIso).getTime();
    const min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (min < 60) return `há ${min} min`;
    const hs = Math.round(min / 60);
    if (hs < 24) return `há ${hs} h`;
    return `há ${Math.round(hs / 24)} dia(s)`;
  }

  /*
    PIX "copia e cola" (BR Code estático, padrão do Banco Central).
    chave: CPF/CNPJ/e-mail/telefone/aleatória; valor opcional.
  */
  function pixPayload({ chave, nome, cidade, valor, txid = '***', descricao = '' }) {
    const clean = (s, max) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 .\-@+]/g, '').trim().slice(0, max);
    const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
    let mai = f('00', 'br.gov.bcb.pix') + f('01', String(chave).trim());
    const desc = clean(descricao, 40);
    if (desc) mai += f('02', desc);
    let p = f('00', '01') + f('26', mai) + f('52', '0000') + f('53', '986');
    if (Number(valor) > 0) p += f('54', Number(valor).toFixed(2));
    p += f('58', 'BR') + f('59', clean(nome, 25) || 'RECEBEDOR') + f('60', clean(cidade, 15) || 'BRASIL');
    p += f('62', f('05', clean(txid, 25) || '***'));
    p += '6304';
    let crc = 0xffff;
    for (let i = 0; i < p.length; i++) {
      crc ^= p.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return p + crc.toString(16).toUpperCase().padStart(4, '0');
  }

  g.FZ_UTIL = {
    daysSince, ago, pixPayload,
    uid, onlyDigits, toChatId, phoneFromChatId, formatPhone, saudacao, spin, applyVars,
    sleep, randInt, fmtDateTime, money, toLocalInput, fileToDataUrl, nextOccurrence
  };
})(globalThis);
