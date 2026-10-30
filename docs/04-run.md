# Run and deploy

## Requirements

- Node.js 20 or newer
- The shared MIS API on port `4012`
- Read access to `NEGT_HQ_ATTN`, and optionally to `NEGTPAYROLL_UAE`

## Environment

Copy the names from `deploy/env.example` into `server/.env` in the MIS project. Do not commit passwords.

```text
HQ_ATTN_SERVER
HQ_ATTN_USER
HQ_ATTN_PASSWORD
HQ_ATTN_DATABASE
HQ_ATTN_CACHE_TTL_MS
SQL_DB_SERVER
SQL_DB_USER
SQL_DB_PASSWORD
SQL_DB_DATABASE
```

## UI development

```bash
cd web
npm install
npm run dev
```

Vite listens on `0.0.0.0:4022` at `/hq-attendance/`. In development, `/api` is proxied to `127.0.0.1:4012`.

```bash
npm run build
npm run preview
```

## Deploy the UI

From the MIS source folder (`hq-attendance/`), after the build:

```bash
npm run build
rsync -a --delete dist/ /var/www/mis-dashboard/hq-attendance/
```

nginx serves the path as in `deploy/nginx-hq-attendance.conf`.

Check:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mis.neweast.cloud/hq-attendance/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4012/api/hq-attendance
```

The page should return `200`. The API returns JSON with `rowCount` and `events`.

## Deploy a read-path or door-type change

```bash
cd /home/negt/MIS/server
npm run build
pm2 restart mis-dashboard-api
```

## Do not publish

- `node_modules/`
- `dist/`
- any `.env` file or password
- `hq-device-roles.json` when it holds server-specific edits; the Food Court defaults live in code
