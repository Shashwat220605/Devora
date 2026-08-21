# Devora API on Cloudflare Workers

The Devora backend keeps its normal Express/Node entrypoint for local development and adds a Cloudflare Workers entrypoint for production.

Cloudflare currently supports Express on Workers through `cloudflare:node` and Node.js compatibility. The Worker entrypoint is `src/worker.ts` and the Wrangler configuration is `wrangler.jsonc`.

## Local development

```powershell
npm install
npm run dev
```

## Cloudflare authentication

```powershell
npx wrangler login
```

## Production secrets

Set the same values you use locally. Do not commit them.

```powershell
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put GITHUB_TOKEN_ENCRYPTION_KEY
npx wrangler secret put FRONTEND_URL
```

For `FRONTEND_URL`, use the public frontend URL after Vercel is deployed, for example:

```text
https://devora.vercel.app
```

## Deploy

```powershell
npm run cf-deploy
```

The deployed API will receive a public `workers.dev` URL. Use its `/api` base in the Vite frontend:

```env
VITE_API_URL=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/api
```

## Local Worker development

```powershell
npm run cf-dev
```

The Worker uses the same Express routes as the local server, so authentication, projects, ProjectFiles, GitHub integration, diff, and sync stay on the same API surface.
