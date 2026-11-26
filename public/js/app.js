// App shell: sign-in, navigation, rendering, global search, shortcuts, offline/sync status, install + updates.
import { $, $$, esc, ic, num, inr, fdate, matches, debounce, initials, today } from './core.js';
import { A, IN, CH, openSheet, closeSheet, closeAll, sheetDepth, toast, confirmBox, busy, readForm, invalid } from './ui.js';
import * as store from './store.js';
import { list, get, put, settings, can, me, isDemo, status, onChange, onStatus } from './store.js';
import { VIEWS, R, view, go, parseHash, state } from './parts.js';
import * as logic from './logic.js';
const { quoteStatus } = logic;
import './v-home.js';
import './v-stock.js';
import { refreshDocSheets } from './v-docs.js';
import { refreshPartySheets } from './v-parties.js';
import { refreshProductSheets } from './v-stock.js';
import { refreshLeadSheets } from './v-more.js';
import './v-reports.js';
import { syncLine } from './v-settings.js';

const NAV = [
  ['Shop', [['home', 'Dashboard', 'home'], ['sales', 'Sales', 'sales'], ['quotes', 'Quotations', 'quote'], ['stock', 'Stock', 'stock']]],
  ['Money', [['credit', 'Customers & credit', 'credit'], ['expenses', 'Expenses', 'expense'], ['purchases', 'Purchases', 'cart', 'purchases'], ['suppliers', 'Suppliers', 'truck']]],
  ['Grow', [['leads', 'Leads', 'leads'], ['reports', 'Reports', 'chart', 'reports']]],
  ['', [['settings', 'Settings', 'gear']]]
];
const BNAV = [['home', 'Home', 'home'], ['stock', 'Stock', 'stock'], ['+', 'Create', 'plus'], ['sales', 'Sales', 'sales'], ['more', 'More', 'more']];

/* ---------------- theme ---------------- */
function applyTheme() { const t = localStorage.getItem('td-theme'); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; const b = $('#theme-btn'); if (b) b.innerHTML = ic(dark ? 'sun' : 'moon', 18); $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0C1311' : '#0F6B5B'); }
A.theme = () => { const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); localStorage.setItem('td-theme', cur === 'dark' ? 'light' : 'dark'); applyTheme(); };

/* ---------------- shell ---------------- */
function shell() {
  document.body.innerHTML = `<div class="app">
    <aside class="side" aria-label="Main navigation"><div class="brand"><span class="logo"><i></i><i></i><i></i><i></i></span><span style="min-width:0"><b>TileDesk</b><small class="t" id="side-shop"></small></span></div>
      <button class="side-search" type="button" data-act="search">${ic('search', 17)}<span>Search</span><kbd>Ctrl K</kbd></button>
      <nav class="nav" id="side-nav"></nav>
      <div class="side-foot"><span class="av" id="side-av"></span><span style="min-width:0;flex:1"><b class="t" id="side-user"></b><small id="side-sync" class="t"></small></span></div></aside>
    <div class="main">
      <header class="top"><div class="top-in">
        <span class="top-brand"><span class="logo"><i></i><i></i><i></i><i></i></span><b class="t" id="top-shop">TileDesk</b></span>
        <span class="top-title" id="top-title"></span><span class="spacer"></span>
        <button class="sync-pill" type="button" id="sync-pill" data-act="syncInfo" hidden></button>
        <button class="icon-btn hide-d" type="button" data-act="search" aria-label="Search">${ic('search', 18)}</button>
        <button class="btn primary sm hide-m" data-act="quick" type="button">${ic('plus', 16, 2.2)}Create</button>
        <button class="icon-btn" data-act="theme" type="button" aria-label="Light or dark theme" id="theme-btn"></button>
        <a class="icon-btn" href="#/settings" aria-label="Settings">${ic('gear', 18)}</a>
      </div></header>
      <main class="view" id="view" tabindex="-1"></main>
    </div>
    <nav class="bnav" id="bnav" aria-label="Bottom navigation"></nav></div>
    <div id="layers"></div><div id="toast" role="status" aria-live="polite"></div><div id="print" aria-hidden="true"></div>`;
  applyTheme();
}
function renderNav() {
  const cur = R.cur;
  const cs = { credit: null, leads: null };
  $('#side-nav').innerHTML = NAV.map(([g, items]) => `${g ? `<div class="nav-l">${g}</div>` : '<div class="nav-sp"></div>'}${items.filter(i => !i[3] || can(i[3])).map(([v, l, i]) => `<a href="#/${v}" class="${cur === v ? 'on' : ''}" ${cur === v ? 'aria-current="page"' : ''}>${ic(i, 19)}<span>${l}</span>${badge(v)}</a>`).join('')}`).join('');
  $('#bnav').innerHTML = BNAV.map(([v, l, i]) => v === '+' ? `<a data-act="quick" aria-label="Create" class="fab"><span class="f">${ic('plus', 26, 2.4)}</span></a>` : `<a href="#/${v}" class="${cur === v || (v === 'more' && !['home', 'stock', 'sales'].includes(cur)) ? 'on' : ''}">${ic(i, 22)}<span>${l}</span></a>`).join('');
  const s = settings(); const u = me();
  $('#side-shop').textContent = s.shopName || 'Tiles ERP'; $('#top-shop').textContent = s.shopName || 'TileDesk';
  $('#side-user').textContent = u.name || ''; $('#side-av').textContent = initials(u.name);
  $('#top-title').textContent = VIEWS[cur]?.title || '';
  document.title = (VIEWS[cur]?.title || 'TileDesk') + ' · ' + (s.shopName || 'TileDesk');
  renderSync();
}
function badge(v) {
  if (v === 'leads') { const n = list('leads').filter(l => l.follow && !['Won', 'Lost'].includes(l.stage) && l.follow <= today()).length; return n ? `<span class="cnt">${n}</span>` : ''; }
  if (v === 'quotes') { const n = list('quotes').filter(q => quoteStatus(q) === 'Sent').length; return n ? `<span class="cnt soft">${n}</span>` : ''; }
  return '';
}
function renderSync() {
  const p = $('#sync-pill'), side = $('#side-sync'); if (!p) return;
  if (isDemo()) { side.textContent = 'Demo · saved on this device'; p.hidden = true; return; }
  const off = !status.online, bad = status.error, busyS = status.syncing || status.pending;
  side.innerHTML = syncLine();
  p.hidden = !(off || bad || status.pending);
  p.className = 'sync-pill ' + (off ? 'off' : bad ? 'bad' : busyS ? 'busy' : '');
  p.innerHTML = off ? `${ic('offline', 15)}<span>Offline${status.pending ? ' · ' + status.pending : ''}</span>` : bad ? `${ic('alert', 15)}<span>Sync issue</span>` : `${ic('sync', 15)}<span>${status.pending || ''}</span>`;
}
A.syncInfo = () => openSheet({ title: 'Sync', cls: 'narrow', body: `<p>${syncLine()}</p><p class="muted">You can keep working without internet. Bills, payments and everything else are saved on this phone and sent to the server automatically when the internet is back.</p>`, foot: `<button class="btn primary block" type="button" data-act="syncNowBtn">Sync now</button>` });

/* ---------------- render ---------------- */
let lastView = '';
function render() {
  parseHash();
  const v = VIEWS[R.cur]; const main = $('#view'); if (!main || !v) return;
  const ae = document.activeElement; const fid = ae && ae.id && main.contains(ae) ? ae.id : null; const sel = fid && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const t0 = performance.now();
  try { main.innerHTML = v.render(); } catch (e) { console.error(e); main.innerHTML = `<div class="empty"><b>Something went wrong on this screen</b><p>${esc(e.message)}</p><button class="btn" type="button" data-act="go" data-id="home">Go to dashboard</button></div>`; }
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { } } }
  if (lastView !== R.cur) { window.scrollTo(0, 0); lastView = R.cur; main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); }
  renderNav();
  window.__lastRender = performance.now() - t0;
}
R.onRender = render;
let raf = 0;
function scheduleRender() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); refreshDocSheets(); refreshPartySheets(); refreshProductSheets(); refreshLeadSheets(); }); }

IN.listQ = debounce(el => { const v = el.dataset.v; state[v] = state[v] || {}; state[v].q = el.value; state[v].n = 60; render(); }, 120);
A.listF = el => { const v = el.dataset.v; state[v].f = el.dataset.f; render(); };

/* ---------------- create menu ---------------- */
A.quick = () => {
  const items = [['newBill', 'sales', 'New bill', 'GST bill, batch picking, part payment'], ['newQuote', 'quote', 'Quotation', 'Room area → boxes, WhatsApp'], ['receivePay', 'cash', 'Receive payment', 'From a customer'], ['addExpense', 'expense', 'Expense', 'Tempo, hamali, tea, commission'], ['addLead', 'leads', 'New lead', 'Walk-in, call, Instagram'], ['newPurchase', 'truck', 'Stock purchase', 'Stock in from supplier', 'purchases'], ['stockIn', 'plus', 'Add stock', 'Opening or count correction', 'stockAdjust'], ['newParty', 'user', 'New customer', 'Contractor, builder, retail'], ['calc', 'calc', 'Box calculator', 'Room size → boxes']].filter(x => !x[4] || can(x[4]));
  openSheet({ title: 'Create', cls: 'narrow quick', body: `<div class="qa qa-sheet">${items.map(([a, i, t, s]) => `<button type="button" data-qa="${a}"><span class="qi">${ic(i, 20)}</span><b>${t}</b><small>${s}</small></button>`).join('')}</div>`, onOpen: sh => sh.addEventListener('click', e => { const b = e.target.closest('[data-qa]'); if (!b) return; const a = b.dataset.qa; closeAll(() => A[a]({ dataset: {} })); }) });
};

/* ---------------- global search ---------------- */
A.search = () => {
  const s = openSheet({ title: 'Search', cls: 'cmdk-sheet', body: `<div class="search sticky">${ic('search', 18)}<input placeholder="Bill no., customer, phone, design, page…" data-in="gsQ" autofocus autocomplete="off" enterkeyhint="search"></div><div class="gs-res">${gsResults('')}</div>` });
  s.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = s.querySelector('.gs-res [data-act]'); if (f) f.click(); } });
};
IN.gsQ = debounce(el => { el.closest('.sheet').querySelector('.gs-res').innerHTML = gsResults(el.value.trim()); }, 80);
function gsResults(q) {
  const pages = Object.entries(VIEWS).filter(([k]) => k !== 'more' && (k !== 'reports' || can('reports'))).map(([k, v]) => ({ k, t: v.title, i: v.icon }));
  if (!q) return `<div class="gs-g"><small>Go to</small>${pages.map(p => `<button class="pick" type="button" data-act="gsGo" data-v="${p.k}">${ic(p.i || 'right', 18)}<span class="grow"><b>${esc(p.t)}</b></span></button>`).join('')}</div>`;
  const out = [];
  const pg = pages.filter(p => matches(q, p.t)); if (pg.length) out.push(`<div class="gs-g"><small>Pages</small>${pg.map(p => `<button class="pick" type="button" data-act="gsGo" data-v="${p.k}">${ic(p.i || 'right', 18)}<span class="grow"><b>${esc(p.t)}</b></span></button>`).join('')}</div>`);
  const inv = list('invoices').filter(i => matches(q, i.no, i.cust.name, i.cust.phone)).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8);
  if (inv.length) out.push(`<div class="gs-g"><small>Bills</small>${inv.map(i => `<button class="pick" type="button" data-act="gsDoc" data-kind="invoices" data-id="${i.id}">${ic('sales', 18)}<span class="grow"><b class="t">${esc(i.cust.name)}</b><small class="muted">${esc(i.no || '')} · ${fdate(i.date)}</small></span><b>${inr(i.total)}</b></button>`).join('')}</div>`);
  const ps = list('parties').filter(p => matches(q, p.name, p.phone, p.gstin)).slice(0, 8);
  if (ps.length) out.push(`<div class="gs-g"><small>Customers & suppliers</small>${ps.map(p => `<button class="pick" type="button" data-act="gsParty" data-id="${p.id}"><span class="av">${esc(initials(p.name))}</span><span class="grow"><b class="t">${esc(p.name)}</b><small class="muted">${esc([p.kind, p.phone].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`);
  const pr = list('products').filter(p => matches(q, p.name, p.code, p.size, p.brand)).slice(0, 8);
  if (pr.length) out.push(`<div class="gs-g"><small>Designs</small>${pr.map(p => `<button class="pick" type="button" data-act="gsProduct" data-id="${p.id}">${ic('stock', 18)}<span class="grow"><b class="t">${esc(p.name)}</b><small class="muted">${esc([p.size, p.brand].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`);
  const qs = list('quotes').filter(x => matches(q, x.no, x.cust.name, x.cust.phone)).slice(0, 5);
  if (qs.length) out.push(`<div class="gs-g"><small>Quotations</small>${qs.map(x => `<button class="pick" type="button" data-act="gsDoc" data-kind="quotes" data-id="${x.id}">${ic('quote', 18)}<span class="grow"><b class="t">${esc(x.cust.name)}</b><small class="muted">${esc(x.no || '')}</small></span><b>${inr(x.total)}</b></button>`).join('')}</div>`);
  const ls = list('leads').filter(l => matches(q, l.name, l.phone, l.need)).slice(0, 5);
  if (ls.length) out.push(`<div class="gs-g"><small>Leads</small>${ls.map(l => `<button class="pick" type="button" data-act="gsLead" data-id="${l.id}">${ic('leads', 18)}<span class="grow"><b class="t">${esc(l.name)}</b><small class="muted">${esc(l.stage)} · ${esc(l.need || '')}</small></span></button>`).join('')}</div>`);
  return out.join('') || `<div class="empty"><b>Nothing found</b><p>Try a name, phone number or bill number.</p></div>`;
}
A.gsGo = el => go(el.dataset.v);
A.gsDoc = el => closeAll(() => A.openDoc(el));
A.gsParty = el => closeAll(() => A.party(el));
A.gsProduct = el => closeAll(() => A.product(el));
A.gsLead = el => closeAll(() => A.viewLead(el));

document.addEventListener('keydown', e => {
  if (!$('.app')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!document.querySelector('.cmdk-sheet')) A.search(); return; }
  if (e.key === '/' && !typing && !sheetDepth()) { e.preventDefault(); A.search(); return; }
  if (e.altKey && !e.ctrlKey) { const k = e.key.toLowerCase(); const m = { n: 'newBill', q: 'newQuote', p: 'receivePay', e: 'addExpense' }[k]; if (m) { e.preventDefault(); closeAll(() => A[m]({ dataset: {} })); } }
});

/* ---------------- auth ---------------- */
function authScreen(mode = 'login', msg = '') {
  document.body.innerHTML = `<div class="auth"><div class="auth-art" aria-hidden="true"><div class="tiles-bg">${Array.from({ length: 24 }, (_, i) => `<i style="--d:${(i * 37) % 11}"></i>`).join('')}</div>
      <div class="auth-pitch"><span class="logo lg"><i></i><i></i><i></i><i></i></span><h1>TileDesk</h1><p>Stock by batch & shade, GST bills, quotations, credit, expenses and leads: one app for your tile showroom.</p>
      <ul><li>${ic('check', 18)} Works on phone and computer, even without internet</li><li>${ic('check', 18)} Area in, boxes out. No more calculation mistakes</li><li>${ic('check', 18)} Know who owes you, and since when</li></ul></div></div>
    <div class="auth-box"><div class="auth-card">
      <div class="auth-brand"><span class="logo"><i></i><i></i><i></i><i></i></span><b>TileDesk</b></div>
      <div class="seg wide"><label><input type="radio" name="am" value="login" ${mode === 'login' ? 'checked' : ''} data-ch="authMode"><span>Sign in</span></label><label><input type="radio" name="am" value="signup" ${mode === 'signup' ? 'checked' : ''} data-ch="authMode"><span>New shop</span></label></div>
      <form id="auth-form" autocomplete="on" novalidate>${mode === 'login' ? `
        <h2>Welcome back</h2><p class="muted">Sign in with the username your shop owner gave you.</p>
        <label class="fld"><span>Username or mobile</span><input name="username" autocomplete="username" autocapitalize="none" required></label>
        <label class="fld"><span>Password</span><div class="pw"><input name="password" type="password" autocomplete="current-password" required><button type="button" class="link" data-act="pwShow">Show</button></div></label>
        <button class="btn primary lg block" type="submit">Sign in</button>` : `
        <h2>Set up your shop</h2><p class="muted">Free to start. Takes one minute.</p>
        <label class="fld"><span>Shop name</span><input name="shopName" required placeholder="e.g. Shree Balaji Tiles"></label>
        <label class="fld"><span>Your name</span><input name="name" autocomplete="name" required></label>
        <label class="fld"><span>Mobile (this is your username)</span><input name="username" inputmode="tel" autocomplete="username" required></label>
        <label class="fld"><span>Password</span><div class="pw"><input name="password" type="password" autocomplete="new-password" required minlength="6"><button type="button" class="link" data-act="pwShow">Show</button></div><small class="hint">At least 6 characters.</small></label>
        <button class="btn primary lg block" type="submit">Create my shop</button>`}
        <div class="note bad" id="auth-err">${esc(msg)}</div>
      </form>
      <div class="auth-or"><span>or</span></div>
      <button class="btn block lg" type="button" data-act="tryDemo">${ic('stock', 18)} Try the demo shop (sample data)</button>
      <p class="auth-foot muted">Your data is private to your shop. Staff get their own login with limited rights.</p>
    </div></div></div><div id="layers"></div><div id="toast" role="status" aria-live="polite"></div>`;
  applyTheme();
  const f = $('#auth-form');
  f.querySelector('input').focus();
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]'); const d = readForm(f); const err = $('#auth-err'); err.textContent = '';
    await busy(btn, async () => {
      try {
        if (mode === 'login') { if (!d.username || !d.password) throw new Error('Enter username and password'); await store.signIn(d.username, d.password); }
        else { if (!d.shopName || !d.name || !d.username || !d.password) throw new Error('Please fill all fields'); await store.signUp(d); }
        await startApp(true);
      } catch (x) { err.textContent = x.message; }
    });
  });
}
CH.authMode = el => authScreen(el.value);
A.pwShow = el => { const i = el.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; };
A.tryDemo = el => busy(el, async () => { await store.open({ mode: 'demo', user: { name: 'Rajesh Jain', role: 'owner' } }); if (await store.isEmpty()) await loadDemo(); await startApp(true); });
A.startReal = async () => {
  if (!(await confirmBox({ title: 'Use TileDesk for your shop?', text: 'Create your own shop account. The demo stays on this device and you can open it again any time. Your real data is kept on the server and syncs to every phone and computer you sign in on.', ok: 'Create my shop' }))) return;
  await store.logout(false); location.hash = ''; authScreen('signup');
};
export async function loadDemo() {
  const { demoData } = await import('./seed.js');
  const d = demoData(); const items = [];
  for (const [c, arr] of Object.entries(d)) for (const x of arr) items.push({ c, d: x });
  for (let i = 0; i < items.length; i += 500) await store.put(items.slice(i, i + 500));
}

/* ---------------- boot ---------------- */
let started = false;
async function startApp(fresh) {
  shell();
  if (!started) {
    started = true;
    onChange(scheduleRender);
    onStatus(() => { renderSync(); const sb = document.querySelector('.sync-box'); if (sb) sb.innerHTML = syncLine(); });
    window.addEventListener('hashchange', () => { if (sheetDepth()) closeAll(render); else render(); });
    store.onSessionExpired(() => { toast('Please sign in again', 'bad'); const u = me(); setTimeout(() => { authScreen('login', 'Your session ended. Sign in again. Unsynced changes on this device are kept.'); const i = document.querySelector('[name=username]'); if (i) i.value = u.username || ''; }, 600); });
  }
  if (!location.hash || fresh) history.replaceState(null, '', '#/home');
  render();
  if (!isDemo() && !list('settings').length) { const v = $('#view'); v.innerHTML = `<div class="loading-shop"><span class="spin"></span><b>Loading your shop…</b><p class="muted">First time on this device takes a few seconds.</p></div>`; }
  if (fresh && !isDemo() && store.S.session?.user?.role === 'owner' && list('products').length === 0) setTimeout(() => onboarding(), 900);
}
function onboarding() {
  if (!$('.app') || list('products').length) return;
  openSheet({ title: 'Welcome! Three quick steps', cls: 'narrow', body: `<ol class="steps-l"><li><b>Shop details</b><span>Name, GSTIN, address, UPI for bills.</span><button class="btn sm" type="button" data-act="obGo" data-v="settings">Open</button></li><li><b>Add your designs</b><span>Size, pieces per box, rate. Add opening stock.</span><button class="btn sm" type="button" data-act="obGo" data-v="stock">Open</button></li><li><b>Add staff</b><span>Settings → Users. Each person gets their own login.</span></li></ol><p class="muted">Tip: install the app on your phone from Settings → My account.</p>`, foot: `<button class="btn primary block" type="button" data-act="closeSheet">Got it</button>` });
}
A.obGo = el => closeAll(() => go(el.dataset.v));

// install prompt
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
A.installApp = async () => {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; if (r.outcome === 'accepted') toast('Installed. Open TileDesk from your home screen.'); installEvt = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  openSheet({ title: 'Install TileDesk', cls: 'narrow', body: ios ? '<p>On iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>' : matchMedia('(display-mode: standalone)').matches ? '<p>TileDesk is already installed on this device.</p>' : '<p>Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p><p class="muted">On a computer, look for the install icon at the right end of the address bar.</p>' });
};

// service worker + update notice
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('A new version is ready', '', { label: 'Update', run: () => { w.postMessage('skip'); } }); });
      });
    }).catch(() => { });
    let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded || !hadController) return; reloaded = true; location.reload(); });
  });
}

async function boot() {
  applyTheme();
  const sess = store.loadSession();
  if (!sess) { authScreen(location.hash === '#signup' ? 'signup' : 'login'); return; }
  try {
    await store.open(sess);
    if (sess.mode === 'demo' && await store.isEmpty()) await loadDemo();
    await startApp(false);
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div class="empty" style="padding:60px 20px"><b>Could not open TileDesk</b><p>${esc(e.message)}</p><p class="muted">If you are in private/incognito mode, open in a normal window.</p><button class="btn" onclick="localStorage.clear();location.reload()">Reset and try again</button></div>`;
  }
}
window.__td = { store, VIEWS, R, A, go, render }; window.__logic = logic;
boot();
