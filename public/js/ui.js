// UI primitives: action registry, sheets (modal on desktop, bottom sheet on phone) wired to the back button, toasts, dialogs, form helpers.
import { $, $$, esc, ic, num } from './core.js';

export const A = {};   // click actions:  data-act="name"
export const IN = {};  // input handlers: data-in="name"
export const CH = {};  // change handlers: data-ch="name"
export const act = (o) => Object.assign(A, o);

/* ---------------- delegation ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act], a[href], [data-stop]');
  if (!el || !el.dataset.act || el.disabled) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' && !el.getAttribute('href')?.startsWith('http')) e.preventDefault();
  try { const r = fn(el, e); if (r && r.catch) r.catch(err => { console.error(err); toast(err.message || 'Something went wrong', 'bad'); }); }
  catch (err) { console.error(err); toast(err.message || 'Something went wrong', 'bad'); }
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e); });

/* ---------------- toast ---------------- */
let toastT;
export function toast(msg, kind = '', action) {
  const t = $('#toast');
  t.className = kind; t.innerHTML = esc(msg) + (action ? ` <button class="toast-act" type="button">${esc(action.label)}</button>` : '');
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.run(); };
  t.style.pointerEvents = action ? 'auto' : 'none';
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}

/* ---------------- sheets ---------------- */
const stack = [];
let navAfterClose = null;
export const sheetDepth = () => stack.length;
export const topSheet = () => stack[stack.length - 1] || null;

export function openSheet({ title = '', sub = '', body = '', foot = '', cls = '', id = '', onClose = null, onOpen = null }) {
  const layer = document.createElement('div');
  layer.className = 'layer';
  layer.innerHTML = `<div class="sheet-bg" data-act="closeSheet"></div>
    <section class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${id ? `data-sheet="${esc(id)}"` : ''}>
      <span class="grab" aria-hidden="true"></span>
      <header class="sheet-h"><div style="min-width:0"><h3 class="sh-t">${esc(title)}</h3><p class="sh-s">${sub}</p></div>
        <button class="icon-btn" data-act="closeSheet" type="button" aria-label="Close">${ic('x', 18)}</button></header>
      <div class="sheet-b">${body}</div>
      <footer class="sheet-f">${foot}</footer>
    </section>`;
  if (!foot) layer.querySelector('.sheet-f').remove();
  if (!sub) layer.querySelector('.sh-s').remove();
  $('#layers').append(layer);
  stack.push({ layer, onClose, id });
  history.pushState({ td: stack.length }, '');
  document.body.classList.add('locked');
  const sheet = layer.querySelector('.sheet');
  if (onOpen) onOpen(sheet);
  if (matchMedia('(pointer:fine)').matches) {
    const f = sheet.querySelector('[autofocus]') || sheet.querySelector('.sheet-b input:not([type=hidden]):not([readonly]), .sheet-b select, .sheet-b textarea');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  } else {
    const f = sheet.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 260);
  }
  enableSwipe(sheet);
  return sheet;
}
// update the open sheet in place (no new history entry)
export function setSheet(sheet, { title, sub, body, foot }) {
  if (title != null) sheet.querySelector('.sh-t').textContent = title;
  if (sub != null) { let s = sheet.querySelector('.sh-s'); if (!s) { s = document.createElement('p'); s.className = 'sh-s'; sheet.querySelector('.sheet-h div').append(s); } s.innerHTML = sub; }
  if (body != null) { const b = sheet.querySelector('.sheet-b'); b.innerHTML = body; b.scrollTop = 0; }
  if (foot != null) { let f = sheet.querySelector('.sheet-f'); if (!f) { f = document.createElement('footer'); f.className = 'sheet-f'; sheet.append(f); } f.innerHTML = foot; if (!foot) f.remove(); }
}
export function closeSheet() { if (stack.length) history.back(); }
export function closeAll(then) {
  if (!stack.length) { then && then(); return; }
  navAfterClose = then || null;
  history.go(-stack.length);
}
function removeTop() {
  const s = stack.pop(); if (!s) return;
  s.layer.classList.add('closing');
  setTimeout(() => s.layer.remove(), 170);
  if (s.onClose) try { s.onClose(); } catch (e) { console.error(e); }
  if (!stack.length) document.body.classList.remove('locked');
}
window.addEventListener('popstate', e => {
  const depth = (e.state && e.state.td) || 0;
  while (stack.length > depth) removeTop();
  if (!stack.length && navAfterClose) { const f = navAfterClose; navAfterClose = null; setTimeout(f, 0); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length && !document.querySelector('.cmdk')) { e.preventDefault(); closeSheet(); } });
A.closeSheet = () => closeSheet();

// drag the grab handle / header down to dismiss on touch screens
function enableSwipe(sheet) {
  const h = sheet.querySelector('.sheet-h'); const g = sheet.querySelector('.grab');
  let y0 = null, dy = 0;
  const start = e => { if (innerWidth > 720) return; y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; };
  const move = e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; };
  const end = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ''; if (dy > 110) closeSheet(); else sheet.style.transform = ''; };
  [h, g].forEach(el => { if (!el) return; el.addEventListener('touchstart', start, { passive: true }); el.addEventListener('touchmove', move, { passive: true }); el.addEventListener('touchend', end); });
}

/* ---------------- dialogs ---------------- */
export function confirmBox({ title, text = '', ok = 'Yes', cancel = 'Cancel', danger = false }) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; res(v); };
    const s = openSheet({
      title, cls: 'narrow', body: `<p class="muted">${text}</p>`,
      foot: `<button class="btn" data-act="cbNo" type="button">${esc(cancel)}</button><button class="btn ${danger ? 'danger armed' : 'primary'}" data-act="cbYes" type="button">${esc(ok)}</button>`,
      onClose: () => fin(false)
    });
    s.querySelector('[data-act=cbYes]').onclick = e => { e.stopPropagation(); fin(true); closeSheet(); };
    s.querySelector('[data-act=cbNo]').onclick = e => { e.stopPropagation(); fin(false); closeSheet(); };
  });
}

export function askText({ title, text = '', label = '', value = '', ok = 'OK', danger = false, required = false }) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (done) return; done = true; res(v); };
    const s = openSheet({
      title, cls: 'narrow', body: `${text ? `<p class="muted">${text}</p>` : ''}<label class="fld"><span>${esc(label)}</span><input name="ask" value="${esc(value)}" autocomplete="off" autofocus></label>`,
      foot: `<button class="btn" type="button" data-x="no">Back</button><button class="btn ${danger ? 'danger armed' : 'primary'}" type="button" data-x="yes">${esc(ok)}</button>`,
      onClose: () => fin(null)
    });
    const go = () => { const v = s.querySelector('[name=ask]').value.trim(); if (required && !v) { toast('Please fill this', 'bad'); return; } fin(v); closeSheet(); };
    s.querySelector('[data-x=yes]').onclick = go;
    s.querySelector('[data-x=no]').onclick = () => { fin(null); closeSheet(); };
    s.querySelector('[name=ask]').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

/* ---------------- forms ---------------- */
export const fld = (label, control, { cls = '', hint = '' } = {}) => `<label class="fld ${cls}"><span>${esc(label)}</span>${control}${hint ? `<small class="hint">${hint}</small>` : ''}</label>`;
export const inp = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
export const numInp = (name, value = '', attrs = '') => `<input name="${name}" value="${value === '' || value == null ? '' : esc(value)}" inputmode="decimal" autocomplete="off" ${attrs}>`;
export const area = (name, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`;
export const sel = (name, opts, value, attrs = '') => `<select name="${name}" ${attrs}>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
export const check = (name, on, label) => `<label class="tgl"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="tgl-ui"></span><span>${esc(label)}</span></label>`;
export const seg = (name, opts, value, attrs = '') => `<div class="seg" role="radiogroup">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''} ${attrs}><span>${esc(l)}</span></label>`; }).join('')}</div>`;
export function readForm(root) {
  const o = {};
  $$('[name]', root).forEach(el => {
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  });
  return o;
}
export function invalid(root, name, msg) {
  const el = root.querySelector(`[name="${name}"]`);
  if (el) { el.classList.add('err'); el.focus(); el.addEventListener('input', () => el.classList.remove('err'), { once: true }); }
  toast(msg, 'bad');
  return false;
}
export const n0 = v => num(v);

// one-tap busy state for async buttons (prevents double save)
export async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.dataset.busy) return;
  btn.dataset.busy = '1'; const html = btn.innerHTML; btn.disabled = true; btn.classList.add('busy');
  try { return await fn(); } finally { btn.disabled = false; delete btn.dataset.busy; btn.classList.remove('busy'); if (btn.isConnected) btn.innerHTML = html; }
}

export const empty = (title, text = '', btn = '') => `<div class="empty"><span class="empty-i">${ic('box', 26)}</span><b>${esc(title)}</b>${text ? `<p>${text}</p>` : ''}${btn}</div>`;
export const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`;
