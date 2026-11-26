// Expenses, leads (follow-ups), day book, and the phone "More" menu.
import { esc, ic, num, inr, inrS, fmt1, fdate, fdateY, today, addDays, daysSince, matches, sum, uid, phone10, waLink, telLink, rel, startOfMonth, endOfMonth, monthLabel, ftime, fdt } from './core.js';
import { A, IN, CH, openSheet, setSheet, closeSheet, closeAll, toast, confirmBox, busy, empty, pill, readForm, invalid, fld, inp, sel } from './ui.js';
import { list, get, put, del, settings, can, me, isDemo, status } from './store.js';
import { cfg, STAGE_C, dueFollowups, periodStats, customers } from './logic.js';
import { view, go, state, av, hbars, kpi, payModeSel, moreBtn, VIEWS } from './parts.js';
import { printHtml } from './docs.js';
import { newDraft, openBuilder } from './v-docs.js';

/* ================= expenses ================= */
view('expenses', {
  title: 'Expenses', icon: 'expense',
  render() {
    const st = state.expenses || (state.expenses = { m: 0, cat: 'All', q: '', n: 80 });
    const a = startOfMonth(st.m), b = st.m === 0 ? today() : endOfMonth(st.m);
    const all = list('expenses').filter(e => e.date >= a && e.date <= b).filter(e => can('expensesAll') || e.createdBy === me().name);
    const rows = all.filter(e => st.cat === 'All' || e.cat === st.cat).filter(e => matches(st.q, e.note, e.cat, e.mode)).sort((x, y) => x.date < y.date ? 1 : x.date > y.date ? -1 : (y.createdAt || 0) - (x.createdAt || 0));
    const byCat = {}; all.forEach(e => byCat[e.cat] = (byCat[e.cat] || 0) + num(e.amount));
    const total = sum(all, e => num(e.amount));
    const ps = can('viewCost') ? periodStats(a, b) : null;
    let last = '', out = '';
    rows.slice(0, st.n).forEach(e => { if (e.date !== last) { last = e.date; out += `<div class="day-h">${rel(e.date)} · ${fdate(e.date)}<span>${inr(sum(rows.filter(x => x.date === e.date), x => num(x.amount)))}</span></div>`; } out += `<div class="row" data-act="editExpense" data-id="${e.id}"><span class="av clay">${ic('expense', 18)}</span><div class="grow"><b class="t">${esc(e.note || e.cat)}</b><small class="muted t">${esc(e.cat)} · ${esc(e.mode || '')}${e.createdBy ? ' · ' + esc(e.createdBy) : ''}</small></div><span class="amt">${inr(e.amount)}</span></div>`; });
    const months = [0, 1, 2, 3, 4, 5].map(m => [m, monthLabel(startOfMonth(m).slice(0, 7))]);
    return `<div class="ph"><div><h1>Expenses</h1><p>${inr(total)} in ${monthLabel(a.slice(0, 7))}${ps && ps.sales ? ` · ${Math.round(total / ps.sales * 1000) / 10}% of sales` : ''}</p></div><div class="ph-act"><select class="sel-sm" data-ch="expMonth" aria-label="Month">${months.map(([m, l]) => `<option value="${m}" ${st.m === m ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn primary" type="button" data-act="addExpense">${ic('plus', 18)} Add expense</button></div></div>
      ${can('expensesAll') && Object.keys(byCat).length ? `<section class="card"><div class="card-h"><h3>Where the money went</h3></div>${hbars(Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ t: k, v, act: 'expCat', id: k })), inr)}</section>` : ''}
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-expenses" placeholder="Search note" value="${esc(st.q)}" data-in="listQ" data-v="expenses" enterkeyhint="search"></div></div>
      <div class="chips">${['All', ...cfg('expenseCats')].map(c => `<button class="chip ${st.cat === c ? 'on' : ''}" type="button" data-act="expCat" data-id="${esc(c)}">${esc(c)}${byCat[c] ? ` <em>${inrS(byCat[c])}</em>` : ''}</button>`).join('')}</div>
      <section class="card flush">${rows.length ? `<div class="rows">${out}</div>${moreBtn(st.n, rows.length, 'moreExp')}` : empty('No expenses', 'Add daily cash spends like tempo, hamali, tea, commission. It takes 5 seconds.')}</section>`;
  }
});
CH.expMonth = el => { state.expenses.m = +el.value; go('expenses'); };
function expenseForm(e) {
  const cats = cfg('expenseCats');
  return `<label class="fld"><span>Amount ₹</span><input name="amount" class="big-num" value="${esc(e.amount || '')}" inputmode="decimal" autocomplete="off" autofocus></label>
    <div class="fld"><span>Category</span><div class="cat-grid">${cats.map(c => `<label><input type="radio" name="cat" value="${esc(c)}" ${c === (e.cat || cats[0]) ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div></div>
    ${fld('Note', inp('note', e.note, 'autocomplete="off" placeholder="e.g. Tempo to Bopal site" list="exp-notes"'))}
    <div class="frow">${fld('Paid by', payModeSel('mode', e.mode || 'Cash'))}${fld('Date', inp('date', e.date || today(), 'type="date"'))}</div>
    <datalist id="exp-notes">${[...new Set(list('expenses').slice(-200).map(x => x.note).filter(Boolean))].slice(0, 40).map(n => `<option value="${esc(n)}">`).join('')}</datalist>`;
}
Object.assign(A, {
  addExpense() { openSheet({ title: 'Add expense', cls: 'narrow', body: expenseForm({}), foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary lg" type="button" data-act="saveExpense">${ic('check', 18)} Save</button>` }); },
  editExpense(el) { const e = get('expenses', el.dataset.id); openSheet({ title: 'Expense', cls: 'narrow', body: expenseForm(e), foot: `${can('expensesAll') ? `<button class="btn danger" type="button" data-act="delExpense" data-id="${e.id}">${ic('trash', 16)}</button>` : ''}<span class="spacer"></span><button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveExpense" data-id="${e.id}">Save</button>` }); },
  saveExpense: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s);
    if (num(f.amount) <= 0) return invalid(s, 'amount', 'Enter the amount');
    const prev = el.dataset.id ? get('expenses', el.dataset.id) : {};
    await put('expenses', { ...prev, id: el.dataset.id || undefined, amount: num(f.amount), cat: f.cat, note: f.note, mode: f.mode, date: f.date || today() });
    toast('Expense saved'); closeSheet();
  }),
  async delExpense(el) { if (!(await confirmBox({ title: 'Delete this expense?', ok: 'Delete', danger: true }))) return; await del('expenses', el.dataset.id); closeAll(); toast('Deleted'); },
  expCat(el) { state.expenses.cat = el.dataset.id; go('expenses'); },
  moreExp: () => { state.expenses.n += 100; go('expenses'); }
});

/* ================= leads ================= */
view('leads', {
  title: 'Leads', icon: 'leads',
  render() {
    const st = state.leads || (state.leads = { q: '', mode: innerWidth > 900 ? 'board' : 'list', f: 'Open' });
    const stages = cfg('stages');
    const all = list('leads').filter(l => matches(st.q, l.name, l.phone, l.need, l.source));
    const fu = dueFollowups();
    const open = all.filter(l => !['Won', 'Lost'].includes(l.stage));
    const won = list('leads').filter(l => l.stage === 'Won').length, lost = list('leads').filter(l => l.stage === 'Lost').length;
    const head = `<div class="ph"><div><h1>Leads</h1><p>${open.length} open enquiries · ${inrS(sum(open, l => num(l.value)))} possible business${won + lost ? ` · ${Math.round(won / (won + lost) * 100)}% won` : ''}</p></div><div class="ph-act"><div class="seg sm"><label><input type="radio" name="lm" ${st.mode === 'list' ? 'checked' : ''} data-ch="leadMode" value="list"><span>List</span></label><label><input type="radio" name="lm" ${st.mode === 'board' ? 'checked' : ''} data-ch="leadMode" value="board"><span>Board</span></label></div><button class="btn primary" type="button" data-act="addLead">${ic('plus', 18)} New lead</button></div></div>
      ${fu.length ? `<section class="card call-today"><div class="card-h"><h3>${ic('phone', 18)} Call today (${fu.length})</h3></div><div class="rows">${fu.map(l => leadRow(l)).join('')}</div></section>` : ''}
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-leads" placeholder="Search name, phone, need" value="${esc(st.q)}" data-in="listQ" data-v="leads" enterkeyhint="search"></div></div>`;
    if (st.mode === 'board') {
      return head + `<div class="kan">${stages.map(sg => { const ls = all.filter(l => l.stage === sg).sort((a, b) => (a.follow || '9') < (b.follow || '9') ? -1 : 1); return `<div class="kcol"><div class="kcol-h"><span class="dot" style="background:${STAGE_C[sg] || 'var(--muted)'}"></span>${esc(sg)}<em>${ls.length} · ${inrS(sum(ls, l => num(l.value)))}</em></div>${ls.map(lcard).join('') || '<p class="muted" style="padding:8px">None</p>'}</div>`; }).join('')}</div>`;
    }
    const F = { Open: l => !['Won', 'Lost'].includes(l.stage), ...Object.fromEntries(stages.map(s => [s, l => l.stage === s])) };
    const rows = all.filter(F[st.f] || F.Open).sort((a, b) => (a.follow || '9') < (b.follow || '9') ? -1 : 1);
    return head + `<div class="chips">${Object.keys(F).map(k => `<button class="chip ${st.f === k ? 'on' : ''}" type="button" data-act="listF" data-v="leads" data-f="${k}">${k} <em>${all.filter(F[k]).length}</em></button>`).join('')}</div>
      <section class="card flush">${rows.length ? `<div class="rows">${rows.map(leadRow).join('')}</div>` : empty('No leads here', 'Every walk-in, call or Instagram enquiry should be added so nobody is forgotten.')}</section>`;
  }
});
CH.leadMode = el => { state.leads.mode = el.value; go('leads'); };
function fuText(l) { if (!l.follow || ['Won', 'Lost'].includes(l.stage)) return ''; const n = daysSince(l.follow); return n > 0 ? pill('Overdue ' + n + 'd', 'bad') : n === 0 ? pill('Call today', 'warn') : pill(rel(l.follow), ''); }
function leadRow(l) { return `<div class="row" data-act="viewLead" data-id="${l.id}"><span class="av" style="background:color-mix(in srgb,${STAGE_C[l.stage] || 'var(--muted)'} 18%,transparent);color:${STAGE_C[l.stage] || 'var(--muted)'}">${esc((l.name || '?').slice(0, 2).toUpperCase())}</span><div class="grow"><b class="t">${esc(l.name)}</b><small class="muted t">${esc(l.need || '')}</small></div><div class="r-end">${l.value ? `<span class="amt">${inrS(l.value)}</span>` : ''}<span>${fuText(l) || pill(l.stage, '')}</span></div>${l.phone ? `<div class="row-acts"><a class="icon-btn" href="${telLink(l.phone)}" aria-label="Call">${ic('phone', 17)}</a></div>` : ''}</div>`; }
function lcard(l) { return `<div class="lcard" data-act="viewLead" data-id="${l.id}"><div class="lf"><b class="t" style="flex:1">${esc(l.name)}</b>${l.value ? `<b>${inrS(l.value)}</b>` : ''}</div><p>${esc(l.need || '')}</p><div class="lf">${pill(l.source || '', 'acc')}${l.area ? pill(fmt1(l.area) + ' sq ft', '') : ''}</div><div class="lb"><span class="muted">${l.phone || ''}</span>${fuText(l)}</div></div>`; }
function leadForm(l) {
  return `<div class="frow">${fld('Name', inp('name', l.name, 'autocomplete="off" autofocus'))}${fld('Mobile', inp('phone', l.phone, 'inputmode="tel" maxlength="14"'))}</div>
    ${fld('What do they need?', inp('need', l.need, 'autocomplete="off" placeholder="e.g. 3BHK flooring, glossy 800×1600"'))}
    <div class="frow3">${fld('Area sq ft', inp('area', l.area || '', 'inputmode="decimal"'))}${fld('Value ₹ (approx.)', inp('value', l.value || '', 'inputmode="decimal"'))}${fld('Source', sel('source', cfg('leadSources'), l.source || 'Walk-in'))}</div>
    <div class="frow">${fld('Stage', sel('stage', cfg('stages'), l.stage || 'New'))}${fld('Next follow-up', inp('follow', l.follow || addDays(today(), 1), 'type="date"'))}</div>
    ${!l.id ? fld('Note', inp('note', '', 'autocomplete="off"')) : ''}`;
}
function leadBody(id) {
  const l = get('leads', id); if (!l) return { body: empty('Not found'), foot: '' };
  const stages = cfg('stages');
  const q = l.quoteId && get('quotes', l.quoteId);
  const body = `<div class="party-top">${av(l.name)}<div class="grow"><h3>${esc(l.name)}</h3><p class="muted">${esc([l.phone, l.source, l.area ? fmt1(l.area) + ' sq ft' : '', l.value ? '≈ ' + inr(l.value) : ''].filter(Boolean).join(' · '))}</p></div></div>
    ${l.need ? `<div class="note">${esc(l.need)}</div>` : ''}
    <div class="fld"><span>Stage</span><div class="stage-row">${stages.map(s => `<button type="button" class="stage ${l.stage === s ? 'on' : ''}" style="--c:${STAGE_C[s]}" data-act="leadStage" data-id="${id}" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>
    ${!['Won', 'Lost'].includes(l.stage) ? `<div class="fld"><span>Next follow-up ${l.follow ? '· ' + fdateY(l.follow) : ''}</span><div class="chips">${[['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]].map(([t, n]) => `<button class="chip ${l.follow === addDays(today(), n) ? 'on' : ''}" type="button" data-act="leadFollow" data-id="${id}" data-n="${n}">${t}</button>`).join('')}</div></div>` : ''}
    ${l.stage === 'Lost' && l.lostReason ? `<div class="note bad">Lost: ${esc(l.lostReason)}</div>` : ''}
    ${q ? `<button class="mini" type="button" data-act="openDoc" data-kind="quotes" data-id="${q.id}">${ic('quote', 16)}<span class="grow">Quotation ${esc(q.no || '')} · ${inr(q.total)}</span>${ic('right', 16)}</button>` : ''}
    <section><h4>Notes</h4><div class="add-note"><input placeholder="Add a note (what they said, budget, samples…)" data-note autocomplete="off" enterkeyhint="send"><button class="btn" type="button" data-act="leadNote" data-id="${id}">Add</button></div>
    <div class="timeline">${(l.notes || []).slice().reverse().map(n => `<div class="tl"><b>${esc(n.text)}</b><small class="muted">${esc(n.by || '')} · ${fdt(n.at)}</small></div>`).join('') || '<p class="muted">No notes yet.</p>'}</div></section>`;
  const B = [];
  if (l.phone) B.push(`<a class="icon-btn" href="${telLink(l.phone)}" aria-label="Call">${ic('phone', 18)}</a><a class="icon-btn wa" href="${waLink(l.phone, `Namaste ${l.name} ji, this is ${settings().shopName || 'the tile shop'}. `)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic('wa', 18)}</a>`);
  B.push(`<button class="btn" type="button" data-act="editLead" data-id="${id}">${ic('edit', 18)}<span>Edit</span></button>`);
  B.push(`<button class="btn primary" type="button" data-act="leadQuote" data-id="${id}">${ic('quote', 18)}<span>Make quotation</span></button>`);
  return { body, foot: `<div class="doc-acts">${B.join('')}</div>` };
}
export function refreshLeadSheets() { document.querySelectorAll('.sheet[data-live-lead]').forEach(s => { if (!get('leads', s.dataset.liveLead)) return; const b = s.querySelector('.sheet-b'); const st = b.scrollTop; const inp = s.querySelector('[data-note]'); const typed = inp ? inp.value : ''; if (document.activeElement === inp) return; setSheet(s, leadBody(s.dataset.liveLead)); s.querySelector('.sheet-b').scrollTop = st; const ni = s.querySelector('[data-note]'); if (ni) ni.value = typed; }); }
Object.assign(A, {
  addLead() { openSheet({ title: 'New lead', body: leadForm({}), foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveLead">Save lead</button>` }); },
  editLead(el) { const l = get('leads', el.dataset.id); openSheet({ title: 'Edit lead', body: leadForm(l), foot: `<button class="btn danger" type="button" data-act="delLead" data-id="${l.id}">${ic('trash', 16)}</button><span class="spacer"></span><button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveLead" data-id="${l.id}">Save</button>` }); },
  saveLead: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s);
    if (!f.name) return invalid(s, 'name', 'Enter the name');
    const prev = el.dataset.id ? get('leads', el.dataset.id) : { notes: [], date: today() };
    const notes = [...(prev.notes || [])]; if (f.note) notes.push({ at: Date.now(), by: me().name, text: f.note });
    const rec = await put('leads', { ...prev, id: el.dataset.id || undefined, name: f.name, phone: phone10(f.phone), need: f.need, area: num(f.area), value: num(f.value) || Math.round(num(f.area) * 70 / 1000) * 1000, source: f.source, stage: f.stage, follow: f.follow, notes });
    toast('Lead saved'); closeSheet();
    if (!el.dataset.id) setTimeout(() => A.viewLead({ dataset: { id: rec.id } }), 200);
  }),
  async delLead(el) { if (!(await confirmBox({ title: 'Delete this lead?', ok: 'Delete', danger: true }))) return; await del('leads', el.dataset.id); closeAll(); toast('Deleted'); },
  viewLead(el) { const c = leadBody(el.dataset.id); const s = openSheet({ title: 'Lead', body: c.body, foot: c.foot }); s.dataset.liveLead = el.dataset.id; s.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-note]')) A.leadNote({ dataset: { id: el.dataset.id }, closest: () => s }); }); },
  async leadStage(el) {
    const l = get('leads', el.dataset.id); const sg = el.dataset.s;
    let lostReason = l.lostReason || '';
    if (sg === 'Lost') { const { askText } = await import('./ui.js'); const r = await askText({ title: 'Why was it lost?', label: 'Reason', value: '', ok: 'Mark lost' }); if (r === null) return; lostReason = r || 'Not given'; }
    await put('leads', { ...l, stage: sg, lostReason, notes: [...(l.notes || []), { at: Date.now(), by: me().name, text: 'Stage → ' + sg + (sg === 'Lost' && lostReason ? ' (' + lostReason + ')' : '') }] });
    toast('Moved to ' + sg);
  },
  async leadFollow(el) { const l = get('leads', el.dataset.id); await put('leads', { ...l, follow: addDays(today(), +el.dataset.n) }); toast('Follow-up set for ' + fdate(addDays(today(), +el.dataset.n))); },
  async leadNote(el) {
    const s = el.closest('.sheet'); const i = s.querySelector('[data-note]'); const t = i.value.trim(); if (!t) return;
    const l = get('leads', el.dataset.id); i.value = '';
    await put('leads', { ...l, notes: [...(l.notes || []), { at: Date.now(), by: me().name, text: t }], stage: l.stage === 'New' ? 'Contacted' : l.stage });
    i.blur();
  },
  leadQuote(el) {
    const l = get('leads', el.dataset.id);
    const party = customers().find(c => c.phone && c.phone === l.phone);
    closeAll(() => openBuilder(newDraft('quotes', { leadId: l.id, partyId: party ? party.id : null, cust: { name: l.name, phone: l.phone, stateCode: settings().stateCode || '' }, notes: l.need || '' })));
  }
});

/* ================= day book ================= */
function dayBody(date) {
  const inv = list('invoices').filter(i => i.date === date);
  const pays = list('payments').filter(p => p.date === date);
  const exps = list('expenses').filter(e => e.date === date);
  const purs = list('purchases').filter(p => p.date === date && !p.cancelled);
  const rets = list('returns').filter(r => r.date === date && !r.cancelled);
  const modes = {}; pays.forEach(p => { const k = p.mode || 'Cash'; modes[k] = modes[k] || { in: 0, out: 0 }; modes[k][p.dir === 'out' ? 'out' : 'in'] += num(p.amount); });
  exps.forEach(e => { const k = e.mode || 'Cash'; modes[k] = modes[k] || { in: 0, out: 0 }; modes[k].out += num(e.amount); });
  const row = (icon, t, s, amt, cls = '', act = '') => `<div class="row" ${act}><span class="av ${cls}">${ic(icon, 17)}</span><div class="grow"><b class="t">${esc(t)}</b><small class="muted t">${esc(s)}</small></div><span class="amt ${amt < 0 ? 'bad-t' : ''}">${amt < 0 ? '− ' : ''}${inr(Math.abs(amt))}</span></div>`;
  const sales = sum(inv.filter(i => !i.cancelled), i => num(i.total));
  return `<div class="frow"><label class="fld"><span>Date</span><input type="date" value="${date}" max="${today()}" data-ch="dayDate"></label><div class="fld"><span>&nbsp;</span><button class="btn" type="button" data-act="dayPrint" data-d="${date}">${ic('print', 18)} Print day book</button></div></div>
    <div class="doc-strip"><div><small>Sales</small><b>${inr(sales)}</b></div><div><small>Received</small><b class="good-t">${inr(sum(pays.filter(p => p.dir !== 'out'), p => num(p.amount)))}</b></div><div><small>Paid out</small><b class="bad-t">${inr(sum(pays.filter(p => p.dir === 'out'), p => num(p.amount)) + sum(exps, e => num(e.amount)))}</b></div></div>
    ${Object.keys(modes).length ? `<div class="tbl-w"><table class="tbl"><thead><tr><th>Mode</th><th class="n">In</th><th class="n">Out</th><th class="n">Net</th></tr></thead><tbody>${Object.entries(modes).map(([m, v]) => `<tr><td><b>${esc(m)}</b></td><td class="n good-t">${inr(v.in)}</td><td class="n bad-t">${inr(v.out)}</td><td class="n"><b>${inr(v.in - v.out)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
    <section><h4>Bills (${inv.length})</h4><div class="rows">${inv.map(i => row('sales', i.cust.name + (i.cancelled ? ' (cancelled)' : ''), (i.no || '') + ' · ' + (i.createdBy || ''), i.cancelled ? 0 : num(i.total), '', `data-act="openDoc" data-kind="invoices" data-id="${i.id}"`)).join('') || '<p class="muted">None</p>'}</div></section>
    <section><h4>Money in / out (${pays.length})</h4><div class="rows">${pays.map(p => row('cash', (p.dir === 'out' ? 'Paid · ' : 'Received · ') + ((get('parties', p.partyId) || {}).name || p.name || ''), (p.mode || '') + (p.no ? ' · ' + p.no : ''), p.dir === 'out' ? -num(p.amount) : num(p.amount), p.dir === 'out' ? 'clay' : 'acc', `data-act="viewPay" data-id="${p.id}"`)).join('') || '<p class="muted">None</p>'}</div></section>
    <section><h4>Expenses (${exps.length})</h4><div class="rows">${exps.map(e => row('expense', e.note || e.cat, e.cat + ' · ' + (e.mode || ''), -num(e.amount), 'clay', `data-act="editExpense" data-id="${e.id}"`)).join('') || '<p class="muted">None</p>'}</div></section>
    ${purs.length || rets.length ? `<section><h4>Stock in / returns</h4><div class="rows">${purs.map(p => row('truck', 'Purchase · ' + ((get('parties', p.partyId) || {}).name || ''), p.no || '', can('viewCost') ? num(p.total) : 0, 'acc', `data-act="openDoc" data-kind="purchases" data-id="${p.id}"`)).join('')}${rets.map(r => row('return', 'Return · ' + r.cust.name, r.no || '', -num(r.total), 'clay', `data-act="openDoc" data-kind="returns" data-id="${r.id}"`)).join('')}</div></section>` : ''}`;
}
let dayDate = today();
Object.assign(A, {
  dayBook() { dayDate = today(); openSheet({ title: 'Day book', sub: 'Everything that happened on one day', cls: 'wide', body: dayBody(dayDate) }); },
  dayPrint(el) {
    const s = settings(); const d = el.dataset.d;
    const html = dayBody(d).replace(/<div class="frow">[\s\S]*?<\/div><\/div>/, '');
    printHtml(`<article class="paper"><div class="paper-h"><div><span class="shop">${esc(s.shopName || '')}</span></div><div class="doc-tag"><span>DAY BOOK</span><b>${fdateY(d)}</b></div></div>${html}</article>`);
  }
});
CH.dayDate = el => { dayDate = el.value || today(); setSheet(el.closest('.sheet'), { body: dayBody(dayDate) }); };

/* ================= more (phone menu) ================= */
view('more', {
  title: 'More', icon: 'more',
  render() {
    const links = [['credit', 'credit', 'Customers & credit', 'Udhaar, ledgers, reminders'], ['quotes', 'quote', 'Quotations', 'Estimates and follow-up'], ['leads', 'leads', 'Leads', 'Enquiries and call list'], ['expenses', 'expense', 'Expenses', 'Daily spends'], ['purchases', 'cart', 'Purchases', 'Stock from suppliers'], ['suppliers', 'truck', 'Suppliers', 'What you owe'], ['reports', 'chart', 'Reports', 'Sales, GST, profit, stock'], ['settings', 'gear', 'Settings', 'Shop, bill, users, backup']]
      .filter(([v]) => (v !== 'reports' || can('reports')) && (v !== 'purchases' || can('purchases')));
    return `<div class="ph"><div><h1>More</h1><p>${esc(settings().shopName || '')}</p></div></div>
      <div class="more">${links.map(([v, i, t, s]) => `<a href="#/${v}"><span class="qi">${ic(i, 22)}</span><b>${t}</b><small>${s}</small></a>`).join('')}
      <a href="#" data-act="dayBook"><span class="qi">${ic('book', 22)}</span><b>Day book</b><small>Today's cash in and out</small></a>
      <a href="#" data-act="calc"><span class="qi">${ic('calc', 22)}</span><b>Box calculator</b><small>Room size to boxes</small></a></div>`;
  }
});
