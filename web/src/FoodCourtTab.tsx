import { useEffect, useMemo, useState } from 'react';
import { PanelHead } from './components/PanelHead';
import { exportFoodCourt } from './excel';
import { printFoodCourtReport } from './foodCourtReport';
import {
  FC_IN_SERIAL,
  FC_OUT_SERIAL,
  foodCourtDays,
  foodCourtEvents,
  foodCourtVisits,
  formatHours,
  isFoodCourtSerial,
  type FcGate,
  type FoodCourtDay,
  type FoodCourtVisit,
} from './foodCourt';
import type { HqAccessEvent } from './types';

type Props = { events: HqAccessEvent[] };
type OpenRow = { employeeId: string; date: string };

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
}

function prettyDate(iso: string, weekday: string) {
  if (!iso) return weekday;
  const [y, m, d] = iso.split('-');
  return `${weekday} ${d}/${m}/${y}`;
}

function clock(t: string) {
  return t ? t.slice(0, 8) : '—';
}

export function FoodCourtTab({ events }: Props) {
  const span = useMemo(() => {
    const dates = events.filter((e) => isFoodCourtSerial(e.deviceSerial)).map((e) => e.accessDate).filter(Boolean).sort();
    return { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
  }, [events]);

  const [gate, setGate] = useState<FcGate>('both');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [emp, setEmp] = useState('all');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [open, setOpen] = useState<OpenRow | null>(null);

  useEffect(() => {
    if (seeded || !span.to) return;
    setFrom(span.to);
    setTo(span.to);
    setSeeded(true);
  }, [span.to, seeded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const fcAll = useMemo(() => foodCourtEvents(events, 'both'), [events]);
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of fcAll) m.set(e.employeeId, e.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [fcAll]);
  const depts = useMemo(() => [...new Set(fcAll.map((e) => e.department).filter(Boolean))].sort(), [fcAll]);

  const scoped = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (list: HqAccessEvent[]) =>
      list.filter((e) => {
        if (from && e.accessDate && e.accessDate < from) return false;
        if (to && e.accessDate && e.accessDate > to) return false;
        if (emp !== 'all' && e.employeeId !== emp) return false;
        if (dept !== 'all' && e.department !== dept) return false;
        if (qq) {
          const blob = `${e.name} ${e.employeeId} ${e.department} ${e.jobTitle}`.toLowerCase();
          if (!blob.includes(qq)) return false;
        }
        return true;
      });
  }, [from, to, emp, dept, q]);

  const pairPunches = useMemo(() => scoped(foodCourtEvents(events, 'both')), [events, scoped]);
  const logPunches = useMemo(() => scoped(foodCourtEvents(events, gate)), [events, gate, scoped]);
  const visits = useMemo(() => foodCourtVisits(pairPunches), [pairPunches]);
  const daysAll = useMemo(() => foodCourtDays(visits, pairPunches), [visits, pairPunches]);
  const days = useMemo(() => {
    if (gate === 'both') return daysAll;
    const keys = new Set(logPunches.map((e) => `${e.employeeId}|${e.accessDate}`));
    return daysAll.filter((d) => keys.has(`${d.employeeId}|${d.date}`));
  }, [daysAll, gate, logPunches]);

  const groups = useMemo(() => {
    const m = new Map<string, FoodCourtDay[]>();
    for (const d of days) {
      const arr = m.get(d.date) ?? [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [days]);

  const inName = fcAll.find((e) => e.direction === 'IN')?.deviceName || 'MB GF FC IN';
  const outName = fcAll.find((e) => e.direction === 'OUT')?.deviceName || 'MB GF FC OUT';
  const inCount = pairPunches.filter((e) => e.direction === 'IN').length;
  const outCount = pairPunches.filter((e) => e.direction === 'OUT').length;
  const hours = days.reduce((s, d) => s + d.hours, 0);
  const completeN = days.reduce((s, d) => s + d.complete, 0);
  const peopleN = new Set(days.map((d) => d.employeeId)).size;

  const detailDay = open ? days.find((d) => d.employeeId === open.employeeId && d.date === open.date) : null;
  const detailVisits: FoodCourtVisit[] = open
    ? visits.filter((v) => v.employeeId === open.employeeId && v.date === open.date)
    : [];
  const detailPunches: HqAccessEvent[] = open
    ? pairPunches.filter((e) => e.employeeId === open.employeeId && e.accessDate === open.date)
    : [];

  const reset = () => {
    setGate('both');
    setFrom(span.to || span.from);
    setTo(span.to || span.from);
    setEmp('all');
    setDept('all');
    setQ('');
  };

  return (
    <div className="fc-wrap">
      <section className="panel">
        <PanelHead
          title="Food Court readers"
          info="IN / OUT follow the reader name. Hours are the sum of each complete visit, not first punch to last punch."
        />
        <div className="fc-gates">
          <button type="button" className={`fc-gate${gate === 'both' ? ' active' : ''}`} onClick={() => setGate('both')}>
            <span className="fc-gate-kicker">Both readers</span>
            <strong>IN + OUT</strong>
            <em>Used to pair visits</em>
          </button>
          <button type="button" className={`fc-gate in${gate === 'IN' ? ' active' : ''}`} onClick={() => setGate('IN')}>
            <span className="fc-gate-kicker">IN</span>
            <strong>{inName}</strong>
            <em className="mono">{FC_IN_SERIAL}</em>
          </button>
          <button type="button" className={`fc-gate out${gate === 'OUT' ? ' active' : ''}`} onClick={() => setGate('OUT')}>
            <span className="fc-gate-kicker">OUT</span>
            <strong>{outName}</strong>
            <em className="mono">{FC_OUT_SERIAL}</em>
          </button>
        </div>
      </section>

      <section className="panel filters-panel">
        <PanelHead
          title="Food Court filters"
          info="Pick the day (26/10 for example). Each person is one row; Details opens every movement that day."
          actions={
            <>
              <button type="button" className="btn btn-sm" onClick={reset}>
                Reset
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            <span className="filter-label">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label>
            <span className="filter-label">Person</span>
            <select value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="all">Everyone</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name} ({id})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="filter-label">Department</span>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="all">All departments</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input type="search" placeholder="Name, employee ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <div className="kpi-grid fc-kpis">
        <div className="kpi">
          <label>People</label>
          <strong>{peopleN}</strong>
          <span className="kpi-foot">on the selected day(s)</span>
        </div>
        <div className="kpi green">
          <label>Total IN</label>
          <strong>{inCount}</strong>
          <span className="kpi-foot">entries</span>
        </div>
        <div className="kpi cyan">
          <label>Total OUT</label>
          <strong>{outCount}</strong>
          <span className="kpi-foot">exits</span>
        </div>
        <div className="kpi violet">
          <label>Complete cycles</label>
          <strong>{completeN}</strong>
          <span className="kpi-foot">IN → OUT pairs</span>
        </div>
        <div className="kpi amber">
          <label>Time inside</label>
          <strong>{formatHours(hours)}</strong>
          <span className="kpi-foot">sum of complete visits</span>
        </div>
      </div>

      <section className="panel details-panel">
        <PanelHead
          title="Daily report"
          info="One card per employee per day. Export Excel or print a PDF-ready report of the filtered day."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!days.length}
                onClick={() => {
                  printFoodCourtReport({ from, to, days, visits, punches: pairPunches });
                }}
              >
                Print report
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!days.length}
                onClick={() => exportFoodCourt(days, visits, pairPunches, { from, to })}
              >
                Excel report
              </button>
            </>
          }
        />
        {groups.length ? (
          groups.map(([date, rows]) => (
            <div key={date} className="fc-day-block">
              <div className="fc-day-label">{prettyDate(date, rows[0]?.weekday || '')}</div>
              <div className="fc-people">
                {rows.map((d) => (
                  <article key={`${d.employeeId}-${d.date}`} className="fc-person">
                    <div className="fc-person-who">
                      <span className="fc-avatar" aria-hidden>
                        {initials(d.name)}
                      </span>
                      <div>
                        <strong>{d.name}</strong>
                        <p>
                          {d.employeeId}
                          {d.department ? ` · ${d.department}` : ''}
                          {d.jobTitle ? ` · ${d.jobTitle}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="fc-metric">
                      <em>Complete cycles</em>
                      <b>{d.complete}</b>
                    </div>
                    <div className="fc-metric">
                      <em>Time inside</em>
                      <b>{formatHours(d.hours)}</b>
                    </div>
                    <div className="fc-metric">
                      <em>IN / OUT</em>
                      <b>
                        {d.inCount} / {d.outCount}
                      </b>
                    </div>
                    <div className="fc-person-actions">
                      {d.open > 0 ? <span className="pill amber">Open visit</span> : <span className="pill green">Closed</span>}
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => setOpen({ employeeId: d.employeeId, date: d.date })}
                      >
                        Details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="muted fc-empty">No Food Court punches in this filter.</p>
        )}
      </section>

      {open && detailDay && (
        <div className="stage-modal-backdrop" role="presentation" onClick={() => setOpen(null)}>
          <div
            className="stage-modal fc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fc-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="stage-modal-head">
              <div>
                <p className="eyebrow">{prettyDate(detailDay.date, detailDay.weekday)}</p>
                <h3 id="fc-detail-title">{detailDay.name}</h3>
                <p className="muted">
                  {detailDay.employeeId}
                  {detailDay.department ? ` · ${detailDay.department}` : ''}
                  {detailDay.jobTitle ? ` · ${detailDay.jobTitle}` : ''}
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
            <div className="fc-modal-kpis">
              <div>
                <em>Complete cycles</em>
                <strong>{detailDay.complete}</strong>
              </div>
              <div>
                <em>Time inside</em>
                <strong>{formatHours(detailDay.hours)}</strong>
              </div>
              <div>
                <em>IN</em>
                <strong>{detailDay.inCount}</strong>
              </div>
              <div>
                <em>OUT</em>
                <strong>{detailDay.outCount}</strong>
              </div>
            </div>
            <div className="fc-modal-body">
              <h4>Visits that day</h4>
              {detailVisits.length ? (
                <ol className="fc-timeline">
                  {detailVisits.map((v) => (
                    <li key={`${v.n}-${v.inTime}-${v.outTime}`} className={v.complete ? 'done' : 'open'}>
                      <span className="fc-tl-n">#{v.n}</span>
                      <div className="fc-tl-track">
                        <span className="fc-tl-end in">
                          <em>IN</em>
                          <b>{clock(v.inTime)}</b>
                        </span>
                        <span className="fc-tl-line">
                          <i>{v.complete ? formatHours(v.hours) : 'open'}</i>
                        </span>
                        <span className={`fc-tl-end out${v.complete ? '' : ' missing'}`}>
                          <em>OUT</em>
                          <b>{v.complete ? clock(v.outTime) : '—'}</b>
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No paired visits.</p>
              )}
              <h4>Every movement</h4>
              <div className="stage-modal-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Direction</th>
                      <th>Reader</th>
                      <th>Serial</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailPunches.map((e, i) => (
                      <tr key={`${e.ts}-${i}`}>
                        <td className="mono">{clock(e.accessTime)}</td>
                        <td>
                          <span className={`pill ${e.direction === 'IN' ? 'green' : 'isuzu'}`}>{e.direction}</span>
                        </td>
                        <td>{e.deviceName}</td>
                        <td className="mono">{e.deviceSerial}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
