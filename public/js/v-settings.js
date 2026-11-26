// Settings: shop profile, bill settings, lists, users & roles, my account, backup/restore, activity log, install.
import { esc, ic, num, today, fdt, fyLabel, STATES, gstinOk, rel, iso } from './core.js';
import { A, CH, openSheet, setSheet, closeSheet, closeAll, toast, confirmBox, askText, busy, empty, pill, readForm, invalid, fld, inp, sel, area, check } from './ui.js';
import { list, get, put, settings, can, me, role, isDemo, api, status, exportAll, importAll, logout, setSessionUser, updateSessionToken, S, syncNow, wipeDemo } from './store.js';
import { cfg, DEFAULTS } from './logic.js';
import { view, go, state, av } from './parts.js';
import { download } from './v-reports.js';

const ROLE_L = { owner: 'Owner (everything)', manager: 'Manager (no users/settings)', staff: 'Staff (billing, quotes, leads, payments; no cost or profit)' };
const TABS = [['shop', 'Shop'], ['bill', 'Bill & print'], ['lists', 'Lists'], ['users', 'Users'], ['account', 'My account'], ['data', 'Backup & data']];

view('settings', {
  title: 'Settings', icon: 'gear',
  render() {
    const owner = role() === 'owner';
    const tabs = TABS.filter(([k]) => owner || ['account', 'data'].includes(k));
    const st = state.settings || (state.settings = { tab: owner ? 'shop' : 'account' });
    if (!tabs.some(t => t[0] === st.tab)) st.tab = tabs[0][0];
    const s = settings();
    const body = { shop: shopTab, bill: billTab, lists: listsTab, users: usersTab, account: accountTab, data: dataTab }[st.tab](s);
    return `<div class="ph"><div><h1>Settings</h1><p>${esc(s.shopName || '')}</p></div></div>
      <div class="chips tabs">${tabs.map(([k, l]) => `<button class="chip ${st.tab === k ? 'on' : ''}" type="button" data-act="setTab" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="set-body" id="set-body">${body}</div>`;
  }
});
A.setTab = el => { state.settings.tab = el.dataset.t; go('settings'); };
const saveBtn = act => `<div class="set-save"><button class="btn primary lg" type="button" data-act="${act}">${ic('check', 18)} Save changes</button></div>`;

function shopTab(s) {
  return `<section class="card"><h3>Shop details</h3><p class="muted">Printed on every bill and quotation.</p>
    <div class="set-grid">
    <div class="logo-pick"><span class="logo-prev">${s.logo ? `<img src="${esc(s.logo)}" alt="">` : ic('shop', 28)}</span><label class="btn sm">${ic('camera', 16)} ${s.logo ? 'Change logo' : 'Add logo'}<input type="file" accept="image/*" data-ch="setLogo" hidden></label>${s.logo ? '<button class="btn sm" type="button" data-act="noLogo">Remove</button>' : ''}</div>
    ${fld('Shop name', inp('shopName', s.shopName))}${fld('Tagline', inp('tagline', s.tagline, 'placeholder="Tiles · Sanitary · Bath fittings"'))}
    <div class="frow">${fld('Owner name', inp('owner', s.owner))}${fld('Phone', inp('phone', s.phone, 'inputmode="tel"'))}</div>
    ${fld('Address', inp('address', s.address))}
    <div class="frow3">${fld('City', inp('city', s.city))}${fld('State', sel('stateCode', [['', '—'], ...STATES.map(([c, n]) => [c, c + ' · ' + n])], s.stateCode || ''))}${fld('PIN', inp('pin', s.pin, 'inputmode="numeric" maxlength="6"'))}</div>
    <div class="frow">${fld('GSTIN', inp('gstin', s.gstin, 'style="text-transform:uppercase" maxlength="15"'), { hint: 'State is filled from GSTIN.' })}${fld('Email', inp('email', s.email, 'type="email"'))}</div>
    </div></section>${saveBtn('saveShop')}`;
}
let logoData = null;
CH.setLogo = async el => { const f = el.files[0]; if (!f) return; const img = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = URL.createObjectURL(f); }); const c = document.createElement('canvas'); const k = Math.min(1, 240 / Math.max(img.width, img.height)); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); logoData = c.toDataURL('image/png'); document.querySelector('.logo-prev').innerHTML = `<img src="${logoData}" alt="">`; toast('Logo ready. Tap Save.'); };
A.noLogo = () => { logoData = ''; document.querySelector('.logo-prev').innerHTML = ic('shop', 28); };
async function saveSettings(patch) { if (role() !== 'owner') { toast('Only the owner can change settings', 'bad'); return; } await put('settings', { ...settings(), id: 'shop', ...patch }); toast('Settings saved'); }
A.saveShop = el => busy(el, async () => {
  const f = readForm(document.getElementById('set-body'));
  if (!f.shopName) return invalid(document.getElementById('set-body'), 'shopName', 'Enter shop name');
  const g = f.gstin.toUpperCase();
  if (g && !gstinOk(g)) { if (!(await confirmBox({ title: 'GSTIN looks wrong', text: `“${esc(g)}” is not in the usual 15-character format. Save anyway?`, ok: 'Save anyway' }))) return; }
  const patch = { shopName: f.shopName, tagline: f.tagline, owner: f.owner, phone: f.phone, address: f.address, city: f.city, stateCode: f.stateCode || (g ? g.slice(0, 2) : ''), pin: f.pin, gstin: g, email: f.email };
  patch.state = (STATES.find(x => x[0] === patch.stateCode) || [, ''])[1];
  if (logoData !== null) patch.logo = logoData;
  await saveSettings(patch); logoData = null;
});

function billTab(s) {
  const bank = s.bank || {};
  return `<section class="card"><h3>Bills</h3><div class="set-grid">
    <div class="frow">${fld('Default GST on new bills', sel('defaultTaxMode', [['excl', 'Rates + GST extra'], ['incl', 'Rates include GST'], ['none', 'No GST (estimate / bill of supply)']], s.defaultTaxMode || 'excl'))}${fld('Print size', sel('printSize', [['a4', 'A4 / Letter'], ['thermal', 'Thermal 80 mm']], s.printSize || 'a4'))}</div>
    <div class="frow3">${fld('Default wastage %', inp('wastage', s.wastage ?? DEFAULTS.wastage, 'inputmode="decimal"'))}${fld('Quotation valid (days)', inp('validDays', s.validDays ?? DEFAULTS.validDays, 'inputmode="numeric"'))}${fld('Staff max discount %', inp('staffMaxDisc', s.staffMaxDisc ?? DEFAULTS.staffMaxDisc, 'inputmode="decimal"'))}</div>
    ${fld('Bill terms (one per line)', area('terms', s.terms || '', 'rows="4"'))}
    ${fld('Quotation terms (one per line)', area('quoteTerms', s.quoteTerms || '', 'rows="3"'))}
    </div></section>
    <section class="card"><h3>Get paid faster</h3><p class="muted">A UPI QR with the exact amount is printed on unpaid bills and shown on the bill link.</p><div class="set-grid">
    <div class="frow">${fld('UPI ID', inp('upi', s.upi, 'placeholder="shopname@okaxis" autocomplete="off"'))}<div class="fld"><span>&nbsp;</span>${check('showUpiQr', s.showUpiQr !== false, 'Print UPI QR on bills')}</div></div>
    <div class="frow">${fld('Bank name', inp('bankName', bank.name))}${fld('Account no.', inp('bankAcc', bank.acc, 'inputmode="numeric"'))}</div>
    <div class="frow">${fld('IFSC', inp('bankIfsc', bank.ifsc, 'style="text-transform:uppercase"'))}${fld('Branch', inp('bankBranch', bank.branch))}</div></div></section>
    ${!isDemo() ? `<section class="card"><h3>Bill numbering</h3><p class="muted">Numbers restart every financial year (April). Bills this year look like INV/${fyLabel()}/0001. If you are moving from a bill book or old software, set the next number.</p>
      <div class="frow">${fld('Next number for', sel('ckind', [['invoices', 'Bills (INV)'], ['quotes', 'Quotations (QT)'], ['receipts', 'Receipts (RCPT)'], ['returns', 'Credit notes (CN)'], ['purchases', 'Purchases (PUR)']], 'invoices'))}${fld('Next number', inp('cnext', '', 'inputmode="numeric" placeholder="e.g. 1251"'))}</div>
      <button class="btn" type="button" data-act="setCounter">Set number</button></section>` : ''}
    ${saveBtn('saveBill')}`;
}
A.saveBill = el => busy(el, async () => {
  const f = readForm(document.getElementById('set-body'));
  await saveSettings({ defaultTaxMode: f.defaultTaxMode, printSize: f.printSize, wastage: num(f.wastage), validDays: num(f.validDays) || 15, staffMaxDisc: num(f.staffMaxDisc), terms: f.terms, quoteTerms: f.quoteTerms, upi: f.upi.trim(), showUpiQr: f.showUpiQr, bank: { name: f.bankName, acc: f.bankAcc, ifsc: f.bankIfsc.toUpperCase(), branch: f.bankBranch } });
});
A.setCounter = el => busy(el, async () => {
  const f = readForm(document.getElementById('set-body'));
  const n = parseInt(f.cnext, 10); if (!(n >= 1)) { toast('Enter a number', 'bad'); return; }
  try { await api('POST', '/api/counters', { kind: f.ckind, next: n, date: today() }); toast('Next number set to ' + n); } catch (e) { toast(e.message, 'bad'); }
});

function listsTab() {
  const L = [['godowns', 'Godowns / locations', 'Where stock is kept'], ['categories', 'Categories', 'Floor, Wall, Sanitary…'], ['expenseCats', 'Expense categories', ''], ['leadSources', 'Lead sources', 'Where enquiries come from'], ['partyKinds', 'Customer types', ''], ['payModes', 'Payment modes', '']];
  return `<section class="card"><h3>Lists</h3><p class="muted">One per line. Renaming does not change old entries.</p><div class="set-grid lists">${L.map(([k, t, h]) => fld(t, area(k, cfg(k).join('\n'), 'rows="5"'), { hint: h })).join('')}</div></section>${saveBtn('saveLists')}`;
}
A.saveLists = el => busy(el, async () => {
  const f = readForm(document.getElementById('set-body')); const patch = {};
  for (const k of ['godowns', 'categories', 'expenseCats', 'leadSources', 'partyKinds', 'payModes']) { const v = [...new Set(f[k].split('\n').map(x => x.trim()).filter(Boolean))]; patch[k] = v.length ? v : DEFAULTS[k]; }
  await saveSettings(patch);
});

/* ---------------- users ---------------- */
let usersCache = null;
function usersTab() {
  if (isDemo()) return `<section class="card"><h3>Users</h3><p class="muted">In your real shop account you can add staff with their own login. Each person sees only what their role allows:</p><ul class="roles">${Object.values(ROLE_L).map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>`;
  if (!usersCache) { api('GET', '/api/users').then(r => { usersCache = r.users; if (state.settings.tab === 'users') go('settings'); }).catch(e => toast(e.message, 'bad')); return `<section class="card"><p class="muted">Loading users…</p></section>`; }
  return `<section class="card"><div class="card-h"><h3>Users (${usersCache.length})</h3><button class="btn primary sm" type="button" data-act="addUser">${ic('plus', 16)} Add user</button></div>
    <div class="rows">${usersCache.map(u => `<div class="row" data-act="editUser" data-id="${u.id}">${av(u.name)}<div class="grow"><b class="t">${esc(u.name)}${u.id === me().id ? ' (you)' : ''}</b><small class="muted t">${esc(u.username)} · ${u.lastSeen ? 'last seen ' + fdt(u.lastSeen) : 'never signed in'}</small></div>${pill(u.role, u.role === 'owner' ? 'acc' : u.role === 'manager' ? 'clay' : '')}${u.active ? '' : pill('Off', 'bad')}</div>`).join('')}</div></section>
    <section class="card"><h3>What each role can do</h3><ul class="roles">${Object.values(ROLE_L).map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>`;
}
A.addUser = () => openSheet({ title: 'Add user', cls: 'narrow', body: `${fld('Name', inp('name', '', 'autofocus'))}${fld('Username (or mobile)', inp('username', '', 'autocapitalize="none" autocomplete="off"'), { hint: 'They type this to sign in.' })}${fld('Password', inp('password', '', 'type="text" autocomplete="off"'), { hint: 'At least 6 characters. Share it with them privately.' })}${fld('Role', sel('role', [['staff', ROLE_L.staff], ['manager', ROLE_L.manager]], 'staff'))}`, foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveUser">Add user</button>` });
A.saveUser = el => busy(el, async () => {
  const s = el.closest('.sheet'); const f = readForm(s);
  try { await api('POST', '/api/users', { name: f.name, username: f.username, password: f.password, role: f.role }); usersCache = null; toast(f.name + ' added'); closeSheet(); go('settings'); }
  catch (e) { toast(e.message, 'bad'); }
});
A.editUser = el => {
  const u = usersCache.find(x => x.id === el.dataset.id); if (!u) return;
  const self = u.id === me().id;
  openSheet({ title: u.name, sub: esc(u.username), cls: 'narrow', body: `${fld('Name', inp('name', u.name))}${!self && u.role !== 'owner' ? fld('Role', sel('role', [['staff', ROLE_L.staff], ['manager', ROLE_L.manager]], u.role)) + `<div class="fld">${check('active', u.active, 'Can sign in')}</div>` : ''}${fld('New password (leave empty to keep)', inp('password', '', 'type="text" autocomplete="off"'))}${self ? fld('Current password', inp('current', '', 'type="password"')) : ''}`,
    foot: `${!self ? `<button class="btn" type="button" data-act="signOutUser" data-id="${u.id}">Sign out their devices</button>` : ''}<span class="spacer"></span><button class="btn primary" type="button" data-act="saveEditUser" data-id="${u.id}">Save</button>` });
};
A.saveEditUser = el => busy(el, async () => {
  const s = el.closest('.sheet'); const f = readForm(s); const u = usersCache.find(x => x.id === el.dataset.id);
  const body = {}; if (f.name && f.name !== u.name) body.name = f.name; if (f.role && f.role !== u.role) body.role = f.role; if (f.active != null && f.active !== u.active) body.active = f.active; if (f.password) { body.password = f.password; if (f.current != null) body.current = f.current; }
  if (!Object.keys(body).length) { closeSheet(); return; }
  try { const r = await api('PATCH', '/api/users/' + u.id, body); if (r.token) updateSessionToken(r); if (u.id === me().id && body.name) setSessionUser({ name: body.name }); usersCache = null; toast('Saved'); closeSheet(); go('settings'); }
  catch (e) { toast(e.message, 'bad'); }
});
A.signOutUser = el => busy(el, async () => { try { await api('PATCH', '/api/users/' + el.dataset.id, { signOutAll: true }); toast('Signed out from all their devices'); closeSheet(); } catch (e) { toast(e.message, 'bad'); } });

/* ---------------- my account ---------------- */
function accountTab() {
  const u = me();
  return `<section class="card"><div class="party-top">${av(u.name, 'lg')}<div class="grow"><h3>${esc(u.name)}</h3><p class="muted">${isDemo() ? 'Demo mode · data stays on this device' : esc(u.username || '') + ' · ' + esc(ROLE_L[u.role] || u.role)}</p></div></div>
    <div class="sync-box">${syncLine()}</div>
    <div class="set-acts">
    ${!isDemo() ? `<button class="btn" type="button" data-act="changePw">${ic('lock', 18)} Change password</button><button class="btn" type="button" data-act="syncNowBtn">${ic('sync', 18)} Sync now</button>` : `<button class="btn primary" type="button" data-act="startReal">${ic('shop', 18)} Create my shop account</button>`}
    <button class="btn" type="button" data-act="installApp" id="install-btn">${ic('install', 18)} Install app on this device</button>
    <button class="btn" type="button" data-act="theme">${ic('moon', 18)} Light / dark</button>
    <button class="btn danger" type="button" data-act="signOut">${ic('logout', 18)} ${isDemo() ? 'Exit demo' : 'Sign out'}</button></div></section>
    <section class="card"><h3>Shortcuts on computer</h3><ul class="keys"><li><kbd>Ctrl</kbd> + <kbd>K</kbd> or <kbd>/</kbd> Search anything</li><li><kbd>Alt</kbd> + <kbd>N</kbd> New bill</li><li><kbd>Alt</kbd> + <kbd>Q</kbd> New quotation</li><li><kbd>Alt</kbd> + <kbd>P</kbd> Receive payment</li><li><kbd>Esc</kbd> Close</li></ul></section>`;
}
export function syncLine() {
  if (isDemo()) return `<span class="sync-dot off"></span> Demo: nothing is sent to the internet`;
  if (!status.online) return `<span class="sync-dot off"></span> Offline. ${status.pending ? status.pending + ' change(s) saved on this device, will sync when online.' : 'All changes are saved.'}`;
  if (status.error === 'expired') return `<span class="sync-dot bad"></span> Session expired. Please sign in again.`;
  if (status.error) return `<span class="sync-dot bad"></span> Sync problem: ${esc(status.error)}`;
  if (status.syncing || status.pending) return `<span class="sync-dot busy"></span> Syncing ${status.pending ? status.pending + ' change(s)' : ''}…`;
  return `<span class="sync-dot ok"></span> All synced${status.lastSync ? ' · ' + new Date(status.lastSync).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}`;
}
A.syncNowBtn = () => { syncNow(); toast('Syncing…'); };
A.changePw = () => openSheet({ title: 'Change password', cls: 'narrow', body: `${fld('Current password', inp('current', '', 'type="password" autofocus autocomplete="current-password"'))}${fld('New password', inp('password', '', 'type="password" autocomplete="new-password"'), { hint: 'At least 6 characters. You will stay signed in here; other devices sign out.' })}`, foot: `<button class="btn primary block" type="button" data-act="savePw">Change password</button>` });
A.savePw = el => busy(el, async () => {
  const f = readForm(el.closest('.sheet'));
  try { const r = await api('PATCH', '/api/users/' + me().id, { password: f.password, current: f.current }); updateSessionToken(r); toast('Password changed'); closeSheet(); }
  catch (e) { toast(e.message, 'bad'); }
});
A.signOut = async () => {
  const pend = !isDemo() && status.pending;
  const ok = await confirmBox({ title: isDemo() ? 'Exit demo?' : 'Sign out?', text: pend ? `<b>${pend} change(s) are not synced yet.</b> Connect to the internet first or they will be lost.` : isDemo() ? 'Demo data stays on this device for next time.' : 'Data on this device will be removed. It stays safe on the server.', ok: isDemo() ? 'Exit demo' : 'Sign out', danger: !!pend });
  if (!ok) return;
  await logout(!isDemo()); usersCache = null; location.hash = ''; location.reload();
};

/* ---------------- data ---------------- */
function dataTab() {
  const counts = ['products', 'parties', 'invoices', 'quotes', 'payments', 'expenses', 'leads'].map(c => `<div><small>${c === 'parties' ? 'customers & suppliers' : c}</small><b>${list(c).length}</b></div>`).join('');
  const owner = role() === 'owner';
  return `<section class="card"><h3>Your data</h3><div class="strip">${counts}</div>
    <p class="muted" style="margin-top:12px">${isDemo() ? 'Demo data is saved only in this browser.' : 'Saved on this device and on the server. Every phone and computer you sign in on shows the same data.'}</p></section>
    ${owner ? `<section class="card"><h3>Backup</h3><p class="muted">Download a full backup file. Keep it on Google Drive or a pen drive every month.</p><div class="set-acts"><button class="btn primary" type="button" data-act="backup">${ic('download', 18)} Download backup</button><label class="btn">${ic('upload', 18)} Restore from backup<input type="file" accept=".json,application/json" data-ch="restore" hidden></label></div></section>` : ''}
    ${!isDemo() && role() !== 'staff' ? `<section class="card"><div class="card-h"><h3>Activity log</h3><button class="link" type="button" data-act="loadAudit">Load</button></div><div id="audit"><p class="muted">Who created, changed or cancelled what.</p></div></section>` : ''}
    ${isDemo() ? `<section class="card"><h3>Demo data</h3><div class="set-acts"><button class="btn" type="button" data-act="resetDemo">${ic('sync', 18)} Reset demo data</button><button class="btn" type="button" data-act="emptyDemo">${ic('trash', 18)} Start empty (try with your own items)</button></div></section>` : ''}`;
}
A.backup = () => { const d = exportAll(); download(`TileDesk-backup-${(settings().shopName || 'shop').replace(/\W+/g, '-')}-${today()}.json`, JSON.stringify(d), 'application/json'); toast('Backup downloaded'); };
CH.restore = async el => {
  const f = el.files[0]; if (!f) return; el.value = '';
  let obj; try { obj = JSON.parse(await f.text()); } catch { toast('This file is not a backup', 'bad'); return; }
  if (!obj || obj.app !== 'TileDesk') { toast('This file is not a TileDesk backup', 'bad'); return; }
  const n = Object.values(obj.data || {}).reduce((a, x) => a + (x || []).length, 0);
  const replace = await confirmBox({ title: 'Restore backup?', text: `Backup of <b>${esc(obj.shop || '')}</b> from ${esc((obj.exportedAt || '').slice(0, 10))} with ${n} records.<br><br><b>Replace</b> removes anything not in the backup. <b>Merge</b> only adds and updates.`, ok: 'Replace all', cancel: 'Merge' });
  try { const c = await importAll(obj, { replace }); toast(c + ' records restored'); go('home'); } catch (e) { toast(e.message, 'bad'); }
};
A.loadAudit = el => busy(el, async () => {
  try {
    const r = await api('GET', '/api/audit');
    const L = { invoices: 'bill', quotes: 'quotation', payments: 'payment', expenses: 'expense', products: 'design', parties: 'customer/supplier', leads: 'lead', purchases: 'purchase', returns: 'return', adjustments: 'stock change', lots: 'batch', settings: 'settings' };
    document.getElementById('audit').innerHTML = r.items.length ? `<div class="timeline">${r.items.map(i => `<div class="tl"><b>${esc(i.user_name)} ${esc(i.action === 'save' ? 'saved' : i.action + 'd')} ${esc(L[i.coll] || i.coll)} ${esc(i.label || '')}</b><small class="muted">${fdt(i.at)}</small></div>`).join('')}</div>` : '<p class="muted">Nothing yet.</p>';
  } catch (e) { toast(e.message, 'bad'); }
});
A.resetDemo = async () => { if (!(await confirmBox({ title: 'Reset demo?', text: 'All demo changes will be replaced with fresh sample data.', ok: 'Reset' }))) return; await wipeDemo(); const { loadDemo } = await import('./app.js'); await loadDemo(); toast('Fresh demo data loaded'); go('home'); };
A.emptyDemo = async () => { if (!(await confirmBox({ title: 'Start with empty data?', text: 'Sample data is removed. Add a few of your own designs and make a bill to see how it works.', ok: 'Start empty' }))) return; await wipeDemo(); await put('settings', { id: 'shop', shopName: 'My Tile Shop', owner: 'Owner', defaultTaxMode: 'excl', wastage: 10 }); toast('Empty. Start by adding designs in Stock.'); go('stock'); };
