# Hundegger stock matrix

A React + TypeScript app for managing the 12&nbsp;m timber stock matrix. The
frontend runs in the browser while a lightweight Node.js service keeps the
matrix JSON in sync across devices on the local network.

## Prerequisites

Node.js 20+

## Install dependencies

```bash
npm install
```

## Start the local API

```bash
npm run server
```

The service listens on port `4000` by default and persists data to
`server/data/matrix.json`. Set `MATRIX_SERVER_PORT` to use a different port.

## Start the frontend

```bash
npm run dev
```

By default the frontend expects the API at `http://localhost:4000`. Override
this by setting `VITE_API_URL` before starting Vite, e.g.

```bash
VITE_API_URL=http://matrix-pc:4000 npm run dev
```

## Production notes

Build the frontend bundle once and let the Node.js service serve the compiled
files alongside the JSON API:

```bash
npm run build
```

Then start the production server:

```bash
MATRIX_SERVER_PORT=4000 node server/index.js
```

The process serves the static files from `dist/` and exposes the matrix API on
the same host, so PCs and tablets on the LAN can simply load
`http://<hostname>:4000`. Configure the process with Task Scheduler, systemd,
PM2, or a similar tool so it starts automatically on boot.

Additional recommendations:
- Share the `server/data/matrix.json` file as part of your backup routine.
- Reverse proxy (nginx, Caddy, etc.) if you need HTTPS, otherwise the built-in
  server is sufficient for LAN usage.

## Daily registry form submission

The `/daily-registry` API route proxies submissions to the Google Apps Script
web app so tablets on the LAN can submit entries without running into browser
CORS restrictions.

Before starting the Node.js server, set the following environment variables:

- `DAILY_REGISTRY_WEB_APP_URL` – the published Apps Script web app URL (ends in
  `/exec`).
- `DAILY_REGISTRY_API_TOKEN` – the shared secret that the Apps Script checks.
- `DAILY_REGISTRY_TIMEOUT_MS` (optional) – override the 15&nbsp;second upstream
  request timeout.

The frontend points to `/daily-registry` automatically. If you need to hit a
different endpoint, set `VITE_DAILY_REGISTRY_WEB_APP_URL` before starting Vite
or building the frontend bundle.