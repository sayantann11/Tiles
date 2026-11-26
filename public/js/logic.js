// Business rules: document totals + GST, stock by lot, party ledgers with FIFO ageing, profit.
import { num, r2, today, daysSince, sum, inRange } from './core.js';
import { list, get, settings, S } from './store.js';

export const DEFAULTS = {
  godowns: ['Showroom', 'Godown 1', 'Godown 2'],
  categories: ['Floor', 'Wall', 'Wood', 'Outdoor', 'Elevation', 'Sanitary', 'Adhesive & Grout'],
  expenseCats: ['Transport', 'Loading / Hamali', 'Commission', 'Breakage', 'Salaries', 'Rent', 'Electricity', 'Marketing', 'Shop & Misc'],
  leadSources: ['Walk-in', 'Phone', 'WhatsApp', 'Instagram', 'Google', 'IndiaMART', 'Architect', 'Contractor', 'Referral'],
  partyKinds: ['Retail', 'Contractor', 'Builder', 'Architect', 'Interior Designer', 'Mistri / Fitter', 'Dealer'],
  payModes: ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque'],
  units: [['box', 'Box'], ['pc', 'Piece'], ['bag', 'Bag'], ['set', 'Set'], ['nos', 'Nos']],
  stages: ['New', 'Contacted', 'Site visit', 'Quoted', 'Won', 'Lost'],
  wastage: 10, gst: 18, validDays: 15, staffMaxDisc: 5
};
export const STAGE_C = { 'New': 'var(--muted)', 'Contacted': '#3B82C4', 'Site visit': 'var(--clay)', 'Quoted': 'var(--warn)', 'Won': 'var(--good)', 'Lost': 'var(--bad)' };
export const cfg = k => { const s = settings(); const v = s[k]; return v == null || (Array.isArray(v) && !v.length) ? DEFAULTS[k] : v; };

/* memo per data version */
const memo = new Map();
export function memoV(name, fn) {
  const m = memo.get(name);
  if (m && m.v === S.version) return m.val;
  const val = fn(); memo.set(name, { v: S.version, val }); return val;
}

/* ---------------- products & lines ---------------- */
export const isTile = p => !p || (p.uom || 'box') === 'box' && num(p.sqftPerBox) > 0;
export const unitLabel = (p, n = 2) => { const u = (p && p.uom) || 'box'; const L = { box: ['box', 'boxes'], pc: ['pc', 'pcs'], bag: ['bag', 'bags'], set: ['set', 'sets'], nos: ['no.', 'nos'] }[u] || ['unit', 'units']; return n === 1 ? L[0] : L[1]; };
export const priceUnit = p => (p && p.priceOn === 'unit') || !isTile(p) ? '/' + unitLabel(p, 1) : '/sq ft';
export const productLabel = p => p ? p.name + (p.size ? ' · ' + p.size : '') : 'Deleted item';

/* box + loose pieces: qty is stored as decimal boxes */
export function qtyText(qty, p) {
  if (!isTile(p)) return fmtQ(qty) + ' ' + unitLabel(p, qty);
  const per = num(p.pcsPerBox) || 1;
  const sign = qty < 0 ? '-' : ''; const q = Math.abs(qty);
  let boxes = Math.floor(q + 1e-9), pcs = Math.round((q - boxes) * per);
  if (pcs >= per) { boxes++; pcs = 0; }
  return sign + boxes + ' box' + (boxes === 1 ? '' : 'es') + (pcs ? ' + ' + pcs + ' pc' : '');
}
const fmtQ = n => (Math.round(n * 100) / 100).toLocaleString('en-IN');
export const boxesFor = (area, p, wastage) => isTile(p) ? Math.ceil(num(area) * (1 + num(wastage) / 100) / num(p.sqftPerBox) - 1e-9) : 0;

export function lineCalc(l, p) {
  p = p || lineProduct(l);
  const qty = num(l.qty);
  const tile = l.priceOn ? l.priceOn === 'sqft' : (isTile(p) && (p.priceOn || 'sqft') === 'sqft');
  const spb = num(l.sqftPerBox != null ? l.sqftPerBox : p && p.sqftPerBox);
  const sqft = isTile(p) || l.sqftPerBox ? qty * spb : 0;
  const base = tile ? sqft : qty;
  const gross = base * num(l.rate);
  const disc = gross * num(l.disc) / 100;
  const costRate = num(l.cost != null ? l.cost : p && p.cost);
  const cogs = base * costRate;
  return { qty, sqft, gross, disc, net: gross - disc, cogs, base };
}
// snapshot of product details stored on each line so old bills never change
export function lineSnapshot(p) {
  return { name: p.name, size: p.size || '', hsn: p.hsn || '6907', uom: p.uom || 'box', sqftPerBox: num(p.sqftPerBox), pcsPerBox: num(p.pcsPerBox), priceOn: isTile(p) ? (p.priceOn || 'sqft') : 'unit', cost: num(p.cost), gst: p.gst != null ? num(p.gst) : DEFAULTS.gst, brand: p.brand || '', finish: p.finish || '' };
}
export function lineProduct(l) { return get('products', l.productId) || (l.name ? { name: l.name, size: l.size, uom: l.uom, sqftPerBox: l.sqftPerBox, pcsPerBox: l.pcsPerBox, priceOn: l.priceOn, hsn: l.hsn, cost: l.cost, gst: l.gst } : null); }

export function calcDoc(doc) {
  const shop = settings();
  const mode = doc.taxMode || 'excl';
  const lines = (doc.lines || []).map(l => { const p = lineProduct(l); return { l, p, ...lineCalc(l, p), g: num(l.gst != null ? l.gst : p && p.gst != null ? p.gst : DEFAULTS.gst) }; });
  const sumNet = sum(lines, x => x.net);
  const discAmt = Math.min(Math.max(0, num(doc.discAmt)), sumNet);
  let taxable = 0, tax = 0, cogs = 0, sqft = 0, boxes = 0, pcs = 0, gross = 0, lineDisc = 0;
  const rates = {}, hsn = {};
  for (const x of lines) {
    const share = sumNet > 0 ? discAmt * x.net / sumNet : 0;
    const after = x.net - share;
    let tx, tv;
    if (mode === 'incl') { tx = after / (1 + x.g / 100); tv = after - tx; }
    else if (mode === 'none') { tx = after; tv = 0; }
    else { tx = after; tv = after * x.g / 100; }
    x.taxable = tx; x.tax = tv; x.amount = tx + tv;
    taxable += tx; tax += tv; cogs += x.cogs; sqft += x.sqft; gross += x.gross; lineDisc += x.disc;
    if (isTile(x.p)) { boxes += x.qty; pcs += x.qty * num(x.l.pcsPerBox || (x.p && x.p.pcsPerBox)); }
    const rk = mode === 'none' ? 0 : x.g;
    (rates[rk] = rates[rk] || { taxable: 0, tax: 0 }); rates[rk].taxable += tx; rates[rk].tax += tv;
    const hk = (x.l.hsn || (x.p && x.p.hsn) || '6907') + '@' + rk;
    (hsn[hk] = hsn[hk] || { hsn: hk.split('@')[0], rate: rk, qty: 0, sqft: 0, taxable: 0, tax: 0 });
    hsn[hk].qty += x.qty; hsn[hk].sqft += x.sqft; hsn[hk].taxable += tx; hsn[hk].tax += tv;
  }
  const pos = doc.cust && doc.cust.stateCode || doc.placeOfSupply || '';
  const shopState = doc.shopState != null && doc.shopState !== '' ? doc.shopState : shop.stateCode;
  const inter = !!(pos && shopState && pos !== shopState);
  const charges = num(doc.transport) + num(doc.loading);
  const raw = taxable + tax + charges;
  const total = doc.noRound ? r2(raw) : Math.round(raw);
  return {
    lines, gross, lineDisc, discAmt, discount: lineDisc + discAmt, taxable, tax, cgst: inter ? 0 : tax / 2, sgst: inter ? 0 : tax / 2, igst: inter ? tax : 0, inter,
    charges, transport: num(doc.transport), loading: num(doc.loading), roundOff: total - raw, total, cogs, sqft, boxes, pcs, rates, hsn: Object.values(hsn), mode
  };
}
// values stored on the document for fast reports
export function docTotals(doc) { const c = calcDoc(doc); return { total: c.total, taxable: r2(c.taxable), tax: r2(c.tax), cogs: r2(c.cogs), sqft: r2(c.sqft) }; }

/* ---------------- stock ---------------- */
export const activeInvoices = () => memoV('actInv', () => list('invoices').filter(i => !i.cancelled));
export function stockMap() {
  return memoV('stock', () => {
    const m = new Map();
    const add = (lot, q) => { if (lot) m.set(lot, (m.get(lot) || 0) + q); };
    for (const l of list('lots')) add(l.id, num(l.opening));
    for (const p of list('purchases')) if (!p.cancelled) for (const ln of p.lines || []) add(ln.lotId, num(ln.qty));
    for (const i of activeInvoices()) for (const ln of i.lines || []) add(ln.lotId, -num(ln.qty));
    for (const r of list('returns')) if (!r.cancelled) for (const ln of r.lines || []) add(ln.lotId, num(ln.qty));
    for (const a of list('adjustments')) add(a.lotId, num(a.qty));
    return m;
  });
}
export const lotQty = id => stockMap().get(id) || 0;
export function lotsOf(pid, all) {
  const m = memoV('lotsBy', () => { const g = new Map(); for (const l of list('lots')) { if (!g.has(l.productId)) g.set(l.productId, []); g.get(l.productId).push(l); } return g; });
  const ls = (m.get(pid) || []).map(l => ({ ...l, qty: lotQty(l.id) }));
  return (all ? ls : ls.filter(l => Math.abs(l.qty) > 1e-6)).sort((a, b) => (b.qty - a.qty));
}
export function productStock(pid) {
  return memoV('pstock', () => {
    const m = new Map();
    for (const l of list('lots')) m.set(l.productId, (m.get(l.productId) || 0) + lotQty(l.id));
    return m;
  }).get(pid) || 0;
}
export function stockState(p) { const q = productStock(p.id); return q <= 1e-6 ? 'out' : q <= num(p.min) ? 'low' : ''; }
export const activeProducts = () => memoV('actP', () => list('products').filter(p => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)));
export function stockValue() { return sum(activeProducts(), p => { const q = productStock(p.id); const c = num(p.cost); return q > 0 ? q * (isTile(p) && (p.priceOn || 'sqft') === 'sqft' ? num(p.sqftPerBox) * c : c) : 0; }); }
export function lastSold() {
  return memoV('lastSold', () => { const m = new Map(); for (const i of activeInvoices()) for (const l of i.lines || []) { const d = m.get(l.productId); if (!d || i.date > d) m.set(l.productId, i.date); } return m; });
}
// sales qty per product in last N days (for reorder suggestions)
export function soldQty(days) {
  return memoV('sold' + days, () => { const m = new Map(); for (const i of activeInvoices()) { if (daysSince(i.date) > days) continue; for (const l of i.lines || []) m.set(l.productId, (m.get(l.productId) || 0) + num(l.qty)); } return m; });
}

/* ---------------- parties & credit ---------------- */
export const customers = () => memoV('cust', () => list('parties').filter(p => p.type !== 'supplier').sort((a, b) => a.name.localeCompare(b.name)));
export const suppliers = () => memoV('supp', () => list('parties').filter(p => p.type === 'supplier').sort((a, b) => a.name.localeCompare(b.name)));

// All money movements per party, oldest first. sign +: they owe us more (customer) / we owe them more (supplier).
export function ledger(pid) {
  return memoV('ledgerAll', () => {
    const m = new Map();
    const push = (id, e) => { if (!id) return; if (!m.has(id)) m.set(id, []); m.get(id).push(e); };
    for (const p of list('parties')) if (num(p.opening)) push(p.id, { date: p.openingDate || p.createdDate || '2000-01-01', kind: 'opening', label: 'Opening balance', amt: num(p.opening), ref: null });
    for (const i of activeInvoices()) push(i.partyId, { date: i.date, kind: 'invoice', label: 'Bill ' + (i.no || '(pending)'), amt: num(i.total), ref: i.id, doc: i });
    for (const r of list('returns')) if (!r.cancelled) push(r.partyId, { date: r.date, kind: 'return', label: 'Return ' + (r.no || ''), amt: -num(r.total), ref: r.id, doc: r });
    for (const p of list('purchases')) if (!p.cancelled) push(p.partyId, { date: p.date, kind: 'purchase', label: 'Purchase ' + (p.billNo || p.no || ''), amt: num(p.total), ref: p.id, doc: p });
    for (const p of list('payments')) {
      const party = get('parties', p.partyId); const supplier = party && party.type === 'supplier';
      const a = num(p.amount) * (p.dir === 'out' ? 1 : -1) * (supplier ? -1 : 1);
      push(p.partyId, { date: p.date, kind: 'payment', label: (p.dir === 'out' ? (supplier ? 'Paid ' : 'Refund ') : 'Received ') + '(' + (p.mode || '') + ')' + (p.no ? ' ' + p.no : ''), amt: a, ref: p.id, doc: p });
    }
    for (const [, arr] of m) arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.kind === 'opening' ? -1 : b.kind === 'opening' ? 1 : (a.doc && b.doc ? (a.doc.createdAt || a.doc.updatedAt || 0) - (b.doc.createdAt || b.doc.updatedAt || 0) : 0)));
    return m;
  }).get(pid) || [];
}
// FIFO: credits settle the oldest debits first; linked payments settle their own bill first.
export function partyCredit(pid) {
  return memoV('pc:' + pid, () => {
    const es = ledger(pid);
    const debits = es.filter(e => e.amt > 0).map(e => ({ ...e, open: e.amt }));
    const byRef = new Map(debits.filter(d => d.ref).map(d => [d.ref, d]));
    let pool = 0;
    for (const e of es) {
      if (e.amt >= 0) continue;
      let c = -e.amt;
      const link = e.doc && (e.doc.invoiceId || e.doc.purchaseId);
      const d = link && byRef.get(link);
      if (d) { const x = Math.min(d.open, c); d.open -= x; c -= x; }
      pool += c;
    }
    for (const d of debits) { if (pool <= 0) break; const x = Math.min(d.open, pool); d.open -= x; pool -= x; }
    const open = debits.filter(d => d.open > 0.5);
    const out = sum(open, d => d.open) - pool;
    const b = [0, 0, 0, 0];
    for (const d of open) { const n = daysSince(d.date); b[n <= 30 ? 0 : n <= 60 ? 1 : n <= 90 ? 2 : 3] += d.open; }
    const pays = es.filter(e => e.kind === 'payment' && e.amt < 0);
    const paidBy = new Map(debits.filter(d => d.ref).map(d => [d.ref, d.amt - d.open]));
    return { out, b, oldest: open.length ? daysSince(open[0].date) : 0, oldestDate: open.length ? open[0].date : null, last: pays[pays.length - 1] || null, advance: pool > 0.5 ? pool : 0, paidBy, open };
  });
}
// paid amount for any invoice (party via FIFO, walk-in via linked payments)
export function invoicePaid(inv) {
  if (inv.partyId) { const pc = partyCredit(inv.partyId); const v = pc.paidBy.get(inv.id); return v == null ? 0 : v; }
  return memoV('walkPaid', () => {
    const m = new Map();
    for (const p of list('payments')) if (p.invoiceId) m.set(p.invoiceId, (m.get(p.invoiceId) || 0) + num(p.amount) * (p.dir === 'out' ? -1 : 1));
    for (const r of list('returns')) if (!r.cancelled && r.invoiceId) m.set(r.invoiceId, (m.get(r.invoiceId) || 0) + num(r.total));
    return m;
  }).get(inv.id) || 0;
}
export function invStatus(inv) {
  if (inv.cancelled) return ['Cancelled', 'bad'];
  const due = num(inv.total) - invoicePaid(inv);
  if (due <= 0.5) return ['Paid', 'good'];
  if (invoicePaid(inv) > 0.5) return ['Part paid', 'warn'];
  return ['Unpaid', 'bad'];
}
export function creditSummary() {
  return memoV('credSum', () => {
    let total = 0, od = 0, parties = 0, odParties = 0, overLimit = 0; const b = [0, 0, 0, 0];
    const rows = customers().map(c => {
      const x = partyCredit(c.id);
      if (x.out > 0.5) { total += x.out; parties++; x.b.forEach((v, i) => b[i] += v); if (x.b[2] + x.b[3] > 0) { od += x.b[2] + x.b[3]; odParties++; } if (num(c.limit) && x.out > num(c.limit)) overLimit++; }
      return { c, x };
    });
    // walk-in bills not fully paid
    const walk = activeInvoices().filter(i => !i.partyId).map(i => ({ i, due: num(i.total) - invoicePaid(i) })).filter(x => x.due > 0.5);
    const walkDue = sum(walk, x => x.due);
    return { total: total + walkDue, od, parties, odParties, overLimit, b, rows, walk, walkDue };
  });
}
export const payables = () => memoV('payables', () => { const rows = suppliers().map(s => ({ s, x: partyCredit(s.id) })); return { rows, total: sum(rows, r => Math.max(0, r.x.out)) }; });

/* ---------------- period stats ---------------- */
export function salesIn(a, b) { return activeInvoices().filter(i => inRange(i.date, a, b)); }
export function periodStats(a, b) {
  const inv = salesIn(a, b);
  const rets = list('returns').filter(r => !r.cancelled && inRange(r.date, a, b));
  const exps = list('expenses').filter(e => inRange(e.date, a, b));
  const pays = list('payments').filter(p => inRange(p.date, a, b));
  const sales = sum(inv, i => num(i.total));
  const taxable = sum(inv, i => num(i.taxable)) - sum(rets, r => num(r.taxable));
  const cogs = sum(inv, i => num(i.cogs)) - sum(rets, r => num(r.cogs));
  const exp = sum(exps, e => num(e.amount));
  const collected = sum(pays.filter(p => p.dir !== 'out' && !isSupplier(p.partyId)), p => num(p.amount));
  const refunds = sum(pays.filter(p => p.dir === 'out' && !isSupplier(p.partyId)), p => num(p.amount));
  return { inv, rets, exps, pays, n: inv.length, sales, returns: sum(rets, r => num(r.total)), taxable, tax: sum(inv, i => num(i.tax)) - sum(rets, r => num(r.tax)), cogs, gp: taxable - cogs, exp, profit: taxable - cogs - exp, collected, refunds, sqft: sum(inv, i => num(i.sqft)) };
}
export const isSupplier = pid => { const p = get('parties', pid); return !!(p && p.type === 'supplier'); };

export function dueFollowups() { const t = today(); return list('leads').filter(l => l.follow && !['Won', 'Lost'].includes(l.stage) && l.follow <= t); }
export function quoteStatus(q) { if (q.status === 'Sent' || q.status === 'Draft') { if (daysSince(q.date) > num(q.validDays || DEFAULTS.validDays)) return 'Expired'; } return q.status || 'Draft'; }
export const QSTAT = { Draft: '', Sent: 'acc', Accepted: 'good', Converted: 'good', Lost: 'bad', Expired: 'warn' };
export const pendingDeliveries = () => activeInvoices().filter(i => i.delivery && i.delivery.status === 'pending');
export function lowStock() { return activeProducts().filter(p => stockState(p)); }
