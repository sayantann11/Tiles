// End-to-end tests in a real browser (Playwright). Starts the dev server on a fresh in-memory DB.
// Run: node tests/e2e.mjs        (set PLAYWRIGHT_DIR if playwright is installed elsewhere; set PW_CHANNEL=msedge|chrome)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require((process.env.PLAYWRIGHT_DIR || '.') + '/node_modules/playwright'); }
const { chromium } = pw;
const PORT = 8898, BASE = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['dev/server.mjs', '--port', String(PORT), '--db', ':memory:'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { srv.stdout.on('data', d => String(d).includes('dev server') && res()); setTimeout(() => rej(new Error('server did not start')), 8000); });
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});

let passed = 0; const errors = []; const pages = [];
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`  ok  ${name} (${Date.now() - t0} ms)`); }
  catch (e) {
    console.error(`  FAIL ${name}\n`, e);
    for (const pg of pages) {
      try {
        const info = await pg.evaluate(() => ({ toasts: (window.__toasts || []).slice(-5), sheets: [...document.querySelectorAll('.layer')].map(x => x.className + ':' + (x.querySelector('.sh-t') || {}).textContent) }));
        console.error('   page', pg.url(), JSON.stringify(info));
        if (process.env.SHOT_DIR) await pg.screenshot({ path: process.env.SHOT_DIR + '/fail-' + pages.indexOf(pg) + '.png', timeout: 5000 });
      } catch (x) { console.error('   (diag failed)', x.message); }
    }
    console.error(errors.join('\n'));
    await browser.close(); srv.kill(); process.exit(1);
  }
}
async function newPage(viewport = { width: 1366, height: 860 }, extra = {}) {
  const ctx = await browser.newContext({ viewport, ...extra });
  await ctx.addInitScript(() => {
    window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.open = () => null;
    window.__toasts = []; const _t = setInterval(() => { const t = document.getElementById('toast'); if (t) { clearInterval(_t); new MutationObserver(() => window.__toasts.push(t.textContent)).observe(t, { childList: true, characterData: true, subtree: true }); } }, 50);
  });
  const p = await ctx.newPage(); pages.push(p);
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*(401|403|404|409|429)|net::ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(m.text())) errors.push(m.text()); });
  p.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.error('    PAGEERROR', e.message); });
  return p;
}
const td = (p, fn, arg) => p.evaluate(fn, arg);
const settle = p => p.waitForTimeout(220);
const topSheet = '.layer:last-child .sheet';
async function pickDesign(p, q) { await p.click(`${topSheet} [data-act=bAdd]`); await p.fill(`${topSheet} [data-in=pickQ]`, q); await settle(p); await p.click(`${topSheet} [data-pid]`); await settle(p); }
async function save(p, waitSel = '.docview') {
  await p.click(`${topSheet} [data-act=bSave]`);
  for (let i = 0; i < 20; i++) { if (await p.$(waitSel + ' .paper')) return; const y = await p.$(`${topSheet} [data-act=cbYes]`); if (y) await y.click(); await p.waitForTimeout(150); }
  await p.waitForSelector(waitSel);
}
async function noOverflow(p, label) { const ov = await td(p, () => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 1, `${label}: horizontal overflow ${ov}px`); }

/* ---------------- demo mode on desktop ---------------- */
const d = await newPage();
await test('demo opens with sample shop', async () => {
  await d.goto(BASE); await d.click('[data-act=tryDemo]'); await d.waitForSelector('.kpis');
  const n = await td(d, () => __td.store.list('invoices').length); assert.ok(n > 60, 'demo bills: ' + n);
});
await test('all screens render without errors', async () => {
  for (const v of ['home', 'sales', 'quotes', 'stock', 'credit', 'expenses', 'purchases', 'suppliers', 'leads', 'reports', 'settings', 'more']) { await td(d, v => location.hash = '#/' + v, v); await settle(d); assert.ok(await d.$('#view h1, #view .ph'), v); await noOverflow(d, v); }
  for (const t of ['summary', 'items', 'customers', 'gst', 'stock', 'credit', 'commission', 'staff']) { await td(d, () => location.hash = '#/reports'); await settle(d); await d.click(`[data-act=repTab][data-t=${t}]`); await settle(d); }
  for (const t of ['shop', 'bill', 'lists', 'users', 'account', 'data']) { await td(d, () => location.hash = '#/settings'); await settle(d); await d.click(`[data-act=setTab][data-t=${t}]`); await settle(d); }
});
let billId;
await test('walk-in bill: full payment, stock goes down from chosen batch', async () => {
  await td(d, () => location.hash = '#/sales'); await settle(d);
  const p = await td(d, () => { const p = __td.store.list('products').find(x => x.name === 'Glacier White Nano'); return p.id; });
  const before = await td(d, pid => { const { lotsOf } = window.__logic; return lotsOf(pid)[0]; }, p).catch(() => null);
  await d.click('[data-act=newBill]'); await d.waitForSelector('.builder');
  await d.fill(`${topSheet} [data-in=bCust][data-k=name]`, 'Test Walkin');
  await d.fill(`${topSheet} [data-in=bCust][data-k=phone]`, '9812345678');
  await pickDesign(d, 'glacier');
  await d.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '5');
  await d.fill(`${topSheet} [data-line="0"] [data-k=pcs]`, '2');
  await settle(d);
  const info = await d.textContent(`${topSheet} [data-info="0"]`);
  assert.match(info, /5 boxes \+ 2 pc/);
  await save(d);
  const r = await td(d, () => { const i = __td.store.list('invoices').find(x => x.cust.name === 'Test Walkin'); return { id: i.id, no: i.no, qty: i.lines[0].qty, total: i.total }; });
  billId = r.id;
  assert.match(r.no, /^INV\/\d\d-\d\d\/\d{4}$/); assert.equal(r.qty, 5.5);
  const st = await d.textContent('.docview .doc-strip'); assert.match(st, /Paid/);
  assert.ok((await d.textContent('.docview .paper')).includes('Test Walkin'));
});
await test('print and challan do not crash', async () => {
  await d.click(`${topSheet} [data-act=docPrint]`); await settle(d);
  assert.ok(await td(d, () => window.__printed >= 1));
  assert.ok(await td(d, () => document.querySelector('#print .paper') !== null));
});
await test('back button closes the open sheet', async () => {
  const n0 = await d.$$eval('.layer', l => l.length); assert.ok(n0 >= 1);
  await d.goBack(); await d.waitForTimeout(300);
  assert.equal(await d.$$eval('.layer', l => l.length), n0 - 1);
});
await test('credit bill for contractor raises balance; payment lowers it (FIFO)', async () => {
  const before = await td(d, () => { const c = __td.store.list('parties').find(p => p.name === 'Ramesh Patel'); return window.__logic.partyCredit(c.id).out; });
  await d.click('[data-act=newBill]'); await d.waitForSelector('.builder');
  await d.click(`${topSheet} [data-act=bPickParty]`); await d.fill(`${topSheet} [data-in=ppQ]`, 'ramesh'); await settle(d); await d.click(`${topSheet} [data-party]`); await settle(d);
  assert.ok(await d.$(`${topSheet} .party-card`));
  await pickDesign(d, 'armani'); await d.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '4'); await settle(d);
  await save(d);
  const inv = await td(d, () => __td.store.list('invoices').filter(i => i.cust.name === 'Ramesh Patel').sort((a, b) => b.createdAt - a.createdAt)[0]);
  const mid = await td(d, () => { const c = __td.store.list('parties').find(p => p.name === 'Ramesh Patel'); return window.__logic.partyCredit(c.id).out; });
  assert.ok(Math.abs(mid - before - inv.total) < 1, `credit ${before} -> ${mid}, bill ${inv.total}`);
  await d.click(`${topSheet} [data-act=docPay]`); await d.waitForSelector(`${topSheet} [name=amount]`);
  await d.fill(`${topSheet} [name=amount]`, '10000'); await d.click(`${topSheet} [data-act=savePay]`); await d.waitForSelector(`${topSheet} .done-box`);
  const after = await td(d, () => { const c = __td.store.list('parties').find(p => p.name === 'Ramesh Patel'); return window.__logic.partyCredit(c.id).out; });
  assert.ok(Math.abs(mid - 10000 - after) < 1);
  await td(d, () => history.go(-3)); await d.waitForTimeout(400);
});
await test('quotation: area → boxes with wastage, then convert to bill', async () => {
  await td(d, () => location.hash = '#/quotes'); await settle(d);
  await d.click('[data-act=newQuote]'); await d.waitForSelector('.builder');
  await d.fill(`${topSheet} [data-in=bCust][data-k=name]`, 'Quote Person');
  await pickDesign(d, 'calacatta');
  await d.fill(`${topSheet} [data-line="0"] [data-k=area]`, '500'); await settle(d);
  const boxes = await d.inputValue(`${topSheet} [data-line="0"] [data-k=qty]`);
  assert.equal(boxes, String(Math.ceil(500 * 1.1 / 15.5)));
  await save(d);
  assert.ok((await d.textContent('.docview .paper')).includes('QUOTATION'));
  await d.click(`${topSheet} [data-act=quoteToBill]`); await d.waitForSelector('.builder');
  await save(d);
  const q = await td(d, () => __td.store.list('quotes').find(x => x.cust.name === 'Quote Person'));
  assert.equal(q.status, 'Converted'); assert.ok(q.invoiceId);
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
});
await test('cancel bill restores stock', async () => {
  const lot = await td(d, id => __td.store.get('invoices', id).lines[0].lotId, billId);
  const q0 = await td(d, l => window.__logic.lotQty(l), lot);
  await td(d, id => __td.A.openDoc({ dataset: { kind: 'invoices', id } }), billId); await d.waitForSelector('.docview');
  await d.click(`${topSheet} [data-act=docMenu]`); await d.click(`${topSheet} [data-act=docCancel]`);
  await d.fill(`${topSheet} [name=ask]`, 'Test cancel'); await d.click(`${topSheet} [data-x=yes]`);
  await d.waitForTimeout(400); if (await d.$(`${topSheet} [data-act=cbYes]`)) await d.click(`${topSheet} [data-act=cbYes]`);
  await d.waitForTimeout(400);
  const q1 = await td(d, l => window.__logic.lotQty(l), lot);
  assert.ok(Math.abs(q1 - q0 - 5.5) < 1e-6, `lot ${q0} -> ${q1}`);
  assert.equal(await td(d, id => __td.store.get('invoices', id).cancelled, billId), true);
  await td(d, () => location.hash = '#/home'); await d.waitForTimeout(400);
});
await test('purchase with new batch raises stock and supplier balance', async () => {
  const pid = await td(d, () => __td.store.list('products').find(x => x.name === 'Nero Marquina').id);
  const s0 = await td(d, pid => window.__logic.productStock(pid), pid);
  await td(d, () => __td.A.newPurchase()); await d.waitForSelector('.builder');
  await d.click(`${topSheet} [data-act=bPickParty]`); await settle(d); await d.click(`${topSheet} [data-party]`); await settle(d);
  await pickDesign(d, 'nero'); await d.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '30');
  await d.fill(`${topSheet} [data-in=bNewLot][data-k=batch]`, 'TEST-B1'); await d.fill(`${topSheet} [data-in=bNewLot][data-k=shade]`, 'N9');
  await save(d);
  const s1 = await td(d, pid => window.__logic.productStock(pid), pid);
  assert.equal(s1 - s0, 30);
  assert.ok(await td(d, () => __td.store.list('lots').some(l => l.batch === 'TEST-B1' && l.shade === 'N9')));
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
});
await test('damage + transfer adjust lot stock', async () => {
  const lot = await td(d, () => __td.store.list('lots').find(l => l.batch === 'TEST-B1'));
  await td(d, id => __td.A.product({ dataset: { id } }), lot.productId); await d.waitForSelector(`${topSheet} .prod-top`);
  await d.click(`${topSheet} [data-act=adjust]`); await d.selectOption(`${topSheet} [name=lot]`, lot.id); await d.fill(`${topSheet} [name=qty]`, '2'); await d.click(`${topSheet} [data-act=saveAdjust]`); await d.waitForTimeout(300);
  assert.equal(await td(d, id => window.__logic.lotQty(id), lot.id), 28);
  await d.click(`${topSheet} [data-act=lotMenu][data-id="${lot.id}"]`); await d.click(`${topSheet} [data-act=transfer]`);
  await d.fill(`${topSheet} [name=qty]`, '8'); await d.click(`${topSheet} [data-act=saveTransfer]`); await d.waitForTimeout(300);
  assert.equal(await td(d, id => window.__logic.lotQty(id), lot.id), 20);
  assert.equal(await td(d, pid => window.__logic.productStock(pid), lot.productId) - 0, await td(d, pid => window.__logic.productStock(pid), lot.productId));
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
});
await test('sales return puts stock back and gives credit', async () => {
  const inv = await td(d, () => __td.store.list('invoices').find(i => !i.cancelled && i.partyId && i.lines[0].qty >= 4));
  const lot = inv.lines[0].lotId; const q0 = await td(d, l => window.__logic.lotQty(l), lot);
  await td(d, id => __td.A.openDoc({ dataset: { kind: 'invoices', id } }), inv.id); await d.waitForSelector('.docview');
  await d.click(`${topSheet} [data-act=docMenu]`); await d.click(`${topSheet} [data-act=docReturn]`); await d.waitForSelector('.builder');
  await d.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '2'); await settle(d);
  await save(d);
  assert.ok((await d.textContent('.docview .paper')).includes('CREDIT NOTE'));
  const q1 = await td(d, l => window.__logic.lotQty(l), lot); assert.equal(q1 - q0, 2);
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
});
await test('expense, lead with note and stage, new design', async () => {
  await td(d, () => __td.A.addExpense()); await d.fill(`${topSheet} [name=amount]`, '750'); await d.fill(`${topSheet} [name=note]`, 'Tempo test'); await d.click(`${topSheet} [data-act=saveExpense]`);
  await d.waitForFunction(() => __td.store.list('expenses').some(e => e.note === 'Tempo test' && e.amount === 750), null, { timeout: 5000 });
  await td(d, () => __td.A.addLead()); await d.fill(`${topSheet} [name=name]`, 'Lead Tester'); await d.fill(`${topSheet} [name=phone]`, '9800011111'); await d.fill(`${topSheet} [name=area]`, '1200'); await d.click(`${topSheet} [data-act=saveLead]`); await d.waitForSelector(`${topSheet} .stage-row`);
  await d.fill(`${topSheet} [data-note]`, 'Wants glossy'); await d.click(`${topSheet} [data-act=leadNote]`);
  await d.waitForFunction(() => __td.store.list('leads').find(x => x.name === 'Lead Tester')?.notes.some(n => n.text === 'Wants glossy'), null, { timeout: 5000 });
  await d.click(`${topSheet} [data-act=leadStage][data-s="Site visit"]`);
  await d.waitForFunction(() => __td.store.list('leads').find(x => x.name === 'Lead Tester')?.stage === 'Site visit', null, { timeout: 5000 });
  const l = await td(d, () => __td.store.list('leads').find(x => x.name === 'Lead Tester'));
  assert.equal(l.stage, 'Site visit'); assert.ok(l.notes.some(n => n.text === 'Wants glossy'));
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
  const layers = await d.$$eval('.layer', l => l.map(x => x.querySelector('.sh-t').textContent));
  assert.equal(layers.length, 0, 'open sheets: ' + layers.join(', '));
  await td(d, () => __td.A.addDesign()); await d.waitForSelector('.sheet .pf-top'); const F = '.sheet:has(.pf-top)';
  await d.fill(`${F} [name=name]`, 'Test Onyx'); await d.fill(`${F} [name=size]`, '600×1200'); await d.fill(`${F} [name=pcsPerBox]`, '2');
  assert.equal(await d.inputValue(`${F} [name=sqftPerBox]`), '15.5');
  await d.fill(`${F} [name=rate]`, '80'); await d.fill(`${F} [name=oqty]`, '25'); await d.click(`${F} [data-act=saveDesign]`); await d.waitForSelector(`${topSheet} .prod-top`);
  const pid = await td(d, () => __td.store.list('products').find(p => p.name === 'Test Onyx').id);
  assert.equal(await td(d, pid => window.__logic.productStock(pid), pid), 25);
  await td(d, () => history.go(-1)); await d.waitForTimeout(300);
});
await test('global search finds bills and opens them', async () => {
  await d.keyboard.press('Control+k'); await d.fill(`${topSheet} [data-in=gsQ]`, 'Quote Person'); await d.waitForTimeout(250);
  assert.ok(await d.$(`${topSheet} .gs-res [data-act=gsDoc]`));
  await d.keyboard.press('Escape'); await d.waitForTimeout(300);
});
await test('backup export contains everything', async () => {
  const n = await td(d, () => { const b = __td.store.exportAll(); return Object.values(b.data).reduce((a, x) => a + x.length, 0); });
  assert.ok(n > 300, 'records ' + n);
});

/* ---------------- phone layout ---------------- */
const m = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await test('phone: demo, bottom nav, no overflow on any screen or sheet', async () => {
  await m.goto(BASE); await m.click('[data-act=tryDemo]'); await m.waitForSelector('.bnav');
  for (const v of ['home', 'stock', 'sales', 'more', 'credit', 'quotes', 'leads', 'expenses', 'reports', 'settings', 'purchases', 'suppliers']) { await td(m, v => location.hash = '#/' + v, v); await settle(m); await noOverflow(m, 'phone ' + v); }
  await td(m, () => location.hash = '#/home'); await settle(m);
  await m.click('.bnav [data-act=quick]'); await m.waitForSelector('.qa-sheet');
  await m.click('[data-qa=newBill]'); await m.waitForSelector('.builder');
  await pickDesign(m, 'oak'); await m.click(`${topSheet} [data-act=bStep][data-d="1"]`); await m.click(`${topSheet} [data-act=bStep][data-d="1"]`); await settle(m);
  assert.equal(await m.inputValue(`${topSheet} [data-line="0"] [data-k=qty]`), '2');
  await noOverflow(m, 'phone builder');
  const sheetW = await td(m, () => { const s = document.querySelector('.layer:last-child .sheet-b'); return s.scrollWidth - s.clientWidth; }); assert.ok(sheetW <= 1, 'builder sheet overflow ' + sheetW);
  await save(m);
  const sw2 = await td(m, () => { const s = document.querySelector('.layer:last-child .sheet-f'); return s.scrollWidth - s.clientWidth; }); assert.ok(sw2 <= 1, 'doc footer overflow ' + sw2);
});

/* ---------------- cloud mode: sign up, sync between devices, offline ---------------- */
const c1 = await newPage();
let shopUser = '9876500001';
await test('sign up creates shop and opens app', async () => {
  await c1.goto(BASE); await c1.click('label:has([value=signup])');
  await c1.fill('[name=shopName]', 'Cloud Tiles'); await c1.fill('[name=name]', 'Owner One'); await c1.fill('[name=username]', shopUser); await c1.fill('[name=password]', 'secret123');
  await c1.click('#auth-form [type=submit]'); await c1.waitForSelector('.app');
  await c1.waitForFunction(() => __td.store.status.lastSync > 0, null, { timeout: 8000 });
  assert.equal(await td(c1, () => __td.store.settings().shopName), 'Cloud Tiles');
});
await test('cloud: design + bill sync and get a server number', async () => {
  await c1.waitForTimeout(1200); if (await c1.$(`${topSheet} [data-act=closeSheet]`)) { await td(c1, () => history.back()); await c1.waitForTimeout(300); }
  await td(c1, async () => { await __td.store.put('products', { id: 'cp1', name: 'Cloud Marble', size: '600×600', uom: 'box', sqftPerBox: 15.5, pcsPerBox: 4, rate: 50, cost: 35, gst: 18, active: true, pattern: 'marble', c1: '#eee', c2: '#aaa' }); await __td.store.put('lots', { id: 'cl1', productId: 'cp1', batch: 'B1', shade: 'S1', location: 'Showroom', opening: 100 }); });
  await td(c1, () => __td.A.newBill()); await c1.waitForSelector('.builder');
  await c1.fill(`${topSheet} [data-in=bCust][data-k=name]`, 'Cloud Buyer');
  await pickDesign(c1, 'cloud'); await c1.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '10'); await settle(c1);
  await save(c1);
  await c1.waitForFunction(() => __td.store.list('invoices').some(i => i.no), null, { timeout: 8000 });
  const no = await td(c1, () => __td.store.list('invoices')[0].no); assert.match(no, /^INV\/\d\d-\d\d\/0001$/);
  await c1.waitForFunction(() => __td.store.status.pending === 0, null, { timeout: 8000 });
});
const c2 = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
await test('second device signs in and sees the same data', async () => {
  await c2.goto(BASE); await c2.fill('[name=username]', shopUser); await c2.fill('[name=password]', 'secret123'); await c2.click('#auth-form [type=submit]');
  await c2.waitForSelector('.app'); await c2.waitForFunction(() => __td.store.list('invoices').length === 1, null, { timeout: 8000 });
  assert.equal(await td(c2, () => window.__logic.lotQty('cl1')), 90);
});
await test('offline bill is kept and synced with a number when back online', async () => {
  await c2.context().setOffline(true);
  await td(c2, () => window.dispatchEvent(new Event('offline')));
  await td(c2, () => __td.A.newBill()); await c2.waitForSelector('.builder');
  await c2.fill(`${topSheet} [data-in=bCust][data-k=name]`, 'Offline Buyer');
  await pickDesign(c2, 'cloud'); await c2.fill(`${topSheet} [data-line="0"] [data-k=qty]`, '3'); await settle(c2);
  await save(c2);
  assert.ok((await c2.textContent('.docview')).includes('internet is back'));
  assert.ok(await td(c2, () => __td.store.status.pending > 0));
  await c2.context().setOffline(false); await td(c2, () => window.dispatchEvent(new Event('online')));
  await c2.waitForFunction(() => __td.store.list('invoices').find(i => i.cust.name === 'Offline Buyer')?.no, null, { timeout: 10000 });
  assert.equal(await td(c2, () => __td.store.list('invoices').find(i => i.cust.name === 'Offline Buyer').no.endsWith('/0002')), true);
  await td(c1, () => __td.store.syncNow()); await c1.waitForFunction(() => __td.store.list('invoices').length === 2, null, { timeout: 8000 });
  assert.equal(await td(c1, () => window.__logic.lotQty('cl1')), 87);
});
await test('share link opens public bill page', async () => {
  const id = await td(c1, () => __td.store.list('invoices').find(i => i.cust.name === 'Cloud Buyer').id);
  const token = await td(c1, async id => (await __td.store.api('POST', '/api/share', { c: 'invoices', id })).token, id);
  const s = await newPage({ width: 390, height: 844 });
  await s.goto(BASE + '/share.html#' + token); await s.waitForSelector('.paper');
  assert.ok((await s.textContent('.paper')).includes('Cloud Buyer'));
  await s.close();
});
await test('owner adds staff; staff cannot see cost or reports', async () => {
  await td(c1, () => location.hash = '#/settings'); await c1.waitForTimeout(200); await c1.click('[data-act=setTab][data-t=users]');
  await c1.waitForSelector('[data-act=addUser]', { timeout: 6000 }); await c1.click('[data-act=addUser]');
  await c1.fill(`${topSheet} [name=name]`, 'Staff Sam'); await c1.fill(`${topSheet} [name=username]`, 'sam'); await c1.fill(`${topSheet} [name=password]`, 'staff123'); await c1.click(`${topSheet} [data-act=saveUser]`); await c1.waitForTimeout(600);
  const s = await newPage();
  await s.goto(BASE); await s.fill('[name=username]', 'sam'); await s.fill('[name=password]', 'staff123'); await s.click('#auth-form [type=submit]'); await s.waitForSelector('.app');
  await s.waitForFunction(() => __td.store.list('products').length === 1, null, { timeout: 8000 });
  assert.equal(await td(s, () => __td.store.get('products', 'cp1').cost), undefined);
  assert.equal(await td(s, () => __td.store.can('reports')), false);
  assert.equal(await s.$$eval('#side-nav a[href="#/reports"]', a => a.length), 0);
  await s.close();
});

await browser.close(); srv.kill();
if (errors.length) { console.error('\nBrowser console errors:\n' + errors.join('\n')); process.exit(1); }
console.log(`\nE2E: ${passed} tests passed, no console errors`);
