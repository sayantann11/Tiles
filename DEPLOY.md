# Deploy TileDesk (free)

TileDesk runs on **Cloudflare Pages + D1**. The free plan covers a tile shop many times over:

| Free limit (per day) | A busy shop uses |
|---|---|
| 100,000 API requests | ~5,000 (3–4 devices open all day) |
| 5 million database reads, 100,000 writes | a few thousand |
| 5 GB database | ~50 MB after several years |
| Unlimited website traffic | |

It never sleeps (unlike free Render/Heroku), and pages are served from data centres in India.
**Monthly cost: ₹0.** Optional: your own domain (about ₹700–900 per year).

## One-time setup (about 10 minutes)

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. On your computer, in this folder:

```bash
npm install
npx wrangler login                     # opens the browser, click Allow
npx wrangler d1 create tiledesk        # prints a database_id
```

3. Paste that `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).
4. Deploy:

```bash
npm run deploy
```

It prints your address, for example `https://tiledesk.pages.dev`. Open it, choose **New shop** and create the owner account.
The database tables are created automatically on the first request.

5. (Recommended) Set a fixed secret for login tokens:

```bash
npx wrangler pages secret put AUTH_SECRET --project-name=tiledesk
```

Type any long random text. Without this, a secret is generated and stored in the database automatically.

## Updates

Change the code, then run `npm run deploy` again. Phones get a "New version ready · Update" message.

Or connect the GitHub repo in Cloudflare (Workers & Pages → your project → Settings → Builds) with build output directory `public`, so every push deploys.
If you do that, add the D1 binding in the dashboard: Settings → Bindings → D1 database → variable name `DB` → `tiledesk`.

## Custom domain

Cloudflare dashboard → Workers & Pages → tiledesk → Custom domains → add `erp.yourshop.in`.

## Backups

- Owner: Settings → Backup & data → **Download backup** (a JSON file). Keep one per month on Google Drive.
- Server: `npx wrangler d1 export tiledesk --remote --output=backup.sql`.
- D1 Time Travel can restore the database to any point in the last 7 days (free plan).

## Install on phones

Open the address in Chrome → menu (⋮) → **Install app**. On iPhone: Safari → Share → **Add to Home Screen**.

## Other hosting

The `public/` folder works on any static host (Render, Netlify, GitHub Pages) in **demo mode**.
For real accounts and sync the `/api` must run somewhere with a database: Cloudflare (above) is the free option.
To use a different API address, set `window.TD_API = 'https://your-api.example.com'` in `public/index.html`.
