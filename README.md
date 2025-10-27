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
this by setting `VITE_MATRIX_API_URL` before starting Vite, e.g.

```bash
VITE_MATRIX_API_URL=http://matrix-pc:4000 npm run dev
```

## Production notes

- Keep the API process running on the always-on factory PC (Task Scheduler,
systemd, PM2, etc.).
- Share the `server/data/matrix.json` file as part of your backup routine.
- The tablet and desktop browsers can point to the same LAN hostname to stay in
sync automatically.
