/*
  Acesso ao chrome.storage.local com valores padrão.
*/
(function (g) {
  const { DEFAULTS } = g.FZ_CONFIG;

  async function get(key) {
    const r = await chrome.storage.local.get(key);
    return r[key] === undefined ? structuredClone(DEFAULTS[key]) : r[key];
  }

  async function getMany(keys) {
    const r = await chrome.storage.local.get(keys);
    const out = {};
    for (const k of keys) out[k] = r[k] === undefined ? structuredClone(DEFAULTS[k]) : r[k];
    return out;
  }

  function set(key, value) {
    return chrome.storage.local.set({ [key]: value });
  }

  // Lê, altera e grava uma chave numa única operação
  async function update(key, fn) {
    const cur = await get(key);
    const next = (await fn(cur)) ?? cur;
    await set(key, next);
    return next;
  }

  // Garante que todas as chaves existam (equivale ao setup na instalação)
  async function ensureDefaults() {
    const all = await chrome.storage.local.get(null);
    const patch = {};
    for (const [k, v] of Object.entries(DEFAULTS)) if (all[k] === undefined) patch[k] = v;
    if (!all.initDate) patch.initDate = new Date().toISOString();
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  }

  function onChange(keys, cb) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (keys.some((k) => k in changes)) cb(changes);
    });
  }

  g.FZ_STORE = { get, getMany, set, update, ensureDefaults, onChange };
})(globalThis);
