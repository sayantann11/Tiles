// Dashboard: the whole shop on one screen.
import { esc, ic, num, inr, inrS, fmt1, fdate, today, dAgo, addDays, daysSince, sum, startOfMonth, asDate, iso, DOW, MON } from './core.js';
import { A } from './ui.js';
import { list, get, settings, can, me, status, isDemo } from './store.js';
import { periodStats, creditSummary, lowStock, dueFollowups, quoteStatus, pendingDeliveries, activeInvoices, isTile, productStock, stockValue, payables } from './logic.js';
import { view, go, kpi, bars, hbars, sw, av } from './parts.js';
import { invRow } from './v-docs.js';

function hello() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

export function cashToday(date = today()) {
  const pays = list('payments').filter(p => p.date === date);
  const exps = list('expenses').filter(e => e.date === date);
  const cashIn = sum(pays.filter(p => p.dir !== 'out' && p.mode === 'Cash'), p => num(p.amount));
  const cashOut = sum(pays.filter(p => p.dir === 'out' && p.mode === 'Cash'), p => num(p.amount)) + sum(exps.filter(e => e.mode === 'Cash'), e => num(e.amount));
  const byMode = {};
  for (const p of pays.filter(p => p.dir !== 'out')) byMode[p.mode] = (byMode[p.mode] || 0) + num(p.amount);
  return { cashIn, cashOut, net: cashIn - cashOut, byMode, received: sum(pays.filter(p => p.dir !== 'out'), p => num(p.amount)), spent: sum(exps, e => num(e.amount)) };
}

view('home', {
  title: 'Dashboard', icon: 'home',
  render() {
    const t = today();
    const td = periodStats(t, t);
    const ms = startOfMonth(0), ls = startOfMonth(1);
    const dom = asDate(t).getDate();
    const month = periodStats(ms, t);
    const lastEnd = (() => { const d = asDate(ls); d.setDate(Math.min(dom, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); })();
    const last = periodStats(ls, lastEnd);
    const ch = last.sales ? (month.sales - last.sales) / last.sales * 100 : 0;
    const cs = creditSummary();
    const low = lowStock();
    const fu = dueFollowups();
    const openQ = list('quotes').filter(q => ['Sent', 'Accepted'].includes(quoteStatus(q)));
    const pend = pendingDeliveries();
    const cash = cashToday(t);
    const s = settings();
    const owner = can('viewCost');
    // chart: last 30 days
    const series = [];
    const byDay = new Map(); for (const i of activeInvoices()) if (daysSince(i.date) < 30) byDay.set(i.date, (byDay.get(i.date) || 0) + num(i.total));
    for (let d = 29; d >= 0; d--) { const k = dAgo(d); const dt = asDate(k); series.push({ v: byDay.get(k) || 0, t: fdate(k), l: d % 5 === 0 ? (d === 0 ? 'Today' : dt.getDate() + ' ' + MON[dt.getMonth()]) : '' }); }
    const top = topDesigns(30).slice(0, 6);
    const recent = activeInvoices().slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    const alerts = [
      fu.length ? ['leads', 'acc', 'phone', fu.length + ' follow-up' + (fu.length > 1 ? 's' : ''), 'Customers to call today', 'go'] : null,
      low.length ? ['stock', 'warn', 'alert', low.length + ' design' + (low.length > 1 ? 's' : '') + ' low', 'Reorder before you run out', 'lowStock'] : null,
      cs.b[2] + cs.b[3] > 0 ? ['credit', 'bad', 'clock', inrS(cs.b[2] + cs.b[3]) + ' over 60 days', cs.odParties + ' customers · send reminders', 'remindAll'] : null,
      pend.length ? ['sales', 'clay', 'truck', pend.length + ' to deliver', 'Bills waiting for delivery', 'pendDel'] : null,
      openQ.length ? ['quotes', 'acc', 'quote', openQ.length + ' open quotes', inrS(sum(openQ, q => num(q.total))) + ' could become sales', 'go'] : null
    ].filter(Boolean);
    return `<div class="hello"><div><p class="eyebrow">${DOW[new Date().getDay()]}, ${fdate(t)}</p><h1>${hello()}, ${esc((me().name || s.owner || '').split(' ')[0] || 'there')}</h1></div>
      <div class="hello-act hide-m"><button class="btn" type="button" data-act="receivePay">${ic('cash', 18)} Receive payment</button><button class="btn" type="button" data-act="newQuote">${ic('quote', 18)} Quotation</button><button class="btn primary" type="button" data-act="newBill">${ic('plus', 18)} New bill</button></div></div>
      ${isDemo() ? `<div class="demo-bar">${ic('info', 18)}<span>You are looking at a <b>demo shop</b> with sample data. Try anything: it stays on this device.</span><button class="btn sm" type="button" data-act="startReal">Use for my shop</button></div>` : ''}
      <div class="kpis">
        ${kpi("Today's sales", inr(td.sales), `${td.n} bill${td.n === 1 ? '' : 's'}${td.sqft ? ' · ' + fmt1(td.sqft) + ' sq ft' : ''}`, { cls: 'hero', act: 'go', id: 'sales' })}
        ${kpi('Money received today', inr(cash.received), Object.entries(cash.byMode).map(([m, v]) => m + ' ' + inrS(v)).join(' · ') || 'No payments yet', { act: 'dayBook' })}
        ${kpi('This month', inr(month.sales), last.sales ? `<span class="${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(ch))}%</span> vs same days last month` : month.n + ' bills', { act: 'go', id: owner ? 'reports' : 'sales' })}
        ${owner ? kpi('Profit this month (est.)', inr(month.profit), `Margin ${inrS(month.gp)} − expenses ${inrS(month.exp)}`, { act: 'go', id: 'reports' }) : kpi('To collect', inr(cs.total), cs.parties + ' customers', { act: 'go', id: 'credit' })}
      </div>
      ${alerts.length ? `<div class="alerts">${alerts.map(a => `<button class="alert" type="button" data-act="${a[5]}" data-id="${a[0]}"><span class="ab ${a[1]}">${ic(a[2], 20)}</span><span style="min-width:0"><b>${a[3]}</b><span>${a[4]}</span></span></button>`).join('')}</div>` : ''}
      <div class="qa hide-d">
        <button type="button" data-act="newBill"><span class="qi">${ic('sales', 20)}</span><b>New bill</b><small>GST bill in a minute</small></button>
        <button type="button" data-act="newQuote"><span class="qi clay">${ic('quote', 20)}</span><b>Quotation</b><small>Area in, boxes out</small></button>
        <button type="button" data-act="receivePay"><span class="qi">${ic('cash', 20)}</span><b>Receive</b><small>Payment from customer</small></button>
        <button type="button" data-act="addExpense"><span class="qi clay">${ic('expense', 20)}</span><b>Expense</b><small>Tempo, hamali, tea…</small></button>
      </div>
      <div class="grid2">
        <section class="card"><div class="card-h"><h3>Sales, last 30 days</h3><span class="muted">${inr(sum(series, x => x.v))}</span></div>${bars(series)}<div class="chart-note"><span>Average ${inrS(sum(series, x => x.v) / 30)} a day</span><span>Best day ${inrS(Math.max(...series.map(x => x.v)))}</span></div></section>
        <section class="card"><div class="card-h"><h3>Top designs, 30 days</h3><button class="link" type="button" data-act="go" data-id="${owner ? 'reports' : 'stock'}">See all</button></div>${top.length ? hbars(top.map(x => ({ t: x.p.name, v: x.amt, s: fmt1(x.sqft) + ' sq ft', p: x.p, act: 'product', id: x.p.id }))) : '<p class="muted">No sales yet.</p>'}</section>
      </div>
      <div class="grid2">
        <section class="card flush"><div class="card-h" style="padding-top:14px"><h3>Latest bills</h3><button class="link" type="button" data-act="go" data-id="sales">All bills</button></div>${recent.length ? `<div class="rows">${recent.map(invRow).join('')}</div>` : '<p class="muted" style="padding:0 0 14px">No bills yet. Tap “New bill”.</p>'}</section>
        <section class="card"><div class="card-h"><h3>Today's cash</h3><button class="link" type="button" data-act="dayBook">Day book</button></div>
          <div class="cash-sum"><div><small>Cash in</small><b class="good-t">${inr(cash.cashIn)}</b></div><div><small>Cash out</small><b class="bad-t">${inr(cash.cashOut)}</b></div><div><small>Cash in drawer (today)</small><b>${inr(cash.net)}</b></div></div>
          <div class="strip" style="margin-top:14px"><div><small>Credit to collect</small><b class="${cs.b[2] + cs.b[3] ? 'warn' : ''}">${inrS(cs.total)}</b></div>${owner ? `<div><small>Stock value</small><b>${inrS(stockValue())}</b></div><div><small>Supplier dues</small><b>${inrS(payables().total)}</b></div>` : `<div><small>Low stock</small><b>${low.length}</b></div>`}</div>
        </section>
      </div>`;
  }
});

export function topDesigns(days) {
  const m = new Map();
  for (const i of activeInvoices()) { if (daysSince(i.date) >= days) continue; for (const l of i.lines) { const p = get('products', l.productId); if (!p) continue; const r = m.get(p.id) || { p, sqft: 0, amt: 0, qty: 0 }; r.sqft += num(l.qty) * num(l.sqftPerBox); r.qty += num(l.qty); r.amt += (num(i.taxable) && num(i.total)) ? lineShare(i, l) : 0; m.set(p.id, r); } }
  return [...m.values()].sort((a, b) => b.amt - a.amt);
}
function lineShare(inv, l) { const base = (l.priceOn || 'sqft') === 'sqft' && num(l.sqftPerBox) ? num(l.qty) * num(l.sqftPerBox) : num(l.qty); return base * num(l.rate) * (1 - num(l.disc) / 100); }

Object.assign(A, {
  go: el => go(el.dataset.id || el.dataset.v),
  lowStock: () => { import('./parts.js').then(m => { m.state.stock = { ...(m.state.stock || { q: '', cat: 'All', loc: 'All', n: 60 }), f: 'Low stock' }; go('stock'); }); },
  pendDel: () => { import('./parts.js').then(m => { m.state.sales = { ...(m.state.sales || { q: '', n: 60 }), f: 'To deliver' }; go('sales'); }); }
});
