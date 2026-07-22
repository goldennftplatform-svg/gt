# Geoff Thermometer

Live **sniffer · translator · dashboard** for [geoff.ai](https://geoff.ai) deploys and [Stacknet](https://stacknet.magma-rpc.com) API heat.

Designed to deploy on **Vercel** (stateless API + browser history) or run locally with a persistent file store.

## Signals

| Source | Endpoint | What we track |
| --- | --- | --- |
| geoff.ai build | `/api/version` | `buildId` |
| geoff.ai deploy | HTML | Vercel `dpl_*` + chunk fingerprint |
| Stacknet health | `/health` | version, status, MCP contract, in-flight |
| Stacknet network | `/network/summary` | nodes, GPUs, VRAM, models, capabilities, SOL |
| Stacknet models | `/v1/models` | OpenAI-compatible model cards + caps |
| Stacknet widgets | `/widgets` | public widget catalog |
| Stacknet node | `/node` | node id / tasks |
| Geoff catalogs | `/api/catalog/*` | optional auth cookie / preview code |

The translator turns diffs into a readable feed and a **temperature** score (cool → blazing).

## Deploy on Vercel

1. Import this repo in Vercel (root directory).
2. Framework preset: **Other**
3. Output / static: `public` (see `vercel.json`)
4. Deploy.

On Vercel, each `/api/poll` sniffs fresh data. Event history lives in the browser (`localStorage`) so it works without a database.

Optional env vars:

- `GEOFF_COOKIE`
- `GEOFF_PREVIEW_CODE`
- `POLL_INTERVAL_MS` (local only)
- `GEOFF_BASE_URL` / `STACKNET_BASE_URL`

## Local

```bash
npm install
npm start
# http://localhost:3847
```

```bash
npm run sniff   # one-shot CLI sniff
npm run dev     # watch mode
```

## API

- `GET /api/health`
- `GET /api/status` — stored snapshot (local) / fresh sniff (Vercel POST preferred)
- `POST /api/poll` — `{ previous, events }` → latest snapshot + translated events
- `GET /api/sniff` — raw snapshot
- `GET /api/stream` — SSE (local only)
