// Bills, quotations, returns and purchases: builder, document view and lists.
import { $, $$, esc, ic, num, r2, inr, inr2, fmt2, fdate, fdateY, today, daysSince, matches, sum, uid, phone10, waLink, telLink, rel, addDays, sortBy } from './core.js';
import { A, IN, CH, openSheet, setSheet, closeSheet, closeAll, toast, confirmBox, askText, busy, empty, pill, topSheet } from './ui.js';
import { list, get, put, del, settings, can, me, isDemo, api, status } from './store.js';
import { calcDoc, docTotals, lineCalc, lineSnapshot, lineProduct, boxesFor, isTile, qtyText, unitLabel, priceUnit, lotsOf, lotQty, productStock, invoicePaid, invStatus, partyCredit, quoteStatus, QSTAT, cfg, customers, DEFAULTS, activeInvoices } from './logic.js';
import { view, go, state, sw, av, pickProduct, pickParty, payModeSel, moreBtn } from './parts.js';
import { paper, printHtml, docText, hydrateQr, receiptPaper } from './docs.js';

const KIND = {
  invoices: { one: 'Bill', title: 'New bill', party: 'customer' },
  quotes: { one: 'Quotation', title: 'New quotation', party: 'customer' },
  returns: { one: 'Sales return', title: 'Sales return', party: 'customer' },
  purchases: { one: 'Purchase', title: 'Stock purchase', party: 'supplier' }
};
let D = null;        // the draft being edited
let sheetEl = null;  // builder sheet

/* ============ builder ============ */
export function newDraft(kind, preset = {}) {
  const s = settings();
  return {
    kind, id: null, date: today(), partyId: null, cust: { name: '', phone: '', stateCode: s.stateCode || '' }, lines: [],
    taxMode: s.defaultTaxMode || 'excl', discAmt: '', transport: '', loading: '', notes: '', validDays: num(s.validDays) || DEFAULTS.validDays,
    status: kind === 'quotes' ? 'Sent' : undefined,
    pay: { amount: '', mode: 'Cash', full: kind === 'invoices' }, delivery: { status: 'delivered', vehicle: '', address: '' },
    referrerId: '', commissionPct: '', billNo: '', updateCost: true, refund: 'credit', ...preset
  };
}
function lineFrom(p, extra = {}) {
  const s = settings();
  const tile = isTile(p);
  const lots = lotsOf(p.id);
  return { id: uid('ln'), productId: p.id, lotId: D.kind === 'purchases' ? '' : (lots[0] ? lots[0].id : ''), room: '', area: '', wastage: tile ? num(s.wastage ?? DEFAULTS.wastage) : '', qty: tile ? '' : 1, pcs: '', rate: D.kind === 'purchases' ? num(p.cost) : num(p.rate), disc: '', ...lineSnapshot(p), newLot: D.kind === 'purchases' ? { batch: '', shade: '', location: cfg('godowns')[0] } : null, ...extra };
}
export function openBuilder(draft) {
  D = draft;
  const k = KIND[D.kind];
  sheetEl = openSheet({ title: D.id ? 'Edit ' + k.one.toLowerCase() + ' ' + (D.no || '') : k.title, cls: 'wide full builder', id: 'builder', body: builderBody(), foot: builderFoot() });
  updateTotals();
}
function rerender() { if (!sheetEl || !sheetEl.isConnected) return; const b = sheetEl.querySelector('.sheet-b'); const st = b.scrollTop; b.innerHTML = builderBody(); b.scrollTop = st; updateTotals(); }

function partyCard() {
  const k = KIND[D.kind];
  const p = D.partyId && get('parties', D.partyId);
  if (p) {
    const cr = partyCredit(p.id);
    const limit = num(p.limit);
    const warn = D.kind === 'invoices' && cr.out > 0.5 ? `<div class="note ${limit && cr.out > limit ? 'bad' : 'warn'}">Old balance ${inr(cr.out)}${limit ? ' · limit ' + inr(limit) : ''}${cr.oldest > 60 ? ' · oldest bill ' + cr.oldest + ' days' : ''}</div>` : (cr.advance ? `<div class="note good">Advance with us: ${inr(cr.advance)}</div>` : '');
    return `<div class="party-card">${av(p.name)}<div class="grow"><b class="t">${esc(p.name)}</b><small class="muted t">${esc([p.kind, p.phone, p.gstin].filter(Boolean).join(' · '))}</small></div><button class="btn sm" type="button" data-act="bPickParty">Change</button></div>${warn}`;
  }
  if (k.party === 'supplier') return `<button class="party-card add" type="button" data-act="bPickParty"><span class="av acc">${ic('plus', 18)}</span><span class="grow"><b>Choose supplier</b><small class="muted">Who sent this stock?</small></span>${ic('right', 18)}</button>`;
  return `<div class="walkin"><div class="frow">
      <label class="fld"><span>Customer name</span><input data-in="bCust" data-k="name" value="${esc(D.cust.name)}" placeholder="Cash customer" autocomplete="off"></label>
      <label class="fld"><span>Mobile</span><input data-in="bCust" data-k="phone" value="${esc(D.cust.phone)}" inputmode="tel" maxlength="14" placeholder="For WhatsApp" autocomplete="off"></label></div>
      <button class="link" type="button" data-act="bPickParty">${ic('users', 16)} Pick a saved customer (contractor, builder…)</button></div>`;
}
function lotOptions(l) {
  const lots = lotsOf(l.productId, true).filter(x => x.qty > 0 || x.id === l.lotId);
  if (!lots.length) return `<option value="">No stock: will go negative</option>`;
  return lots.map(x => `<option value="${x.id}" ${x.id === l.lotId ? 'selected' : ''}>${esc(x.location)} · Batch ${esc(x.batch || '-')}${x.shade ? ' · Shade ' + esc(x.shade) : ''} · ${esc(qtyText(x.qty, get('products', l.productId)))}</option>`).join('');
}
function itemCard(l, i) {
  const p = lineProduct(l) || {};
  const tile = isTile(p);
  const showRoom = D.kind === 'quotes' || D.kind === 'invoices';
  const room = showRoom ? `<label class="fld room"><span>Room / area</span><input data-in="bLine" data-i="${i}" data-k="room" value="${esc(l.room || '')}" placeholder="e.g. Living room" list="rooms-dl" autocomplete="off"></label>` : '';
  const areaF = tile && D.kind !== 'purchases' && D.kind !== 'returns' ? `<label class="fld"><span>Area sq ft</span><input data-in="bLine" data-i="${i}" data-k="area" value="${esc(l.area)}" inputmode="decimal" placeholder="0" autocomplete="off"></label>
    <label class="fld"><span>Wastage %</span><input data-in="bLine" data-i="${i}" data-k="wastage" value="${esc(l.wastage)}" inputmode="decimal" autocomplete="off"></label>` : '';
  const qtyF = tile ? `<label class="fld"><span>Boxes</span><div class="stepper"><button type="button" data-act="bStep" data-i="${i}" data-d="-1" aria-label="One box less">${ic('minus', 16)}</button><input data-in="bLine" data-i="${i}" data-k="qty" value="${esc(l.qtyBox ?? (l.qty === '' ? '' : Math.floor(num(l.qty) + 1e-9)))}" inputmode="numeric" placeholder="0" autocomplete="off"><button type="button" data-act="bStep" data-i="${i}" data-d="1" aria-label="One box more">${ic('plus', 16)}</button></div></label>
      <label class="fld sm"><span>Loose pcs</span><input data-in="bLine" data-i="${i}" data-k="pcs" value="${esc(l.pcs)}" inputmode="numeric" placeholder="0" autocomplete="off"></label>`
    : `<label class="fld"><span>Qty (${esc(unitLabel(p))})</span><div class="stepper"><button type="button" data-act="bStep" data-i="${i}" data-d="-1" aria-label="Less">${ic('minus', 16)}</button><input data-in="bLine" data-i="${i}" data-k="qty" value="${esc(l.qty)}" inputmode="decimal" autocomplete="off"><button type="button" data-act="bStep" data-i="${i}" data-d="1" aria-label="More">${ic('plus', 16)}</button></div></label>`;
  const rateLabel = D.kind === 'purchases' ? 'Cost ' + priceUnit(p) : 'Rate ' + priceUnit(p);
  const rateF = `<label class="fld"><span>${rateLabel}</span><input data-in="bLine" data-i="${i}" data-k="rate" value="${esc(l.rate)}" inputmode="decimal" autocomplete="off"></label>`;
  const discF = D.kind !== 'purchases' && D.kind !== 'returns' ? `<label class="fld sm"><span>Disc %</span><input data-in="bLine" data-i="${i}" data-k="disc" value="${esc(l.disc)}" inputmode="decimal" placeholder="0" autocomplete="off"></label>` : '';
  let lotF = '';
  if (D.kind === 'invoices' || D.kind === 'returns') lotF = `<label class="fld batch"><span>${D.kind === 'returns' ? 'Put back into' : 'Give from (location · batch · shade)'}</span><select data-ch="bLot" data-i="${i}">${lotOptions(l)}</select></label>`;
  if (D.kind === 'purchases') {
    const lots = lotsOf(l.productId, true);
    lotF = `<div class="batch frow3">
      <label class="fld"><span>Batch no.</span><input data-in="bNewLot" data-i="${i}" data-k="batch" value="${esc(l.newLot ? l.newLot.batch : '')}" placeholder="From box label" autocomplete="off" ${l.lotId ? 'disabled' : ''}></label>
      <label class="fld"><span>Shade</span><input data-in="bNewLot" data-i="${i}" data-k="shade" value="${esc(l.newLot ? l.newLot.shade : '')}" placeholder="e.g. S1" autocomplete="off" ${l.lotId ? 'disabled' : ''}></label>
      <label class="fld"><span>Keep at</span><select data-ch="bNewLotLoc" data-i="${i}" ${l.lotId ? 'disabled' : ''}>${cfg('godowns').map(g => `<option ${l.newLot && l.newLot.location === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      ${lots.length ? `<label class="fld" style="grid-column:1/-1"><span>Or add to an existing batch</span><select data-ch="bExistLot" data-i="${i}"><option value="">New batch (fill above)</option>${lots.map(x => `<option value="${x.id}" ${x.id === l.lotId ? 'selected' : ''}>${esc(x.location)} · ${esc(x.batch || '-')} ${x.shade ? '· ' + esc(x.shade) : ''} · ${esc(qtyText(x.qty, p))}</option>`).join('')}</select></label>` : ''}
    </div>`;
  }
  return `<div class="bitem" data-line="${i}">
    <div class="bitem-h">${sw(get('products', l.productId) || p, 'sm')}<div class="grow"><b class="t">${esc(l.name || p.name)}</b><small class="t">${esc([l.size, l.finish, tile ? fmt2(l.sqftPerBox) + ' sq ft/box · ' + num(l.pcsPerBox) + ' pcs' : ''].filter(Boolean).join(' · '))}</small></div>
      <button class="icon-btn sm" type="button" data-act="bDel" data-i="${i}" aria-label="Remove item">${ic('trash', 16)}</button></div>
    <div class="bitem-g">${room}${areaF}${qtyF}${rateF}${discF}${lotF}</div>
    <div class="bitem-f"><span class="lf-info" data-info="${i}"></span><b data-amt="${i}"></b></div>
    <div class="note warn" data-warn="${i}"></div>
  </div>`;
}
function builderBody() {
  const k = KIND[D.kind];
  const s = settings();
  const isInv = D.kind === 'invoices', isQ = D.kind === 'quotes', isP = D.kind === 'purchases', isR = D.kind === 'returns';
  const refs = customers().filter(c => /Architect|Interior|Mistri|Contractor/.test(c.kind || ''));
  return `
  <section class="b-sec"><div class="sec-h"><h4>${isP ? 'Supplier' : 'Customer'}</h4>${isR && D.invoiceNo ? pill('Against ' + D.invoiceNo, 'acc') : ''}</div>${partyCard()}</section>
  <section class="b-sec frow3">
    <label class="fld"><span>Date</span><input type="date" data-in="bTop" data-k="date" value="${esc(D.date)}" max="${isQ ? '' : addDays(today(), 1)}"></label>
    ${isQ ? `<label class="fld"><span>Valid for (days)</span><input data-in="bTop" data-k="validDays" value="${esc(D.validDays)}" inputmode="numeric"></label>` : ''}
    ${isP ? `<label class="fld"><span>Supplier bill no.</span><input data-in="bTop" data-k="billNo" value="${esc(D.billNo)}" autocomplete="off"></label>` : ''}
    ${!isR ? `<label class="fld"><span>GST</span><select data-ch="bTax">${[['excl', 'Rates + GST extra'], ['incl', 'Rates include GST'], ['none', 'No GST (estimate)']].map(([v, l]) => `<option value="${v}" ${D.taxMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
  </section>
  <section class="b-sec"><div class="sec-h"><h4>Items <span class="muted" data-cnt></span></h4>${isQ ? `<button class="link" type="button" data-act="calc">${ic('calc', 16)} Box calculator</button>` : ''}</div>
    <div class="bitems">${D.lines.map(itemCard).join('') || `<div class="empty sm"><b>No items yet</b><p>${isQ ? 'Add a design, then enter the room area. Boxes are worked out for you.' : 'Add the designs being sold.'}</p></div>`}</div>
    <button class="btn block add-item" type="button" data-act="bAdd">${ic('plus', 18)} Add ${isP ? 'item' : 'design'}</button>
  </section>
  ${!isR ? `<section class="b-sec"><h4>Charges & discount</h4><div class="frow3">
    ${!isP ? `<label class="fld"><span>Discount ₹ (whole bill)</span><input data-in="bTop" data-k="discAmt" value="${esc(D.discAmt)}" inputmode="decimal" placeholder="0"></label>` : ''}
    <label class="fld"><span>Transport ₹</span><input data-in="bTop" data-k="transport" value="${esc(D.transport)}" inputmode="decimal" placeholder="0"></label>
    <label class="fld"><span>Loading / unloading ₹</span><input data-in="bTop" data-k="loading" value="${esc(D.loading)}" inputmode="decimal" placeholder="0"></label>
  </div></section>` : ''}
  ${isInv ? `<section class="b-sec"><h4>Payment now</h4>
    <div class="pay-row"><label class="fld"><span>Amount received ₹</span><input data-in="bPay" data-k="amount" value="${esc(D.pay.amount)}" inputmode="decimal" placeholder="0"></label>
    <label class="fld"><span>Mode</span>${payModeSel('pmode', D.pay.mode).replace('<select', '<select data-ch="bPayMode"')}</label></div>
    <div class="chips"><button class="chip" type="button" data-act="bPayFull">Full amount</button><button class="chip" type="button" data-act="bPayNone">Nothing now (credit)</button><button class="chip" type="button" data-act="bPayHalf">50% advance</button></div>
    <div class="note" data-paynote></div></section>
  <section class="b-sec"><h4>Delivery</h4><div class="frow3">
    <label class="fld"><span>Status</span><select data-ch="bDel"><option value="delivered" ${D.delivery.status !== 'pending' ? 'selected' : ''}>Taken / delivered</option><option value="pending" ${D.delivery.status === 'pending' ? 'selected' : ''}>To be delivered</option></select></label>
    <label class="fld"><span>Vehicle no.</span><input data-in="bDelv" data-k="vehicle" value="${esc(D.delivery.vehicle || '')}" autocomplete="off" style="text-transform:uppercase"></label>
    <label class="fld"><span>Site address</span><input data-in="bDelv" data-k="address" value="${esc(D.delivery.address || '')}" autocomplete="off"></label></div></section>
  ${refs.length ? `<section class="b-sec"><h4>Referred by (commission)</h4><div class="frow">
    <label class="fld"><span>Architect / mistri / contractor</span><select data-ch="bRef"><option value="">None</option>${refs.map(r => `<option value="${r.id}" ${D.referrerId === r.id ? 'selected' : ''}>${esc(r.name)} · ${esc(r.kind)}</option>`).join('')}</select></label>
    <label class="fld"><span>Commission %</span><input data-in="bTop" data-k="commissionPct" value="${esc(D.commissionPct)}" inputmode="decimal" placeholder="0"></label></div></section>` : ''}` : ''}
  ${isP ? `<section class="b-sec"><h4>Payment to supplier</h4><div class="pay-row"><label class="fld"><span>Paid now ₹</span><input data-in="bPay" data-k="amount" value="${esc(D.pay.amount)}" inputmode="decimal" placeholder="0"></label>
    <label class="fld"><span>Mode</span>${payModeSel('pmode', D.pay.mode).replace('<select', '<select data-ch="bPayMode"')}</label></div>
    <label class="tgl"><input type="checkbox" data-ch="bUpdCost" ${D.updateCost ? 'checked' : ''}><span class="tgl-ui"></span><span>Update cost price of these designs</span></label></section>` : ''}
  ${isR ? `<section class="b-sec"><h4>Money back</h4><select class="sel-lg" data-ch="bRefund"><option value="credit" ${D.refund === 'credit' ? 'selected' : ''}>Adjust in customer's account (credit note)</option><option value="cash" ${D.refund === 'cash' ? 'selected' : ''}>Refund cash / UPI now</option></select>
    <label class="fld" style="margin-top:12px"><span>Reason</span><input data-in="bTop" data-k="reason" value="${esc(D.reason || '')}" placeholder="e.g. extra boxes returned unopened"></label></section>` : ''}
  <section class="b-sec"><label class="fld"><span>Note (printed on ${isQ ? 'quotation' : 'bill'})</span><input data-in="bTop" data-k="notes" value="${esc(D.notes || '')}" autocomplete="off"></label></section>
  <section class="b-sec"><div class="b-sum" data-sum></div></section>
  <datalist id="rooms-dl">${['Living room', 'Bedroom', 'Master bedroom', 'Kitchen', 'Kitchen wall', 'Bathroom', 'Bathroom wall', 'Toilet', 'Hall', 'Dining', 'Balcony', 'Terrace', 'Parking', 'Staircase', 'Front elevation', 'Pooja room', 'Office'].map(r => `<option value="${r}">`).join('')}</datalist>`;
}
function builderFoot() {
  const k = KIND[D.kind];
  return `<div class="bt-sum"><small data-ftl>Total</small><b data-ftot>₹0</b></div>
    <button class="btn" type="button" data-act="closeSheet">Cancel</button>
    <button class="btn primary lg" type="button" data-act="bSave">${ic('check', 18)} Save ${k.one.toLowerCase()}</button>`;
}
function lineQty(l) { const p = lineProduct(l); if (isTile(p)) { const per = num(l.pcsPerBox) || 1; return num(l.qtyBox ?? l.qty) + num(l.pcs) / per; } return num(l.qty); }
function syncQty(l) { l.qty = lineQty(l); }

export function updateTotals() {
  if (!sheetEl || !D) return;
  D.lines.forEach(syncQty);
  const c = calcDoc(D);
  const max = num(settings().staffMaxDisc ?? DEFAULTS.staffMaxDisc);
  c.lines.forEach((x, i) => {
    const l = x.l, p = x.p || {};
    const info = sheetEl.querySelector(`[data-info="${i}"]`), amt = sheetEl.querySelector(`[data-amt="${i}"]`), warn = sheetEl.querySelector(`[data-warn="${i}"]`);
    if (!info) return;
    const tile = isTile(p);
    info.textContent = (tile ? qtyText(x.qty, p) + ' = ' + fmt2(x.sqft) + ' sq ft' : '') + (tile && (l.priceOn || 'sqft') === 'sqft' ? ' · ' + inr(num(l.rate) * num(l.sqftPerBox)) + '/box' : '');
    amt.textContent = inr2(x.amount != null ? x.amount : x.net);
    const ws = [];
    if (D.kind === 'invoices' && x.qty > 0) {
      const have = l.lotId ? lotQty(l.lotId) + (D.id ? origQty(l.lotId) : 0) : 0;
      if (x.qty > have + 1e-6) {
        const total = productStock(l.productId) + (D.id ? origQtyP(l.productId) : 0);
        if (x.qty <= total + 1e-6) ws.push(`This batch has only ${qtyText(have, p)}. Rest must come from another batch: <b>shade may not match</b>. Add the design again to pick a second batch.`);
        else ws.push(`Only ${qtyText(Math.max(0, total), p)} in stock. Stock will go below zero.`);
      }
      if (can('viewCost') && num(l.cost) > 0 && num(l.rate) * (1 - num(l.disc) / 100) < num(l.cost)) ws.push('Selling below cost price (' + inr2(l.cost) + ').');
      if (!can('viewCost') && num(l.disc) > max) ws.push(`Your discount limit is ${max}%.`);
    }
    if (D.kind === 'returns' && D.maxQty && D.maxQty[l.id] != null && x.qty > D.maxQty[l.id] + 1e-6) ws.push(`Only ${qtyText(D.maxQty[l.id], p)} were billed.`);
    warn.innerHTML = ws.join('<br>');
  });
  const cnt = sheetEl.querySelector('[data-cnt]'); if (cnt) cnt.textContent = D.lines.length ? '(' + D.lines.length + ')' : '';
  const isP = D.kind === 'purchases';
  const paid = num(D.pay.amount);
  const rows = [];
  rows.push(`<div><span>Gross${c.sqft ? ` · ${fmt2(c.boxes)} boxes · ${fmt2(c.sqft)} sq ft` : ''}</span><span>${inr2(c.gross)}</span></div>`);
  if (c.discount) rows.push(`<div><span>Discount</span><span>− ${inr2(c.discount)}</span></div>`);
  if (c.mode !== 'none') rows.push(`<div><span>Taxable</span><span>${inr2(c.taxable)}</span></div>`, c.inter ? `<div><span>IGST</span><span>${inr2(c.igst)}</span></div>` : `<div><span>CGST + SGST</span><span>${inr2(c.tax)}</span></div>`);
  if (c.charges) rows.push(`<div><span>Transport + loading</span><span>${inr2(c.charges)}</span></div>`);
  if (Math.abs(c.roundOff) > .004) rows.push(`<div><span>Round off</span><span>${fmt2(c.roundOff)}</span></div>`);
  rows.push(`<div class="g"><span>${D.kind === 'quotes' ? 'Estimate' : 'Total'}</span><span>${inr(c.total)}</span></div>`);
  if (can('viewCost') && D.kind === 'invoices' && c.taxable > 0) { const gp = c.taxable - c.cogs; rows.push(`<div class="muted"><span>Margin (owner only)</span><span>${inr(gp)} · ${fmt2(gp / c.taxable * 100)}%</span></div>`); }
  if (D.kind === 'invoices' && D.pay.full) { D.pay.amount = String(c.total); const pi = sheetEl.querySelector('[data-in=bPay][data-k=amount]'); if (pi && document.activeElement !== pi) pi.value = c.total; }
  const pn = sheetEl.querySelector('[data-paynote]');
  if (pn) {
    const pd = num(D.pay.amount); const bal = c.total - pd;
    pn.className = 'note ' + (bal > 0.5 ? (D.partyId ? 'warn' : 'bad') : 'good');
    pn.innerHTML = bal > 0.5 ? (D.partyId ? `${inr(bal)} will be added to ${esc(get('parties', D.partyId).name)}'s credit.` : `${inr(bal)} balance pending. Pick a saved customer to keep it on credit.`) : (pd > c.total + 0.5 ? `Extra ${inr(pd - c.total)} goes as advance.` : 'Fully paid.');
  }
  sheetEl.querySelector('[data-sum]').innerHTML = rows.join('');
  sheetEl.querySelector('[data-ftot]').textContent = inr(c.total);
  sheetEl.querySelector('[data-ftl]').textContent = D.lines.length ? `${D.lines.length} item${D.lines.length > 1 ? 's' : ''}${c.sqft ? ' · ' + fmt2(c.sqft) + ' sq ft' : ''}${isP ? '' : ''}` : 'Total';
}
// when editing a saved bill, its own old quantities are "available" again
function origQty(lotId) { const o = D.id && get('invoices', D.id); return o ? sum(o.lines.filter(l => l.lotId === lotId), l => num(l.qty)) : 0; }
function origQtyP(pid) { const o = D.id && get('invoices', D.id); return o ? sum(o.lines.filter(l => l.productId === pid), l => num(l.qty)) : 0; }

IN.bCust = el => { D.cust[el.dataset.k] = el.value; };
IN.bTop = el => { D[el.dataset.k] = el.value; updateTotals(); };
IN.bDelv = el => { D.delivery[el.dataset.k] = el.value; };
IN.bPay = el => { D.pay.amount = el.value; D.pay.full = false; updateTotals(); };
IN.bLine = el => {
  const l = D.lines[+el.dataset.i]; const k = el.dataset.k; const p = lineProduct(l);
  if (k === 'qty' && isTile(p)) { l.qtyBox = el.value; }
  else l[k] = el.value;
  if ((k === 'area' || k === 'wastage') && isTile(p) && num(l.area) > 0) {
    l.qtyBox = String(boxesFor(l.area, { ...p, sqftPerBox: l.sqftPerBox, uom: 'box' }, l.wastage)); l.pcs = '';
    const q = sheetEl.querySelector(`[data-line="${el.dataset.i}"] [data-k=qty]`); if (q) q.value = l.qtyBox;
    const pc = sheetEl.querySelector(`[data-line="${el.dataset.i}"] [data-k=pcs]`); if (pc) pc.value = '';
  }
  updateTotals();
};
IN.bNewLot = el => { const l = D.lines[+el.dataset.i]; l.newLot = l.newLot || {}; l.newLot[el.dataset.k] = el.value; };
CH.bNewLotLoc = el => { const l = D.lines[+el.dataset.i]; l.newLot = l.newLot || {}; l.newLot.location = el.value; };
CH.bExistLot = el => { const l = D.lines[+el.dataset.i]; l.lotId = el.value; rerender(); };
CH.bLot = el => { D.lines[+el.dataset.i].lotId = el.value; updateTotals(); };
CH.bTax = el => { D.taxMode = el.value; updateTotals(); };
CH.bPayMode = el => { D.pay.mode = el.value; };
CH.bDel = el => { D.delivery.status = el.value; };
CH.bRef = el => { D.referrerId = el.value; if (el.value && !D.commissionPct) { D.commissionPct = '2'; rerender(); } };
CH.bUpdCost = el => { D.updateCost = el.checked; };
CH.bRefund = el => { D.refund = el.value; };

Object.assign(A, {
  bStep(el) {
    const i = +el.dataset.i, l = D.lines[i], p = lineProduct(l);
    const inp = sheetEl.querySelector(`[data-line="${i}"] [data-k=qty]`);
    const v = Math.max(0, num(inp.value) + num(el.dataset.d));
    inp.value = v; if (isTile(p)) l.qtyBox = String(v); else l.qty = String(v);
    updateTotals();
  },
  bDel(el) { D.lines.splice(+el.dataset.i, 1); rerender(); },
  async bAdd() {
    const p = await pickProduct({ title: D.kind === 'purchases' ? 'Which item came in?' : 'Add design' });
    if (!p) return;
    const used = D.lines.filter(l => l.productId === p.id).map(l => l.lotId);
    const line = lineFrom(p);
    if (D.kind === 'invoices' && used.length) { const next = lotsOf(p.id).find(x => !used.includes(x.id)); if (next) line.lotId = next.id; }
    D.lines.push(line);
    rerender();
    setTimeout(() => {
      const card = sheetEl.querySelector(`[data-line="${D.lines.length - 1}"]`);
      if (!card) return;
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const f = card.querySelector(D.kind === 'quotes' && isTile(p) ? '[data-k=area]' : '[data-k=qty]');
      if (f) f.focus({ preventScroll: true });
    }, 60);
  },
  async bPickParty() {
    const p = await pickParty({ type: KIND[D.kind].party, allowWalkin: KIND[D.kind].party === 'customer' });
    if (!p) return;
    if (p === 'walkin') { D.partyId = null; D.cust = { name: '', phone: '', stateCode: settings().stateCode || '' }; }
    else { D.partyId = p.id; D.cust = { name: p.name, phone: p.phone || '', gstin: p.gstin || '', address: p.address || '', stateCode: p.stateCode || settings().stateCode || '' }; if (D.kind === 'invoices' && !D.delivery.address) D.delivery.address = p.address || ''; if (D.kind === 'invoices' && D.pay.full && !D.id) { D.pay.full = false; D.pay.amount = ''; } }
    rerender();
  },
  bPayFull() { D.pay.full = true; updateTotals(); },
  bPayNone() { D.pay.full = false; D.pay.amount = ''; const i = sheetEl.querySelector('[data-in=bPay]'); if (i) i.value = ''; updateTotals(); },
  bPayHalf() { const c = calcDoc(D); D.pay.full = false; D.pay.amount = String(Math.round(c.total / 2 / 100) * 100); const i = sheetEl.querySelector('[data-in=bPay]'); if (i) i.value = D.pay.amount; updateTotals(); },
  bSave: el => busy(el, saveDraft),
  __addLine(p, extra = {}) {
    if (!D || !p) return;
    const l = lineFrom(p);
    if (extra.area && isTile(p)) { l.area = String(extra.area); l.wastage = String(extra.wastage ?? l.wastage); l.qtyBox = String(boxesFor(extra.area, p, l.wastage)); }
    D.lines.push(l); rerender();
  }
});

function cleanLines() {
  return D.lines.map(l => {
    syncQty(l);
    const o = { ...l, qty: r2(lineQty(l) * 10000) / 10000, rate: num(l.rate), disc: num(l.disc), area: num(l.area) || '', wastage: l.area ? num(l.wastage) : '' };
    delete o.qtyBox; delete o.newLot; delete o.pcs;
    const lot = o.lotId && get('lots', o.lotId);
    if (lot) { o.batch = lot.batch || ''; o.shade = lot.shade || ''; o.location = lot.location || ''; }
    return o;
  }).filter(l => l.qty > 0);
}
async function saveDraft() {
  const k = D.kind, s = settings();
  if (k === 'purchases' && !D.partyId) { toast('Choose the supplier', 'bad'); return; }
  const lines = cleanLines();
  if (!lines.length) { toast(D.lines.length ? 'Enter quantity for the items' : 'Add at least one item', 'bad'); return; }
  if (k === 'invoices' && !can('viewCost')) {
    const max = num(s.staffMaxDisc ?? DEFAULTS.staffMaxDisc);
    const bad = lines.find(l => num(l.disc) > max || (get('products', l.productId) && num(l.rate) < num(get('products', l.productId).rate) * (1 - max / 100) - 0.01));
    if (bad) { toast(`Discount above ${max}% needs the owner. Change the rate or discount.`, 'bad'); return; }
  }
  if (k === 'returns' && D.maxQty) { const bad = lines.find(l => D.maxQty[l.id] != null && l.qty > D.maxQty[l.id] + 1e-6); if (bad) { toast('Return quantity is more than billed', 'bad'); return; } }
  const writes = [];
  // purchases: create lots for new batches
  if (k === 'purchases') {
    for (let i = 0; i < D.lines.length; i++) {
      const src = D.lines[i], ln = lines.find(x => x.id === src.id); if (!ln) continue;
      if (!ln.lotId) {
        const nl = src.newLot || {};
        const existing = lotsOf(ln.productId, true).find(x => (x.batch || '') === (nl.batch || '').trim() && (x.shade || '') === (nl.shade || '').trim() && x.location === (nl.location || cfg('godowns')[0]));
        if (existing) ln.lotId = existing.id;
        else { const lot = { id: uid('lt'), productId: ln.productId, batch: (nl.batch || '').trim() || 'NEW-' + D.date.replace(/-/g, '').slice(2), shade: (nl.shade || '').trim(), location: nl.location || cfg('godowns')[0], opening: 0, date: D.date }; writes.push({ c: 'lots', d: lot }); ln.lotId = lot.id; }
        const lot = get('lots', ln.lotId) || writes.find(w => w.d.id === ln.lotId)?.d;
        if (lot) { ln.batch = lot.batch; ln.shade = lot.shade; ln.location = lot.location; }
      }
      if (D.updateCost) { const p = get('products', ln.productId); if (p && num(p.cost) !== num(ln.rate)) writes.push({ c: 'products', d: { ...p, cost: num(ln.rate) } }); }
    }
  }
  const prev = D.id ? get(k, D.id) : null;
  const doc = {
    ...(prev || {}), id: D.id || uid(k.slice(0, 2)), date: D.date || today(), partyId: D.partyId || null,
    cust: { ...D.cust, name: (D.cust.name || '').trim() || (k === 'purchases' ? '' : 'Cash customer'), phone: phone10(D.cust.phone) },
    lines, shopState: (prev && prev.shopState) || s.stateCode || '', taxMode: D.taxMode || 'excl', discAmt: num(D.discAmt), transport: num(D.transport), loading: num(D.loading), notes: (D.notes || '').trim()
  };
  if (k === 'quotes') { doc.validDays = num(D.validDays) || 15; doc.status = prev ? prev.status : (D.status || 'Sent'); }
  if (k === 'invoices') { doc.delivery = { ...D.delivery, vehicle: (D.delivery.vehicle || '').toUpperCase() }; doc.referrerId = D.referrerId || ''; doc.commissionPct = num(D.commissionPct); if (D.quoteId) doc.quoteId = D.quoteId; }
  if (k === 'purchases') doc.billNo = (D.billNo || '').trim();
  if (k === 'returns') { doc.invoiceId = D.invoiceId || ''; doc.invoiceNo = D.invoiceNo || ''; doc.reason = (D.reason || '').trim(); doc.taxMode = D.taxMode; }
  Object.assign(doc, docTotals(doc));
  // credit limit check
  if (k === 'invoices' && D.partyId) {
    const p = get('parties', D.partyId); const cr = partyCredit(D.partyId);
    const newDue = cr.out - (prev ? num(prev.total) : 0) + doc.total - num(D.pay.amount) + (prev ? atBillingPaid(prev) : 0);
    if (num(p.limit) && newDue > num(p.limit) + 0.5 && !(await confirmBox({ title: 'Credit limit crossed', text: `${esc(p.name)} will owe ${inr(newDue)}. Their limit is ${inr(p.limit)}. Save anyway?`, ok: 'Save anyway' }))) return;
  }
  if (k === 'invoices') {
    const short = lines.find(l => { const have = productStock(l.productId) + (prev ? sum(prev.lines.filter(x => x.productId === l.productId), x => num(x.qty)) : 0); return sum(lines.filter(x => x.productId === l.productId), x => x.qty) > have + 1e-6; });
    if (short && !(await confirmBox({ title: 'Not enough stock', text: `${esc(short.name)}: billing more than what is in stock. Stock will show negative until new stock is entered. Continue?`, ok: 'Continue' }))) return;
  }
  writes.push({ c: k, d: doc });
  // money movement linked to this document
  if (k === 'invoices' || k === 'purchases') {
    const amt = num(D.pay.amount);
    const old = list('payments').find(p => p.atBilling && p[k === 'invoices' ? 'invoiceId' : 'purchaseId'] === doc.id);
    if (amt > 0) writes.push({ c: 'payments', d: { ...(old || {}), id: old ? old.id : uid('py'), date: doc.date, partyId: doc.partyId, [k === 'invoices' ? 'invoiceId' : 'purchaseId']: doc.id, invoiceNo: doc.no || '', amount: amt, mode: D.pay.mode || 'Cash', dir: k === 'invoices' ? 'in' : 'out', atBilling: true, name: doc.cust.name } });
    else if (old) await del('payments', old.id);
  }
  if (k === 'returns' && D.refund === 'cash' && !prev) writes.push({ c: 'payments', d: { id: uid('py'), date: doc.date, partyId: doc.partyId, invoiceId: doc.invoiceId || '', amount: doc.total, mode: 'Cash', dir: 'out', atBilling: true, name: doc.cust.name, ref: 'Refund for return' } });
  if (k === 'invoices' && D.quoteId) { const q = get('quotes', D.quoteId); if (q) writes.push({ c: 'quotes', d: { ...q, status: 'Converted', invoiceId: doc.id } }); }
  if (k === 'invoices' && D.leadId) { const l = get('leads', D.leadId); if (l) writes.push({ c: 'leads', d: { ...l, stage: 'Won' } }); }
  if (k === 'quotes' && D.leadId) { const l = get('leads', D.leadId); if (l) writes.push({ c: 'leads', d: { ...l, stage: l.stage === 'Won' ? 'Won' : 'Quoted', quoteId: doc.id } }); doc.leadId = D.leadId; }
  const saved = await put(writes);
  const rec = saved.find(r => r.id === doc.id);
  toast(KIND[k].one + (prev ? ' updated' : ' saved'));
  const kind = k; D = null;
  const s2 = topSheet();
  if (s2) showDoc(kind, rec.id, s2.layer.querySelector('.sheet'));
}
const atBillingPaid = inv => sum(list('payments').filter(p => p.atBilling && p.invoiceId === inv.id), p => num(p.amount));

/* ============ document view ============ */
export function showDoc(kind, id, into) {
  const body = () => docBody(kind, id);
  const content = { title: docTitle(kind, id), body: body().body, foot: body().foot };
  const s = into ? (setSheet(into, content), into) : openSheet({ ...content, cls: 'wide full docview', id: 'doc:' + kind + ':' + id });
  s.dataset.live = kind + ':' + id;
  s.classList.add('docview'); s.classList.remove('builder');
  hydrateQr(s);
}
export function refreshDocSheets() {
  $$('.sheet[data-live]').forEach(s => {
    const [kind, id] = s.dataset.live.split(':');
    if (!get(kind, id)) return;
    const b = s.querySelector('.sheet-b'); const st = b.scrollTop;
    const c = docBody(kind, id);
    setSheet(s, { title: docTitle(kind, id), body: c.body, foot: c.foot });
    s.querySelector('.sheet-b').scrollTop = st; hydrateQr(s);
  });
}
function docTitle(kind, id) { const d = get(kind, id); return d ? KIND[kind].one + ' ' + (d.no || '(number pending)') : KIND[kind].one; }
function docBody(kind, id) {
  const d = get(kind, id); const shop = settings();
  if (!d) return { body: empty('Not found', 'This document was removed.'), foot: '' };
  const party = d.partyId && get('parties', d.partyId);
  const head = [];
  if (kind === 'invoices') {
    const [st, cls] = invStatus(d); const paid = invoicePaid(d); const due = num(d.total) - paid;
    head.push(`<div class="doc-strip"><div><small>Total</small><b>${inr(d.total)}</b></div><div><small>Paid</small><b class="good-t">${inr(paid)}</b></div><div><small>Balance</small><b class="${due > 0.5 ? 'bad-t' : ''}">${inr(Math.max(0, due))}</b></div><div><small>Status</small>${pill(st, cls)}${d.delivery && d.delivery.status === 'pending' ? ' ' + pill('Delivery pending', 'warn') : ''}</div></div>`);
    const pays = list('payments').filter(p => p.invoiceId === d.id);
    if (pays.length) head.push(`<div class="mini-list">${pays.map(p => `<div class="mini" data-act="viewPay" data-id="${p.id}">${ic('cash', 16)}<span class="grow">${p.dir === 'out' ? 'Refund' : 'Received'} · ${esc(p.mode)} · ${fdate(p.date)}</span><b>${inr(p.amount)}</b></div>`).join('')}</div>`);
    const rets = list('returns').filter(r => r.invoiceId === d.id && !r.cancelled);
    if (rets.length) head.push(`<div class="mini-list">${rets.map(r => `<div class="mini" data-act="openDoc" data-kind="returns" data-id="${r.id}">${ic('return', 16)}<span class="grow">Return ${esc(r.no || '')} · ${fdate(r.date)}</span><b>− ${inr(r.total)}</b></div>`).join('')}</div>`);
    if (d.referrerId) { const r = get('parties', d.referrerId); if (r) head.push(`<div class="note">Referred by ${esc(r.name)} · commission ${fmt2(d.commissionPct)}% ≈ ${inr(num(d.taxable) * num(d.commissionPct) / 100)}</div>`); }
  }
  if (kind === 'quotes') { const st = quoteStatus(d); head.push(`<div class="doc-strip"><div><small>Estimate</small><b>${inr(d.total)}</b></div><div><small>Valid till</small><b>${fdate(addDays(d.date, num(d.validDays || 15)))}</b></div><div><small>Status</small>${pill(st, QSTAT[st])}</div></div>`); if (d.invoiceId && get('invoices', d.invoiceId)) head.push(`<button class="mini" type="button" data-act="openDoc" data-kind="invoices" data-id="${d.invoiceId}">${ic('sales', 16)}<span class="grow">Converted to bill ${esc(get('invoices', d.invoiceId).no || '')}</span>${ic('right', 16)}</button>`); }
  if (kind === 'purchases') { const pc = party ? partyCredit(party.id) : null; head.push(`<div class="doc-strip"><div><small>Total</small><b>${can('viewCost') ? inr(d.total) : '—'}</b></div><div><small>Supplier</small><b class="t">${esc(party ? party.name : '')}</b></div>${pc && can('viewCost') ? `<div><small>We owe them</small><b>${inr(Math.max(0, pc.out))}</b></div>` : ''}</div>`); }
  if (d.cancelled) head.push(`<div class="note bad">Cancelled${d.cancelReason ? ': ' + esc(d.cancelReason) : ''}. Stock and credit are not counted.</div>`);
  if (!d.no && !isDemo()) head.push(`<div class="note warn">${status.online ? 'Getting a number from the server…' : 'Saved on this device. The bill number is given when internet is back.'}</div>`);
  const meta = `<p class="doc-meta muted">${d.createdBy ? 'Made by ' + esc(d.createdBy) : ''}${d.updatedAt ? ' · last change ' + new Date(d.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</p>`;
  const body = head.join('') + `<div class="paper-wrap">${paper(kind, d, shop)}</div>` + meta;
  const phone = d.cust && d.cust.phone;
  const B = [];
  if (kind === 'invoices' && !d.cancelled) {
    const due = num(d.total) - invoicePaid(d);
    if (due > 0.5) B.push(`<button class="btn primary" type="button" data-act="docPay" data-id="${d.id}">${ic('cash', 18)}<span>Receive payment</span></button>`);
    B.push(`<button class="btn wa" type="button" data-act="docWa" data-kind="${kind}" data-id="${d.id}">${ic('wa', 18)}<span>WhatsApp</span></button>`);
    B.push(`<button class="btn" type="button" data-act="docPrint" data-kind="${kind}" data-id="${d.id}">${ic('print', 18)}<span>Print</span></button>`);
    B.push(`<button class="btn" type="button" data-act="docMenu" data-kind="${kind}" data-id="${d.id}">${ic('more', 18)}<span>More</span></button>`);
  } else if (kind === 'quotes') {
    if (!['Converted', 'Lost'].includes(d.status)) B.push(`<button class="btn primary" type="button" data-act="quoteToBill" data-id="${d.id}">${ic('sales', 18)}<span>Convert to bill</span></button>`);
    B.push(`<button class="btn wa" type="button" data-act="docWa" data-kind="${kind}" data-id="${d.id}">${ic('wa', 18)}<span>WhatsApp</span></button>`);
    B.push(`<button class="btn" type="button" data-act="docPrint" data-kind="${kind}" data-id="${d.id}">${ic('print', 18)}<span>Print</span></button>`);
    B.push(`<button class="btn" type="button" data-act="docMenu" data-kind="${kind}" data-id="${d.id}">${ic('more', 18)}<span>More</span></button>`);
  } else {
    B.push(`<button class="btn" type="button" data-act="docPrint" data-kind="${kind}" data-id="${d.id}">${ic('print', 18)}<span>Print</span></button>`);
    if (kind === 'returns') B.push(`<button class="btn wa" type="button" data-act="docWa" data-kind="${kind}" data-id="${d.id}">${ic('wa', 18)}<span>WhatsApp</span></button>`);
    B.push(`<button class="btn" type="button" data-act="docMenu" data-kind="${kind}" data-id="${d.id}">${ic('more', 18)}<span>More</span></button>`);
  }
  if (phone && kind !== 'purchases') B.unshift(`<a class="icon-btn" href="${telLink(phone)}" aria-label="Call customer">${ic('phone', 18)}</a>`);
  return { body, foot: `<div class="doc-acts">${B.join('')}</div>` };
}

async function shareLink(kind, id) {
  if (isDemo()) return '';
  try { const r = await api('POST', '/api/share', { c: kind, id }); return new URL('share.html#' + r.token, location.href.split('#')[0]).href; } catch { return ''; }
}
Object.assign(A, {
  openDoc(el) { showDoc(el.dataset.kind, el.dataset.id); },
  async docPrint(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id); const shop = settings();
    printHtml(paper(kind, d, shop, { thermal: shop.printSize === 'thermal' }), { thermal: shop.printSize === 'thermal' });
  },
  async docChallan(el) { const d = get('invoices', el.dataset.id); closeSheet(); setTimeout(() => printHtml(paper('invoices', d, settings(), { challan: true })), 200); },
  async docWa(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id); const shop = settings();
    const win = window.open('', '_blank');
    const link = d.no ? await shareLink(kind, d.id) : '';
    const text = docText(kind, d, shop, link, kind === 'invoices' ? invoicePaid(d) : null);
    const url = waLink(d.cust && d.cust.phone, text);
    if (win) win.location = url; else location.href = url;
    if (kind === 'quotes' && d.status === 'Draft') await put('quotes', { ...d, status: 'Sent' });
  },
  async docCopyLink(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id);
    if (isDemo()) { toast('Share links work after you create your shop account', 'bad'); return; }
    if (!d.no) { toast('Wait for the bill number (needs internet)', 'bad'); return; }
    const link = await shareLink(kind, d.id);
    if (!link) { toast('Could not make a link. Check internet.', 'bad'); return; }
    try { await navigator.clipboard.writeText(link); toast('Link copied. Paste it anywhere.'); } catch { await askText({ title: 'Copy this link', label: 'Bill link', value: link, ok: 'Done' }); }
  },
  docMenu(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id); const id = d.id;
    const it = (act, icon, label, extra = '') => `<button class="menu-i" type="button" data-act="${act}" data-kind="${kind}" data-id="${id}" ${extra}>${ic(icon, 18)}<span>${label}</span></button>`;
    const items = [];
    if (kind === 'invoices') {
      if (!d.cancelled) {
        items.push(it('docEdit', 'edit', 'Edit bill'));
        if (d.delivery && d.delivery.status === 'pending') items.push(it('docDelivered', 'truck', 'Mark as delivered'));
        items.push(it('docChallan', 'truck', 'Print delivery challan (no prices)'));
        items.push(it('docCopyLink', 'link', 'Copy bill link'));
        if (can('returns')) items.push(it('docReturn', 'return', 'Return items'));
      }
      items.push(it('docDup', 'copy', 'Make a copy as new bill'));
      if (!d.cancelled && can('cancel')) items.push(it('docCancel', 'x', 'Cancel bill', 'data-danger'));
    }
    if (kind === 'quotes') {
      items.push(it('docEdit', 'edit', 'Edit quotation'), it('docDup', 'copy', 'Duplicate'), it('docCopyLink', 'link', 'Copy quotation link'));
      if (d.status !== 'Accepted' && d.status !== 'Converted') items.push(it('quoteStatus', 'check', 'Mark accepted', 'data-s="Accepted"'));
      if (d.status !== 'Lost' && d.status !== 'Converted') items.push(it('quoteStatus', 'x', 'Mark lost', 'data-s="Lost"'));
      items.push(it('docDelete', 'trash', 'Delete quotation', 'data-danger'));
    }
    if (kind === 'purchases') { if (!d.cancelled && can('purchases')) items.push(it('docEdit', 'edit', 'Edit purchase')); if (!d.cancelled && can('cancel')) items.push(it('docCancel', 'x', 'Cancel purchase', 'data-danger')); }
    if (kind === 'returns') { if (!d.cancelled && can('cancel')) items.push(it('docCancel', 'x', 'Cancel return', 'data-danger')); }
    openSheet({ title: KIND[kind].one + ' ' + (d.no || ''), cls: 'narrow menu', body: `<div class="menu-l">${items.join('')}</div>` });
  },
  docEdit(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id);
    if (kind === 'invoices' && !can('cancel') && daysSince(d.date) > 0) { toast('Only owner or manager can edit old bills', 'bad'); return; }
    const pay = kind === 'invoices' || kind === 'purchases' ? list('payments').find(p => p.atBilling && p[kind === 'invoices' ? 'invoiceId' : 'purchaseId'] === d.id) : null;
    const draft = newDraft(kind, {
      id: d.id, no: d.no, date: d.date, partyId: d.partyId, cust: { ...d.cust }, taxMode: d.taxMode, discAmt: d.discAmt || '', transport: d.transport || '', loading: d.loading || '', notes: d.notes || '', validDays: d.validDays, status: d.status, billNo: d.billNo || '',
      delivery: { ...(d.delivery || { status: 'delivered' }) }, referrerId: d.referrerId || '', commissionPct: d.commissionPct || '', quoteId: d.quoteId, invoiceId: d.invoiceId, invoiceNo: d.invoiceNo, reason: d.reason,
      pay: { amount: pay ? String(pay.amount) : '', mode: pay ? pay.mode : 'Cash', full: false }, updateCost: false,
      lines: d.lines.map(l => { const p = lineProduct(l); const tile = isTile(p); const per = num(l.pcsPerBox) || 1; const b = Math.floor(num(l.qty) + 1e-9); return { ...l, qtyBox: tile ? String(b) : undefined, pcs: tile ? (Math.round((num(l.qty) - b) * per) || '') : '', qty: tile ? l.qty : String(l.qty), disc: l.disc || '', area: l.area || '', newLot: null }; })
    });
    closeAll(() => openBuilder(draft));
  },
  docDup(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id);
    const draft = newDraft(kind, { partyId: d.partyId, cust: { ...d.cust }, taxMode: d.taxMode, discAmt: d.discAmt || '', transport: d.transport || '', loading: d.loading || '', notes: d.notes || '', lines: d.lines.map(l => { const p = get('products', l.productId); const per = num(l.pcsPerBox) || 1; const b = Math.floor(num(l.qty) + 1e-9); return { ...l, ...(p ? lineSnapshot(p) : {}), id: uid('ln'), rate: p ? (kind === 'purchases' ? p.cost : p.rate) : l.rate, qtyBox: isTile(p) ? String(b) : undefined, pcs: isTile(p) ? (Math.round((num(l.qty) - b) * per) || '') : '' }; }) });
    if (kind === 'invoices') draft.pay = { amount: '', mode: 'Cash', full: !d.partyId };
    closeAll(() => openBuilder(draft));
  },
  async docDelivered(el) { const d = get('invoices', el.dataset.id); await put('invoices', { ...d, delivery: { ...(d.delivery || {}), status: 'delivered', date: today() } }); closeSheet(); toast('Marked as delivered'); },
  async docCancel(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id);
    const reason = await askText({ title: `Cancel ${KIND[kind].one.toLowerCase()} ${d.no || ''}?`, text: 'Stock and credit will be reversed. It stays in records as cancelled.', label: 'Reason', ok: 'Cancel ' + KIND[kind].one.toLowerCase(), danger: true });
    if (reason === null) return;
    const writes = [{ c: kind, d: { ...d, cancelled: true, cancelReason: reason.trim(), cancelledAt: Date.now() } }];
    await put(writes);
    const pays = list('payments').filter(p => p.atBilling && (p.invoiceId === d.id || p.purchaseId === d.id));
    if (pays.length && await confirmBox({ title: 'Money taken on this bill', text: `${inr(sum(pays, p => num(p.amount)))} was recorded as paid with this bill. Remove that payment too? (Choose No if the customer left the money as advance.)`, ok: 'Remove payment', cancel: 'Keep as advance' })) for (const p of pays) await del('payments', p.id);
    if (kind === 'invoices' && d.quoteId) { const q = get('quotes', d.quoteId); if (q) await put('quotes', { ...q, status: 'Accepted' }); }
    closeSheet(); toast(KIND[kind].one + ' cancelled');
  },
  async docDelete(el) {
    const kind = el.dataset.kind, d = get(kind, el.dataset.id);
    if (!(await confirmBox({ title: 'Delete ' + KIND[kind].one.toLowerCase() + '?', text: `${esc(d.no || '')} for ${esc(d.cust.name)} will be removed.`, ok: 'Delete', danger: true }))) return;
    await del(kind, d.id); closeSheet(); setTimeout(closeSheet, 80); toast('Deleted');
  },
  async quoteStatus(el) { const d = get('quotes', el.dataset.id); await put('quotes', { ...d, status: el.dataset.s }); closeSheet(); toast('Quotation marked ' + el.dataset.s.toLowerCase()); },
  quoteToBill(el) {
    const q = get('quotes', el.dataset.id);
    const draft = newDraft('invoices', {
      quoteId: q.id, partyId: q.partyId, cust: { ...q.cust }, taxMode: q.taxMode, discAmt: q.discAmt || '', transport: q.transport || '', loading: q.loading || '', notes: q.notes || '', pay: { amount: '', mode: 'Cash', full: !q.partyId },
      lines: q.lines.map(l => { const p = get('products', l.productId); const lots = p ? lotsOf(p.id) : []; const fit = lots.find(x => x.qty >= num(l.qty)) || lots[0]; return { ...l, id: uid('ln'), lotId: fit ? fit.id : '', qtyBox: String(Math.floor(num(l.qty))), pcs: '', newLot: null }; })
    });
    closeAll(() => openBuilder(draft));
  },
  docReturn(el) {
    const inv = get('invoices', el.dataset.id);
    const already = {}; list('returns').filter(r => r.invoiceId === inv.id && !r.cancelled).forEach(r => r.lines.forEach(l => { already[l.srcLine || l.id] = (already[l.srcLine || l.id] || 0) + num(l.qty); }));
    const maxQty = {};
    const lines = inv.lines.map(l => { const id = uid('ln'); maxQty[id] = num(l.qty) - (already[l.id] || 0); return { ...l, id, srcLine: l.id, qtyBox: '', pcs: '', qty: '', area: '', disc: l.disc, newLot: null }; });
    const draft = newDraft('returns', { partyId: inv.partyId, cust: { ...inv.cust }, taxMode: inv.taxMode, invoiceId: inv.id, invoiceNo: inv.no, lines, maxQty, refund: inv.partyId ? 'credit' : 'cash' });
    closeAll(() => openBuilder(draft));
  },
  docPay(el) { const inv = get('invoices', el.dataset.id); A.receivePay({ dataset: { id: inv.partyId || '', inv: inv.id } }); }
});

/* ============ lists ============ */
function dateGroups(rows, rowFn, limit) {
  let out = '', last = '';
  rows.slice(0, limit).forEach(r => { if (r.date !== last) { last = r.date; out += `<div class="day-h">${rel(r.date) === fdate(r.date) ? fdateY(r.date) : rel(r.date) + ' · ' + fdate(r.date)}<span>${inr(sum(rows.filter(x => x.date === r.date), x => x.cancelled ? 0 : num(x.total)))}</span></div>`; } out += rowFn(r); });
  return out;
}
const docSort = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || b.updatedAt || 0) - (a.createdAt || a.updatedAt || 0);
export function invRow(i) {
  const [st, cls] = invStatus(i);
  const items = i.lines.map(l => l.name).slice(0, 2).join(', ') + (i.lines.length > 2 ? ' +' + (i.lines.length - 2) : '');
  return `<div class="row" data-act="openDoc" data-kind="invoices" data-id="${i.id}">${av(i.cust.name)}<div class="grow"><b class="t">${esc(i.cust.name)}</b><small class="muted t">${esc(i.no || 'Number pending')} · ${esc(items)}</small></div>
    <div class="r-end"><span class="amt">${inr(i.total)}</span><span>${i.delivery && i.delivery.status === 'pending' && !i.cancelled ? pill('To deliver', 'warn') + ' ' : ''}${pill(st, cls)}</span></div></div>`;
}
view('sales', {
  title: 'Sales', icon: 'sales',
  render() {
    const st = state.sales || (state.sales = { q: '', f: 'All', n: 60 });
    const F = {
      All: i => !i.cancelled, Today: i => i.date === today() && !i.cancelled, Unpaid: i => !i.cancelled && invStatus(i)[0] !== 'Paid', 'To deliver': i => !i.cancelled && i.delivery && i.delivery.status === 'pending', 'This month': i => !i.cancelled && i.date.slice(0, 7) === today().slice(0, 7), Cancelled: i => i.cancelled
    };
    const all = list('invoices').slice().sort(docSort);
    const rows = all.filter(F[st.f]).filter(i => matches(st.q, i.no, i.cust.name, i.cust.phone, i.lines.map(l => l.name).join(' ')));
    const tot = sum(rows, i => i.cancelled ? 0 : num(i.total));
    return `<div class="ph"><div><h1>Sales</h1><p>${rows.length} bills · ${inr(tot)}</p></div><div class="ph-act"><button class="btn primary" type="button" data-act="newBill">${ic('plus', 18)} New bill</button></div></div>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-sales" placeholder="Search bill no., customer, phone, design" value="${esc(st.q)}" data-in="listQ" data-v="sales" enterkeyhint="search"></div></div>
      <div class="chips">${Object.keys(F).map(k => `<button class="chip ${st.f === k ? 'on' : ''}" type="button" data-act="listF" data-v="sales" data-f="${k}">${k} <em>${all.filter(F[k]).length}</em></button>`).join('')}</div>
      <section class="card flush">${rows.length ? `<div class="rows">${dateGroups(rows, invRow, st.n)}</div>${moreBtn(st.n, rows.length, 'moreSales')}` : empty('No bills here', st.q ? 'Try a different search.' : 'Tap “New bill” to make the first one.')}</section>`;
  }
});
view('quotes', {
  title: 'Quotations', icon: 'quote',
  render() {
    const st = state.quotes || (state.quotes = { q: '', f: 'Open', n: 60 });
    const F = { Open: q => ['Sent', 'Draft', 'Accepted'].includes(quoteStatus(q)), All: () => true, Accepted: q => quoteStatus(q) === 'Accepted', Converted: q => q.status === 'Converted', Expired: q => quoteStatus(q) === 'Expired', Lost: q => q.status === 'Lost' };
    const all = list('quotes').slice().sort(docSort);
    const rows = all.filter(F[st.f]).filter(q => matches(st.q, q.no, q.cust.name, q.cust.phone));
    const open = all.filter(F.Open);
    return `<div class="ph"><div><h1>Quotations</h1><p>${open.length} open · ${inr(sum(open, q => num(q.total)))} could become sales</p></div><div class="ph-act"><button class="btn" type="button" data-act="calc">${ic('calc', 18)} Box calculator</button><button class="btn primary" type="button" data-act="newQuote">${ic('plus', 18)} New quotation</button></div></div>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-quotes" placeholder="Search quotation no. or customer" value="${esc(st.q)}" data-in="listQ" data-v="quotes" enterkeyhint="search"></div></div>
      <div class="chips">${Object.keys(F).map(k => `<button class="chip ${st.f === k ? 'on' : ''}" type="button" data-act="listF" data-v="quotes" data-f="${k}">${k} <em>${all.filter(F[k]).length}</em></button>`).join('')}</div>
      <section class="card flush">${rows.length ? `<div class="rows">${rows.slice(0, st.n).map(q => { const s = quoteStatus(q); return `<div class="row" data-act="openDoc" data-kind="quotes" data-id="${q.id}">${av(q.cust.name)}<div class="grow"><b class="t">${esc(q.cust.name)}</b><small class="muted t">${esc(q.no || '')} · ${fdate(q.date)} · ${q.lines.length} item${q.lines.length > 1 ? 's' : ''}${q.lines[0] && q.lines[0].room ? ' · ' + esc(q.lines.map(l => l.room).filter(Boolean).slice(0, 2).join(', ')) : ''}</small></div><div class="r-end"><span class="amt">${inr(q.total)}</span>${pill(s, QSTAT[s])}</div>
      ${q.cust.phone && s !== 'Converted' ? `<div class="row-acts"><button class="icon-btn wa" type="button" data-act="docWa" data-kind="quotes" data-id="${q.id}" aria-label="Send on WhatsApp">${ic('wa', 18)}</button></div>` : ''}</div>`; }).join('')}</div>${moreBtn(st.n, rows.length, 'moreQuotes')}` : empty('No quotations here', 'Make a quotation in under a minute: area in, boxes out.')}</section>`;
  }
});
view('purchases', {
  title: 'Purchases', icon: 'cart',
  render() {
    const st = state.purchases || (state.purchases = { q: '', n: 60 });
    const rows = list('purchases').slice().sort(docSort).filter(p => matches(st.q, p.no, p.billNo, p.cust && p.cust.name, (get('parties', p.partyId) || {}).name, p.lines.map(l => l.name).join(' ')));
    const month = rows.filter(p => !p.cancelled && p.date.slice(0, 7) === today().slice(0, 7));
    return `<div class="ph"><div><h1>Purchases</h1><p>Stock that came in from suppliers${can('viewCost') ? ' · this month ' + inr(sum(month, p => num(p.total))) : ''}</p></div><div class="ph-act"><button class="btn" type="button" data-act="go" data-v="suppliers">${ic('users', 18)} Suppliers</button><button class="btn primary" type="button" data-act="newPurchase">${ic('plus', 18)} Stock purchase</button></div></div>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-purchases" placeholder="Search supplier, bill no., design" value="${esc(st.q)}" data-in="listQ" data-v="purchases" enterkeyhint="search"></div></div>
      <section class="card flush">${rows.length ? `<div class="rows">${rows.slice(0, st.n).map(p => { const s = get('parties', p.partyId); return `<div class="row" data-act="openDoc" data-kind="purchases" data-id="${p.id}">${av(s ? s.name : '?', 'acc')}<div class="grow"><b class="t">${esc(s ? s.name : 'Supplier')}</b><small class="muted t">${esc(p.no || '')}${p.billNo ? ' · bill ' + esc(p.billNo) : ''} · ${fdate(p.date)} · ${esc(p.lines.map(l => l.name).slice(0, 2).join(', '))}</small></div><div class="r-end">${can('viewCost') ? `<span class="amt">${inr(p.total)}</span>` : ''}${p.cancelled ? pill('Cancelled', 'bad') : pill(fmt2(sum(p.lines, l => num(l.qty))) + ' units', 'acc')}</div></div>`; }).join('')}</div>${moreBtn(st.n, rows.length, 'morePurchases')}` : empty('No purchases yet', 'When stock arrives, enter it here with batch and shade. Stock goes up automatically.')}</section>`;
  }
});
Object.assign(A, {
  newBill: () => openBuilder(newDraft('invoices')),
  newQuote: () => openBuilder(newDraft('quotes')),
  newPurchase: () => { if (!can('purchases')) { toast('Ask the owner to enter purchases', 'bad'); return; } openBuilder(newDraft('purchases')); },
  moreSales: () => { state.sales.n += 100; go('sales'); },
  moreQuotes: () => { state.quotes.n += 100; go('quotes'); },
  morePurchases: () => { state.purchases.n += 100; go('purchases'); }
});
export { KIND };
