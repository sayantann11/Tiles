// Printable documents (invoice, quotation, credit note, purchase, delivery challan, receipt), UPI QR, WhatsApp text.
import { esc, inr, inr2, fmt2, fdateY, words, stateName, num, addDays } from './core.js';
import { calcDoc, qtyText, isTile, lineProduct, invoicePaid } from './logic.js';

const KIND = {
  invoices: d => d.taxMode === 'none' ? 'BILL OF SUPPLY' : 'TAX INVOICE',
  quotes: () => 'QUOTATION', returns: () => 'CREDIT NOTE', purchases: () => 'PURCHASE', challan: () => 'DELIVERY CHALLAN'
};

let qrLib = null;
export async function qrSvg(text, cell = 3) {
  if (!qrLib) qrLib = (await import('./vendor/qrcode.mjs')).default;
  const q = qrLib(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
export function upiLink(shop, amount, note) {
  if (!shop.upi) return '';
  const p = new URLSearchParams({ pa: shop.upi, pn: (shop.shopName || 'Shop').slice(0, 40), cu: 'INR' });
  if (amount > 0) p.set('am', (Math.round(amount * 100) / 100).toFixed(2));
  if (note) p.set('tn', note.slice(0, 40));
  return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
}

function shopHead(shop, title, doc, kind) {
  const addr = [shop.address, shop.city, shop.pin, shop.state].filter(Boolean).join(', ');
  return `<div class="paper-h">
    <div class="ph-shop">${shop.logo ? `<img class="p-logo" src="${esc(shop.logo)}" alt="">` : ''}<div>
      <span class="shop">${esc(shop.shopName || 'Your Shop Name')}</span>
      ${shop.tagline ? `<small>${esc(shop.tagline)}</small>` : ''}
      ${addr ? `<small>${esc(addr)}</small>` : ''}
      <small>${[shop.phone ? 'Ph: ' + esc(shop.phone) : '', shop.email ? esc(shop.email) : ''].filter(Boolean).join(' · ')}</small>
      ${shop.gstin ? `<small><b>GSTIN: ${esc(shop.gstin)}</b></small>` : ''}
    </div></div>
    <div class="doc-tag"><span>${title}</span><b>${esc(doc.no || 'Draft (number on sync)')}</b><small>Date: ${fdateY(doc.date)}</small>
      ${kind === 'quotes' ? `<small>Valid till: ${fdateY(addDays(doc.date, num(doc.validDays || 15)))}</small>` : ''}
      ${kind === 'purchases' && doc.billNo ? `<small>Supplier bill: ${esc(doc.billNo)}</small>` : ''}
      ${doc.cancelled ? '<small class="p-cancel">CANCELLED</small>' : ''}
    </div></div>`;
}
function partyBlock(doc, kind, shop) {
  const c = doc.cust || {};
  const pos = c.stateCode || shop.stateCode;
  return `<div class="p-party"><div><small>${kind === 'purchases' ? 'Supplier' : kind === 'quotes' ? 'Quotation for' : 'Bill to'}</small>
    <b>${esc(c.name || 'Cash customer')}</b>
    ${c.address ? `<small>${esc(c.address)}</small>` : ''}
    ${c.phone ? `<small>Ph: ${esc(c.phone)}</small>` : ''}
    ${c.gstin ? `<small>GSTIN: ${esc(c.gstin)}</small>` : ''}</div>
    <div class="p-meta">${kind !== 'quotes' && pos ? `<small>Place of supply: ${esc(stateName(pos) || pos)} (${esc(pos)})</small>` : ''}
    ${doc.site ? `<small>Site: ${esc(doc.site)}</small>` : ''}
    ${doc.delivery && doc.delivery.vehicle ? `<small>Vehicle: ${esc(doc.delivery.vehicle)}</small>` : ''}
    ${doc.invoiceNo ? `<small>Against bill: ${esc(doc.invoiceNo)}</small>` : ''}</div></div>`;
}

export function paper(kind, doc, shop, opt = {}) {
  const c = calcDoc(doc);
  const challan = opt.challan;
  const title = challan ? KIND.challan() : KIND[kind](doc);
  const showRoom = c.lines.some(x => x.l.room || x.l.area);
  const tax = c.mode !== 'none';
  const rows = c.lines.map((x, i) => {
    const p = x.p || {};
    const lot = x.l.batch || x.l.shade ? `Batch ${esc(x.l.batch || '')}${x.l.shade ? ' · Shade ' + esc(x.l.shade) : ''}` : '';
    const desc = `<b>${esc(x.l.name || p.name || 'Item')}</b><small>${esc([x.l.size || p.size, x.l.finish || p.finish].filter(Boolean).join(' · '))}${lot ? ' · ' + lot : ''}</small>${showRoom && (x.l.room || x.l.area) ? `<small>${esc(x.l.room || '')}${x.l.area ? ' · ' + fmt2(x.l.area) + ' sq ft + ' + num(x.l.wastage) + '% wastage' : ''}</small>` : ''}`;
    const tile = isTile(p) || num(x.l.sqftPerBox) > 0;
    if (challan) return `<tr><td>${i + 1}</td><td>${desc}</td><td class="n">${qtyText(x.qty, p)}</td><td class="n">${tile ? fmt2(x.sqft) : ''}</td><td>${esc(x.l.location || '')}</td></tr>`;
    return `<tr><td>${i + 1}</td><td>${desc}</td><td>${esc(x.l.hsn || p.hsn || '')}</td><td class="n">${qtyText(x.qty, p)}</td><td class="n">${tile ? fmt2(x.sqft) : ''}</td>
      <td class="n">${inr2(x.l.rate)}<small>${tile && (x.l.priceOn || 'sqft') === 'sqft' ? '/sq ft' : ''}</small></td>
      ${c.lineDisc ? `<td class="n">${num(x.l.disc) ? fmt2(x.l.disc) + '%' : ''}</td>` : ''}
      ${tax ? `<td class="n">${inr2(x.taxable)}</td><td class="n">${fmt2(x.g)}%</td>` : ''}
      <td class="n"><b>${inr2(x.amount)}</b></td></tr>`;
  }).join('');
  const head = challan
    ? '<tr><th>#</th><th>Item</th><th class="n">Qty</th><th class="n">Sq ft</th><th>From</th></tr>'
    : `<tr><th>#</th><th>Item</th><th>HSN</th><th class="n">Qty</th><th class="n">Sq ft</th><th class="n">Rate</th>${c.lineDisc ? '<th class="n">Disc</th>' : ''}${tax ? '<th class="n">Taxable</th><th class="n">GST</th>' : ''}<th class="n">Amount</th></tr>`;
  const paid = kind === 'invoices' && !opt.noPaid ? (opt.paid != null ? opt.paid : invoicePaid(doc)) : 0;
  const due = c.total - paid;
  const totals = challan ? `<div class="ptot"><div><span>Total boxes</span><b>${fmt2(c.boxes)}</b></div><div><span>Total sq ft</span><b>${fmt2(c.sqft)}</b></div></div>` : `<div class="ptot">
      <div><span>Gross</span><span>${inr2(c.gross)}</span></div>
      ${c.discount ? `<div><span>Discount</span><span>− ${inr2(c.discount)}</span></div>` : ''}
      ${tax ? `<div><span>Taxable value${c.mode === 'incl' ? ' (rates incl. GST)' : ''}</span><span>${inr2(c.taxable)}</span></div>
      ${c.inter ? `<div><span>IGST</span><span>${inr2(c.igst)}</span></div>` : `<div><span>CGST</span><span>${inr2(c.cgst)}</span></div><div><span>SGST</span><span>${inr2(c.sgst)}</span></div>`}` : ''}
      ${c.transport ? `<div><span>Transport</span><span>${inr2(c.transport)}</span></div>` : ''}
      ${c.loading ? `<div><span>Loading / unloading</span><span>${inr2(c.loading)}</span></div>` : ''}
      ${Math.abs(c.roundOff) >= 0.005 ? `<div><span>Round off</span><span>${c.roundOff > 0 ? '+' : '−'} ${inr2(Math.abs(c.roundOff))}</span></div>` : ''}
      <div class="g"><span>${kind === 'quotes' ? 'Estimated total' : 'Grand total'}</span><span>${inr(c.total)}</span></div>
      ${kind === 'invoices' && paid > 0.5 ? `<div><span>Paid</span><span>${inr(paid)}</span></div>` : ''}
      ${kind === 'invoices' && due > 0.5 && !doc.cancelled ? `<div class="due"><span>Balance due</span><span>${inr(due)}</span></div>` : ''}
    </div>`;
  const rateRows = tax && !challan ? Object.entries(c.rates).filter(([, v]) => v.taxable).map(([r, v]) => `<tr><td>${fmt2(+r)}%</td><td class="n">${inr2(v.taxable)}</td>${c.inter ? `<td class="n">${inr2(v.tax)}</td>` : `<td class="n">${inr2(v.tax / 2)}</td><td class="n">${inr2(v.tax / 2)}</td>`}</tr>`).join('') : '';
  const terms = (kind === 'quotes' ? shop.quoteTerms : kind === 'invoices' ? shop.terms : '') || '';
  const bank = shop.bank && shop.bank.acc && kind !== 'purchases' && !challan ? `<div class="p-bank"><small><b>Bank:</b> ${esc(shop.bank.name || '')} · A/c ${esc(shop.bank.acc)} · IFSC ${esc(shop.bank.ifsc || '')}${shop.bank.branch ? ' · ' + esc(shop.bank.branch) : ''}</small>${shop.upi ? `<small><b>UPI:</b> ${esc(shop.upi)}</small>` : ''}</div>` : (shop.upi && kind !== 'purchases' && !challan ? `<div class="p-bank"><small><b>UPI:</b> ${esc(shop.upi)}</small></div>` : '');
  const qrSlot = shop.upi && shop.showUpiQr !== false && kind === 'invoices' && due > 0.5 && !doc.cancelled && !challan ? `<div class="p-qr" data-upi="${esc(upiLink(shop, due, doc.no || ''))}"><div class="qr-box"></div><small>Scan to pay ${inr(due)}</small></div>` : '';
  return `<article class="paper ${opt.thermal ? 'thermal' : ''}">
    ${shopHead(shop, title, doc, kind)}
    ${partyBlock(doc, kind, shop)}
    <div class="ptable-w"><table class="ptable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    <div class="p-sum">
      <div class="p-left">
        ${!challan ? `<p class="p-words">${words(c.total)}</p>` : ''}
        ${rateRows ? `<table class="ptax"><thead><tr><th>GST</th><th class="n">Taxable</th>${c.inter ? '<th class="n">IGST</th>' : '<th class="n">CGST</th><th class="n">SGST</th>'}</tr></thead><tbody>${rateRows}</tbody></table>` : ''}
        ${!challan ? `<p class="p-qty">${c.boxes ? fmt2(c.boxes) + ' boxes · ' : ''}${c.sqft ? fmt2(c.sqft) + ' sq ft' : ''}</p>` : ''}
        ${doc.notes ? `<p class="p-note">${esc(doc.notes)}</p>` : ''}
        ${doc.reason ? `<p class="p-note">Reason: ${esc(doc.reason)}</p>` : ''}
        ${bank}${qrSlot}
      </div>
      ${totals}
    </div>
    ${terms ? `<ol class="terms">${terms.split('\n').filter(Boolean).map(t => `<li>${esc(t)}</li>`).join('')}</ol>` : ''}
    <div class="p-sign"><div><small>${challan ? 'Received the above goods in good condition' : "Customer's signature"}</small></div><div><small>For ${esc(shop.shopName || '')}</small><small class="p-auth">Authorised signatory</small></div></div>
    ${doc.cancelled ? '<div class="p-stamp">CANCELLED</div>' : ''}
  </article>`;
}

export function receiptPaper(pay, party, shop) {
  return `<article class="paper">
    ${shopHead(shop, pay.dir === 'out' ? 'PAYMENT VOUCHER' : 'RECEIPT', pay, 'payments')}
    <div class="p-receipt">
      <p>${pay.dir === 'out' ? 'Paid to' : 'Received with thanks from'} <b>${esc(party ? party.name : (pay.name || 'Customer'))}</b></p>
      <p>the sum of <b>${inr(pay.amount)}</b> <span class="muted">(${words(pay.amount)})</span></p>
      <p>by <b>${esc(pay.mode || 'Cash')}</b>${pay.ref ? ' · Ref: ' + esc(pay.ref) : ''}${pay.invoiceNo ? ' against bill ' + esc(pay.invoiceNo) : ''}.</p>
      ${pay.balanceAfter != null ? `<p class="muted">Balance after this payment: ${inr(pay.balanceAfter)}</p>` : ''}
    </div>
    <div class="p-sign"><div></div><div><small>For ${esc(shop.shopName || '')}</small><small class="p-auth">Authorised signatory</small></div></div>
  </article>`;
}

// fill UPI QR placeholders inside an element
export async function hydrateQr(root) {
  for (const el of root.querySelectorAll('.p-qr[data-upi]')) {
    const box = el.querySelector('.qr-box'); if (!box || box.dataset.done) continue;
    try { box.innerHTML = await qrSvg(el.dataset.upi); box.dataset.done = '1'; } catch { el.remove(); }
  }
}

export async function printHtml(html, { thermal = false } = {}) {
  const host = document.getElementById('print');
  host.className = thermal ? 'thermal' : '';
  host.innerHTML = html;
  await hydrateQr(host);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.print();
}

export function docText(kind, doc, shop, link, paid) {
  const c = calcDoc(doc);
  const name = { invoices: 'Bill', quotes: 'Quotation', returns: 'Credit note' }[kind] || 'Document';
  const lines = c.lines.slice(0, 12).map(x => `• ${x.l.name || (x.p && x.p.name)}${x.l.size ? ' (' + x.l.size + ')' : ''}: ${qtyText(x.qty, x.p)}${x.sqft ? ' = ' + fmt2(x.sqft) + ' sq ft' : ''}`).join('\n');
  let t = `*${shop.shopName || 'Our shop'}*\n${name} ${doc.no || ''} · ${fdateY(doc.date)}\n\nDear ${(doc.cust && doc.cust.name) || 'Customer'},\n${lines}${c.lines.length > 12 ? '\n…and ' + (c.lines.length - 12) + ' more' : ''}\n\n*Total: ${inr(c.total)}*`;
  if (kind === 'invoices' && paid != null) { const due = c.total - paid; if (paid > 0.5) t += `\nPaid: ${inr(paid)}`; if (due > 0.5) t += `\n*Balance: ${inr(due)}*`; }
  if (kind === 'quotes') t += `\nValid till ${fdateY(addDays(doc.date, num(doc.validDays || 15)))}`;
  if (link) t += `\n\nView ${name.toLowerCase()}: ${link}`;
  if (shop.upi && kind === 'invoices') t += `\nUPI: ${shop.upi}`;
  t += `\n\nThank you!${shop.phone ? '\n' + shop.phone : ''}`;
  return t;
}
export { lineProduct };
