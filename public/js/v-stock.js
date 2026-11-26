// Stock: designs, batches/shades by location, stock in, damage, transfer, product form, box calculator.
import { $, esc, ic, num, inr, inr2, inrS, fmt1, fmt2, fdate, today, daysSince, matches, sum, uid, waLink } from './core.js';
import { A, IN, CH, openSheet, setSheet, closeSheet, closeAll, toast, confirmBox, busy, empty, pill, readForm, invalid, fld, inp, sel, check } from './ui.js';
import { list, get, put, del, settings, can } from './store.js';
import { activeProducts, productStock, stockState, lotsOf, lotQty, qtyText, isTile, unitLabel, priceUnit, cfg, lastSold, soldQty, stockValue, boxesFor, DEFAULTS, activeInvoices } from './logic.js';
import { view, go, state, sw, swBg, pickProduct, moreBtn } from './parts.js';

const PATTERNS = [['marble', 'Marble'], ['stone', 'Stone / speckle'], ['wood', 'Wood plank'], ['pattern', 'Pattern / Moroccan'], ['linear', 'Lines'], ['cobble', 'Cobble / parking'], ['slate', 'Slate / 3D'], ['solid', 'Plain']];
const SIZES = ['300×300', '300×450', '300×600', '400×400', '600×600', '600×1200', '800×800', '800×1600', '1200×1200', '1200×1800', '1200×2400', '200×1200', '150×900', '250×375', '250×750'];
const sqftFromSize = (size, pcs) => { const m = String(size || '').match(/(\d+)\s*[×xX*]\s*(\d+)/); if (!m || !num(pcs)) return 0; return Math.round(+m[1] * +m[2] / 1e6 * 10.7639 * num(pcs) * 100) / 100; };

/* ---------------- stock list ---------------- */
view('stock', {
  title: 'Stock', icon: 'stock',
  render() {
    const st = state.stock || (state.stock = { q: '', cat: 'All', f: 'All', loc: 'All', n: 60 });
    const ps = activeProducts();
    const cats = ['All', ...new Set(ps.map(p => p.category).filter(Boolean))];
    const sold = lastSold();
    const F = { All: () => true, 'Low stock': p => stockState(p) === 'low', 'Out of stock': p => stockState(p) === 'out', 'No sale 90 days': p => productStock(p.id) > 0 && (!sold.get(p.id) || daysSince(sold.get(p.id)) > 90) };
    const locQty = p => st.loc === 'All' ? productStock(p.id) : sum(lotsOf(p.id).filter(l => l.location === st.loc), l => l.qty);
    const rows = ps.filter(p => st.cat === 'All' || p.category === st.cat).filter(F[st.f]).filter(p => matches(st.q, p.name, p.code, p.brand, p.size, p.finish, p.category)).filter(p => st.loc === 'All' || locQty(p) > 0);
    const boxes = sum(ps.filter(isTile), p => Math.max(0, productStock(p.id)));
    const sqft = sum(ps.filter(isTile), p => Math.max(0, productStock(p.id)) * num(p.sqftPerBox));
    return `<div class="ph"><div><h1>Stock</h1><p>${ps.length} designs · ${fmt1(boxes)} boxes · ${fmt1(sqft)} sq ft${can('viewCost') ? ' · worth ' + inr(stockValue()) + ' at cost' : ''}</p></div>
      <div class="ph-act"><button class="btn" type="button" data-act="calc">${ic('calc', 18)} Box calculator</button>${can('products') ? `<button class="btn" type="button" data-act="addDesign">${ic('plus', 18)} New design</button><button class="btn primary" type="button" data-act="newPurchase">${ic('truck', 18)} Stock in</button>` : ''}</div></div>
      <div class="toolbar"><div class="search">${ic('search', 18)}<input id="q-stock" placeholder="Search design, size, brand, code" value="${esc(st.q)}" data-in="listQ" data-v="stock" enterkeyhint="search"></div>
        <select class="sel-sm" data-ch="stockLoc" aria-label="Location">${['All', ...cfg('godowns')].map(g => `<option value="${esc(g)}" ${st.loc === g ? 'selected' : ''}>${g === 'All' ? 'All locations' : esc(g)}</option>`).join('')}</select></div>
      <div class="chips">${cats.map(c => `<button class="chip ${st.cat === c ? 'on' : ''}" type="button" data-act="stockCat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="chips">${Object.keys(F).map(k => `<button class="chip sm ${st.f === k ? 'on' : ''}" type="button" data-act="listF" data-v="stock" data-f="${k}">${k} <em>${ps.filter(F[k]).length}</em></button>`).join('')}</div>
      ${rows.length ? `<div class="pgrid">${rows.slice(0, st.n).map(p => pcard(p, st.loc === 'All' ? null : locQty(p))).join('')}</div>${moreBtn(st.n, rows.length, 'moreStock')}` : `<section class="card">${empty(ps.length ? 'No design matches' : 'No designs yet', ps.length ? 'Try another search or filter.' : 'Add your tile designs with size, box details and rate.', can('products') && !ps.length ? `<button class="btn primary" type="button" data-act="addDesign">${ic('plus', 18)} Add first design</button>` : '')}</section>`}`;
  }
});
function pcard(p, locQ) {
  const q = locQ != null ? locQ : productStock(p.id); const s = stockState(p);
  const min = num(p.min); const pct = min ? Math.min(100, q / (min * 3) * 100) : 100;
  const lots = lotsOf(p.id);
  const locs = [...new Set(lots.map(l => l.location))];
  return `<button class="pcard" type="button" data-act="product" data-id="${p.id}">${sw(p)}<span class="pc-b">
    <span class="pc-t"><b class="t">${esc(p.name)}</b>${s === 'out' ? pill('Out', 'bad') : s === 'low' ? pill('Low', 'warn') : ''}</span>
    <span class="meta t">${esc([p.size, p.finish, p.brand].filter(Boolean).join(' · '))}</span>
    <span class="pc-n"><span><b>${esc(qtyText(q, p))}</b></span>${isTile(p) ? `<span>${fmt1(Math.max(0, q) * num(p.sqftPerBox))} sq ft</span>` : ''}<span>${inr2(p.rate)}${priceUnit(p)}</span></span>
    <span class="bar ${s}"><i style="width:${Math.max(0, pct)}%"></i></span>
    <span class="meta t">${lots.length ? lots.length + ' batch' + (lots.length > 1 ? 'es' : '') + ' · ' + esc(locs.join(', ')) : 'No stock'}</span></span></button>`;
}
CH.stockLoc = el => { state.stock.loc = el.value; go('stock'); };

/* ---------------- product detail ---------------- */
function productBody(id) {
  const p = get('products', id); if (!p) return { body: empty('Not found'), foot: '' };
  const lots = lotsOf(id, true).filter(l => Math.abs(l.qty) > 1e-6 || daysSince(l.date || today()) < 30);
  const q = productStock(id); const tile = isTile(p);
  const s30 = soldQty(30).get(id) || 0, s90 = soldQty(90).get(id) || 0;
  const days = s30 > 0 ? Math.round(Math.max(0, q) / (s30 / 30)) : null;
  const mv = movements(id).slice(0, 12);
  const body = `<div class="prod-top"><span class="sw xl ${p.photo ? 'photo' : ''} ${!tile ? 'nogrout' : ''}" style='${swBg(p)}'></span>
    <div class="prod-info"><div class="pi-t"><h3>${esc(p.name)}</h3>${stockState(p) === 'out' ? pill('Out of stock', 'bad') : stockState(p) === 'low' ? pill('Low stock', 'warn') : pill('In stock', 'good')}</div>
    <p class="muted">${esc([p.code, p.brand, p.category].filter(Boolean).join(' · '))}</p>
    <div class="big-stock"><b>${esc(qtyText(q, p))}</b>${tile ? `<span>${fmt1(Math.max(0, q) * num(p.sqftPerBox))} sq ft</span>` : ''}</div>
    <p class="muted">Sold ${fmt1(s30)} ${unitLabel(p)} in 30 days · ${fmt1(s90)} in 90 days${days != null ? ` · stock lasts about <b>${days} days</b>` : ''}</p></div></div>
    <div class="dl">
      <div><small>Size</small><b>${esc(p.size || '—')}</b></div><div><small>Finish</small><b>${esc(p.finish || '—')}</b></div>
      ${tile ? `<div><small>Per box</small><b>${fmt2(p.sqftPerBox)} sq ft · ${num(p.pcsPerBox)} pcs</b></div>` : `<div><small>Unit</small><b>${esc(unitLabel(p, 1))}</b></div>`}
      <div><small>Selling rate</small><b>${inr2(p.rate)}${priceUnit(p)}${tile && (p.priceOn || 'sqft') === 'sqft' ? `<small class="muted"> = ${inr(num(p.rate) * num(p.sqftPerBox))}/box</small>` : ''}</b></div>
      ${can('viewCost') ? `<div><small>Cost</small><b>${inr2(p.cost)}${priceUnit(p)}${num(p.rate) ? `<small class="muted"> · margin ${Math.round((1 - num(p.cost) / num(p.rate)) * 100)}%</small>` : ''}</b></div>` : ''}
      <div><small>GST · HSN</small><b>${fmt2(p.gst ?? 18)}% · ${esc(p.hsn || '6907')}</b></div><div><small>Reorder below</small><b>${fmt1(num(p.min))} ${unitLabel(p)}</b></div>
    </div>
    <section><div class="sec-h"><h4>Batches & locations</h4>${can('stockAdjust') ? `<button class="link" type="button" data-act="stockIn" data-id="${id}">${ic('plus', 16)} Add stock</button>` : ''}</div>
      ${lots.length ? `<div class="tbl-w"><table class="tbl"><thead><tr><th>Location</th><th>Batch</th><th>Shade</th><th class="n">Stock</th>${tile ? '<th class="n">Sq ft</th>' : ''}<th></th></tr></thead><tbody>
      ${lots.map(l => `<tr><td>${esc(l.location)}</td><td><b>${esc(l.batch || '—')}</b></td><td>${l.shade ? pill(l.shade, 'clay') : '—'}</td><td class="n ${l.qty < 0 ? 'bad-t' : ''}"><b>${esc(qtyText(l.qty, p))}</b></td>${tile ? `<td class="n">${fmt1(l.qty * num(p.sqftPerBox))}</td>` : ''}<td class="n">${can('stockAdjust') ? `<button class="link" type="button" data-act="lotMenu" data-id="${l.id}">Change</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>${lots.filter(l => l.qty > 0).length > 1 ? '<p class="note" style="margin-top:8px">Different batches can have slightly different shades. Give one batch per room where possible.</p>' : ''}` : empty('No stock', 'Use “Add stock” or enter a purchase.')}</section>
    <section><h4>Recent movement</h4>${mv.length ? `<div class="mv">${mv.map(m => `<div class="mv-r ${m.act ? 'click' : ''}" ${m.act || ''}><span class="mv-i ${m.q < 0 ? 'out' : 'in'}">${ic(m.icon, 15)}</span><span class="grow"><b>${esc(m.label)}</b><small class="muted">${fdate(m.date)}${m.sub ? ' · ' + esc(m.sub) : ''}</small></span><b class="${m.q < 0 ? 'bad-t' : 'good-t'}">${m.q > 0 ? '+' : ''}${esc(qtyText(m.q, p))}</b></div>`).join('')}</div>` : '<p class="muted">Nothing yet.</p>'}</section>`;
  const B = [];
  B.push(`<button class="btn" type="button" data-act="shareDesign" data-id="${id}">${ic('wa', 18)}<span>Share</span></button>`);
  if (can('products')) B.push(`<button class="btn" type="button" data-act="editDesign" data-id="${id}">${ic('edit', 18)}<span>Edit</span></button>`);
  if (can('stockAdjust')) B.push(`<button class="btn" type="button" data-act="adjust" data-id="${id}">${ic('broken', 18)}<span>Damage / adjust</span></button>`);
  B.push(`<button class="btn primary" type="button" data-act="quoteWith" data-id="${id}">${ic('quote', 18)}<span>Quote</span></button>`);
  return { body, foot: `<div class="doc-acts">${B.join('')}</div>` };
}
function movements(pid) {
  const out = [];
  for (const i of activeInvoices()) for (const l of i.lines) if (l.productId === pid) out.push({ date: i.date, t: i.createdAt || 0, q: -num(l.qty), label: 'Sold · ' + (i.cust.name || ''), sub: (i.no || '') + (l.batch ? ' · ' + l.batch : ''), icon: 'sales', act: `data-act="openDoc" data-kind="invoices" data-id="${i.id}"` });
  for (const p of list('purchases')) if (!p.cancelled) for (const l of p.lines) if (l.productId === pid) out.push({ date: p.date, t: p.createdAt || 0, q: num(l.qty), label: 'Purchase · ' + ((get('parties', p.partyId) || {}).name || ''), sub: l.batch || '', icon: 'truck', act: `data-act="openDoc" data-kind="purchases" data-id="${p.id}"` });
  for (const r of list('returns')) if (!r.cancelled) for (const l of r.lines) if (l.productId === pid) out.push({ date: r.date, t: r.createdAt || 0, q: num(l.qty), label: 'Returned · ' + (r.cust.name || ''), sub: r.no || '', icon: 'return', act: `data-act="openDoc" data-kind="returns" data-id="${r.id}"` });
  for (const a of list('adjustments')) if (a.productId === pid) out.push({ date: a.date, t: a.createdAt || 0, q: num(a.qty), label: a.reason || 'Adjustment', sub: a.note || '', icon: a.reason === 'Transfer' ? 'transfer' : a.qty < 0 ? 'broken' : 'plus' });
  for (const l of list('lots')) if (l.productId === pid && num(l.opening)) out.push({ date: l.date || '2000-01-01', t: l.createdAt || 0, q: num(l.opening), label: 'Opening stock', sub: (l.batch || '') + ' · ' + l.location, icon: 'box' });
  return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.t - a.t);
}
export function showProduct(id) { const c = productBody(id); const s = openSheet({ title: 'Design', cls: 'wide', body: c.body, foot: c.foot }); s.dataset.liveProduct = id; }
export function refreshProductSheets() { document.querySelectorAll('.sheet[data-live-product]').forEach(s => { if (!get('products', s.dataset.liveProduct)) return; const b = s.querySelector('.sheet-b'); const st = b.scrollTop; setSheet(s, productBody(s.dataset.liveProduct)); s.querySelector('.sheet-b').scrollTop = st; }); }

/* ---------------- product form ---------------- */
let photoData = null;
function productForm(p) {
  const isNew = !p.id;
  const cats = cfg('categories');
  const uom = p.uom || 'box';
  return `<div class="pf-top"><span class="sw lg" data-prev style='${swBg(p)}'></span><div class="grow">${fld('Design name', inp('name', p.name, 'autocomplete="off" autofocus placeholder="e.g. Statuario Bianco"'))}</div></div>
    <div class="frow">${fld('Code / SKU', inp('code', p.code, 'autocomplete="off"'))}${fld('Brand / company', inp('brand', p.brand, 'autocomplete="off" list="brand-dl"'))}</div>
    <div class="frow">${fld('Category', `<input name="category" value="${esc(p.category || cats[0])}" list="cat-dl" autocomplete="off">`)}${fld('Sold as', sel('uom', cfg('units'), uom, 'data-ch="pfUom"'))}</div>
    <div class="tile-only ${uom === 'box' ? '' : 'hidden'}">
      <div class="frow3">${fld('Size (mm)', `<input name="size" value="${esc(p.size || '')}" list="size-dl" placeholder="600×1200" autocomplete="off" data-in="pfCalc">`)}${fld('Pieces per box', inp('pcsPerBox', p.pcsPerBox || '', 'inputmode="numeric" data-in="pfCalc"'))}${fld('Sq ft per box', inp('sqftPerBox', p.sqftPerBox || '', 'inputmode="decimal"'), { hint: 'Filled from size × pieces. Check the box label.' })}</div>
      <div class="frow">${fld('Finish', inp('finish', p.finish, 'autocomplete="off" placeholder="Glossy, Matt, Satin…"'))}${fld('Price is per', sel('priceOn', [['sqft', 'Sq ft'], ['unit', 'Box']], p.priceOn || 'sqft'))}</div>
    </div>
    <div class="nontile-only ${uom === 'box' ? 'hidden' : ''}">${fld('Size / pack', inp('size2', uom === 'box' ? '' : p.size, 'autocomplete="off" placeholder="e.g. 20 kg, 500 mm"'))}</div>
    <div class="frow3">${fld('Selling rate ₹', inp('rate', p.rate || '', 'inputmode="decimal"'))}${can('viewCost') ? fld('Cost ₹', inp('cost', p.cost || '', 'inputmode="decimal"')) : ''}${fld('GST %', sel('gst', [0, 5, 12, 18, 28], p.gst ?? DEFAULTS.gst))}</div>
    <div class="frow3">${fld('HSN code', inp('hsn', p.hsn || (uom === 'box' ? '6907' : ''), 'inputmode="numeric"'))}${fld('Reorder when below', inp('min', p.min || '', 'inputmode="decimal"'))}${fld('Status', sel('active', [['1', 'Active'], ['0', 'Discontinued']], p.active === false ? '0' : '1'))}</div>
    <section class="b-sec"><h4>Look</h4>
      <div class="frow3">${fld('Pattern', sel('pattern', PATTERNS, p.pattern || 'marble', 'data-ch="pfLook"'))}${fld('Base colour', `<input type="color" name="c1" value="${esc(p.c1 || '#EDE7DC')}" data-in="pfLook">`)}${fld('Vein / 2nd colour', `<input type="color" name="c2" value="${esc(p.c2 || '#B9AE9E')}" data-in="pfLook">`)}</div>
      <div class="photo-row"><label class="btn">${ic('camera', 18)} ${p.photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/*" capture="environment" data-ch="pfPhoto" hidden></label>${p.photo ? `<button class="btn" type="button" data-act="pfNoPhoto">Remove photo</button>` : ''}<small class="muted">A photo of the tile or catalogue. Kept small so the app stays fast.</small></div>
    </section>
    ${isNew ? `<section class="b-sec"><h4>Opening stock (optional)</h4><div class="frow3">${fld('Boxes / qty', inp('oqty', '', 'inputmode="decimal" placeholder="0"'))}${fld('Batch no.', inp('obatch', '', 'autocomplete="off"'))}${fld('Shade', inp('oshade', '', 'autocomplete="off"'))}</div>${fld('Location', sel('oloc', cfg('godowns'), cfg('godowns')[0]))}</section>` : ''}
    <datalist id="cat-dl">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    <datalist id="size-dl">${SIZES.map(c => `<option value="${c}">`).join('')}</datalist>
    <datalist id="brand-dl">${[...new Set(list('products').map(x => x.brand).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
}
IN.pfCalc = el => { const s = el.closest('.sheet'); const v = sqftFromSize(s.querySelector('[name=size]').value, s.querySelector('[name=pcsPerBox]').value); if (v) s.querySelector('[name=sqftPerBox]').value = v; };
CH.pfUom = el => { const s = el.closest('.sheet'); const t = el.value === 'box'; s.querySelector('.tile-only').classList.toggle('hidden', !t); s.querySelector('.nontile-only').classList.toggle('hidden', t); const h = s.querySelector('[name=hsn]'); if (!t && h.value === '6907') h.value = ''; };
const lookOf = s => ({ pattern: s.querySelector('[name=pattern]').value, c1: s.querySelector('[name=c1]').value, c2: s.querySelector('[name=c2]').value, photo: photoData || '' });
CH.pfLook = el => { const s = el.closest('.sheet'); s.querySelector('[data-prev]').setAttribute('style', swBg(lookOf(s))); };
IN.pfLook = CH.pfLook;
CH.pfPhoto = async el => {
  const f = el.files && el.files[0]; if (!f) return;
  try { photoData = await shrink(f, 360); const s = el.closest('.sheet'); s.querySelector('[data-prev]').setAttribute('style', swBg(lookOf(s))); s.querySelector('[data-prev]').classList.add('photo'); toast('Photo added'); }
  catch { toast('Could not read this photo', 'bad'); }
};
A.pfNoPhoto = el => { photoData = ''; const s = el.closest('.sheet'); s.querySelector('[data-prev]').setAttribute('style', swBg(lookOf(s))); el.remove(); };
function shrink(file, max) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.72)); };
    img.onerror = rej; img.src = url;
  });
}
async function saveProduct(sheet, id) {
  const f = readForm(sheet);
  if (!f.name) return invalid(sheet, 'name', 'Enter the design name');
  const tile = f.uom === 'box';
  if (tile && !num(f.sqftPerBox)) return invalid(sheet, 'sqftPerBox', 'Enter sq ft per box (from the box label)');
  if (!num(f.rate)) return invalid(sheet, 'rate', 'Enter the selling rate');
  const prev = id ? get('products', id) : {};
  const dup = list('products').find(p => p.id !== id && p.name.toLowerCase() === f.name.toLowerCase() && (p.size || '') === (tile ? f.size : f.size2));
  if (dup && !(await confirmBox({ title: 'Same design exists', text: `${esc(dup.name)} ${esc(dup.size || '')} is already saved. Save another?`, ok: 'Save anyway' }))) return;
  const rec = {
    ...prev, id: id || undefined, name: f.name, code: f.code, brand: f.brand, category: f.category, uom: f.uom,
    size: tile ? f.size : f.size2, finish: tile ? f.finish : (prev.finish || ''), pcsPerBox: tile ? num(f.pcsPerBox) : 1, sqftPerBox: tile ? num(f.sqftPerBox) : 0, priceOn: tile ? f.priceOn : 'unit',
    rate: num(f.rate), cost: f.cost != null ? num(f.cost) : num(prev.cost), gst: num(f.gst), hsn: f.hsn, min: num(f.min), active: f.active !== '0',
    pattern: f.pattern, c1: f.c1, c2: f.c2, photo: photoData === null ? (prev.photo || '') : photoData
  };
  const writes = [{ c: 'products', d: rec }];
  const saved = await put(writes);
  const pid = saved[0].id;
  if (!id && num(f.oqty)) await put('lots', { productId: pid, batch: f.obatch || 'OPENING', shade: f.oshade, location: f.oloc, opening: num(f.oqty), date: today() });
  toast(id ? 'Design saved' : 'Design added');
  closeSheet();
  if (!id) setTimeout(() => showProduct(pid), 200);
}

/* ---------------- stock in / adjust / transfer ---------------- */
function lotSelect(pid, name = 'lot', withNew = false, selected = '') {
  const lots = lotsOf(pid, true); const p = get('products', pid);
  return `<select name="${name}" ${withNew ? 'data-ch="siLot"' : ''}>${withNew ? '<option value="">New batch</option>' : ''}${lots.map(l => `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${esc(l.location)} · ${esc(l.batch || '-')}${l.shade ? ' · ' + esc(l.shade) : ''} · ${esc(qtyText(l.qty, p))}</option>`).join('')}</select>`;
}
CH.siLot = el => { el.closest('.sheet').querySelector('.new-lot').classList.toggle('hidden', !!el.value); };
Object.assign(A, {
  product: el => showProduct(el.dataset.id),
  addDesign() { if (!can('products')) { toast('Ask the owner to add designs', 'bad'); return; } photoData = null; openSheet({ title: 'New design', cls: 'wide', body: productForm({ uom: 'box', gst: 18, hsn: '6907', active: true }), foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveDesign">Save design</button>` }); },
  editDesign(el) { const p = get('products', el.dataset.id); photoData = null; openSheet({ title: 'Edit design', cls: 'wide', body: productForm(p), foot: `<button class="btn danger" type="button" data-act="delDesign" data-id="${p.id}">${ic('trash', 16)}</button><span class="spacer"></span><button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveDesign" data-id="${p.id}">Save</button>` }); },
  saveDesign: el => busy(el, () => saveProduct(el.closest('.sheet'), el.dataset.id)),
  async delDesign(el) {
    const p = get('products', el.dataset.id);
    const used = list('invoices').some(i => i.lines.some(l => l.productId === p.id)) || list('quotes').some(i => i.lines.some(l => l.productId === p.id)) || list('purchases').some(i => i.lines.some(l => l.productId === p.id));
    if (used) {
      if (await confirmBox({ title: 'Used in bills', text: 'This design is on old bills, so it cannot be deleted. Mark it as discontinued instead? It will be hidden from stock and billing.', ok: 'Discontinue' })) { await put('products', { ...p, active: false }); closeAll(); toast('Marked discontinued'); }
      return;
    }
    if (!(await confirmBox({ title: 'Delete ' + p.name + '?', text: 'Its batches will be removed too.', ok: 'Delete', danger: true }))) return;
    for (const l of list('lots').filter(l => l.productId === p.id)) await del('lots', l.id);
    for (const a of list('adjustments').filter(a => a.productId === p.id)) await del('adjustments', a.id);
    await del('products', p.id); closeAll(); toast('Deleted');
  },
  async stockIn(el) {
    let p = el.dataset.id ? get('products', el.dataset.id) : await pickProduct({ title: 'Add stock for' });
    if (!p) return;
    openSheet({
      title: 'Add stock', sub: esc(p.name + ' · ' + (p.size || '')), cls: 'narrow', body: `
      <p class="note">For stock bought from a supplier, use <b>Purchases</b> so the supplier balance is kept. Use this for opening stock or a count correction.</p>
      ${fld('Add to', lotSelect(p.id, 'lot', true))}
      <div class="new-lot"><div class="frow">${fld('Batch no.', inp('batch', '', 'autocomplete="off"'))}${fld('Shade', inp('shade', '', 'autocomplete="off"'))}</div>${fld('Location', sel('location', cfg('godowns'), cfg('godowns')[0]))}</div>
      <div class="frow">${fld(isTile(p) ? 'Boxes' : 'Qty (' + unitLabel(p) + ')', inp('qty', '', 'inputmode="decimal" autofocus'))}${fld('Reason', sel('reason', ['Opening stock', 'Count correction', 'Found in godown', 'Returned by site']))}</div>
      ${fld('Note', inp('note', '', 'autocomplete="off"'))}`,
      foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveStockIn" data-id="${p.id}">Add stock</button>`
    });
    const s = document.querySelector('.layer:last-child .sheet'); if (s.querySelector('[name=lot]').value) s.querySelector('.new-lot').classList.add('hidden');
  },
  saveStockIn: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s); const pid = el.dataset.id;
    const q = num(f.qty); if (q <= 0) return invalid(s, 'qty', 'Enter quantity');
    if (f.lot) await put('adjustments', { date: today(), productId: pid, lotId: f.lot, qty: q, reason: f.reason, note: f.note });
    else {
      const ex = lotsOf(pid, true).find(l => (l.batch || '') === f.batch && (l.shade || '') === f.shade && l.location === f.location);
      if (ex) await put('adjustments', { date: today(), productId: pid, lotId: ex.id, qty: q, reason: f.reason, note: f.note });
      else await put('lots', { productId: pid, batch: f.batch || 'OPENING', shade: f.shade, location: f.location, opening: q, date: today(), note: f.reason + (f.note ? ': ' + f.note : '') });
    }
    toast('Stock added'); closeSheet();
  }),
  adjust(el) {
    const p = get('products', el.dataset.id);
    const lots = lotsOf(p.id);
    if (!lots.length) { toast('No stock to adjust', 'bad'); return; }
    openSheet({
      title: 'Damage / adjust stock', sub: esc(p.name), cls: 'narrow', body: `
      ${fld('From batch', lotSelect(p.id, 'lot', false, el.dataset.lot || lots[0].id))}
      ${fld('What happened', sel('reason', [['Damaged', 'Broken / damaged'], ['Display / sample', 'Used for display or sample'], ['Returned to supplier', 'Returned to supplier'], ['Count correction', 'Count correction (less than system)'], ['Count plus', 'Count correction (more than system)']], 'Damaged'))}
      <div class="frow">${fld(isTile(p) ? 'Boxes' : 'Qty', inp('qty', '', 'inputmode="decimal" autofocus'))}${isTile(p) ? fld('Loose pieces', inp('pcs', '', 'inputmode="numeric"')) : ''}</div>
      ${fld('Note', inp('note', '', 'autocomplete="off" placeholder="e.g. broken at unloading"'))}`,
      foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveAdjust" data-id="${p.id}">Save</button>`
    });
  },
  saveAdjust: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s); const p = get('products', el.dataset.id);
    const q = num(f.qty) + (isTile(p) ? num(f.pcs) / (num(p.pcsPerBox) || 1) : 0);
    if (q <= 0) return invalid(s, 'qty', 'Enter quantity');
    const sign = f.reason === 'Count plus' ? 1 : -1;
    const unitCost = isTile(p) && (p.priceOn || 'sqft') === 'sqft' ? num(p.cost) * num(p.sqftPerBox) : num(p.cost);
    await put('adjustments', { date: today(), productId: p.id, lotId: f.lot, qty: sign * q, reason: f.reason === 'Count plus' ? 'Count correction' : f.reason, note: f.note, value: sign < 0 && f.reason === 'Damaged' ? Math.round(q * unitCost) : 0 });
    toast('Stock updated'); closeSheet();
  }),
  lotMenu(el) {
    const l = get('lots', el.dataset.id); const p = get('products', l.productId);
    openSheet({ title: 'Batch ' + (l.batch || ''), sub: esc(p.name + ' · ' + l.location + ' · ' + qtyText(lotQty(l.id), p)), cls: 'narrow menu', body: `<div class="menu-l">
      <button class="menu-i" type="button" data-act="transfer" data-id="${l.id}">${ic('transfer', 18)}<span>Move to another location</span></button>
      <button class="menu-i" type="button" data-act="adjustLot" data-id="${l.id}">${ic('broken', 18)}<span>Damage / adjust</span></button>
      <button class="menu-i" type="button" data-act="editLot" data-id="${l.id}">${ic('edit', 18)}<span>Edit batch / shade name</span></button></div>` });
  },
  adjustLot(el) { const l = get('lots', el.dataset.id); closeSheet(); setTimeout(() => A.adjust({ dataset: { id: l.productId, lot: l.id } }), 120); },
  transfer(el) {
    const l = get('lots', el.dataset.id); const p = get('products', l.productId);
    const others = cfg('godowns').filter(g => g !== l.location);
    setSheet(el.closest('.sheet'), { title: 'Move stock', sub: esc(`${p.name} · batch ${l.batch} · ${l.location} has ${qtyText(lotQty(l.id), p)}`), body: `<div class="frow">${fld('Move to', sel('to', others, others[0]))}${fld(isTile(p) ? 'Boxes' : 'Qty', inp('qty', Math.max(0, Math.floor(lotQty(l.id))), 'inputmode="decimal" autofocus'))}</div>${fld('Note', inp('note', '', 'placeholder="e.g. for showroom display"'))}`, foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveTransfer" data-id="${l.id}">Move</button>` });
  },
  saveTransfer: el => busy(el, async () => {
    const s = el.closest('.sheet'); const f = readForm(s); const l = get('lots', el.dataset.id);
    const q = num(f.qty); if (q <= 0) return invalid(s, 'qty', 'Enter quantity');
    if (q > lotQty(l.id) + 1e-6) return invalid(s, 'qty', 'More than available in this batch');
    let dest = list('lots').find(x => x.productId === l.productId && x.batch === l.batch && (x.shade || '') === (l.shade || '') && x.location === f.to);
    const writes = [];
    if (!dest) { dest = { id: uid('lt'), productId: l.productId, batch: l.batch, shade: l.shade, location: f.to, opening: 0, date: today() }; writes.push({ c: 'lots', d: dest }); }
    writes.push({ c: 'adjustments', d: { date: today(), productId: l.productId, lotId: l.id, qty: -q, reason: 'Transfer', note: 'To ' + f.to + (f.note ? ': ' + f.note : '') } });
    writes.push({ c: 'adjustments', d: { date: today(), productId: l.productId, lotId: dest.id, qty: q, reason: 'Transfer', note: 'From ' + l.location + (f.note ? ': ' + f.note : '') } });
    await put(writes); toast('Moved to ' + f.to); closeSheet();
  }),
  editLot(el) {
    const l = get('lots', el.dataset.id);
    setSheet(el.closest('.sheet'), { title: 'Edit batch', body: `<div class="frow">${fld('Batch no.', inp('batch', l.batch))}${fld('Shade', inp('shade', l.shade))}</div>`, foot: `<button class="btn" type="button" data-act="closeSheet">Cancel</button><button class="btn primary" type="button" data-act="saveLot" data-id="${l.id}">Save</button>` });
  },
  saveLot: el => busy(el, async () => { const f = readForm(el.closest('.sheet')); const l = get('lots', el.dataset.id); await put('lots', { ...l, batch: f.batch, shade: f.shade }); toast('Saved'); closeSheet(); }),
  shareDesign(el) {
    const p = get('products', el.dataset.id); const s = settings();
    const text = `*${p.name}*${p.size ? ' · ' + p.size : ''}\n${[p.finish, p.brand].filter(Boolean).join(' · ')}\nRate: ${inr2(p.rate)}${priceUnit(p)}${isTile(p) ? `\nBox: ${fmt2(p.sqftPerBox)} sq ft (${num(p.pcsPerBox)} pcs)` : ''}\n${productStock(p.id) > 0 ? 'In stock ✅' : 'On order'}\n\n${s.shopName || ''}${s.phone ? '\n' + s.phone : ''}`;
    window.open(waLink('', text), '_blank');
  },
  quoteWith(el) {
    const p = get('products', el.dataset.id);
    import('./v-docs.js').then(m => { closeAll(() => { const d = m.newDraft('quotes'); m.openBuilder(d); A.__addLine && A.__addLine(p); }); });
  },
  stockCat(el) { state.stock.cat = el.dataset.c; go('stock'); },
  moreStock: () => { state.stock.n += 100; go('stock'); },

  /* box calculator */
  async calc(el) {
    const p = el && el.dataset && el.dataset.id ? get('products', el.dataset.id) : null;
    const tiles = list('products').filter(x => isTile(x) && x.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    openSheet({
      title: 'Box calculator', sub: 'Room size → boxes, pieces and price', cls: 'narrow', body: `
      ${fld('Design', `<select name="pid" data-ch="calcRun"><option value="">Custom tile size</option>${tiles.map(t => `<option value="${t.id}" ${p && p.id === t.id ? 'selected' : ''}>${esc(t.name)} · ${esc(t.size)}</option>`).join('')}</select>`)}
      <div class="frow custom-tile">${fld('Tile size (mm)', `<input name="size" value="600×600" list="size-dl2" data-in="calcRun">`)}${fld('Pieces per box', inp('pcs', '4', 'inputmode="numeric" data-in="calcRun"'))}</div>
      ${fld('How to measure', `<div class="seg"><label><input type="radio" name="how" value="area" checked data-ch="calcRun"><span>Area sq ft</span></label><label><input type="radio" name="how" value="lw" data-ch="calcRun"><span>Length × width (ft)</span></label><label><input type="radio" name="how" value="wall" data-ch="calcRun"><span>Walls</span></label></div>`)}
      <div class="m-area">${fld('Area (sq ft)', inp('area', '', 'inputmode="decimal" data-in="calcRun" autofocus placeholder="e.g. 450"'))}</div>
      <div class="m-lw hidden frow">${fld('Length (ft)', inp('len', '', 'inputmode="decimal" data-in="calcRun"'))}${fld('Width (ft)', inp('wid', '', 'inputmode="decimal" data-in="calcRun"'))}</div>
      <div class="m-wall hidden"><div class="frow3">${fld('Room length (ft)', inp('wl', '', 'inputmode="decimal" data-in="calcRun"'))}${fld('Room width (ft)', inp('ww', '', 'inputmode="decimal" data-in="calcRun"'))}${fld('Tile height (ft)', inp('wh', '7', 'inputmode="decimal" data-in="calcRun"'))}</div>${fld('Less doors/windows (sq ft)', inp('wd', '20', 'inputmode="decimal" data-in="calcRun"'))}</div>
      ${fld('Wastage %', `<div class="seg">${[5, 8, 10, 12, 15].map(w => `<label><input type="radio" name="wastage" value="${w}" ${w === num(settings().wastage ?? 10) ? 'checked' : ''} data-ch="calcRun"><span>${w}%</span></label>`).join('')}</div>`, { hint: 'Straight laying ≈ 8–10%. Diagonal or many cuts ≈ 12–15%.' })}
      <div class="calc-out" data-out></div>
      <datalist id="size-dl2">${SIZES.map(c => `<option value="${c}">`).join('')}</datalist>`,
      foot: `<button class="btn" type="button" data-act="closeSheet">Close</button><button class="btn primary" type="button" data-act="calcQuote">${ic('quote', 18)} Make quotation</button>`
    });
    CH.calcRun(document.querySelector('.layer:last-child [name=pid]'));
  },
  calcQuote(el) {
    const s = el.closest('.sheet'); const r = calcResult(s);
    if (!r.p) { toast('Pick a saved design to make a quotation', 'bad'); return; }
    import('./v-docs.js').then(m => closeAll(() => { const d = m.newDraft('quotes'); m.openBuilder(d); A.__addLine && A.__addLine(r.p, { area: r.area, wastage: r.w }); }));
  }
});
function calcResult(s) {
  const f = readForm(s);
  const p = f.pid ? get('products', f.pid) : null;
  s.querySelector('.custom-tile').classList.toggle('hidden', !!p);
  ['area', 'lw', 'wall'].forEach(m => s.querySelector('.m-' + m).classList.toggle('hidden', f.how !== m));
  let area = num(f.area);
  if (f.how === 'lw') area = num(f.len) * num(f.wid);
  if (f.how === 'wall') area = Math.max(0, 2 * (num(f.wl) + num(f.ww)) * num(f.wh) - num(f.wd));
  const spb = p ? num(p.sqftPerBox) : sqftFromSize(f.size, f.pcs);
  const pcs = p ? num(p.pcsPerBox) : num(f.pcs);
  const w = num(f.wastage);
  return { p, area, w, spb, pcs, boxes: spb ? Math.ceil(area * (1 + w / 100) / spb - 1e-9) : 0 };
}
CH.calcRun = el => {
  const s = el.closest('.sheet'); const r = calcResult(s); const out = s.querySelector('[data-out]');
  if (!r.area || !r.spb) { out.innerHTML = '<span class="muted">Enter the area to see boxes needed.</span>'; return; }
  const need = r.area * (1 + r.w / 100);
  const price = r.p ? ((r.p.priceOn || 'sqft') === 'sqft' ? r.boxes * r.spb * num(r.p.rate) : r.boxes * num(r.p.rate)) : 0;
  const stock = r.p ? productStock(r.p.id) : null;
  out.innerHTML = `<div class="calc-big"><b>${r.boxes}</b><span>boxes</span></div>
    <div class="calc-grid"><div><small>Area</small><b>${fmt1(r.area)} sq ft</b></div><div><small>With ${r.w}% wastage</small><b>${fmt1(need)} sq ft</b></div><div><small>Tiles</small><b>${r.boxes * r.pcs} pcs</b></div><div><small>You get</small><b>${fmt1(r.boxes * r.spb)} sq ft</b></div>
    ${r.p ? `<div><small>Price before GST</small><b>${inr(price)}</b></div><div><small>In stock</small><b class="${stock < r.boxes ? 'bad-t' : 'good-t'}">${esc(qtyText(stock, r.p))}</b></div>` : ''}</div>`;
};
IN.calcRun = CH.calcRun;
