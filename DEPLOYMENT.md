# Deployment (quick + persistent)

## Quick share link (temporary)

This repo can be shared with a temporary public URL via a reverse tunnel (works while your machine is running).

## Persistent hosting (recommended)

The backend (`server/index.mjs`) can serve both:

- `POST /api/face-scan`
- static frontend from `dist/` (SPA fallback to `dist/index.html`)

### Local production run

1. `npm install`
2. `npm run build`
3. `set NODE_ENV=production`
4. `set SERVE_DIST=1`
5. `npm start`

The server listens on `PORT` (or `8787` by default).

### Render.com (1 service)

Create a **Web Service** and set:

- Build Command: `npm install && npm run build`
- Start Command: `npm start`

Environment variables:

- `NODE_ENV=production`
- `SERVE_DIST=1`
- `VIBECODE_BASE_URL=...`
- `VIBECODE_API_KEY=...`
- `VIBECODE_MODEL=...` (optional; can be auto-detected by the proxy)

