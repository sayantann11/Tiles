// Demo shop data (about 60 days of activity relative to today). Used only in "Try demo" mode.
import { rng, dAgo, addDays, today, asDate } from './core.js';
import { lineSnapshot, docTotals, boxesFor } from './logic.js';

const PRODUCTS = [
  ['Statuario Bianco', 'Vitro Max', 'Floor', '800×1600', 'GVT High Gloss', 27.56, 2, 128, 96, 'marble', '#F3F1ED', '#B3ACA2', 30, [['VM-2409A', 'S1', 42, 'Showroom'], ['VM-2410C', 'S2', 64, 'Godown 1']]],
  ['Calacatta Gold', 'Vitro Max', 'Floor', '600×1200', 'GVT Glossy', 15.5, 2, 92, 68, 'marble', '#F5F0E6', '#C4A262', 40, [['VM-2408B', 'S1', 118, 'Godown 1'], ['VM-2410A', 'S3', 38, 'Showroom']]],
  ['Armani Grey', 'Orient Stone', 'Floor', '600×1200', 'Matt', 15.5, 2, 84, 61, 'stone', '#8C8985', '#6B6763', 40, [['OS-2407', 'G2', 22, 'Showroom'], ['OS-2409', 'G1', 14, 'Godown 1']]],
  ['Onyx Beige', 'Ceramica Nova', 'Floor', '600×600', 'Double Charge', 15.5, 4, 52, 37, 'stone', '#E3D3B8', '#C2A982', 60, [['CN-2406', 'B1', 210, 'Godown 2'], ['CN-2409', 'B2', 95, 'Showroom']]],
  ['Sahara Crema', 'Orient Stone', 'Floor', '800×800', 'Satin', 20.67, 3, 74, 53, 'marble', '#EADBC4', '#C8AE86', 30, [['OS-2410', 'C1', 58, 'Godown 1']]],
  ['Nero Marquina', 'Vitro Max', 'Floor', '600×1200', 'High Gloss', 15.5, 2, 96, 71, 'marble', '#1E1E20', '#D8D6D2', 20, [['VM-2405', 'N1', 12, 'Showroom']]],
  ['Oak Plank Natural', 'Terra Floor', 'Wood', '200×1200', 'Wood Matt', 10.33, 4, 68, 47, 'wood', '#C29567', '#94683F', 50, [['TF-2409', 'W2', 176, 'Godown 2'], ['TF-2410', 'W1', 64, 'Showroom']]],
  ['Teak Plank Dark', 'Terra Floor', 'Wood', '200×1200', 'Wood Rustic', 10.33, 4, 72, 50, 'wood', '#7A4E2D', '#4F3019', 50, [['TF-2408', 'W4', 41, 'Godown 2']]],
  ['Moroccan Blue', 'Ceramica Nova', 'Wall', '300×450', 'Wall Glossy', 8.72, 6, 38, 25, 'pattern', '#F4F1EA', '#2E5E8E', 80, [['CN-2410', 'M1', 260, 'Godown 1']]],
  ['Aqua Linear', 'Ceramica Nova', 'Wall', '300×600', 'Wall Satin', 9.69, 5, 46, 31, 'linear', '#CFE6E4', '#8DBFBC', 60, [['CN-2407', 'A1', 140, 'Godown 1'], ['CN-2410', 'A2', 55, 'Showroom']]],
  ['Metro White', 'Ceramica Nova', 'Wall', '300×600', 'Wall Glossy', 9.69, 5, 42, 28, 'solid', '#F7F7F5', '#DCDCD6', 80, [['CN-2409', 'W1', 58, 'Showroom']]],
  ['Cobble Grey Parking', 'Terra Floor', 'Outdoor', '300×300', 'Heavy Duty 12mm', 9.69, 10, 36, 23, 'cobble', '#9A9893', '#7A7873', 100, [['TF-2406', 'P1', 340, 'Godown 2']]],
  ['Terracotta Anti-Skid', 'Terra Floor', 'Outdoor', '300×300', 'Anti-Skid', 9.69, 10, 40, 26, 'cobble', '#B5653E', '#8C4828', 80, [['TF-2410', 'T1', 190, 'Godown 2']]],
  ['Slate Elevation', 'Orient Stone', 'Elevation', '300×600', '3D Rock', 9.69, 5, 58, 39, 'slate', '#5D615E', '#3C3F3D', 40, [['OS-2408', 'E1', 72, 'Godown 1']]],
  ['Glacier White Nano', 'Vitro Max', 'Floor', '600×600', 'Nano Polish', 15.5, 4, 38, 27, 'solid', '#FAFAF8', '#E6E6E0', 100, [['VM-2410N', 'N1', 420, 'Godown 2']]],
  ['Concrete Ash', 'Orient Stone', 'Floor', '600×1200', 'Carving Matt', 15.5, 2, 88, 64, 'stone', '#A7A49E', '#878480', 30, [['OS-2410C', 'A1', 0, 'Godown 1']]]
];
const OTHER = [
  ['Tile Adhesive C2 (20 kg)', 'BondFix', 'Adhesive & Grout', '20 kg', 'Grey', 'bag', 420, 330, 18, '3214', 'solid', '#B9B6B0', '#9C9993', 40, 160],
  ['Epoxy Grout (1 kg)', 'BondFix', 'Adhesive & Grout', '1 kg', 'Ivory', 'pc', 650, 470, 18, '3214', 'solid', '#EFE8DA', '#D8CFBD', 20, 46],
  ['Wall-hung WC Set', 'AquaLux', 'Sanitary', 'Standard', 'White', 'set', 14500, 10900, 18, '6910', 'solid', '#FFFFFF', '#E3E6E8', 3, 9],
  ['Wash Basin Counter-top', 'AquaLux', 'Sanitary', '500 mm', 'White', 'pc', 4200, 3050, 18, '6910', 'solid', '#FCFCFC', '#DADDE0', 4, 14]
];
const CUSTOMERS = [
  ['Ramesh Patel', 'Contractor', '9000010101', 200000, 48500, 96, 'Bopal'],
  ['Shivam Constructions', 'Builder', '9000010102', 500000, 120000, 41, 'Prahlad Nagar'],
  ['Imran Shaikh', 'Contractor', '9000010103', 150000, 32000, 74, 'Juhapura'],
  ['Green Valley Homes', 'Builder', '9000010104', 800000, 0, 0, 'Gota'],
  ['Ajay Tiling Works', 'Mistri / Fitter', '9000010105', 100000, 18400, 66, 'Naroda'],
  ['Kapoor Interiors', 'Interior Designer', '9000010106', 250000, 0, 0, 'Satellite'],
  ['Sunita Verma', 'Retail', '9000010107', 50000, 0, 0, 'Vastrapur'],
  ['Om Sai Developers', 'Builder', '9000010108', 600000, 64000, 118, 'Chandkheda'],
  ['Ar. Neeta Bhatt', 'Architect', '9000030104', 0, 0, 0, 'Navrangpura']
];
const SUPPLIERS = [['Vitro Max Ceramics', '9000040101', '24AAACV1234A1Z9', 'Morbi'], ['Orient Stone Tiles', '9000040102', '24AAACO5678B1Z2', 'Morbi'], ['Ceramica Nova', '9000040103', '24AAACC9012C1Z7', 'Himmatnagar'], ['Terra Floor Industries', '9000040104', '24AAACT3456D1Z4', 'Thangadh'], ['BondFix Chemicals', '9000040105', '27AAACB7890E1Z1', 'Mumbai']];
const WALKINS = [['Neha Sharma', '9000020101'], ['Vikas Gupta', '9000020102'], ['Anil Joshi', '9000020103'], ['Pooja Nair', '9000020104'], ['Rahul Singh', '9000020105'], ['Farhan Ali', '9000020106'], ['Deepak Yadav', '9000020107'], ['Kavita Rao', '9000020108'], ['Manoj Kumar', '9000020109'], ['Sneha Kulkarni', '9000020110']];
const ROOMS = { Floor: ['Living room', 'Bedroom', 'Hall', 'Dining', 'Office floor'], Wall: ['Kitchen wall', 'Bathroom wall', 'Toilet dado'], Wood: ['Bedroom', 'Study', 'Kids room'], Outdoor: ['Parking', 'Terrace', 'Balcony'], Elevation: ['Front elevation', 'Compound wall'], Sanitary: ['Bathroom'], 'Adhesive & Grout': [''] };

export function demoData() {
  const R = rng(11); const pick = a => a[Math.floor(R() * a.length)]; const between = (a, b) => a + R() * (b - a);
  let t0 = Date.now() - 70 * 864e5; const ts = () => (t0 += 60000);
  const out = { settings: [], products: [], lots: [], parties: [], invoices: [], quotes: [], returns: [], purchases: [], payments: [], adjustments: [], expenses: [], leads: [] };
  const n = { INV: 0, QT: 0, CN: 0, PUR: 0, RCPT: 0, PAY: 0 };
  const numFor = (p, date) => { const d = asDate(date); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return p + '/' + String(y % 100).padStart(2, '0') + '-' + String((y + 1) % 100).padStart(2, '0') + '/' + String(++n[p]).padStart(4, '0'); };

  out.settings.push({
    id: 'shop', shopName: 'Shree Balaji Tiles & Sanitary', tagline: 'Tiles · Sanitary · Bath fittings', owner: 'Rajesh Jain',
    address: 'Shop 4–6, Sardar Patel Ring Road, Near Sola Bridge', city: 'Ahmedabad', state: 'Gujarat', stateCode: '24', pin: '380060',
    gstin: '24ABCDE1234F1Z5', phone: '9000000000', email: 'shop@example.com', upi: 'balajitiles@okaxis', showUpiQr: true,
    bank: { name: 'HDFC Bank', acc: '50200012345678', ifsc: 'HDFC0001234', branch: 'Sola Road' },
    terms: 'Goods once sold will not be taken back after cutting or fixing.\nPlease check shade and batch before fixing; no claim after fixing.\nInterest @18% p.a. on bills unpaid after 30 days.\nSubject to Ahmedabad jurisdiction.',
    quoteTerms: 'Prices valid for 15 days. Transport extra unless mentioned.\nShade may vary slightly from display sample.\nAdvance of 30% to confirm the order.',
    defaultTaxMode: 'excl', wastage: 10, staffMaxDisc: 5, printSize: 'a4', godowns: ['Showroom', 'Godown 1', 'Godown 2'], createdAt: t0
  });
  const productIds = [];
  PRODUCTS.forEach((x, i) => {
    const id = 'p' + (i + 1); productIds.push(id);
    out.products.push({ id, name: x[0], code: x[1].split(' ').map(w => w[0]).join('') + '-' + (101 + i), brand: x[1], category: x[2], size: x[3], finish: x[4], uom: 'box', sqftPerBox: x[5], pcsPerBox: x[6], priceOn: 'sqft', rate: x[7], cost: x[8], gst: 18, hsn: '6907', min: x[12], pattern: x[9], c1: x[10], c2: x[11], active: true, createdAt: ts() });
    x[13].forEach((b, j) => out.lots.push({ id: 'lt' + (i + 1) + '_' + j, productId: id, batch: b[0], shade: b[1], location: b[3], opening: b[2] + 0, date: dAgo(62), createdAt: ts() }));
  });
  OTHER.forEach((x, i) => {
    const id = 'px' + (i + 1); productIds.push(id);
    out.products.push({ id, name: x[0], code: 'OT-' + (201 + i), brand: x[1], category: x[2], size: x[3], finish: x[4], uom: x[5], sqftPerBox: 0, pcsPerBox: 1, priceOn: 'unit', rate: x[6], cost: x[7], gst: x[8], hsn: x[9], min: x[13], pattern: x[10], c1: x[11], c2: x[12], active: true, createdAt: ts() });
    out.lots.push({ id: 'ltx' + (i + 1), productId: id, batch: 'STD', shade: '', location: 'Showroom', opening: x[14], date: dAgo(62), createdAt: ts() });
  });
  const P = id => out.products.find(p => p.id === id);
  const lotFor = pid => out.lots.filter(l => l.productId === pid).sort((a, b) => b.opening - a.opening)[0];

  CUSTOMERS.forEach((x, i) => out.parties.push({ id: 'c' + (i + 1), type: 'customer', name: x[0], kind: x[1], phone: x[2], limit: x[3], opening: x[4], openingDate: x[4] ? dAgo(x[5]) : '', address: x[6] + ', Ahmedabad', stateCode: '24', gstin: x[1] === 'Builder' ? '24AAB' + 'CS' + (1000 + i) + 'K1Z' + (i % 9 + 1) : '', createdAt: ts() }));
  SUPPLIERS.forEach((x, i) => out.parties.push({ id: 's' + (i + 1), type: 'supplier', name: x[0], kind: 'Manufacturer', phone: x[1], gstin: x[2], address: x[3], stateCode: x[2].slice(0, 2), opening: i === 0 ? 85000 : 0, openingDate: dAgo(45), createdAt: ts() }));
  const custs = out.parties.filter(p => p.type === 'customer' && p.kind !== 'Architect');

  // purchases (stock arrivals) in the window
  const purPlan = [[52, 's1', [[0, 'VM-2411A', 'S1', 40, 'Godown 1'], [14, 'VM-2411N', 'N2', 120, 'Godown 2']]], [38, 's2', [[2, 'OS-2411', 'G3', 60, 'Godown 1'], [4, 'OS-2411C', 'C2', 40, 'Godown 1']]], [24, 's3', [[8, 'CN-2411', 'M2', 100, 'Godown 1'], [3, 'CN-2411B', 'B3', 120, 'Godown 2']]], [12, 's4', [[6, 'TF-2411', 'W3', 90, 'Godown 2'], [11, 'TF-2411P', 'P2', 150, 'Godown 2']]], [6, 's5', [[16, 'B-1124', '', 120, 'Godown 1'], [17, 'B-1124E', '', 40, 'Showroom']]]];
  purPlan.forEach(([d, sid, ls], k) => {
    const lines = ls.map(([pi, batch, shade, qty, loc], j) => {
      const p = out.products[pi]; const lid = 'lp' + k + '_' + j;
      out.lots.push({ id: lid, productId: p.id, batch, shade, location: loc, opening: 0, date: dAgo(d), createdAt: ts() });
      return { id: 'ln' + k + j, productId: p.id, lotId: lid, qty, rate: p.cost, ...lineSnapshot(p) };
    });
    const doc = { id: 'pu' + (k + 1), date: dAgo(d), partyId: sid, billNo: 'S/' + (4100 + k * 37), lines, taxMode: 'excl', transport: k % 2 ? 0 : 3500 };
    Object.assign(doc, docTotals(doc), { no: numFor('PUR', doc.date), createdAt: ts() });
    out.purchases.push(doc);
    if (k < 3) out.payments.push({ id: 'pp' + k, no: numFor('PAY', addDays(doc.date, 5)), date: addDays(doc.date, 5), partyId: sid, purchaseId: doc.id, amount: Math.round(doc.total * (k === 0 ? 1 : .6) / 1000) * 1000, mode: 'Bank transfer', dir: 'out', ref: 'NEFT', createdAt: ts() });
  });

  // sales
  const pool = [0, 1, 1, 2, 3, 3, 3, 4, 6, 6, 7, 8, 8, 9, 10, 11, 11, 12, 13, 14, 14, 1, 0, 2, 4, 9, 16, 16, 17];
  for (let d = 58; d >= 0; d--) {
    const dow = asDate(dAgo(d)).getDay();
    const count = d === 0 ? 3 : (dow === 0 ? Math.floor(R() * 2) : 1 + Math.floor(R() * 3));
    for (let k = 0; k < count; k++) {
      const reg = R() < .5; let party = null, cust;
      if (reg) { party = pick(custs); cust = { name: party.name, phone: party.phone, gstin: party.gstin, address: party.address, stateCode: '24' }; }
      else { const w = pick(WALKINS); cust = { name: w[0], phone: w[1], stateCode: '24' }; }
      const big = party && party.kind === 'Builder';
      const cnt = 1 + Math.floor(R() * 3), used = new Set(), lines = [];
      for (let j = 0; j < cnt; j++) {
        const p = out.products[pick(pool)]; if (used.has(p.id)) continue; used.add(p.id);
        const lot = lotFor(p.id);
        let qty;
        if (p.uom === 'box') qty = Math.max(3, Math.round(between(6, 30) * (p.category === 'Outdoor' ? 1.6 : p.category === 'Wall' ? 1.3 : 1) * (big ? 2.2 : 1)));
        else qty = p.category === 'Sanitary' ? 1 + Math.floor(R() * 2) : Math.max(2, Math.round(between(3, 16)));
        lines.push({ id: 'l' + d + k + j, productId: p.id, lotId: lot.id, room: pick(ROOMS[p.category] || ['']), qty, rate: reg ? Math.round(p.rate * .95 * 100) / 100 : p.rate, disc: 0, ...lineSnapshot(p) });
      }
      if (!lines.length) continue;
      const date = dAgo(d);
      const doc = { id: 'iv' + d + '_' + k, date, partyId: party ? party.id : null, cust, lines, taxMode: 'excl', discAmt: reg ? 0 : pick([0, 0, 0, 200, 500]), transport: R() < .5 ? Math.round(between(300, 2400) / 50) * 50 : 0, loading: R() < .3 ? 300 : 0, delivery: { status: d < 2 && R() < .7 ? 'pending' : 'delivered', address: party ? party.address : '' } };
      if (party && R() < .25) { doc.referrerId = 'c9'; doc.commissionPct = 2; }
      Object.assign(doc, docTotals(doc), { no: numFor('INV', date), createdAt: ts(), createdBy: pick(['Rajesh Jain', 'Suresh', 'Suresh', 'Kiran']) });
      out.invoices.push(doc);
      let paid;
      if (!party) paid = doc.total; else { const x = R(); paid = x < .3 ? doc.total : x < .55 ? 0 : Math.round(doc.total * between(.25, .7) / 500) * 500; }
      if (paid > 0) out.payments.push({ id: 'py' + doc.id, no: numFor('RCPT', date), date, partyId: party ? party.id : null, invoiceId: doc.id, amount: paid, mode: pick(['Cash', 'UPI', 'UPI', 'Card']), dir: 'in', createdAt: ts() });
    }
  }
  // later part payments from contractors/builders
  const PAYR = [.3, .55, .3, .8, .25, .85, .9, .4];
  custs.forEach((c, i) => {
    const dues = out.invoices.filter(s => s.partyId === c.id).reduce((a, s) => a + s.total, 0) - out.payments.filter(p => p.partyId === c.id).reduce((a, p) => a + p.amount, 0) + (c.opening || 0);
    if (dues <= 0) return;
    let amt = Math.round(dues * PAYR[i] / 1000) * 1000;
    if (c.opening && c.openingDate && (Date.now() - asDate(c.openingDate)) / 864e5 > 60) amt = Math.min(amt, Math.round(c.opening * 0.4 / 1000) * 1000 + Math.round((dues - c.opening) * 0.5 / 1000) * 1000);
    if (amt <= 0) return;
    const parts = amt > 40000 ? 2 : 1;
    for (let k = 0; k < parts; k++) { const date = dAgo(Math.floor(between(1, 26))); out.payments.push({ id: 'pr' + i + k, no: numFor('RCPT', date), date, partyId: c.id, amount: Math.round(amt / parts), mode: pick(['UPI', 'Cheque', 'Cash', 'Bank transfer']), ref: 'Part payment', dir: 'in', createdAt: ts() }); }
  });
  // one sales return
  const rInv = out.invoices.find(i => i.partyId && i.lines[0].uom === 'box' && i.lines[0].qty > 8);
  if (rInv) {
    const l = rInv.lines[0];
    const ret = { id: 'rt1', date: addDays(rInv.date, 2), invoiceId: rInv.id, partyId: rInv.partyId, cust: rInv.cust, lines: [{ ...l, id: 'rl1', qty: 3 }], taxMode: 'excl', reason: 'Extra boxes returned unopened' };
    Object.assign(ret, docTotals(ret), { no: numFor('CN', ret.date), createdAt: ts() });
    out.returns.push(ret);
  }
  // stock adjustments
  out.adjustments.push({ id: 'ad1', date: dAgo(15), productId: 'p1', lotId: 'lt1_0', qty: -2, reason: 'Damaged', note: 'Broken at unloading', value: 2 * 27.56 * 96, createdAt: ts() });
  out.adjustments.push({ id: 'ad2', date: dAgo(4), productId: 'p2', lotId: 'lt2_0', qty: -3, reason: 'Damaged', note: 'Breakage in transit', value: 3 * 15.5 * 68, createdAt: ts() });
  out.adjustments.push({ id: 'ad3', date: dAgo(9), productId: 'p4', lotId: 'lt4_0', qty: -2, reason: 'Display / sample', note: 'Sample board for showroom', value: 0, createdAt: ts() });

  // opening stock = what is left today + everything that moved out, so today's stock matches the plan above
  const used = new Map();
  for (const i of out.invoices) for (const l of i.lines) used.set(l.lotId, (used.get(l.lotId) || 0) + l.qty);
  for (const r of out.returns) for (const l of r.lines) used.set(l.lotId, (used.get(l.lotId) || 0) - l.qty);
  for (const a of out.adjustments) used.set(a.lotId, (used.get(a.lotId) || 0) - a.qty);
  for (const l of out.lots) if (used.has(l.id) && l.opening + 0 >= 0 && !l.id.startsWith('lp')) l.opening += used.get(l.id);

  // quotes
  const QN = [['Arjun Malhotra', '9000030101'], ['Ar. Neeta Bhatt', '9000030104'], ['Meera Iyer', '9000030106'], ['Pratik Infra', '9000030112'], ['Nikhil Arora', '9000030201'], ['Shweta Jain', '9000030202'], ['Ramesh Patel', '9000010101'], ['Kapoor Interiors', '9000010106'], ['Harish Reddy', '9000030203'], ['Tanvi Kulkarni', '9000030204']];
  const QD = [0, 1, 2, 3, 5, 7, 9, 12, 18, 24], QS = ['Sent', 'Sent', 'Sent', 'Sent', 'Accepted', 'Converted', 'Converted', 'Sent', 'Sent', 'Lost'];
  const qpool = [[0, 9], [1, 3], [8], [3, 11, 13], [6, 7], [4, 10], [14, 12], [1, 5], [2, 9], [13]];
  QN.forEach((x, i) => {
    const party = out.parties.find(p => p.phone === x[1]);
    const lines = qpool[i].map((pi, j) => { const p = out.products[pi]; const area = Math.round(between(p.category === 'Wall' ? 90 : 220, p.category === 'Outdoor' ? 900 : 1500) / 10) * 10; return { id: 'q' + i + j, productId: p.id, room: pick(ROOMS[p.category]), area, wastage: 10, qty: boxesFor(area, p, 10), rate: p.rate, disc: 0, ...lineSnapshot(p) }; });
    const date = dAgo(QD[i]);
    const q = { id: 'qt' + (i + 1), date, partyId: party ? party.id : null, cust: { name: x[0], phone: x[1], stateCode: '24' }, lines, taxMode: 'excl', discAmt: pick([0, 500, 1000]), transport: pick([0, 800, 1200, 1500]), status: QS[i], validDays: 15 };
    Object.assign(q, docTotals(q), { no: numFor('QT', date), createdAt: ts() });
    out.quotes.push(q);
  });
  // leads
  const LD = [
    ['Arjun Malhotra', '9000030101', '3BHK flat flooring, likes 800×1600 glossy look', 1650, 'Walk-in', 'New', 0],
    ['Priya Desai', '9000030102', 'Two bathrooms: wall tiles + anti-skid floor', 420, 'Instagram', 'Contacted', 0],
    ['Sahil Builders', '9000030103', '12-flat project, 600×600 vitrified in bulk', 14000, 'Referral', 'Site visit', 2],
    ['Ar. Neeta Bhatt', '9000030104', 'Villa project, Italian-look GVT, wants samples at site', 3800, 'Architect', 'Quoted', -1],
    ['Rohit Chauhan', '9000030105', 'Parking + front elevation for bungalow', 900, 'IndiaMART', 'New', 1],
    ['Meera Iyer', '9000030106', 'Kitchen wall, Moroccan pattern', 140, 'Walk-in', 'Quoted', 3],
    ['Hotel Sunrise', '9000030107', 'Lobby + 24 rooms flooring', 9200, 'Referral', 'Site visit', 0],
    ['Karan Mehta', '9000030108', 'Wooden plank tiles for two bedrooms', 600, 'Google', 'Contacted', -2],
    ['Lakshmi Textiles', '9000030109', 'Showroom floor, matt finish', 2400, 'Walk-in', 'Won', null],
    ['Vivek Rana', '9000030110', 'Terrace anti-skid', 500, 'Instagram', 'Lost', null],
    ['Bhavna Shah', '9000030111', '2BHK full house, budget ₹60/sq ft', 1100, 'Walk-in', 'New', 0],
    ['Pratik Infra', '9000030112', 'Commercial complex common areas', 7800, 'Contractor', 'Quoted', 4]];
  LD.forEach((x, i) => out.leads.push({ id: 'ld' + (i + 1), name: x[0], phone: x[1], need: x[2], area: x[3], value: Math.round(x[3] * 72 / 1000) * 1000, source: x[4], stage: x[5], follow: x[6] === null ? '' : addDays(today(), x[6]), date: dAgo(2 + Math.floor(R() * 18)), notes: [{ at: Date.now() - (3 + i) * 864e5, by: 'Rajesh Jain', text: 'Enquiry noted. ' + x[2] }], lostReason: x[5] === 'Lost' ? 'Price too high' : '', createdAt: ts() }));
  // expenses
  const addE = (d, cat, amount, note, mode) => out.expenses.push({ id: 'ex' + out.expenses.length, date: dAgo(d), cat, amount, note, mode: mode || pick(['Cash', 'UPI']), createdAt: ts() });
  const dThis = new Date().getDate() - 1; const prev = new Date(); prev.setDate(1); prev.setMonth(prev.getMonth() - 1); const dPrev = Math.round((Date.now() - prev) / 864e5);
  [dThis, dPrev].forEach(d => { addE(d, 'Rent', 65000, 'Showroom + godown rent', 'Bank transfer'); addE(Math.max(0, d - 1), 'Salaries', 142000, 'Staff salary (6 staff)', 'Bank transfer'); addE(Math.max(0, d - 5), 'Electricity', 8400, 'Electricity bill', 'UPI'); addE(Math.max(0, d - 3), 'Marketing', 5000, 'Instagram ads', 'UPI'); });
  for (let d = 40; d >= 0; d--) {
    if (R() < .6) addE(d, 'Transport', Math.round(between(600, 3200) / 50) * 50, pick(['Tempo to Ramesh site', 'Delivery: Bopal', 'Delivery: Satellite', 'Tata Ace hire', 'Return trip from site']));
    if (R() < .5) addE(d, 'Loading / Hamali', Math.round(between(400, 1800) / 50) * 50, pick(['Unloading container', 'Loading for delivery', 'Godown shifting']), 'Cash');
    if (R() < .3) addE(d, 'Shop & Misc', Math.round(between(120, 900) / 10) * 10, pick(['Tea & snacks', 'Stationery', 'Showroom cleaning']), 'Cash');
  }
  [[2, 'Mistri commission: Ramesh site', 6500], [6, 'Architect commission: Neeta Bhatt', 12000], [11, 'Mistri commission: Imran', 3800], [17, 'Plumber referral', 2000], [23, 'Contractor commission: Ajay', 5400]].forEach(x => addE(x[0], 'Commission', x[2], x[1], 'Cash'));
  addE(8, 'Marketing', 12000, 'New display panels for showroom', 'UPI');
  return out;
}
