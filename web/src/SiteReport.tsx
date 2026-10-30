import { useEffect, useMemo, useState } from 'react';
import { PanelHead } from './components/PanelHead';
import { exportDeviceDay, exportOnSite } from './excel';
import { doorRoleOf, occupancyOf, ROLE_LABEL, type DoorRole } from './deviceRoles';
import { devicesOnDate, formatSince, peopleOnDate, stillInside, type PersonSite } from './siteStatus';
import type { HqAccessEvent } from './types';

function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function latestDate(events: HqAccessEvent[]) {
  const dates = events.map((e) => e.accessDate).filter(Boolean).sort();
  return dates[dates.length - 1] || todayISO();
}

type Props = { events: HqAccessEvent[]; roleMap: Record<string, DoorRole> };
type SiteView = 'inside' | 'left' | 'all';

function matchesPerson(p: PersonSite, q: string) {
  if (!q) return true;
  const blob = `${p.name} ${p.employeeId} ${p.department} ${p.jobTitle} ${p.lastIn?.deviceName} ${p.lastIn?.deviceSerial} ${p.lastOut?.deviceName} ${p.lastAction?.deviceName}`.toLowerCase();
  return blob.includes(q);
}

function clock(t?: string) {
  return t ? t.slice(0, 8) : '—';
}

function lastMove(
  p: PersonSite,
  roleMap: Record<string, DoorRole>,
): { verb: string; time: string; door: string; serial: string; building: string; zone: string } {
  const e = p.lastPunch;
  if (!e) return { verb: 'No punch', time: '—', door: '—', serial: '', building: '—', zone: '' };
  const role = doorRoleOf(e, roleMap);
  const verb =
    role === 'building_in'
      ? 'Entered building'
      : role === 'building_out'
        ? 'Left building'
        : role === 'internal_in'
          ? 'Inside (in)'
          : role === 'internal_out'
            ? 'Inside (out)'
            : 'Door / room';
  return {
    verb,
    time: clock(e.accessTime),
    door: e.deviceName,
    serial: e.deviceSerial,
    building: e.building,
    zone: ROLE_LABEL[role],
  };
}

function actionLabel(e: HqAccessEvent, roleMap: Record<string, DoorRole>) {
  const role = doorRoleOf(e, roleMap);
  if (role === 'building_in') return 'Entered building';
  if (role === 'building_out') return 'Left building';
  if (role === 'internal_in') return 'Inside (in)';
  if (role === 'internal_out') return 'Inside (out)';
  return e.direction === 'IN' ? 'In' : e.direction === 'OUT' ? 'Out' : 'Door / room';
}

export function OnSiteTab({ events, roleMap }: Props) {
  const [day, setDay] = useState(() => latestDate(events) || todayISO());
  const [q, setQ] = useState('');
  const [view, setView] = useState<SiteView>('inside');
  const [openId, setOpenId] = useState<string | null>(null);
  const people = useMemo(() => peopleOnDate(events, day, roleMap), [events, day, roleMap]);
  const qq = q.trim().toLowerCase();
  const insideAll = useMemo(() => stillInside(people), [people]);
  const leftAll = useMemo(() => people.filter((p) => !p.inside), [people]);
  const rows = useMemo(() => {
    const src = view === 'inside' ? insideAll : view === 'left' ? leftAll : people;
    return src.filter((p) => matchesPerson(p, qq));
  }, [view, insideAll, leftAll, people, qq]);

  const openPerson = openId ? people.find((p) => p.employeeId === openId) : null;
  const openPunches = useMemo(() => {
    if (!openId) return [];
    return events
      .filter((e) => e.employeeId === openId && e.accessDate === day)
      .sort((a, b) => a.ts.localeCompare(b.ts));
  }, [events, openId, day]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  return (
    <div className="fc-wrap">
      <section className="panel filters-panel">
        <PanelHead
          title="Who is in the building"
          info="Inside HQ = last building entry with no later building exit. Food Court and other inside doors do not count as leaving the building."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setDay(latestDate(events) || todayISO());
                  setQ('');
                  setView('inside');
                  setOpenId(null);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!rows.length}
                onClick={() =>
                  exportOnSite(day, rows, view === 'inside' ? 'In the building' : view === 'left' ? 'Already left' : 'Came today')
                }
              >
                Excel report
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">Date</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input type="search" placeholder="Name, employee ID, door…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <div className="kpi-grid fc-kpis site-kpis">
        <button type="button" className={`kpi green${view === 'inside' ? ' active' : ''}`} onClick={() => setView('inside')}>
          <label>In the building now</label>
          <strong>{insideAll.length}</strong>
          <span className="kpi-foot">no building exit after last presence</span>
        </button>
        <button type="button" className={`kpi cyan${view === 'left' ? ' active' : ''}`} onClick={() => setView('left')}>
          <label>Already left</label>
          <strong>{leftAll.length}</strong>
          <span className="kpi-foot">used a building exit after entering</span>
        </button>
        <button type="button" className={`kpi slate${view === 'all' ? ' active' : ''}`} onClick={() => setView('all')}>
          <label>Came today</label>
          <strong>{people.length}</strong>
          <span className="kpi-foot">anyone with at least one punch</span>
        </button>
      </div>

      <section className="panel details-panel">
        <PanelHead
          title={view === 'inside' ? 'People in the building' : view === 'left' ? 'People who already left' : 'Everyone who came'}
          info="Status uses building doors only. Last movement is the latest punch of any type, including inside doors."
        />
        <div className="table-wrap">
          <table className="site-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Now</th>
                <th>Last movement</th>
                <th>Door</th>
                <th>Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((p) => {
                  const m = lastMove(p, roleMap);
                  return (
                    <tr key={p.employeeId}>
                      <td>
                        <strong className="site-name">{p.name}</strong>
                        <div className="muted">
                          {p.employeeId}
                          {p.department ? ` · ${p.department}` : ''}
                          {p.jobTitle ? ` · ${p.jobTitle}` : ''}
                        </div>
                      </td>
                      <td>
                        {p.inside ? (
                          <span className="pill green">In the building</span>
                        ) : p.lastIn ? (
                          <span className="pill">Left</span>
                        ) : (
                          <span className="pill amber">Exit only</span>
                        )}
                        {p.inside && p.lastIn ? (
                          <div className="muted">{formatSince(p.lastIn.accessTime, p.date)} since building entry</div>
                        ) : null}
                        {p.inside && !p.lastIn ? <div className="muted">Seen inside — Food Court / inside door</div> : null}
                        {!p.inside && !p.lastIn ? <div className="muted">Building exit with no building entry today</div> : null}
                      </td>
                      <td>
                        <strong>{m.verb}</strong>
                        <div className="mono muted">{m.time}</div>
                        {m.zone ? <div className="muted">{m.zone}</div> : null}
                      </td>
                      <td>
                        <div className="site-door">{m.door}</div>
                        {m.serial ? <div className="muted mono">{m.serial}</div> : null}
                      </td>
                      <td>{m.building || '—'}</td>
                      <td>
                        <button type="button" className="btn btn-sm" onClick={() => setOpenId(p.employeeId)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    {view === 'inside'
                      ? 'No one is currently in the building on this date.'
                      : view === 'left'
                        ? 'No one has exited on this date.'
                        : 'No punches on this date.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {openPerson && (
        <div className="stage-modal-backdrop" role="presentation" onClick={() => setOpenId(null)}>
          <div className="stage-modal fc-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="stage-modal-head">
              <div>
                <p className="eyebrow">{day}</p>
                <h3>{openPerson.name}</h3>
                <p className="muted">
                  {openPerson.employeeId}
                  {openPerson.department ? ` · ${openPerson.department}` : ''}
                  {openPerson.jobTitle ? ` · ${openPerson.jobTitle}` : ''}
                </p>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
            <div className="fc-modal-kpis">
              <div>
                <em>Now</em>
                <strong>{openPerson.inside ? 'Inside' : 'Left'}</strong>
              </div>
              <div>
                <em>Entries</em>
                <strong>{openPerson.inCount}</strong>
              </div>
              <div>
                <em>Exits</em>
                <strong>{openPerson.outCount}</strong>
              </div>
              <div>
                <em>Last movement</em>
                <strong>{lastMove(openPerson, roleMap).verb}</strong>
              </div>
            </div>
            <div className="fc-modal-body">
              <h4>Movements this day</h4>
              <div className="stage-modal-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Type</th>
                      <th>Door</th>
                      <th>Serial</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPunches.map((e, i) => (
                      <tr key={`${e.ts}-${i}`}>
                        <td className="mono">{clock(e.accessTime)}</td>
                        <td>
                          <span
                            className={`pill ${
                              occupancyOf(doorRoleOf(e, roleMap)) === 'in'
                                ? 'green'
                                : occupancyOf(doorRoleOf(e, roleMap)) === 'out'
                                  ? 'isuzu'
                                  : ''
                            }`}
                          >
                            {actionLabel(e, roleMap)}
                          </span>
                        </td>
                        <td>{ROLE_LABEL[doorRoleOf(e, roleMap)]}</td>
                        <td>{e.deviceName}</td>
                        <td className="mono">{e.deviceSerial || '—'}</td>
                        <td>{e.building}</td>
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

export function ByDeviceTab({ events, roleMap }: Props) {
  const [day, setDay] = useState(() => latestDate(events) || todayISO());
  const [q, setQ] = useState('');
  const [onlyInside, setOnlyInside] = useState(false);
  const people = useMemo(() => peopleOnDate(events, day, roleMap), [events, day, roleMap]);
  const devices = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return devicesOnDate(events, people, day, roleMap).filter((d) => {
      if (onlyInside && !d.stillInside.length) return false;
      if (!qq) return true;
      const blob = `${d.deviceName} ${d.deviceSerial} ${d.building}`.toLowerCase();
      return blob.includes(qq);
    });
  }, [events, people, day, q, onlyInside]);
  const inside = stillInside(people);
  const allDevices = useMemo(() => devicesOnDate(events, people, day, roleMap), [events, people, day, roleMap]);

  return (
    <div className="fc-wrap">
      <section className="panel filters-panel">
        <PanelHead
          title="Doors used today"
          info="People still inside are listed on the last building-entry door they used. Inside doors such as Food Court do not change that."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setDay(latestDate(events) || todayISO());
                  setQ('');
                  setOnlyInside(false);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!devices.length}
                onClick={() => exportDeviceDay(day, devices)}
              >
                Excel report
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label>
            <span className="filter-label">Date</span>
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input type="search" placeholder="Door name or serial…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </section>

      <div className="kpi-grid fc-kpis site-kpis">
        <button type="button" className={`kpi slate${!onlyInside ? ' active' : ''}`} onClick={() => setOnlyInside(false)}>
          <label>Doors used</label>
          <strong>{allDevices.length}</strong>
          <span className="kpi-foot">{day}</span>
        </button>
        <button type="button" className={`kpi green${onlyInside ? ' active' : ''}`} onClick={() => setOnlyInside(true)}>
          <label>In the building now</label>
          <strong>{inside.length}</strong>
          <span className="kpi-foot">show only doors with people still inside</span>
        </button>
      </div>

      <section className="panel details-panel">
        <PanelHead title="By door" info="Type comes from Door types. Still inside = last building entry was this door." />
        <div className="table-wrap">
          <table className="site-table">
            <thead>
              <tr>
                <th>Door</th>
                <th>Serial</th>
                <th>Type</th>
                <th>Location</th>
                <th>Entries</th>
                <th>Exits</th>
                <th>Still inside (building entry)</th>
              </tr>
            </thead>
            <tbody>
              {devices.length ? (
                devices.map((d) => (
                  <tr key={d.key}>
                    <td>
                      <div className="site-door">{d.deviceName}</div>
                    </td>
                    <td className="mono">{d.deviceSerial || '—'}</td>
                    <td>{ROLE_LABEL[d.role]}</td>
                    <td>{d.building}</td>
                    <td>{d.inCount}</td>
                    <td>{d.outCount}</td>
                    <td className="site-inside-cell">
                      {d.stillInside.length ? (
                        d.stillInside.map((p) => (
                          <span key={p.employeeId} className="site-chip">
                            {p.name}
                            <em>{p.lastIn?.accessTime.slice(0, 8)}</em>
                          </span>
                        ))
                      ) : (
                        <span className="muted">Nobody</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No door activity on this date.
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
