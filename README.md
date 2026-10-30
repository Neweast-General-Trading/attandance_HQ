# HQ Access & Attendance

HQ door attendance: who entered the building, who left, hours worked, Food Court visits, and door types.

Live app: [https://mis.neweast.cloud/hq-attendance/](https://mis.neweast.cloud/hq-attendance/)

Reads the HQ punch database and the employee file. Nothing is written to SQL Server or SAP. Door-type choices are stored in a local file on the MIS server.

## Contents

| Path | Purpose |
| --- | --- |
| [docs/01-screens.md](docs/01-screens.md) | Screens and what each one shows |
| [docs/02-rules.md](docs/02-rules.md) | Entry, exit, Food Court, and hours |
| [docs/03-data.md](docs/03-data.md) | Data sources and the API |
| [docs/04-run.md](docs/04-run.md) | Local run and deployment |
| `web/` | React / Vite UI |
| `api/` | Read path and local door-type storage used by the shared API |
| `deploy/` | nginx example and environment variable names, without secrets |

## Screens

1. **Overview** — productive and non-productive hours as a pie, with a people breakdown and a link to the full hours report.
2. **Hours** — daily, weekly, and monthly totals, with Excel export.
3. **In building** — who is still inside HQ and who left through a building door.
4. **Doors** — devices used today and who was recorded on them.
5. **Food Court** — IN reader `GM9731498` and OUT reader `GM9731530`.
6. **Door types** — classify each door as building entry, building exit, an inside door, or a room.
7. **People / Presence / Devices / Timeline** — punch reports for the current filters.

**Reset** restores the full date range and clears person, department, door, and direction.

## Short rule

A Food Court exit is not leaving HQ. Only a **building exit** moves a person to Already left. Details are in [docs/02-rules.md](docs/02-rules.md).

## Quick start

```bash
cd web
npm install
npm run dev
```

The UI listens on port `4022` at `/hq-attendance/`. It expects the API at `http://127.0.0.1:4012/api/hq-attendance`.

Full deploy steps are in [docs/04-run.md](docs/04-run.md).
