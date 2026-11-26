// Reports: sales, profit & loss, GST (for the CA), stock, credit, commission. Every table exports to CSV (Excel).
import { esc, ic, num, inr, inr2, inrS, fmt1, fmt2, fdate, fdateY, today, addDays, daysSince, sum, startOfMonth, endOfMonth, fyStart, monthLabel, asDate, iso, MON } from './core.js';
import { A, CH, toast, empty } from './ui.js';
import { list, get, settings, can } from './store.js';
import { periodStats, activeInvoices, activeProducts, productStock, isTile, lastSold, soldQty, creditSummary, payables, calcDoc, cfg, lotsOf, qtyText, stockValue } from './logic.js';
import { view, go, state, kpi, bars, hbars, sw } from './parts.js';

const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['lastmonth', 'Last month'], ['quarter', 'Last 3 months'], ['fy', 'This financial year'], ['custom', 'Custom']];
function range(st) {
  const t = today();
  switch (st.r) {
    case 'today': return [t, t];
    case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
    case 'week': return [addDays(t, -6), t];
    case 'lastmonth': return [startOfMonth(1), endOfMonth(1)];
    case 'quarter': return [addDays(t, -89), t];
    case 'fy': return [fyStart(t), t];
    case 'custom': return [st.a || startOfMonth(0), st.b || t];
    default: return [startOfMonth(0), t];
  }
}
const TABS = [['summary', 'Summary'], ['items', 'Item-wise'], ['customers', 'Customer-wise'], ['gst', 'GST'], ['stock', 'Stock'], ['credit', 'Credit'], ['commission', 'Commission'], ['staff', 'Staff']];
let lastTable = null;

view('reports', {
  title: 'Reports', icon: 'chart',
  render() {
    if (!can('reports')) return empty('Reports are for the owner', 'Ask the owner to see sales and profit reports.');
    const st = state.reports || (state.reports = { tab: 'summary', r: 'month', a: '', b: '' });
    const [a, b] = range(st);
    const body = ({ summary, items, customers, gst, stock, credit, commission, staff })[st.tab](a, b);
    return `<div class="ph"><div><h1>Reports</h1><p>${fdateY(a)}${a !== b ? ' – ' + fdateY(b) : ''}</p></div><div class="ph-act"><button class="btn" type="button" data-act="csv">${ic('download', 18)} Excel (CSV)</button><button class="btn" type="button" data-act="printReport">${ic('print', 18)} Print</button></div></div>
      <div class="chips tabs">${TABS.map(([k, l]) => `<button class="chip ${st.tab === k ? 'on' : ''}" type="button" data-act="repTab" data-t="${k}">${l}</button>`).join('')}</div>
      ${!['stock', 'credit'].includes(st.tab) ? `<div class="toolbar"><select class="sel-sm" data-ch="repRange" aria-label="Period">${RANGES.map(([k, l]) => `<option value="${k}" ${st.r === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${st.r === 'custom' ? `<input type="date" class="sel-sm" value="${a}" data-ch="repA" aria-label="From"><input type="date" class="sel-sm" value="${b}" data-ch="repB" aria-label="To">` : ''}</div>` : ''}
      <div id="report">${body}</div>`;
  }
});
CH.repRange = el => { state.reports.r = el.value; go('reports'); };
CH.repA = el => { state.reports.a = el.value; go('reports'); };
CH.repB = el => { state.reports.b = el.value; go('reports'); };
A.repTab = el => { state.reports.tab = el.dataset.t; go('reports'); };

function table(title, head, rows, foot) {
  lastTable = { title, head, rows, foot };
  const numCol = head.map((h, i) => /₹|^#|^(Qty|Sq ft|Boxes)/.test(h) || rows.some(r => typeof r[i] === 'number'));
  const cell = (v, i) => `<td class="${numCol[i] ? 'n' : ''}">${typeof v === 'number' ? (/₹/.test(head[i]) ? inr2(v) : v.toLocaleString('en-IN')) : esc(v)}</td>`;
  return `<div class="tbl-w"><table class="tbl rep"><thead><tr>${head.map((h, i) => `<th class="${numCol[i] ? 'n' : ''}">${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('') || `<tr><td colspan="${head.length}" class="muted">Nothing in this period</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map(cell).join('')}</tr></tfoot>` : ''}</table></div>`;
}

function summary(a, b) {
  const s = periodStats(a, b);
  const days = Math.round((asDate(b) - asDate(a)) / 864e5) + 1;
  const series = [];
  if (days <= 62) { const m = new Map(); s.inv.forEach(i => m.set(i.date, (m.get(i.date) || 0) + num(i.total))); for (let d = a; d <= b; d = addDays(d, 1)) series.push({ v: m.get(d) || 0, t: fdate(d), l: days <= 10 || asDate(d).getDate() % 5 === 0 ? String(asDate(d).getDate()) : '' }); }
  else { const m = new Map(); s.inv.forEach(i => m.set(i.date.slice(0, 7), (m.get(i.date.slice(0, 7)) || 0) + num(i.total))); for (let d = a.slice(0, 7); d <= b.slice(0, 7);) { series.push({ v: m.get(d) || 0, t: monthLabel(d), l: MON[+d.slice(5) - 1] }); const [y, mo] = d.split('-').map(Number); d = mo === 12 ? (y + 1) + '-01' : y + '-' + String(mo + 1).padStart(2, '0'); } }
  const byCat = {}; s.exps.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + num(e.amount));
  const damage = sum(list('adjustments').filter(x => x.date >= a && x.date <= b && x.reason === 'Damaged'), x => num(x.value));
  const pl = [['Sales (incl. GST & charges)', s.sales], ['Less: returns', -s.returns], ['GST collected', s.tax], ['Sales without GST (taxable)', s.taxable], ['Cost of tiles sold', -s.cogs], ['Gross margin', s.gp], ...Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => ['Expense: ' + k, -v]), ['Stock damaged (at cost, not in expenses)', -damage], ['Net profit (estimate)', s.profit - damage]];
  lastTable = { title: 'Profit & loss', head: ['Item', 'Amount ₹'], rows: pl };
  return `<div class="kpis">${kpi('Sales', inr(s.sales), s.n + ' bills · ' + fmt1(s.sqft) + ' sq ft', { cls: 'hero' })}${kpi('Gross margin', inr(s.gp), s.taxable ? fmt1(s.gp / s.taxable * 100) + '% of taxable sales' : '')}${kpi('Expenses', inr(s.exp), s.sales ? fmt1(s.exp / s.sales * 100) + '% of sales' : '')}${kpi('Net profit (est.)', inr(s.profit - damage), damage ? 'after ' + inrS(damage) + ' breakage' : '')}</div>
    <div class="strip"><div><small>Money received</small><b class="good">${inr(s.collected)}</b></div><div><small>GST collected</small><b>${inr(s.tax)}</b></div><div><small>Returns</small><b>${inr(s.returns)}</b></div><div><small>Average bill</small><b>${inr(s.n ? s.sales / s.n : 0)}</b></div></div>
    <section class="card"><div class="card-h"><h3>Sales trend</h3></div>${bars(series, { highlightLast: false })}</section>
    <section class="card"><div class="card-h"><h3>Profit & loss</h3><span class="muted">Estimate from your cost prices</span></div>
      <div class="pl">${pl.map(([k, v], i) => `<div class="${/^(Gross margin|Net profit)/.test(k) ? 'g' : ''}"><span>${esc(k)}</span><b class="${v < 0 ? 'bad-t' : ''}">${v < 0 ? '− ' : ''}${inr(Math.abs(v))}</b></div>`).join('')}</div></section>`;
}
function items(a, b) {
  const s = periodStats(a, b); const m = new Map();
  for (const i of s.inv) { const c = calcDoc(i); for (const x of c.lines) { const k = x.l.productId; const r = m.get(k) || { name: x.l.name, size: x.l.size || '', cat: (get('products', k) || {}).category || '', qty: 0, sqft: 0, taxable: 0, cogs: 0, bills: 0 }; r.qty += x.qty; r.sqft += x.sqft; r.taxable += x.taxable; r.cogs += x.cogs; r.bills++; m.set(k, r); } }
  const rows = [...m.values()].sort((x, y) => y.taxable - x.taxable);
  const byCat = {}; rows.forEach(r => byCat[r.cat || 'Other'] = (byCat[r.cat || 'Other'] || 0) + r.taxable);
  return `<section class="card"><div class="card-h"><h3>By category</h3></div>${hbars(Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([t, v]) => ({ t, v })))}</section>` +
    table('Item-wise sales', ['Design', 'Size', 'Category', '#Bills', 'Qty', 'Sq ft', 'Sales ₹ (taxable)', 'Margin ₹', 'Margin %'], rows.map(r => [r.name, r.size, r.cat, r.bills, Math.round(r.qty * 100) / 100, Math.round(r.sqft), r.taxable, r.taxable - r.cogs, r.taxable ? Math.round((r.taxable - r.cogs) / r.taxable * 1000) / 10 + '%' : '']), ['Total', '', '', sum(rows, r => r.bills), Math.round(sum(rows, r => r.qty)), Math.round(sum(rows, r => r.sqft)), sum(rows, r => r.taxable), sum(rows, r => r.taxable - r.cogs), '']);
}
function customers(a, b) {
  const s = periodStats(a, b); const m = new Map();
  for (const i of s.inv) { const k = i.partyId || 'walk:' + (i.cust.phone || i.cust.name); const r = m.get(k) || { name: i.cust.name, kind: i.partyId ? (get('parties', i.partyId) || {}).kind || '' : 'Walk-in', phone: i.cust.phone || '', bills: 0, sales: 0, sqft: 0 }; r.bills++; r.sales += num(i.total); r.sqft += num(i.sqft); m.set(k, r); }
  const rows = [...m.values()].sort((x, y) => y.sales - x.sales);
  return table('Customer-wise sales', ['Customer', 'Type', 'Phone', '#Bills', 'Sq ft', 'Sales ₹'], rows.map(r => [r.name, r.kind, r.phone, r.bills, Math.round(r.sqft), r.sales]), ['Total', '', '', sum(rows, r => r.bills), Math.round(sum(rows, r => r.sqft)), sum(rows, r => r.sales)]);
}
function gst(a, b) {
  const s = periodStats(a, b);
  const shop = settings();
  const b2b = [], b2c = {}, hsn = {};
  let tt = 0, tc = 0, ts = 0, ti = 0;
  for (const i of s.inv) {
    const c = calcDoc(i);
    tt += c.taxable; tc += c.cgst; ts += c.sgst; ti += c.igst;
    if (i.cust && i.cust.gstin) b2b.push([i.no || '', fdate(i.date), i.cust.name, i.cust.gstin, c.taxable, c.cgst, c.sgst, c.igst, c.total]);
    else for (const [r, v] of Object.entries(c.rates)) { const k = r + (c.inter ? ' IGST' : ''); b2c[k] = b2c[k] || { taxable: 0, tax: 0 }; b2c[k].taxable += v.taxable; b2c[k].tax += v.tax; }
    for (const h of c.hsn) { const k = h.hsn + '@' + h.rate; hsn[k] = hsn[k] || { hsn: h.hsn, rate: h.rate, qty: 0, sqft: 0, taxable: 0, tax: 0 }; hsn[k].qty += h.qty; hsn[k].sqft += h.sqft; hsn[k].taxable += h.taxable; hsn[k].tax += h.tax; }
  }
  const rt = list('returns').filter(r => !r.cancelled && r.date >= a && r.date <= b);
  const purs = list('purchases').filter(p => !p.cancelled && p.date >= a && p.date <= b);
  const itc = sum(purs, p => num(p.tax));
  const html = `<div class="kpis">${kpi('Taxable sales', inr(tt), s.n + ' bills', { cls: 'hero' })}${kpi('Output GST', inr(tc + ts + ti), `CGST ${inrS(tc)} · SGST ${inrS(ts)}${ti ? ' · IGST ' + inrS(ti) : ''}`)}${kpi('GST on purchases (ITC)', inr(itc), purs.length + ' purchase bills')}${kpi('Net GST payable (approx.)', inr(tc + ts + ti - itc - sum(rt, r => num(r.tax))), 'Check with your CA')}</div>
    <p class="note">${shop.gstin ? 'GSTIN ' + esc(shop.gstin) + '. ' : '<b>Add your GSTIN in Settings.</b> '}Download each table as Excel (CSV) for your CA. B2B = bills with customer GSTIN.</p>
    <section class="card"><div class="card-h"><h3>B2B bills (${b2b.length})</h3><button class="link" type="button" data-act="csvOf" data-t="b2b">${ic('download', 16)} CSV</button></div>${table('GST B2B', ['Bill no.', 'Date', 'Customer', 'GSTIN', 'Taxable ₹', 'CGST ₹', 'SGST ₹', 'IGST ₹', 'Total ₹'], b2b)}</section>`;
  const t1 = lastTable;
  const html2 = `<section class="card"><div class="card-h"><h3>B2C (no GSTIN) by rate</h3><button class="link" type="button" data-act="csvOf" data-t="b2c">${ic('download', 16)} CSV</button></div>${table('GST B2C', ['GST rate', 'Taxable ₹', 'Tax ₹'], Object.entries(b2c).map(([k, v]) => [k + '%', v.taxable, v.tax]))}</section>`;
  const t2 = lastTable;
  const html3 = `<section class="card"><div class="card-h"><h3>HSN summary</h3><button class="link" type="button" data-act="csvOf" data-t="hsn">${ic('download', 16)} CSV</button></div>${table('GST HSN summary', ['HSN', 'GST rate', 'Qty', 'Sq ft', 'Taxable ₹', 'Tax ₹'], Object.values(hsn).map(h => [h.hsn, h.rate + '%', Math.round(h.qty * 100) / 100, Math.round(h.sqft), h.taxable, h.tax]))}</section>`;
  const t3 = lastTable;
  gstTables = { b2b: t1, b2c: t2, hsn: t3 };
  lastTable = t1;
  return html + html2 + html3;
}
let gstTables = {};
function stock() {
  const ps = activeProducts(); const sold = lastSold(); const s90 = soldQty(90);
  const rows = ps.map(p => { const q = productStock(p.id); const unit = isTile(p) && (p.priceOn || 'sqft') === 'sqft' ? num(p.sqftPerBox) * num(p.cost) : num(p.cost); const ls = sold.get(p.id); return { p, q, val: Math.max(0, q) * unit, ls, days: ls ? daysSince(ls) : null, s90: s90.get(p.id) || 0 }; });
  const dead = rows.filter(r => r.q > 0 && (r.days == null || r.days > 90));
  const reorder = rows.filter(r => r.q <= num(r.p.min));
  const html = `<div class="kpis">${kpi('Stock value (cost)', inr(stockValue()), ps.length + ' designs', { cls: 'hero' })}${kpi('Dead stock (no sale 90 days)', inr(sum(dead, r => r.val)), dead.length + ' designs')}${kpi('To reorder', String(reorder.length), 'below minimum')}${kpi('Boxes in stock', fmt1(sum(rows.filter(r => isTile(r.p)), r => Math.max(0, r.q))), fmt1(sum(rows.filter(r => isTile(r.p)), r => Math.max(0, r.q) * num(r.p.sqftPerBox))) + ' sq ft')}</div>
    ${reorder.length ? `<section class="card"><div class="card-h"><h3>Reorder list</h3><button class="link" type="button" data-act="reorderWa">${ic('wa', 16)} Send to supplier</button></div><div class="rows">${reorder.map(r => `<div class="row" data-act="product" data-id="${r.p.id}">${sw(r.p, 'sm')}<div class="grow"><b class="t">${esc(r.p.name)} · ${esc(r.p.size || '')}</b><small class="muted">${esc(r.p.brand || '')} · sold ${fmt1(r.s90)} in 90 days</small></div><div class="r-end"><b class="${r.q <= 0 ? 'bad-t' : 'warn-t'}">${esc(qtyText(r.q, r.p))}</b><small class="muted">min ${fmt1(r.p.min)}</small></div></div>`).join('')}</div></section>` : ''}`;
  return html + table('Stock statement', ['Design', 'Size', 'Brand', 'Qty', 'Sq ft', 'Value ₹ (cost)', 'Sold 90 days', 'Last sold'], rows.sort((a, b) => b.val - a.val).map(r => [r.p.name, r.p.size || '', r.p.brand || '', Math.round(r.q * 100) / 100, isTile(r.p) ? Math.round(r.q * num(r.p.sqftPerBox)) : '', r.val, Math.round(r.s90 * 100) / 100, r.ls ? fdate(r.ls) + ' (' + r.days + 'd)' : 'Never']), ['Total', '', '', '', '', sum(rows, r => r.val), '', '']);
}
function credit() {
  const cs = creditSummary(); const pay = payables();
  const rows = cs.rows.filter(r => r.x.out > 0.5).sort((a, b) => b.x.out - a.x.out);
  return `<div class="kpis">${kpi('Customers owe you', inr(cs.total), cs.parties + ' customers', { cls: 'hero' })}${kpi('0–30 days', inr(cs.b[0]))}${kpi('31–90 days', inr(cs.b[1] + cs.b[2]))}${kpi('Over 90 days', inr(cs.b[3]))}</div>` +
    table('Outstanding (receivable)', ['Customer', 'Type', 'Phone', 'Due ₹', '0–30 ₹', '31–60 ₹', '61–90 ₹', '90+ ₹', 'Oldest (days)'], rows.map(({ c, x }) => [c.name, c.kind || '', c.phone || '', x.out, x.b[0], x.b[1], x.b[2], x.b[3], x.oldest]), ['Total', '', '', sum(rows, r => r.x.out), cs.b[0], cs.b[1], cs.b[2], cs.b[3], '']) +
    `<section class="card"><div class="card-h"><h3>You owe suppliers: ${inr(pay.total)}</h3></div><div class="rows">${pay.rows.filter(r => r.x.out > 0.5).map(r => `<div class="row" data-act="party" data-id="${r.s.id}"><div class="grow"><b>${esc(r.s.name)}</b></div><b>${inr(r.x.out)}</b></div>`).join('') || '<p class="muted">Nothing due.</p>'}</div></section>`;
}
function commission(a, b) {
  const m = new Map();
  for (const i of periodStats(a, b).inv) { if (!i.referrerId) continue; const r = m.get(i.referrerId) || { bills: 0, taxable: 0, comm: 0 }; r.bills++; r.taxable += num(i.taxable); r.comm += num(i.taxable) * num(i.commissionPct) / 100; m.set(i.referrerId, r); }
  const paid = new Map(); list('expenses').filter(e => e.cat === 'Commission' && e.date >= a && e.date <= b).forEach(e => { const k = e.partyId || ''; paid.set(k, (paid.get(k) || 0) + num(e.amount)); });
  const rows = [...m.entries()].map(([id, r]) => { const p = get('parties', id) || { name: '?' }; return [p.name, p.kind || '', r.bills, r.taxable, r.comm]; }).sort((x, y) => y[4] - x[4]);
  return `<p class="note">Bills marked “Referred by” an architect, mistri or contractor. Pay commission from Expenses → Commission.</p>` + table('Commission earned', ['Referred by', 'Type', '#Bills', 'Sales ₹ (taxable)', 'Commission ₹'], rows, ['Total', '', sum(rows, r => r[2]), sum(rows, r => r[3]), sum(rows, r => r[4])]) + `<p class="muted" style="margin-top:8px">Commission paid in this period (Expenses): ${inr(sum([...paid.values()]))}</p>`;
}
function staff(a, b) {
  const m = new Map();
  for (const i of periodStats(a, b).inv) { const k = i.createdBy || 'Unknown'; const r = m.get(k) || { bills: 0, sales: 0, sqft: 0 }; r.bills++; r.sales += num(i.total); r.sqft += num(i.sqft); m.set(k, r); }
  const q = new Map(); list('quotes').filter(x => x.date >= a && x.date <= b).forEach(x => { const k = x.createdBy || 'Unknown'; const r = q.get(k) || { n: 0, conv: 0 }; r.n++; if (x.status === 'Converted') r.conv++; q.set(k, r); });
  const names = [...new Set([...m.keys(), ...q.keys()])];
  return table('Sales by staff', ['Staff', '#Bills', 'Sq ft', 'Sales ₹', '#Quotes', 'Quotes converted'], names.map(n => { const r = m.get(n) || { bills: 0, sales: 0, sqft: 0 }; const x = q.get(n) || { n: 0, conv: 0 }; return [n, r.bills, Math.round(r.sqft), r.sales, x.n, x.n ? x.conv + ' (' + Math.round(x.conv / x.n * 100) + '%)' : '']; }).sort((x, y) => y[3] - x[3]));
}

function toCsv(t) {
  const q = v => { const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '﻿' + [t.head.map(h => h.replace(/^#/, '')), ...t.rows, ...(t.foot ? [t.foot] : [])].map(r => r.map(q).join(',')).join('\r\n');
}
function download(name, text, type = 'text/csv') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
export { download };
Object.assign(A, {
  csv() { if (!lastTable) { toast('Nothing to export here', 'bad'); return; } const [a, b] = range(state.reports); download(`${lastTable.title.replace(/\W+/g, '-')}_${a}_${b}.csv`, toCsv(lastTable)); toast('Downloaded ' + lastTable.title); },
  csvOf(el) { const t = gstTables[el.dataset.t]; if (!t) return; const [a, b] = range(state.reports); download(`${t.title.replace(/\W+/g, '-')}_${a}_${b}.csv`, toCsv(t)); },
  printReport() { const s = settings(); const [a, b] = range(state.reports); import('./docs.js').then(m => m.printHtml(`<article class="paper report-print"><div class="paper-h"><div><span class="shop">${esc(s.shopName || '')}</span>${s.gstin ? `<small>GSTIN ${esc(s.gstin)}</small>` : ''}</div><div class="doc-tag"><span>REPORT</span><b>${esc(TABS.find(t => t[0] === state.reports.tab)[1])}</b><small>${fdateY(a)} – ${fdateY(b)}</small></div></div>${document.getElementById('report').innerHTML}</article>`)); },
  reorderWa() {
    const rows = activeProducts().filter(p => productStock(p.id) <= num(p.min));
    const by = {}; rows.forEach(p => { (by[p.brand || 'Other'] = by[p.brand || 'Other'] || []).push(p); });
    const text = `*Order from ${settings().shopName || ''}*\n` + Object.entries(by).map(([b, ps]) => `\n${b}:\n` + ps.map(p => `• ${p.name} ${p.size || ''}${p.finish ? ' ' + p.finish : ''}: ${Math.max(num(p.min) * 2 - Math.max(0, productStock(p.id)), num(p.min))} ${isTile(p) ? 'boxes' : (p.uom || 'pcs')}`).join('\n')).join('\n') + '\n\nPlease confirm rates and dispatch date.';
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  }
});
