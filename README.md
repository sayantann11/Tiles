# TileDesk: ERP for tile & sanitary showrooms

Stock by batch and shade, GST billing, quotations, credit (udhaar), purchases, expenses, leads and reports.
Works on phone and computer, even without internet. Runs on free hosting (₹0 per month for one shop).

## Features

| Area | What it does |
|---|---|
| **Billing** | GST tax invoice / bill of supply, CGST+SGST or IGST (picked from customer state), rates with or without GST, line and bill discount, transport and loading charges, round off, amount in words, UPI QR with exact amount, A4 and 80 mm thermal print, delivery challan, WhatsApp share with a bill link, part payment, delivery pending/delivered, architect/mistri commission, edit, cancel (reverses stock and credit), copy |
| **Quotations** | Room-wise lines, area + wastage gives boxes, validity, WhatsApp, convert to bill in one tap, accepted/lost/expired, linked to leads |
| **Stock** | Designs with size, pcs/box, sq ft/box (auto from size), photo or tile-look swatch, batch + shade + location for every lot, boxes + loose pieces, low stock, dead stock, stock-in, damage/sample/count adjustment, transfer between godowns, movement history, box calculator (area, L×W, walls) |
| **Purchases** | Supplier bills with new batch/shade/location, cost update, paid now, supplier balance, reorder list on WhatsApp |
| **Customers & credit** | Credit limit, opening balance, ledger/statement (print), FIFO settlement, ageing 0–30/31–60/61–90/90+, WhatsApp reminders, receipts |
| **Returns** | Credit note against a bill, stock goes back to the batch, adjust in account or refund |
| **Expenses** | 5-second entry, categories, month view, % of sales |
| **Leads** | List and board, follow-up dates, call-today list, notes timeline, stages, lost reason, make quotation |
| **Reports** | Summary + P&L, item-wise, customer-wise, GST (B2B, B2C, HSN, ITC), stock valuation, credit, commission, staff; CSV (Excel) export and print |
| **Team** | Owner / manager / staff roles. Staff cannot see cost or profit, cannot change products or settings, have a discount limit. Activity log. Sign out a user's devices. |
| **Other** | Day book (cash in/out by mode), global search (Ctrl+K), keyboard shortcuts, dark mode, installable app, offline with sync, backup/restore, demo shop |

## How it is built

```
public/            the app (plain JavaScript modules, no build step), service worker, share page
  js/store.js      local-first data: memory + IndexedDB, outbox, background sync
  js/logic.js      GST maths, stock by lot, FIFO credit, reports
  js/v-*.js        screens
server/app.js      API (auth, sync, numbering, users, share links, audit) on any D1/SQLite
functions/api/     Cloudflare Pages Function that runs server/app.js
dev/server.mjs     local server using Node's built-in SQLite (same API)
tests/             API tests + browser end-to-end tests
```

- Every change is saved on the device first, so the app never waits for the internet. Changes sync every 20 s and right after saving.
- Bill numbers are given by the server per financial year (`INV/26-27/0001`), so two phones never make the same number, even offline.
- Passwords are hashed (PBKDF2), logins are rate-limited, shops are fully isolated.

## Run locally

```bash
npm install            # only needed for Cloudflare tools
npm run dev            # http://localhost:8787  (Node 22.5+)
npm run test:api       # 18 API tests
npm run test:e2e       # 21 browser tests (needs Playwright)
```

## Deploy

See [DEPLOY.md](DEPLOY.md). About 10 minutes, free.
