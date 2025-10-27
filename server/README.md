# Hundegger matrix LAN API

This directory contains a minimal Node.js server that exposes the stock matrix
through a REST API. Run it on the always-on factory PC so that both the desktop
and tablet browsers read and write from the same data source.

## Running locally

```bash
npm install
npm run server
```

By default the service listens on port `4000`. Override the port by setting
`MATRIX_SERVER_PORT`.

The API persists its data to `server/data/matrix.json`. The file is created
automatically if it does not exist.

## Endpoints

- `GET /matrix` – returns the current matrix JSON
- `PUT /matrix` – replaces the matrix (expects the full matrix payload)
- `GET /healthz` – lightweight health probe

Keep this process running alongside the frontend (e.g. using a systemd unit,
PM2, or the Windows Task Scheduler) to provide automatic syncing across
devices on the local network.