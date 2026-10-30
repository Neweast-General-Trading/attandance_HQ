import { useMemo, useState } from 'react';
import { PanelHead } from './components/PanelHead';
import type { DoorRole } from './deviceRoles';
import { exportHours } from './excel';
import { formatHours } from './foodCourt';
import { hoursOnDate, rollHours, type HoursGrain } from './hoursWorked';
import type { HqAccessEvent } from './types';

type Props = {
  events: HqAccessEvent[];
  roleMap: Record<string, DoorRole>;
};

const GRAINS: { id: HoursGrain; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

function clock(t: string) {
  return t ? t.slice(0, 5) : '—';
}

export function HoursTab({ events, roleMap }: Props) {
  const [grain, setGrain] = useState<HoursGrain>('day');
  const [q, setQ] = useState('');
  const days = useMemo(() => hoursOnDate(events, roleMap), [events, roleMap]);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rollHours(days, grain).filter((r) => {
      if (!qq) return true;
      return `${r.name} ${r.employeeId} ${r.department} ${r.label}`.toLowerCase().includes(qq);
    });
  }, [days, grain, q]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => {
        a.site += r.siteHours;
        a.idle += r.idleHours;
        a.active += r.activeHours;
        a.people.add(r.employeeId);
        return a;
      },
      { site: 0, idle: 0, active: 0, people: new Set<string>() },
    );
  }, [rows]);

  return (
    <div className="fc-wrap">
      <section className="panel filters-panel compact">
        <PanelHead
          title="Time in the building"
          info="In building = each building entry until the matching exit. Non-productive = Food Court and other inside doors. Productive = in building minus non-productive."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={grain === 'day' && !q}
                onClick={() => {
                  setGrain('day');
                  setQ('');
                }}
              >
                Reset
              </button>
              <button type="button" className="btn btn-sm btn-primary" disabled={!rows.length} onClick={() => exportHours(rows, grain)}>
                Excel report
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">Totals</span>
            <div className="grain-switch">
              {GRAINS.map((g) => (
                <button key={g.id} type="button" className={grain === g.id ? 'on' : ''} onClick={() => setGrain(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input type="search" placeholder="Name, employee ID, department…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <div className="kpi-grid fc-kpis site-kpis">
        <div className="kpi green kpi-static">
          <label>Productive hours</label>
          <strong>{formatHours(totals.active)}</strong>
          <span className="kpi-foot">in building minus non-productive</span>
        </div>
        <div className="kpi slate kpi-static">
          <label>In building</label>
          <strong>{formatHours(totals.site)}</strong>
          <span className="kpi-foot">entry to matching exit</span>
        </div>
        <div className="kpi amber kpi-static">
          <label>Non-productive hours</label>
          <strong>{formatHours(totals.idle)}</strong>
          <span className="kpi-foot">Food Court and inside doors</span>
        </div>
        <div className="kpi blue kpi-static">
          <label>People</label>
          <strong>{totals.people.size}</strong>
          <span className="kpi-foot">{rows.length} {grain} rows</span>
        </div>
      </div>

      <div className="hours-legend">
        <span>
          <i className="dot site" /> In building {formatHours(totals.site)}
        </span>
        <span>
          <i className="dot idle" /> Non-productive {formatHours(totals.idle)}
        </span>
        <span>
          <i className="dot active" /> Productive {formatHours(totals.active)}
        </span>
      </div>

      <section className="panel details-panel">
        <PanelHead
          title={grain === 'day' ? 'Daily hours' : grain === 'week' ? 'Weekly totals' : 'Monthly totals'}
          info="Non-productive is time on inside doors such as Food Court, and only counts while the person is still inside HQ."
        />
        <div className="table-wrap">
          <table className="site-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>{grain === 'day' ? 'Date' : 'Period'}</th>
                {grain === 'day' ? (
                  <>
                    <th>Entry</th>
                    <th>Exit</th>
                  </>
                ) : (
                  <th>Days</th>
                )}
                <th>In building</th>
                <th>Non-productive</th>
                <th>Productive</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => {
                  const pct = r.siteHours > 0 ? Math.round((r.activeHours / r.siteHours) * 100) : 0;
                  return (
                    <tr key={r.key}>
                      <td>
                        <strong className="site-name">{r.name}</strong>
                        <div className="muted">
                          {r.employeeId}
                          {r.department ? ` · ${r.department}` : ''}
                        </div>
                      </td>
                      <td>
                        {r.label}
                        {grain !== 'day' ? <div className="muted">{r.from} → {r.to}</div> : null}
                      </td>
                      {grain === 'day' ? (
                        <>
                          <td className="mono">{clock(r.firstIn)}</td>
                          <td className="mono">{clock(r.lastOut)}</td>
                        </>
                      ) : (
                        <td>{r.days}</td>
                      )}
                      <td>{formatHours(r.siteHours)}</td>
                      <td>{formatHours(r.idleHours)}</td>
                      <td>
                        <strong>{formatHours(r.activeHours)}</strong>
                        <div className="hours-mini" aria-hidden="true">
                          <span className="active" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="muted">{pct}% productive</div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={grain === 'day' ? 7 : 6} className="muted">
                    No building hours in the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
