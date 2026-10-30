/*
  Mini biblioteca de interface: criação de elementos, toasts, modais e
  formulários. Tudo é desenhado dentro de um Shadow DOM para não conflitar
  com o CSS do WhatsApp.
*/
(function (g) {
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  let root = null;
  let toastBox = null;

  function mount() {
    if (root) return root;
    const host = h('div', { id: 'fluxo-zap-root' });
    document.body.append(host);
    root = host.attachShadow({ mode: 'open' });
    root.append(h('link', { rel: 'stylesheet', href: chrome.runtime.getURL('content/drawer.css') }));
    toastBox = h('div', { class: 'fz-toasts' });
    root.append(toastBox);
    return root;
  }

  function toast(msg, type = 'info', opts = {}) {
    mount();
    const el = h('div', { class: `fz-toast fz-toast-${type}` },
      h('div', { class: 'fz-toast-msg' }, msg),
      opts.action ? h('button', { class: 'fz-btn fz-btn-sm', onclick: () => { opts.action.fn(); el.remove(); } }, opts.action.label) : null,
      h('button', { class: 'fz-x', onclick: () => el.remove() }, '×'));
    toastBox.append(el);
    if (!opts.sticky) setTimeout(() => el.remove(), opts.ms || 4500);
    return el;
  }

  function modal(title, body, actions = []) {
    mount();
    return new Promise((resolve) => {
      const close = (v) => { overlay.remove(); resolve(v); };
      const overlay = h('div', { class: 'fz-overlay', onmousedown: (e) => { if (e.target === overlay) close(null); } },
        h('div', { class: 'fz-modal' },
          h('div', { class: 'fz-modal-head' }, h('strong', {}, title), h('button', { class: 'fz-x', onclick: () => close(null) }, '×')),
          h('div', { class: 'fz-modal-body' }, body),
          h('div', { class: 'fz-modal-foot' },
            actions.map((a) => h('button', {
              class: 'fz-btn ' + (a.primary ? 'fz-btn-primary' : '') + (a.danger ? ' fz-btn-danger' : ''),
              onclick: async () => {
                const v = a.value ? await a.value() : true;
                if (v !== undefined) close(v);
              }
            }, a.label)))));
      root.append(overlay);
      const first = overlay.querySelector('input, textarea, select');
      if (first) setTimeout(() => first.focus(), 30);
    });
  }

  function confirm(msg, label = 'Confirmar') {
    return modal('Confirmação', h('p', {}, msg), [
      { label: 'Cancelar', value: () => false },
      { label, primary: true, danger: true, value: () => true }
    ]).then(Boolean);
  }

  /*
    Formulário genérico. fields: [{name, label, type, value, options, placeholder, help}]
    type: text | textarea | number | select | datetime | date | time | checkbox | color | file | multiselect
    Retorna objeto com os valores ou null se cancelado.
  */
  function form(title, fields, submitLabel = 'Salvar') {
    const inputs = {};
    const body = h('div', { class: 'fz-form' }, fields.map((f) => {
      let input;
      const val = f.value ?? '';
      switch (f.type) {
        case 'textarea':
          input = h('textarea', { rows: f.rows || 5, placeholder: f.placeholder || '' });
          input.value = val;
          break;
        case 'select':
          input = h('select', {}, (f.options || []).map((o) => {
            const [v, l] = Array.isArray(o) ? o : [o, o];
            return h('option', { value: v, selected: String(v) === String(val) }, l);
          }));
          break;
        case 'multiselect':
          input = h('div', { class: 'fz-checks' }, (f.options || []).map((o) => {
            const [v, l] = Array.isArray(o) ? o : [o, o];
            return h('label', {}, h('input', { type: 'checkbox', value: v, checked: (val || []).includes(v) }), ' ', l);
          }));
          break;
        case 'checkbox':
          input = h('input', { type: 'checkbox', checked: !!val });
          break;
        case 'file':
          input = h('input', { type: 'file', multiple: !!f.multiple, accept: f.accept || '' });
          break;
        case 'datetime':
          input = h('input', { type: 'datetime-local', value: val });
          break;
        default:
          input = h('input', { type: f.type || 'text', value: val, placeholder: f.placeholder || '', step: f.step });
      }
      inputs[f.name] = { el: input, f };
      return h('label', { class: 'fz-field' + (f.type === 'checkbox' ? ' fz-field-inline' : '') },
        h('span', {}, f.label), input, f.help ? h('small', {}, f.help) : null);
    }));

    return modal(title, body, [
      { label: 'Cancelar', value: () => null },
      {
        label: submitLabel,
        primary: true,
        value: async () => {
          const out = {};
          for (const [name, { el, f }] of Object.entries(inputs)) {
            if (f.type === 'checkbox') out[name] = el.checked;
            else if (f.type === 'number') out[name] = el.value === '' ? '' : Number(el.value);
            else if (f.type === 'file') out[name] = [...el.files];
            else if (f.type === 'multiselect') out[name] = [...el.querySelectorAll('input:checked')].map((i) => i.value);
            else out[name] = el.value;
            if (f.required && (out[name] === '' || (Array.isArray(out[name]) && !out[name].length && f.type !== 'file'))) {
              toast(`Preencha: ${f.label}`, 'error');
              return undefined; // mantém o modal aberto
            }
          }
          return out;
        }
      }
    ]);
  }

  g.UI = { h, mount, toast, modal, confirm, form, root: () => mount() };
})(globalThis);
