// Router + shared UI pieces used by several screens (swatches, pickers, charts).
import { $, esc, ic, num, inr, inrS, matches, initials, phone10, fmt2 } from './core.js';
import { openSheet, closeSheet, closeAll, setSheet, A, IN, toast } from './ui.js';
import { list, get, put, can } from './store.js';
import { activeProducts, productStock, stockState, qtyText, isTile, priceUnit, customers, suppliers, partyCredit, cfg } from './logic.js';

/* ---------------- router ---------------- */
export const VIEWS = {};
export const R = { cur: 'home', param: '', onRender: () => { } };
export const view = (name, def) => { VIEWS[name] = def; };
export function go(name) {
  closeAll(() => {
    const h = '#/' + name;
    if (location.hash !== h) location.hash = h; else R.onRender(true);
  });
}
export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [v, ...rest] = h.split('/');
  R.cur = VIEWS[v] ? v : 'home'; R.param = rest.join('/');
}
export const state = {}; // per-view filters survive re-renders

/* ---------------- tile swatch ---------------- */
export function swBg(p) {
  if (!p) return 'background:var(--surface-2)';
  if (p.photo) return `background:url("${p.photo}") center/cover`;
  const a = p.c1 || '#DDD', b = p.c2 || '#BBB';
  switch (p.pattern) {
    case 'marble': return `background:linear-gradient(125deg,transparent 0 37%,${b} 38.5%,transparent 40.5% 61%,${b}aa 62%,transparent 63.5%),linear-gradient(35deg,transparent 0 55%,${b}88 56%,transparent 57.5%),linear-gradient(160deg,transparent 0 20%,${b}55 21%,transparent 22.5%),${a}`;
    case 'stone': return `background:radial-gradient(circle at 30% 30%,${b} 0 7%,transparent 8%),radial-gradient(circle at 72% 62%,${b}cc 0 6%,transparent 7%),radial-gradient(circle at 45% 82%,${b}99 0 5%,transparent 6%),radial-gradient(circle at 82% 22%,${b}88 0 4%,transparent 5%),radial-gradient(circle at 15% 70%,${b}77 0 3%,transparent 4%),${a}`;
    case 'wood': return `background:repeating-linear-gradient(90deg,${a} 0 6px,${b}cc 6px 7px,${a} 7px 12px,${b}55 12px 14px,${a} 14px 19px),${a}`;
    case 'pattern': return `background:radial-gradient(circle at 50% 50%,${b} 0 17%,transparent 18%),radial-gradient(circle at 0 0,${b} 0 13%,transparent 14%),radial-gradient(circle at 100% 0,${b} 0 13%,transparent 14%),radial-gradient(circle at 0 100%,${b} 0 13%,transparent 14%),radial-gradient(circle at 100% 100%,${b} 0 13%,transparent 14%),${a};background-size:50% 50%`;
    case 'linear': return `background:repeating-linear-gradient(0deg,${a} 0 5px,${b} 5px 6px),${a}`;
    case 'cobble': return `background:radial-gradient(circle at 25% 25%,${b} 0 19%,transparent 20%),radial-gradient(circle at 75% 75%,${b} 0 19%,transparent 20%),${a};background-size:50% 50%`;
    case 'slate': return `background:repeating-linear-gradient(0deg,${a} 0 8px,${b} 8px 10px),repeating-linear-gradient(90deg,transparent 0 15px,${b}88 15px 17px),${a}`;
    default: return `background:linear-gradient(135deg,${a},${b})`;
  }
}
export const sw = (p, cls = '') => `<span class="sw ${cls} ${p && p.photo ? 'photo' : ''} ${p && !isTile(p) ? 'nogrout' : ''}" style='${swBg(p)}'></span>`;
export const av = (name, cls = '') => `<span class="av ${cls}">${esc(initials(name))}</span>`;

/* ---------------- charts ---------------- */
export function bars(series, { h = 170, fmt = inrS, highlightLast = true } = {}) {
  const max = Math.max(1, ...series.map(s => s.v));
  return `<div class="chart" style="height:${h}px">${series.map((s, i) => `<div class="col ${highlightLast && i === series.length - 1 ? 'today' : ''}" title="${esc(s.t)}: ${esc(fmt(s.v))}"><div class="b" style="height:${Math.max(1.5, s.v / max * 100)}%"></div></div>`).join('')}</div>
    <div class="xl">${series.map((s, i) => `<span>${s.l != null ? esc(s.l) : ''}</span>`).join('')}</div>`;
}
export function hbars(rows, fmt = inrS) {
  const max = Math.max(1, ...rows.map(r => r.v));
  return `<div class="hb">${rows.map(r => `<div class="hb-r" ${r.act ? `data-act="${r.act}" data-id="${esc(r.id || '')}" style="cursor:pointer"` : ''}>${r.p ? sw(r.p, 'xs') : ''}<b class="t">${esc(r.t)}</b><span class="v">${esc(fmt(r.v))}${r.s ? `<small class="muted"> ${esc(r.s)}</small>` : ''}</span><span class="track"><i style="width:${r.v / max * 100}%"></i></span></div>`).join('')}</div>`;
}

/* ---------------- product picker ---------------- */
export function pickProduct({ title = 'Pick a design', showStock = true } = {}) {
  return new Promise(res => {
    let done = false;
    const rowsFor = q => {
      const ps = activeProducts().filter(p => matches(q, p.name, p.code, p.brand, p.size, p.category, p.finish));
      if (!ps.length) return `<div class="empty"><b>No design found</b><p>Try another name or size.</p></div>`;
      return ps.slice(0, 80).map(p => {
        const st = stockState(p);
        return `<button class="pick" type="button" data-pid="${p.id}">${sw(p, 'sm')}<span class="grow"><b class="t">${esc(p.name)}</b><small class="muted t">${esc([p.size, p.finish, p.brand].filter(Boolean).join(' · '))}</small></span>
        <span class="r-end"><b>${inr(p.rate)}<small class="muted">${priceUnit(p)}</small></b>${showStock ? `<small class="${st === 'out' ? 'bad-t' : st === 'low' ? 'warn-t' : 'muted'}">${qtyText(productStock(p.id), p)}</small>` : ''}</span></button>`;
      }).join('');
    };
    const s = openSheet({
      title, cls: 'picker',
      body: `<div class="search sticky">${ic('search', 18)}<input placeholder="Search name, size, brand, code" data-in="pickQ" autofocus autocomplete="off" enterkeyhint="search"></div><div class="pick-list">${rowsFor('')}</div>`,
      onClose: () => { if (!done) res(null); }
    });
    IN.pickQ = el => { const l = el.closest('.sheet').querySelector('.pick-list'); l.innerHTML = rowsFor(el.value); };
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-pid]'); if (!b) return;
      done = true; res(get('products', b.dataset.pid)); closeSheet();
    });
  });
}

/* ---------------- party picker (with quick add) ---------------- */
export function pickParty({ type = 'customer', title, allowWalkin = false } = {}) {
  return new Promise(res => {
    let done = false;
    const src = () => type === 'supplier' ? suppliers() : customers();
    const rowsFor = q => {
      const ps = src().filter(p => matches(q, p.name, p.phone, p.kind, p.address));
      const add = q && !ps.some(p => p.name.toLowerCase() === q.toLowerCase()) ? `<button class="pick add" type="button" data-new="${esc(q)}"><span class="av acc">${ic('plus', 18)}</span><span class="grow"><b class="t">Add “${esc(q)}”</b><small class="muted">New ${type}</small></span></button>` : '';
      return add + (allowWalkin && !q ? `<button class="pick" type="button" data-walkin="1"><span class="av">${ic('user', 18)}</span><span class="grow"><b>Walk-in customer</b><small class="muted">Just type name and phone on the bill</small></span></button>` : '') +
        ps.slice(0, 80).map(p => { const cr = partyCredit(p.id); return `<button class="pick" type="button" data-party="${p.id}">${av(p.name)}<span class="grow"><b class="t">${esc(p.name)}</b><small class="muted t">${esc([p.kind, p.phone].filter(Boolean).join(' · '))}</small></span>${cr.out > 0.5 ? `<span class="r-end"><small class="muted">${type === 'supplier' ? 'To pay' : 'Due'}</small><b class="${type === 'supplier' ? '' : 'bad-t'}">${inr(cr.out)}</b></span>` : ''}</button>`; }).join('') ||
        (add ? '' : `<div class="empty"><b>No ${type}s yet</b><p>Type a name above to add one.</p></div>`);
    };
    const s = openSheet({
      title: title || (type === 'supplier' ? 'Pick supplier' : 'Pick customer'), cls: 'picker',
      body: `<div class="search sticky">${ic('search', 18)}<input placeholder="Search name or phone" data-in="ppQ" autofocus autocomplete="off" enterkeyhint="search"></div><div class="pick-list">${rowsFor('')}</div>`,
      onClose: () => { if (!done) res(null); }
    });
    IN.ppQ = el => { el.closest('.sheet').querySelector('.pick-list').innerHTML = rowsFor(el.value.trim()); };
    s.addEventListener('click', async e => {
      const b = e.target.closest('[data-party],[data-new],[data-walkin]'); if (!b) return;
      if (b.dataset.walkin) { done = true; res('walkin'); closeSheet(); return; }
      if (b.dataset.party) { done = true; res(get('parties', b.dataset.party)); closeSheet(); return; }
      const name = b.dataset.new;
      const isPhone = /^\d{10}$/.test(name);
      setSheet(s, {
        title: 'New ' + type, body: `<div class="frow">
        <label class="fld"><span>Name</span><input name="name" value="${isPhone ? '' : esc(name)}" autocomplete="off"></label>
        <label class="fld"><span>Mobile</span><input name="phone" value="${isPhone ? name : ''}" inputmode="tel" maxlength="14" autocomplete="off"></label></div>
        ${type === 'customer' ? `<label class="fld"><span>Type</span><select name="kind">${cfg('partyKinds').map(k => `<option>${esc(k)}</option>`).join('')}</select></label>` : ''}
        <label class="fld"><span>GSTIN (optional)</span><input name="gstin" autocomplete="off" style="text-transform:uppercase"></label>`,
        foot: `<button class="btn primary block" type="button" data-qadd>Save ${type}</button>`
      });
      s.querySelector('[data-qadd]').onclick = async () => {
        const f = Object.fromEntries([...s.querySelectorAll('[name]')].map(i => [i.name, i.value.trim()]));
        if (!f.name) { toast('Enter a name', 'bad'); return; }
        const rec = await put('parties', { type, name: f.name, phone: phone10(f.phone), kind: f.kind || (type === 'supplier' ? 'Manufacturer' : 'Retail'), gstin: f.gstin.toUpperCase(), stateCode: f.gstin ? f.gstin.slice(0, 2) : '', limit: 0, opening: 0 });
        done = true; res(rec); closeSheet();
      };
    });
  });
}

/* ---------------- misc ---------------- */
export const kpi = (label, value, sub = '', { cls = '', act = '', id = '' } = {}) => `<button class="kpi ${cls}" type="button" ${act ? `data-act="${act}"` : ''} ${id ? `data-id="${id}"` : ''}><small>${label}</small><b>${value}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</button>`;
export const moneyRow = (l, v, cls = '') => `<div class="${cls}"><span>${l}</span><b>${v}</b></div>`;
export const sec = (title, body, right = '') => `<section class="card"><div class="card-h"><h3>${title}</h3>${right}</div>${body}</section>`;
export function moreBtn(shown, total, act) { return total > shown ? `<button class="btn block ghost" type="button" data-act="${act}">Show more (${total - shown} more)</button>` : ''; }
export function payModeSel(name, value) { return `<select name="${name}">${cfg('payModes').map(m => `<option ${m === value ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`; }
export function partyLine(p) { return `${esc(p.name)}${p.phone ? ' · ' + esc(p.phone) : ''}`; }
export const fmtQtyShort = (q, p) => isTile(p) ? fmt2(q) : fmt2(q) + ' ' + ((p && p.uom) || '');
