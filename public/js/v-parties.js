// Customers, credit (udhaar) with ageing, suppliers, ledgers, payments in/out, reminders.
import { $, esc, ic, num, inr, inrS, fmt2, fdate, fdateY, today, daysSince, matches, sum, uid, phone10, waLink, telLink, rel, STATES } from './core.js';
import { A, IN, CH, openSheet, setSheet, closeSheet, closeAll, toast, confirmBox, busy, empty, pill, readForm, invalid, fld, inp, sel } from './ui.js';
import { list, get, put, del, settings, can, isDemo } from './store.js';
import { partyCredit, ledger, creditSummary, payables, customers, suppliers, cfg, activeInvoices, invoicePaid, invStatus } from './logic.js';
import { view, go, state, av, pickParty, payModeSel, moreBtn, kpi } from './parts.js';
import { receiptPaper, printHtml } from './docs.js';
import { showDoc, invRow } from './v-docs.js';

const AGE_C = ['var(--good)', 'var(--warn)', 'var(--clay)', 'var(--bad)'];
const AGE_L = ['0–30 days', '31–60 days', '61–90 days', '90+ days'];

function reminderText(p, x) {
  const s = settings();
  return `Namaste ${p.name} ji,\nThis is a gentle reminder from *${s.shopName || 'our shop'}*.\nYour pending balance is *${inr(x.out)}*${x.oldest > 30 ? ` (oldest bill ${x.oldest} days)` : ''}.\n${s.upi ? `\nPay by UPI: ${s.upi}` : ''}${s.bank && s.bank.acc ? `\nBank: ${s.bank.name || ''} A/c ${s.bank.acc} IFSC ${s.bank.ifsc || ''}` : ''}\n\nPlease ignore if already paid. Thank you!`;
}

view('credit', {
  title: 'Customers & credit', icon: 'credit',
  render() {
    const st = state.credit || (state.credit = { q: '', f: 'Has balance', sort: 'due', n: 80 });
    const cs = creditSummary();
    const F = { 'Has balance': r => r.x.out > 0.5, 'Over 60 days': r => r.x.b[2] + r.x.b[3] > 0.5, 'Over limit': r => num(r.c.limit) && r.x.out > num(r.c.limit), All: () => true, Advance: r => r.x.advance > 0 };
    let rows = cs.rows.filter(F[st.f]).filter(r => matches(st.q, r.c.name, r.c.phone, r.c.kind, r.c.address));
    rows = rows.sort(st.sort === 'old' ? (a, b) => b.x.oldest - a.x.oldest : st.sort === 'name' ? (a, b) => a.c.name.localeCompare(b.c.name) : (a, b) => b.x.out - a.x.out);
    const total = Math.max(1, sum(cs.b));
    const collected = sum(list('payments').filter(p => p.dir !== 'out' && p.partyId && p.date.slice(0, 7) === today().slice(0, 7) && get('parties', p.partyId)?.type !== 'supplier'), p => num(p.amount));
    return `<div class="ph"><div><h1>Customers & credit</h1><p>Who owes what, and since when. Oldest bills are settled first when money comes in.</p></div>
      <div class="ph-act"><button class="btn" type="button" data-act="newParty" data-type="customer">${ic('plus', 18)} Customer</button><button class="btn primary" type="button" data-act="receivePay">${ic('cash', 18)} Receive payment</button></div></div>
      <div class="kpis">${kpi('To collect', inr(cs.total), cs.parties + ' customers' + (cs.walkDue ? ' + walk-in ' + inrS(cs.walkDue) : ''), { cls: 'hero' })}${kpi('Over 60 days', inr(cs.b[2] + cs.b[3]), cs.odParties + ' customers', { cls: cs.b[2] + cs.b[3] ? 'warn' : '' })}${kpi('Over credit limit', String(cs.overLimit), 'customers')}${kpi('Collected this month', inr(collected), 'from credit customers')}</div>
      <section class="card"><div class="card-h"><h3>Credit ageing</h3><span class="muted">${inr(sum(cs.b))}</span></div>
        <div class="age">${cs.b.map((v, i) => v > 0 ? `<i style="width:${v / total * 100}%;background:${AGE_C[i]}" title="${AGE_L[i]}: ${inr(v)}"></i>` : '').join('')}</div>
        <div class="age-l">${cs.b.map((v, i) => `<div><small><span class="dot" style="background:${AGE_C[i]}"></span>${AGE_L[i]}</small><b>${inr(v)}</b></div>`).join('')}</div></section>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-credit" placeholder="Search customer name, phone, area" value="${esc(st.q)}" data-in="listQ" data-v="credit" enterkeyhint="search"></div>
        <select class="sel-sm" data-ch="creditSort" aria-label="Sort"><option value="due" ${st.sort === 'due' ? 'selected' : ''}>Highest due</option><option value="old" ${st.sort === 'old' ? 'selected' : ''}>Oldest due</option><option value="name" ${st.sort === 'name' ? 'selected' : ''}>Name</option></select></div>
      <div class="chips">${Object.keys(F).map(k => `<button class="chip ${st.f === k ? 'on' : ''}" type="button" data-act="listF" data-v="credit" data-f="${k}">${k} <em>${cs.rows.filter(F[k]).length}</em></button>`).join('')}</div>
      <section class="card flush">${rows.length ? `<div class="rows">${rows.slice(0, st.n).map(({ c, x }) => {
        const lim = num(c.limit); const util = lim ? Math.min(100, x.out / lim * 100) : 0;
        return `<div class="row" data-act="party" data-id="${c.id}">${av(c.name)}<div class="grow"><b class="t">${esc(c.name)}</b><small class="muted t">${esc(c.kind || '')}${x.out > 0.5 ? ` · oldest ${x.oldest} days` : ''}${x.last ? ' · paid ' + rel(x.last.date).toLowerCase() : ''}</small></div>
        ${lim ? `<div class="util hide-s"><span class="bar ${util >= 100 ? 'out' : util > 80 ? 'low' : ''}"><i style="width:${util}%"></i></span><small>${Math.round(util)}% of ${inrS(lim)}</small></div>` : ''}
        <div class="r-end"><span class="amt ${x.out > 0.5 ? (x.oldest > 60 ? 'bad-t' : '') : 'muted'}">${x.out > 0.5 ? inr(x.out) : x.advance ? 'Adv ' + inr(x.advance) : 'Clear'}</span>${x.out > 0.5 ? `<span>${pill(x.oldest > 90 ? '90+ days' : x.oldest > 60 ? '60+ days' : x.oldest > 30 ? '30+ days' : 'Current', x.oldest > 90 ? 'bad' : x.oldest > 60 ? 'clay' : x.oldest > 30 ? 'warn' : 'good')}</span>` : ''}</div>
        ${x.out > 0.5 && c.phone ? `<div class="row-acts"><a class="icon-btn wa" href="${waLink(c.phone, reminderText(c, x))}" target="_blank" rel="noopener" aria-label="Send WhatsApp reminder" data-stop>${ic('wa', 18)}</a></div>` : ''}</div>`;
      }).join('')}</div>${moreBtn(st.n, rows.length, 'moreCredit')}` : empty('Nobody here', st.f === 'Has balance' ? 'No customer owes money right now.' : 'Try another filter.')}</section>
      ${cs.walk.length && st.f === 'Has balance' ? `<section class="card flush"><div class="card-h" style="padding-top:12px"><h3>Walk-in bills with balance</h3><span class="muted">${inr(cs.walkDue)}</span></div><div class="rows">${cs.walk.slice(0, 20).map(w => invRow(w.i)).join('')}</div></section>` : ''}`;
  }
});
CH.creditSort = el => { state.credit.sort = el.value; go('credit'); };

view('suppliers', {
  title: 'Suppliers', icon: 'truck',
  render() {
    const st = state.suppliers || (state.suppliers = { q: '' });
    const pay = payables();
    const rows = pay.rows.filter(r => matches(st.q, r.s.name, r.s.phone, r.s.address)).sort((a, b) => b.x.out - a.x.out);
    return `<div class="ph"><div><h1>Suppliers</h1><p>${can('viewCost') ? 'You owe suppliers ' + inr(pay.total) + ' in total.' : 'Companies you buy stock from.'}</p></div><div class="ph-act"><button class="btn" type="button" data-act="newParty" data-type="supplier">${ic('plus', 18)} Supplier</button>${can('purchases') ? `<button class="btn primary" type="button" data-act="paySupplier">${ic('cash', 18)} Pay supplier</button>` : ''}</div></div>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-suppliers" placeholder="Search supplier" value="${esc(st.q)}" data-in="listQ" data-v="suppliers" enterkeyhint="search"></div></div>
      <section class="card flush">${rows.length ? `<div class="rows">${rows.map(({ s, x }) => `<div class="row" data-act="party" data-id="${s.id}">${av(s.name, 'acc')}<div class="grow"><b class="t">${esc(s.name)}</b><small class="muted t">${esc([s.address, s.phone, s.gstin].filter(Boolean).join(' · '))}</small></div>${can('viewCost') ? `<div class="r-end"><span class="amt">${x.out > 0.5 ? inr(x.out) : 'Clear'}</span><small class="muted">${x.out > 0.5 ? 'to pay' : ''}</small></div>` : ''}</div>`).join('')}</div>` : empty('No suppliers yet', 'Add the companies you buy tiles from.')}</section>`;
  }
});

/* ---------------- party detail + ledger ---------------- */
function partyBody(id) {
  const p = get('parties', id); if (!p) return { body: empty('Not found'), foot: '' };
  const sup = p.type === 'supplier';
  const x = partyCredit(id);
  const es = ledger(id);
  let bal = 0; const rows = es.map(e => { bal += e.amt; return { ...e, bal }; }).reverse();
  const inv = sup ? [] : activeInvoices().filter(i => i.partyId === id);
  const lifetime = sum(inv, i => num(i.total));
  const showMoney = !sup || can('viewCost');
  const lim = num(p.limit);
  const body = `<div class="party-top">${av(p.name, sup ? 'acc lg' : 'lg')}<div class="grow"><h3>${esc(p.name)}</h3><p class="muted">${esc([p.kind, p.phone, p.address].filter(Boolean).join(' · '))}</p>${p.gstin ? `<p class="muted">GSTIN ${esc(p.gstin)}</p>` : ''}</div></div>
    ${showMoney ? `<div class="doc-strip"><div><small>${sup ? 'We owe' : 'Balance due'}</small><b class="${x.out > 0.5 && !sup ? 'bad-t' : ''}">${x.out > 0.5 ? inr(x.out) : x.advance ? 'Advance ' + inr(x.advance) : 'Nil'}</b></div>
      ${!sup ? `<div><small>Credit limit</small><b>${lim ? inr(lim) : 'None'}</b></div><div><small>Oldest due</small><b>${x.out > 0.5 ? x.oldest + ' days' : '—'}</b></div><div><small>Total business</small><b>${inrS(lifetime)}</b></div>` : `<div><small>Purchases</small><b>${list('purchases').filter(q => q.partyId === id && !q.cancelled).length}</b></div>`}</div>` : ''}
    ${!sup && x.out > 0.5 ? `<div class="age">${x.b.map((v, i) => v > 0 ? `<i style="width:${v / x.out * 100}%;background:${AGE_C[i]}"></i>` : '').join('')}</div><div class="age-l">${x.b.map((v, i) => `<div><small><span class="dot" style="background:${AGE_C[i]}"></span>${AGE_L[i]}</small><b>${inr(v)}</b></div>`).join('')}</div>` : ''}
    ${p.notes ? `<div class="note">${esc(p.notes)}</div>` : ''}
    ${showMoney ? `<section><div class="sec-h"><h4>Account statement</h4><button class="link" type="button" data-act="printLedger" data-id="${id}">${ic('print', 16)} Print</button></div>
      ${rows.length ? `<div class="tbl-w"><table class="tbl ledger"><thead><tr><th>Date</th><th>Details</th><th class="n">${sup ? 'Purchase' : 'Bill'}</th><th class="n">${sup ? 'Paid' : 'Received'}</th><th class="n">Balance</th></tr></thead><tbody>
      ${rows.slice(0, 200).map(e => `<tr ${e.kind === 'invoice' ? `data-act="openDoc" data-kind="invoices" data-id="${e.ref}"` : e.kind === 'purchase' ? `data-act="openDoc" data-kind="purchases" data-id="${e.ref}"` : e.kind === 'return' ? `data-act="openDoc" data-kind="returns" data-id="${e.ref}"` : e.kind === 'payment' ? `data-act="viewPay" data-id="${e.ref}"` : ''} class="${e.ref ? 'click' : ''}"><td>${fdate(e.date)}</td><td>${esc(e.label)}</td><td class="n">${e.amt > 0 ? inr(e.amt) : ''}</td><td class="n good-t">${e.amt < 0 ? inr(-e.amt) : ''}</td><td class="n"><b>${inr(e.bal)}</b></td></tr>`).join('')}
      </tbody></table></div>` : empty('No entries yet')}</section>` : ''}`;
  const B = [];
  if (p.phone) { B.push(`<a class="icon-btn" href="${telLink(p.phone)}" aria-label="Call">${ic('phone', 18)}</a>`); if (!sup && x.out > 0.5) B.push(`<a class="btn wa" href="${waLink(p.phone, reminderText(p, x))}" target="_blank" rel="noopener">${ic('wa', 18)}<span>Reminder</span></a>`); }
  B.push(`<button class="btn" type="button" data-act="editParty" data-id="${id}">${ic('edit', 18)}<span>Edit</span></button>`);
  if (sup) { if (can('purchases')) B.push(`<button class="btn primary" type="button" data-act="paySupplier" data-id="${id}">${ic('cash', 18)}<span>Pay</span></button>`); }
  else { B.push(`<button class="btn" type="button" data-act="billFor" data-id="${id}">${ic('sales', 18)}<span>New bill</span></button>`, `<button class="btn primary" type="button" data-act="receivePay" data-id="${id}">${ic('cash', 18)}<span>Receive</span></button>`); }
  return { body, foot: `<div class="doc-acts">${B.join('')}</div>` };
}
export function showParty(id) { const c = partyBody(id); const s = openSheet({ title: get('parties', id)?.type === 'supplier' ? 'Supplier' : 'Customer', cls: 'wide', body: c.body, foot: c.foot }); s.dataset.liveParty = id; }
export function refreshPartySheets() { document.querySelectorAll('.sheet[data-live-party]').forEach(s => { if (!get('parties', s.dataset.liveParty)) return; const b = s.querySelector('.sheet-b'); const st = b.scrollTop; const c = partyBody(s.dataset.liveParty); setSheet(s, c); s.querySelector('.sheet-b').scrollTop = st; }); }

/* ---------------- party form ---------------- */
function partyForm(p, type) {
  const sup = type === 'supplier';
  const s = settings();
  return `<div class="frow">${fld('Name', inp('name', p.name, 'autocomplete="off" autofocus'))}${fld('Mobile', inp('phone', p.phone, 'inputmode="tel" maxlength="14" autocomplete="off"'))}</div>
    <div class="frow">${sup ? fld('Type', inp('kind', p.kind || 'Manufacturer')) : fld('Type', sel('kind', cfg('partyKinds'), p.kind || 'Retail'))}${fld('GSTIN', inp('gstin', p.gstin, 'autocomplete="off" style="text-transform:uppercase" maxlength="15"'), { hint: 'Optional. State is picked from GSTIN.' })}</div>
    ${fld('Address / area', inp('address', p.address, 'autocomplete="off"'))}
    <div class="frow">${fld('State', sel('stateCode', [['', '—'], ...STATES.map(([c, n]) => [c, c + ' · ' + n])], p.stateCode || s.stateCode || ''))}${!sup ? fld('Credit limit ₹', inp('limit', p.limit || '', 'inputmode="decimal" placeholder="0 = no limit"')) : fld('Payment terms (days)', inp('terms', p.terms || '', 'inputmode="numeric"'))}</div>
    <div class="frow">${fld(sup ? 'Opening balance we owe ₹' : 'Opening balance due ₹', inp('opening', p.opening || '', 'inputmode="decimal" placeholder="0"'), { hint: 'Old balance from your diary or old software.' })}${fld('Opening balance date', inp('openingDate', p.openingDate || today(), 'type="date"'))}</div>
    ${fld('Notes', inp('notes', p.notes, 'autocomplete="off"'))}`;
}
async function saveParty(sheet, type, id) {
  const f = readForm(sheet);
  if (!f.name) return invalid(sheet, 'name', 'Enter the name');
  const ph = phone10(f.phone);
  if (f.phone && ph.length !== 10) return invalid(sheet, 'phone', 'Mobile should be 10 digits');
  const g = f.gstin.toUpperCase();
  if (g && !/^\d{2}[A-Z0-9]{13}$/.test(g)) return invalid(sheet, 'gstin', 'GSTIN should be 15 characters');
  const dup = list('parties').find(x => x.id !== id && x.type === type && ((ph && x.phone === ph) || x.name.toLowerCase() === f.name.toLowerCase()));
  if (dup && !(await confirmBox({ title: 'Already saved?', text: `${esc(dup.name)} (${esc(dup.phone || 'no phone')}) looks the same. Save another anyway?`, ok: 'Save anyway' }))) return;
  const prev = id ? get('parties', id) : {};
  const rec = await put('parties', { ...prev, id: id || undefined, type, name: f.name, phone: ph, kind: f.kind, gstin: g, address: f.address, stateCode: f.stateCode || (g ? g.slice(0, 2) : ''), limit: num(f.limit), terms: num(f.terms), opening: num(f.opening), openingDate: f.openingDate || today(), notes: f.notes });
  toast(id ? 'Saved' : (type === 'supplier' ? 'Supplier added' : 'Customer added'));
  closeSheet();
  if (!id) setTimeout(() => showParty(rec.id), 200);
}

/* ---------------- payments ---------------- */
function payForm(party, inv, dir) {
  const sup = party && party.type === 'supplier';
  const x = party ? partyCredit(party.id) : null;
  const due = inv ? num(inv.total) - invoicePaid(inv) : x ? Math.max(0, x.out) : 0;
  const open = party && !sup ? x.open.slice(0, 6) : [];
  return `${party ? `<div class="party-card">${av(party.name, sup ? 'acc' : '')}<div class="grow"><b class="t">${esc(party.name)}</b><small class="muted">${sup ? 'We owe ' : 'Due '} ${inr(Math.max(0, x.out))}</small></div><button class="btn sm" type="button" data-act="payChangeParty" data-type="${sup ? 'supplier' : 'customer'}">Change</button></div>` : inv ? `<div class="party-card">${av(inv.cust.name)}<div class="grow"><b>${esc(inv.cust.name)}</b><small class="muted">Bill ${esc(inv.no || '')} · due ${inr(due)}</small></div></div>` : `<button class="party-card add" type="button" data-act="payChangeParty" data-type="${dir === 'out' ? 'supplier' : 'customer'}"><span class="av acc">${ic('user', 18)}</span><span class="grow"><b>Choose ${dir === 'out' ? 'supplier' : 'customer'}</b></span>${ic('right', 18)}</button>`}
    <label class="fld"><span>Amount ₹</span><input name="amount" class="big-num" value="${due > 0 ? Math.round(due) : ''}" inputmode="decimal" autocomplete="off" autofocus></label>
    ${due > 0 ? `<div class="chips"><button class="chip" type="button" data-act="payQuick" data-v="${Math.round(due)}">Full ${inr(due)}</button>${[0.5, 0.25].map(f => `<button class="chip" type="button" data-act="payQuick" data-v="${Math.round(due * f / 100) * 100}">${f * 100}%</button>`).join('')}</div>` : ''}
    <div class="frow">${fld('Mode', payModeSel('mode', 'Cash'))}${fld('Date', inp('date', today(), 'type="date"'))}</div>
    ${fld('Reference (UPI ref / cheque no.)', inp('ref', '', 'autocomplete="off"'))}
    ${open.length ? `<div class="note">This will settle the oldest bills first: ${open.map(o => esc(o.label.replace('Bill ', '')) + ' (' + inr(o.open) + ')').join(', ')}</div>` : ''}`;
}
let payCtx = null;
function openPay(ctx) {
  payCtx = ctx;
  const party = ctx.partyId ? get('parties', ctx.partyId) : null;
  const inv = ctx.invId ? get('invoices', ctx.invId) : null;
  const title = ctx.dir === 'out' ? 'Pay supplier' : 'Receive payment';
  const s = openSheet({ title, cls: 'narrow', body: payForm(party, inv, ctx.dir), foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary lg" type="button" data-act="savePay">${ic('check', 18)} Save payment</button>` });
  ctx.sheet = s;
}
Object.assign(A, {
  party: el => showParty(el.dataset.id),
  newParty(el) { const type = el.dataset.type || 'customer'; const s = openSheet({ title: type === 'supplier' ? 'New supplier' : 'New customer', body: partyForm({}, type), foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveParty" data-type="${type}">Save</button>` }); },
  editParty(el) { const p = get('parties', el.dataset.id); openSheet({ title: 'Edit ' + p.name, body: partyForm(p, p.type || 'customer'), foot: `${can('delete') ? `<button class="btn danger" type="button" data-act="delParty" data-id="${p.id}">${ic('trash', 16)}</button>` : ''}<span class="spacer"></span><button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveParty" data-type="${p.type || 'customer'}" data-id="${p.id}">Save</button>` }); },
  saveParty: el => busy(el, () => saveParty(el.closest('.sheet'), el.dataset.type, el.dataset.id)),
  async delParty(el) {
    const p = get('parties', el.dataset.id);
    const used = list('invoices').some(i => i.partyId === p.id) || list('purchases').some(i => i.partyId === p.id) || list('payments').some(i => i.partyId === p.id);
    if (used) { toast('Has bills or payments. It cannot be deleted.', 'bad'); return; }
    if (!(await confirmBox({ title: 'Delete ' + p.name + '?', ok: 'Delete', danger: true }))) return;
    await del('parties', p.id); closeAll(); toast('Deleted');
  },
  billFor(el) { import('./v-docs.js').then(m => { const p = get('parties', el.dataset.id); closeAll(() => m.openBuilder(m.newDraft('invoices', { partyId: p.id, cust: { name: p.name, phone: p.phone, gstin: p.gstin, address: p.address, stateCode: p.stateCode || settings().stateCode }, pay: { amount: '', mode: 'Cash', full: false }, delivery: { status: 'delivered', address: p.address || '', vehicle: '' } }))); }); },
  receivePay(el) { const d = (el && el.dataset) || {}; openPay({ dir: 'in', partyId: d.id || null, invId: d.inv || null }); },
  paySupplier(el) { if (!can('purchases')) { toast('Ask the owner', 'bad'); return; } openPay({ dir: 'out', partyId: (el && el.dataset.id) || null }); },
  async payChangeParty(el) {
    const p = await pickParty({ type: el.dataset.type });
    if (!p || p === 'walkin' || !payCtx) return;
    payCtx.partyId = p.id; payCtx.invId = null;
    setSheet(payCtx.sheet, { body: payForm(p, null, payCtx.dir) });
  },
  payQuick(el) { el.closest('.sheet').querySelector('[name=amount]').value = el.dataset.v; },
  savePay: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s);
    const amt = num(f.amount);
    if (!payCtx.partyId && !payCtx.invId) { toast('Choose who paid', 'bad'); return; }
    if (amt <= 0) return invalid(s, 'amount', 'Enter the amount');
    const inv = payCtx.invId ? get('invoices', payCtx.invId) : null;
    const party = payCtx.partyId ? get('parties', payCtx.partyId) : null;
    const before = party ? partyCredit(party.id).out : 0;
    const rec = await put('payments', { date: f.date || today(), partyId: payCtx.partyId || null, invoiceId: inv ? inv.id : '', invoiceNo: inv ? inv.no || '' : '', amount: amt, mode: f.mode, ref: f.ref, dir: payCtx.dir, name: party ? party.name : inv ? inv.cust.name : '', balanceAfter: party ? Math.max(0, before - amt) : (inv ? Math.max(0, num(inv.total) - invoicePaid(inv) - amt) : 0) });
    toast(payCtx.dir === 'out' ? 'Payment saved' : inr(amt) + ' received');
    const sheet = payCtx.sheet;
    setSheet(sheet, { title: payCtx.dir === 'out' ? 'Payment saved' : 'Payment received', body: payDone(rec), foot: payDoneFoot(rec) });
  }),
  viewPay(el) { const p = get('payments', el.dataset.id); if (!p) return; openSheet({ title: (p.dir === 'out' ? 'Payment ' : 'Receipt ') + (p.no || ''), cls: 'narrow', body: payDone(p), foot: payDoneFoot(p, true) }); },
  printPay(el) { const p = get('payments', el.dataset.id); printHtml(receiptPaper(p, get('parties', p.partyId), settings())); },
  async delPay(el) {
    const p = get('payments', el.dataset.id);
    if (!(await confirmBox({ title: 'Delete this payment?', text: `${inr(p.amount)} on ${fdateY(p.date)} will be removed and the balance will go back up.`, ok: 'Delete', danger: true }))) return;
    await del('payments', p.id); closeSheet(); toast('Payment deleted');
  },
  async printLedger(el) {
    const p = get('parties', el.dataset.id); const s = settings();
    let bal = 0;
    const rows = ledger(p.id).map(e => { bal += e.amt; return `<tr><td>${fdate(e.date)}</td><td>${esc(e.label)}</td><td class="n">${e.amt > 0 ? inr(e.amt) : ''}</td><td class="n">${e.amt < 0 ? inr(-e.amt) : ''}</td><td class="n">${inr(bal)}</td></tr>`; }).join('');
    printHtml(`<article class="paper"><div class="paper-h"><div><span class="shop">${esc(s.shopName || '')}</span><small>${esc([s.address, s.city].filter(Boolean).join(', '))}</small>${s.gstin ? `<small>GSTIN ${esc(s.gstin)}</small>` : ''}</div><div class="doc-tag"><span>ACCOUNT STATEMENT</span><b>${esc(p.name)}</b><small>As on ${fdateY(today())}</small></div></div>
      <table class="ptable"><thead><tr><th>Date</th><th>Details</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Balance</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="ptot"><div class="g"><span>Closing balance</span><span>${inr(bal)}</span></div></div></article>`);
  },
  remindAll() {
    const rows = creditSummary().rows.filter(r => r.x.out > 0.5 && r.c.phone && r.x.oldest > 30).sort((a, b) => b.x.out - a.x.out);
    openSheet({ title: 'Send reminders', sub: 'Customers with bills older than 30 days', body: rows.length ? `<div class="rows">${rows.map(({ c, x }) => `<div class="row">${av(c.name)}<div class="grow"><b class="t">${esc(c.name)}</b><small class="muted">${inr(x.out)} · oldest ${x.oldest} days</small></div><a class="btn wa sm" href="${waLink(c.phone, reminderText(c, x))}" target="_blank" rel="noopener">${ic('wa', 16)} Send</a></div>`).join('')}</div>` : empty('Nobody to remind', 'No old dues with a phone number.') });
  },
  moreCredit: () => { state.credit.n += 100; go('credit'); }
});
function payDone(p) {
  const party = get('parties', p.partyId);
  return `<div class="done-box">${ic('check', 30, 2.4)}<b>${inr(p.amount)}</b><span>${p.dir === 'out' ? 'paid to' : 'received from'} ${esc(party ? party.name : p.name || '')}</span><small class="muted">${esc(p.mode)} · ${fdateY(p.date)}${p.no ? ' · ' + esc(p.no) : ''}${p.ref ? ' · ' + esc(p.ref) : ''}</small></div>
    ${party && party.type !== 'supplier' ? `<div class="note">${partyCredit(party.id).out > 0.5 ? 'Balance now ' + inr(partyCredit(party.id).out) : 'Account is clear now.'}</div>` : ''}`;
}
function payDoneFoot(p, canDel) {
  const party = get('parties', p.partyId);
  const phone = party ? party.phone : '';
  const s = settings();
  const text = `*${s.shopName || ''}*\n${p.dir === 'out' ? 'Payment sent' : 'Payment received'}: *${inr(p.amount)}* by ${p.mode} on ${fdateY(p.date)}${p.no ? ' (' + p.no + ')' : ''}.${party && party.type !== 'supplier' ? `\nBalance now: ${inr(Math.max(0, partyCredit(party.id).out))}` : ''}\nThank you!`;
  return `${canDel && can('delete') ? `<button class="btn danger" type="button" data-act="delPay" data-id="${p.id}">${ic('trash', 16)}</button>` : ''}<span class="spacer"></span>
    ${phone ? `<a class="btn wa" href="${waLink(phone, text)}" target="_blank" rel="noopener">${ic('wa', 18)} Send receipt</a>` : ''}
    <button class="btn" type="button" data-act="printPay" data-id="${p.id}">${ic('print', 18)} Print</button><button class="btn primary" type="button" data-act="closeSheet">Done</button>`;
}
