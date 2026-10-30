import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PanelHead } from './components/PanelHead';
import type { DoorRole } from './deviceRoles';
import { formatHours } from './foodCourt';
import { hoursOnDate, hoursTrend, type HoursGrain } from './hoursWorked';
import type { Direction, HqAccessEvent } from './types';

const tip = {
  background: '#fff',
  border: '1px solid #e8eef4',
  borderRadius: 10,
  boxShadow: '0 8px 28px rgba(15, 23, 42, 0.08)',
  fontSize: 12,
  color: '#334155',
};

const GRAINS: { id: HoursGrain; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

type Props = {
  events: HqAccessEvent[];
  roleMap: Record<string, DoorRole>;
  byDay: { date: string; punches: number }[];
  byHour: { hour: string; n: number }[];
  dirSlices: { id: Direction; name: string; value: number; color: string }[];
  dirTotal: number;
  byBuilding: { name: string; n: number }[];
  onRange: (from: string, to: string) => void;
  onPerson: (id: string) => void;
  onDir: (dir: Direction) => void;
  onBuilding: (name: string) => void;
  onOpenHours: () => void;
  onReset: () => void;
};

function HoursTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ov-tip">
      <p>{label}</p>
      {payload.map((p) => (
        <div key={p.name}>
          <i style={{ background: p.color }} />
          {p.name}
          <b>{Number(p.value).toFixed(1)} h</b>
        </div>
      ))}
    </div>
  );
}

export function OverviewCharts({
  events,
  roleMap,
  byDay,
  byHour,
  dirSlices,
  dirTotal,
  byBuilding,
  onRange,
  onPerson,
  onDir,
  onBuilding,
  onOpenHours,
  onReset,
}: Props) {
  const [grain, setGrain] = useState<HoursGrain>('day');
  const [mixView, setMixView] = useState<'productive' | 'idle' | null>(null);
  const days = useMemo(() => hoursOnDate(events, roleMap), [events, roleMap]);
  const trend = useMemo(() => hoursTrend(days, grain), [days, grain]);
  const site = days.reduce((s, d) => s + d.siteHours, 0);
  const idle = days.reduce((s, d) => s + d.idleHours, 0);
  const active = Math.max(0, site - idle);
  const topHours = useMemo(() => {
    const m = new Map<string, { id: string; name: string; active: number }>();
    for (const d of days) {
      const cur = m.get(d.employeeId) ?? { id: d.employeeId, name: d.name, active: 0 };
      cur.active += d.activeHours;
      if (d.name && d.name !== d.employeeId) cur.name = d.name;
      m.set(d.employeeId, cur);
    }
    return [...m.values()].sort((a, b) => b.active - a.active).slice(0, 6);
  }, [days]);
  const topMax = topHours[0]?.active || 1;
  const weekdays = useMemo(() => {
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const m = new Map(order.map((w) => [w, { weekday: w, hours: 0, n: 0 }]));
    for (const d of days) {
      const cur = m.get(d.weekday);
      if (!cur) continue;
      cur.hours += d.activeHours;
      cur.n += 1;
    }
    return order.map((w) => {
      const cur = m.get(w)!;
      return { weekday: w, hours: cur.n ? Number((cur.hours / cur.n).toFixed(2)) : 0 };
    });
  }, [days]);
  const bMax = byBuilding[0]?.n || 1;

  const mixSlices = [
    { id: 'productive' as const, name: 'Productive', value: Number(active.toFixed(2)), color: '#10b981' },
    { id: 'idle' as const, name: 'Non-productive', value: Number(idle.toFixed(2)), color: '#60a5fa' },
  ].filter((s) => s.value > 0);
  const peopleHours = useMemo(() => {
    const m = new Map<string, { id: string; name: string; dept: string; productive: number; idle: number; site: number }>();
    for (const d of days) {
      const cur = m.get(d.employeeId) ?? {
        id: d.employeeId,
        name: d.name,
        dept: d.department,
        productive: 0,
        idle: 0,
        site: 0,
      };
      cur.productive += d.activeHours;
      cur.idle += d.idleHours;
      cur.site += d.siteHours;
      if (d.name && d.name !== d.employeeId) cur.name = d.name;
      m.set(d.employeeId, cur);
    }
    return [...m.values()].sort((a, b) =>
      mixView === 'idle' ? b.idle - a.idle : b.productive - a.productive,
    );
  }, [days, mixView]);
  const detailRows = mixView
    ? peopleHours.filter((p) => (mixView === 'idle' ? p.idle > 0 : p.productive > 0)).slice(0, 40)
    : [];

  return (
    <div className="ov-page">
      <section className="panel ov-mix">
        <PanelHead
          title="Productive vs non-productive hours"
          info="Productive = time inside HQ minus Food Court / inside-door idle. Click a slice or row to see who makes up that total, then open the full Hours report."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setMixView(null);
                  onReset();
                }}
              >
                Reset
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={onOpenHours}>
                Full hours report
              </button>
            </>
          }
        />
        <div className="ov-mix-body">
          <div className="ov-mix-pie">
            {mixSlices.length ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={mixSlices}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={96}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={2}
                    >
                      {mixSlices.map((s) => (
                        <Cell
                          key={s.id}
                          fill={s.color}
                          cursor="pointer"
                          onClick={() => setMixView(s.id)}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatHours(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="cycle-donut-center">
                  <strong>{formatHours(site)}</strong>
                  <span>in the building</span>
                </div>
              </>
            ) : (
              <p className="muted chart-empty">No hours in this filter.</p>
            )}
          </div>
          <ul className="ov-mix-list">
            {mixSlices.map((s) => {
              const pct = site > 0 ? Math.round((s.value / site) * 100) : 0;
              return (
                <li key={s.id}>
                  <button type="button" className={mixView === s.id ? 'on' : ''} onClick={() => setMixView(s.id)}>
                    <span className="outcome-dot" style={{ background: s.color }} />
                    <span>
                      <strong>{s.name}</strong>
                      <em>{formatHours(s.value)}</em>
                    </span>
                    <var>{pct}%</var>
                  </button>
                </li>
              );
            })}
            <li className="ov-mix-hint">Click a slice to list people. Then open any row for punches.</li>
          </ul>
        </div>
        {mixView && (
          <div className="ov-mix-detail">
            <div className="ov-mix-detail-head">
              <h4>{mixView === 'idle' ? 'Non-productive hours — people' : 'Productive hours — people'}</h4>
              <div className="ov-mix-detail-actions">
                <button type="button" className="btn btn-sm btn-primary" onClick={onOpenHours}>
                  Open full report
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setMixView(null);
                    onReset();
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="site-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Productive</th>
                    <th>Non-productive</th>
                    <th>In building</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detailRows.length ? (
                    detailRows.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong className="site-name">{p.name}</strong>
                          <div className="muted">
                            {p.id}
                            {p.dept ? ` · ${p.dept}` : ''}
                          </div>
                        </td>
                        <td>{formatHours(p.productive)}</td>
                        <td>{formatHours(p.idle)}</td>
                        <td>{formatHours(p.site)}</td>
                        <td>
                          <button type="button" className="btn btn-sm" onClick={() => onPerson(p.id)}>
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        Nobody in this slice for the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="panel chart-card ov-hero-chart">
        <PanelHead
          title="Productive vs non-productive"
          info="Productive = time inside HQ minus inside idle (Food Court and similar). Click a point to filter that period."
          actions={
            <div className="grain-switch">
              {GRAINS.map((g) => (
                <button key={g.id} type="button" className={grain === g.id ? 'on' : ''} onClick={() => setGrain(g.id)}>
                  {g.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="chart-body ov-chart">
          {trend.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={trend}
                onClick={(state) => {
                  const row = (state?.activePayload?.[0]?.payload ?? null) as (typeof trend)[number] | null;
                  if (row?.from) onRange(row.from, row.to);
                }}
              >
                <defs>
                  <linearGradient id="ovActive" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="ovIdle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip content={<HoursTip />} />
                <Area
                  type="monotone"
                  dataKey="active"
                  name="Productive"
                  stackId="h"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#ovActive)"
                />
                <Area
                  type="monotone"
                  dataKey="idle"
                  name="Non-productive"
                  stackId="h"
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  fill="url(#ovIdle)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="muted chart-empty">No building hours in this filter.</p>
          )}
          <p className="ov-legend">
            <span>
              <i className="active" /> Productive
            </span>
            <span>
              <i className="idle" /> Non-productive
            </span>
          </p>
        </div>
      </section>

      <div className="ov-two">
        <section className="panel chart-card">
          <PanelHead title="Typical weekday" info="Average productive hours per person-day." />
          <div className="chart-body ov-chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weekdays} barCategoryGap="28%">
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="weekday" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={tip} formatter={(v) => [`${Number(v).toFixed(1)} h`, 'Productive']} />
                <Bar dataKey="hours" name="Productive" fill="#10b981" fillOpacity={0.45} radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel chart-card">
          <PanelHead title="People" info="Highest productive hours in the current filter. Click a name for punches." />
          <ol className="ov-rank">
            {topHours.length ? (
              topHours.map((p, i) => (
                <li key={p.id}>
                  <button type="button" onClick={() => onPerson(p.id)}>
                    <em>{i + 1}</em>
                    <span>
                      <strong>{p.name}</strong>
                      <b style={{ width: `${Math.round((p.active / topMax) * 100)}%` }} />
                    </span>
                    <var>{formatHours(p.active)}</var>
                  </button>
                </li>
              ))
            ) : (
              <li className="muted">No people in this filter.</li>
            )}
          </ol>
        </section>
      </div>

      <div className="ov-two">
        <section className="panel chart-card">
          <PanelHead title="Punches by day" info="Click a day to focus the dashboard on that date." />
          <div className="chart-body ov-chart">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={byDay}
                onClick={(state) => {
                  const date = String(state?.activeLabel || '');
                  if (date) onRange(date, date);
                }}
              >
                <defs>
                  <linearGradient id="ovPunch" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => String(v).slice(5)} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tip} />
                <Area type="monotone" dataKey="punches" name="Punches" stroke="#60a5fa" strokeWidth={2} fill="url(#ovPunch)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel chart-card">
          <PanelHead title="When people punch" info="Door activity across the 24-hour clock." />
          <div className="chart-body ov-chart">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byHour} barCategoryGap="12%">
                <CartesianGrid stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={3} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="n" name="Punches" fill="#60a5fa" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="ov-two">
        <section className="panel chart-card">
          <PanelHead title="In / Out" info="Click a row to filter punches." />
          <ul className="ov-rows">
            {dirSlices.map((s) => {
              const pct = Math.round((s.value / (dirTotal || 1)) * 100);
              return (
                <li key={s.id} className={s.id === 'IN' ? 'tone-green' : s.id === 'OUT' ? 'tone-blue' : ''}>
                  <button type="button" onClick={() => onDir(s.id)}>
                    <span>
                      {s.name}
                      <small>{s.value.toLocaleString()} punches</small>
                    </span>
                    <b>
                      <i style={{ width: `${pct}%` }} />
                    </b>
                    <var>{pct}%</var>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel chart-card">
          <PanelHead title="Locations" info="Click a row to filter that building." />
          <ul className="ov-rows tone-blue">
            {byBuilding.map((b) => {
              const pct = Math.round((b.n / bMax) * 100);
              return (
                <li key={b.name}>
                  <button type="button" onClick={() => onBuilding(b.name)}>
                    <span>
                      {b.name}
                      <small>{b.n.toLocaleString()} punches</small>
                    </span>
                    <b>
                      <i style={{ width: `${pct}%` }} />
                    </b>
                    <var>{pct}%</var>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
