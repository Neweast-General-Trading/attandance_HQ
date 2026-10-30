# Data and API

All source reads are SQL Server queries. There is no `INSERT` or `UPDATE` against the punch database or payroll.

## Punches

| Item | Value |
| --- | --- |
| Variable | `HQ_ATTN_SERVER` |
| Database | `NEGT_HQ_ATTN` |
| Table | `dbo.HCP_Access` |
| Cache | `HQ_ATTN_CACHE_TTL_MS`, default 60 seconds |

Fields used include name, employee id, department, device, serial, date, time, and direction.

Device direction, building, and floor are inferred in `api/hq-attendance.ts` from the reader name when direction is not explicit.

## Employees

When the payroll SQL variables are set, name, department, and job title are read from `NEGTPAYROLL_UAE.dbo.Pr_EmpMaster` by `HRM_EmpId`. If that lookup fails, punches still load and the name from the access device is shown.

## Door types

`GET` and `PUT` `/api/hq-attendance/device-roles`.

The local file on the API server is `server/data/hq-device-roles.json`. That is the only write, and it is outside SAP and outside the punch database. The two Food Court devices stay internal even if a save tries to reclassify them.

## Requests

The live base is `https://mis.neweast.cloud/api/hq-attendance`. nginx proxies it to `127.0.0.1:4012`.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/hq-attendance` | `{ cachedAt, rowCount, events }` |
| GET | `/api/hq-attendance/device-roles` | Saved door types |
| PUT | `/api/hq-attendance/device-roles` | Local save. Body: `{ "devices": [{ "serial", "name", "role" }] }` |

The UI in `web/src/App.tsx` calls the same origin at `/api/hq-attendance`.

The two modules in this repository are the copies used by MIS:

- `api/hq-attendance.ts` — punch and payroll reads
- `api/hq-device-roles.ts` — load and save door types

They are wired from `server/src/index.ts` in the shared MIS project. The process runs under pm2 as `mis-dashboard-api`.
