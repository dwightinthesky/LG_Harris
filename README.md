# LG Harris Customer Catalogue Builder

A Vite + React tool for LG Harris staff to prepare a customer reference catalogue and export it as an A4 PDF.

## Stack

- Frontend: Vite + React
- Runtime: Cloudflare Pages Functions
- Storage: Cloudflare R2 (`CATALOGUE_BUCKET`)

## Local development

```bash
npm install
npm run dev
```

To test frontend + Functions locally:

```bash
npm run dev:full
```

`dev:full` runs a production build once, then serves `dist` with Cloudflare Pages Functions.

## Cloudflare setup

1. Create two R2 buckets in Cloudflare:
- `lg-harris-catalogue`
- `lg-harris-catalogue-preview`
2. If you use different names, update [wrangler.toml](/Users/just5/Documents/New%20project/LG_Harris/wrangler.toml).
3. Create a Cloudflare Pages project from this GitHub repository.
4. Keep the project name as `lg-harris` (or update `deploy:cf` in [package.json](/Users/just5/Documents/New%20project/LG_Harris/package.json)).
5. Use these build settings in Pages:
- Build command: `npm run build`
- Build output directory: `dist`
6. Add an R2 binding in Pages settings:
- Variable name: `CATALOGUE_BUCKET`
- Bucket: your production bucket

## Production deploy

```bash
npm run deploy:cf
```

If Wrangler is not logged in, run `npx wrangler login` first or set `CLOUDFLARE_API_TOKEN`.
