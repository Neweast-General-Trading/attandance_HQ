import { useEffect, useMemo, useState, useTransition } from 'react';
import { PanelHead } from './components/PanelHead';
import { DoorSetupTab } from './DoorSetupTab';
import { FoodCourtTab } from './FoodCourtTab';
import { HoursTab } from './HoursTab';
import { OverviewCharts } from './OverviewCharts';
import { ByDeviceTab, OnSiteTab } from './SiteReport';
import { rolesToMap, type DoorRole, type DoorRolesFile, type SavedDoor } from './deviceRoles';
import { exportAttendance, exportDevices } from './excel';
import { formatHours } from './foodCourt';
import { hoursOnDate } from './hoursWorked';
import { peopleOnDate, stillInside } from './siteStatus';
import type { ApiResponse, Direction, HqAccessEvent, PresenceDay } from './types';

const API = '/api/hq-attendance';
const ROLES_API = `${API}/device-roles`;

const PAGE = 15;

type Tab = 'overview' | 'people' | 'devices' | 'presence' | 'hours' | 'timeline' | 'foodcourt' | 'onsite' | 'bydevice' | 'doortypes';

const NAV_GROUPS: { id: string; label: string; items: [Tab, string][] }[] = [
  {
    id: 'today',
    label: 'Today',
    items: [
      ['onsite', 'In building'],
      ['bydevice', 'Doors'],
      ['foodcourt', 'Food Court'],
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      ['overview', 'Overview'],
      ['hours', 'Hours'],
      ['people', 'People'],
      ['presence', 'Presence'],
      ['devices', 'Devices'],
      ['timeline', 'Timeline'],
    ],
  },
  {
    id: 'setup',
    label: 'Setup',
    items: [['doortypes', 'Door types']],
  },
];

const REPORT_TABS: Tab[] = ['overview', 'hours', 'people', 'presence', 'devices', 'timeline'];
type Filters = {
  from: string;
  to: string;
  q: string;
  emp: string;
  dept: string;
  building: string;
  device: string;
  dir: 'all' | Direction;
};

const emptyFilters = (): Filters => ({
  from: '',
  to: '',
  q: '',
  emp: 'all',
  dept: 'all',
  building: 'all',
  device: 'all',
  dir: 'all',
});

function unique(list: string[]) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function minutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function hoursBetween(a: string, b: string) {
  const d = minutes(b) - minutes(a);
  return d > 0 ? d / 60 : 0;
}
function todayISO() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function presenceFrom(events: HqAccessEvent[]): PresenceDay[] {
  const map = new Map<string, HqAccessEvent[]>();
  for (const e of events) {
    if (!e.accessDate) continue;
    const k = `${e.employeeId}|${e.accessDate}`;
    const arr = map.get(k) ?? [];
    arr.push(e);
    map.set(k, arr);
  }
  const out: PresenceDay[] = [];
  for (const arr of map.values()) {
    const sorted = [...arr].sort((a, b) => a.ts.localeCompare(b.ts));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    out.push({
      employeeId: first.employeeId,
      name: first.name,
      department: first.department,
      date: first.accessDate,
      weekday: first.weekday,
      first: first.accessTime,
      last: last.accessTime,
      punches: sorted.length,
      hours: hoursBetween(first.accessTime, last.accessTime),
      firstDir: first.direction,
      lastDir: last.direction,
      late: minutes(first.accessTime) > 9 * 60 + 15,
      earlyOut: minutes(last.accessTime) < 17 * 60 && sorted.length > 1,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [draft, setDraft] = useState<Filters>(emptyFilters());
  const [tab, setTab] = useState<Tab>('overview');
  const [page, setPage] = useState(0);
  const [kpiFocus, setKpiFocus] = useState<'late' | 'early' | null>(null);
  const [isPending, startTransition] = useTransition();
  const [roleMap, setRoleMap] = useState<Record<string, DoorRole>>({});
  const [rolesUpdatedAt, setRolesUpdatedAt] = useState('');
  const [savingRoles, setSavingRoles] = useState(false);

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const next = json as ApiResponse;
      setData(next);
      if (!filters.from && next.events.length) {
        const dates = next.events.map((e) => e.accessDate).filter(Boolean).sort();
        const seeded = { ...emptyFilters(), from: dates[0], to: dates[dates.length - 1] };
        setFilters(seeded);
        setDraft(seeded);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyRoles = (file: DoorRolesFile) => {
    setRoleMap(rolesToMap(file.devices ?? []));
    setRolesUpdatedAt(file.updatedAt || '');
  };

  const loadRoles = async () => {
    const res = await fetch(ROLES_API, { cache: 'no-store' });
    const json = (await res.json()) as DoorRolesFile & { error?: string };
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    applyRoles(json);
  };

  const saveRoles = async (devices: SavedDoor[]) => {
    setSavingRoles(true);
    try {
      const res = await fetch(ROLES_API, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devices }),
      });
      const json = (await res.json()) as DoorRolesFile & { error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      applyRoles(json);
    } finally {
      setSavingRoles(false);
    }
  };

  useEffect(() => {
    void load();
    void loadRoles().catch(() => {
      /* occupancy still uses name-based suggestions */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = data?.events ?? [];
  const people = useMemo(() => unique(events.map((e) => `${e.employeeId}||${e.name}`)), [events]);
  const depts = useMemo(() => unique(events.map((e) => e.department)), [events]);
  const buildings = useMemo(() => unique(events.map((e) => e.building)), [events]);
  const devices = useMemo(() => unique(events.map((e) => e.deviceName)), [events]);

  const filtered = useMemo(() => {
    const qq = filters.q.trim().toLowerCase();
    return events.filter((e) => {
      if (filters.from && e.accessDate && e.accessDate < filters.from) return false;
      if (filters.to && e.accessDate && e.accessDate > filters.to) return false;
      if (filters.emp !== 'all' && e.employeeId !== filters.emp) return false;
      if (filters.dept !== 'all' && e.department !== filters.dept) return false;
      if (filters.building !== 'all' && e.building !== filters.building) return false;
      if (filters.device !== 'all' && e.deviceName !== filters.device) return false;
      if (filters.dir !== 'all' && e.direction !== filters.dir) return false;
      if (qq) {
        const blob = `${e.name} ${e.employeeId} ${e.department} ${e.jobTitle} ${e.deviceName} ${e.building}`.toLowerCase();
        if (!blob.includes(qq)) return false;
      }
      return true;
    });
  }, [events, filters]);

  const daysAll = useMemo(() => presenceFrom(filtered), [filtered]);
  const days = useMemo(() => {
    if (kpiFocus === 'late') return daysAll.filter((d) => d.late);
    if (kpiFocus === 'early') return daysAll.filter((d) => d.earlyOut);
    return daysAll;
  }, [daysAll, kpiFocus]);

  const today = todayISO();
  const onSite = useMemo(() => stillInside(peopleOnDate(events, today, roleMap)), [events, today, roleMap]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.accessDate, (m.get(e.accessDate) ?? 0) + 1);
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, punches]) => ({ date, punches }));
  }, [filtered]);
  const byHour = useMemo(() => {
    return Array.from({ length: 24 }, (_, h) => ({
      hour: String(h).padStart(2, '0'),
      n: filtered.filter((e) => e.hour === h).length,
    }));
  }, [filtered]);
  const dirSlices = useMemo(() => {
    const m = { IN: 0, OUT: 0, UNKNOWN: 0 };
    for (const e of filtered) m[e.direction] += 1;
    return [
      { id: 'IN' as const, name: 'In', value: m.IN, color: '#10b981' },
      { id: 'OUT' as const, name: 'Out', value: m.OUT, color: '#60a5fa' },
      { id: 'UNKNOWN' as const, name: 'Door / room', value: m.UNKNOWN, color: '#94a3b8' },
    ].filter((s) => s.value > 0);
  }, [filtered]);
  const dirTotal = dirSlices.reduce((s, x) => s + x.value, 0) || 1;
  const byBuilding = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of filtered) m.set(e.building, (m.get(e.building) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  }, [filtered]);
  const topPeople = useMemo(() => {
    const m = new Map<string, { name: string; id: string; n: number; dept: string; job: string }>();
    for (const e of filtered) {
      const cur = m.get(e.employeeId) ?? { name: e.name, id: e.employeeId, n: 0, dept: e.department, job: e.jobTitle };
      cur.n += 1;
      if (e.department && e.department !== 'Unspecified') cur.dept = e.department;
      if (e.jobTitle) cur.job = e.jobTitle;
      if (e.name && e.name !== e.employeeId) cur.name = e.name;
      m.set(e.employeeId, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [filtered]);
  const topDevices = useMemo(() => {
    const m = new Map<string, { name: string; serial: string; n: number; building: string }>();
    for (const e of filtered) {
      const key = `${e.deviceSerial || e.deviceName}|${e.deviceName}`;
      const cur = m.get(key) ?? { name: e.deviceName, serial: e.deviceSerial, n: 0, building: e.building };
      cur.n += 1;
      if (e.deviceSerial && !cur.serial) cur.serial = e.deviceSerial;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);

  const applyFilters = () => {
    startTransition(() => {
      setFilters({ ...draft });
      setPage(0);
      setKpiFocus(null);
    });
  };
  const dateSpan = useMemo(() => {
    const dates = events.map((e) => e.accessDate).filter(Boolean).sort();
    return { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
  }, [events]);

  const clearAll = () => {
    const empty = { ...emptyFilters(), from: dateSpan.from, to: dateSpan.to };
    setDraft(empty);
    startTransition(() => {
      setFilters(empty);
      setPage(0);
      setKpiFocus(null);
    });
  };
  const setQuick = (patch: Partial<Filters>, focus: 'late' | 'early' | null = null) => {
    const next = { ...filters, ...patch };
    setDraft(next);
    startTransition(() => {
      setFilters(next);
      setPage(0);
      setKpiFocus(focus);
    });
  };

  const activeFilterCount = [
    draft.emp !== 'all',
    draft.dept !== 'all',
    draft.building !== 'all',
    draft.device !== 'all',
    draft.dir !== 'all',
    Boolean(draft.q.trim()),
    Boolean(dateSpan.from && draft.from && draft.from !== dateSpan.from),
    Boolean(dateSpan.to && draft.to && draft.to !== dateSpan.to),
    Boolean(kpiFocus),
  ].filter(Boolean).length;

  useEffect(() => setPage(0), [filters, tab, kpiFocus]);

  const hoursSum = useMemo(() => {
    const rows = hoursOnDate(filtered, roleMap);
    const site = rows.reduce((s, d) => s + d.siteHours, 0);
    const idle = rows.reduce((s, d) => s + d.idleHours, 0);
    return { site, idle, productive: Math.max(0, site - idle) };
  }, [filtered, roleMap]);

  const showReportChrome = REPORT_TABS.includes(tab);
  const lateCount = daysAll.filter((d) => d.late).length;

  if (loading && !data) {
    return (
      <div className="app app-loading">
        <div className="loader-ring" />
        <p>Loading HQ access…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-mast">
        <div className="top-bar">
          <div className="brand">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="NEWEAST" />
            <div>
              <p className="eyebrow">HQ · Access control</p>
              <h1>HQ Access & Attendance</h1>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="btn" onClick={clearAll} disabled={!activeFilterCount && !kpiFocus}>
              Reset
            </button>
            <button type="button" className="btn" onClick={() => exportAttendance(filtered, days)} disabled={!filtered.length}>
              Excel Export
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void load(true)} disabled={refreshing}>
              {refreshing ? '…' : 'Refresh'}
            </button>
          </div>
        </div>
        <nav className="app-nav" aria-label="HQ attendance sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.id} className="nav-group">
              <span className="nav-group-label">{group.label}</span>
              <div className="nav-group-items">
                {group.items.map(([id, label]) => (
                  <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </header>

      {error && (
        <div className="alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}
      {(refreshing || isPending) && (
        <div className="busy-banner" role="status">
          <span className="busy-dot" />
          {refreshing ? 'Syncing from HQ access…' : 'Applying filters…'}
        </div>
      )}

      {showReportChrome && (
        <section className="panel filters-panel compact">
          <PanelHead
            title={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}`}
            info="Narrow punches by date, person, department, building or door. Apply to refresh the metrics below."
            actions={
              <>
                <button type="button" className="btn btn-sm" onClick={clearAll} disabled={!activeFilterCount}>
                  Reset
                </button>
                <button type="button" className="btn btn-sm btn-primary" onClick={applyFilters}>
                  Apply
                </button>
              </>
            }
          />
          <div className="filters-grid">
            <label>
              <span className="filter-label">From</span>
              <input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
            </label>
            <label>
              <span className="filter-label">To</span>
              <input type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
            </label>
            <label>
              <span className="filter-label">Person</span>
              <select value={draft.emp} onChange={(e) => setDraft((d) => ({ ...d, emp: e.target.value }))}>
                <option value="all">Everyone</option>
                {people.map((p) => {
                  const [id, name] = p.split('||');
                  return (
                    <option key={p} value={id}>
                      {name} ({id})
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span className="filter-label">Department</span>
              <select value={draft.dept} onChange={(e) => setDraft((d) => ({ ...d, dept: e.target.value }))}>
                <option value="all">All departments</option>
                {depts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filter-label">Building</span>
              <select value={draft.building} onChange={(e) => setDraft((d) => ({ ...d, building: e.target.value }))}>
                <option value="all">All buildings</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filter-label">Device</span>
              <select value={draft.device} onChange={(e) => setDraft((d) => ({ ...d, device: e.target.value }))}>
                <option value="all">All devices</option>
                {devices.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="filter-label">Direction</span>
              <select value={draft.dir} onChange={(e) => setDraft((d) => ({ ...d, dir: e.target.value as Filters['dir'] }))}>
                <option value="all">All</option>
                <option value="IN">In</option>
                <option value="OUT">Out</option>
                <option value="UNKNOWN">Door / room</option>
              </select>
            </label>
            <label className="span-2">
              <span className="filter-label">Search</span>
              <input
                type="search"
                placeholder="Name, employee ID, device…"
                value={draft.q}
                onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </label>
          </div>
          {data?.cachedAt && (
            <p className="meta">
              Cached {new Date(data.cachedAt).toLocaleString()} · {filtered.length.toLocaleString()} of {events.length.toLocaleString()} punches
            </p>
          )}
        </section>
      )}

      {tab === 'overview' && (
        <div className="ov-stats">
          <button type="button" className="tone-green" onClick={() => setTab('hours')}>
            <em>Productive hours</em>
            <strong>{formatHours(hoursSum.productive)}</strong>
          </button>
          <button type="button" className="tone-blue" onClick={() => setTab('hours')}>
            <em>Non-productive hours</em>
            <strong>{formatHours(hoursSum.idle)}</strong>
          </button>
          <button type="button" className="tone-green" onClick={() => setTab('onsite')}>
            <em>In the building now</em>
            <strong>{onSite.length}</strong>
          </button>
          <button type="button" className="tone-blue" onClick={() => setTab('people')}>
            <em>People</em>
            <strong>{topPeople.length}</strong>
          </button>
          <button type="button" className="tone-blue" onClick={() => setTab('timeline')}>
            <em>Punches</em>
            <strong>{filtered.length.toLocaleString()}</strong>
          </button>
          <button
            type="button"
            className={`tone-red${kpiFocus === 'late' ? ' on' : ''}`}
            onClick={() => {
              setKpiFocus('late');
              setTab('presence');
            }}
          >
            <em>Late after 09:15</em>
            <strong>{lateCount}</strong>
          </button>
        </div>
      )}

      {tab === 'overview' && (
        <OverviewCharts
          events={filtered}
          roleMap={roleMap}
          byDay={byDay}
          byHour={byHour}
          dirSlices={dirSlices}
          dirTotal={dirTotal}
          byBuilding={byBuilding}
          onRange={(from, to) => setQuick({ from, to })}
          onPerson={(id) => {
            setQuick({ emp: id });
            setTab('timeline');
          }}
          onDir={(dir) => setQuick({ dir })}
          onBuilding={(name) => setQuick({ building: name })}
          onOpenHours={() => setTab('hours')}
          onReset={clearAll}
        />
      )}

      {tab === 'hours' && <HoursTab events={filtered} roleMap={roleMap} />}

      {tab === 'people' && (
        <section className="panel details-panel">
          <PanelHead title="People" info="Click a row to see that person’s punches." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Employee ID</th>
                  <th>Department</th>
                  <th>Job title</th>
                  <th>Punches</th>
                </tr>
              </thead>
              <tbody>
                {topPeople.map((p) => (
                  <tr
                    key={p.id}
                    className={filters.emp === p.id ? 'selected' : ''}
                    onClick={() => {
                      setQuick({ emp: p.id });
                      setTab('timeline');
                    }}
                  >
                    <td>{p.name}</td>
                    <td className="mono">{p.id}</td>
                    <td>{p.dept}</td>
                    <td>{p.job || '—'}</td>
                    <td>{p.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'devices' && (
        <section className="panel details-panel">
          <PanelHead
            title="Doors & readers"
            info="Click a row to filter punches to that device."
            actions={
              <button type="button" className="btn btn-sm btn-primary" disabled={!topDevices.length} onClick={() => exportDevices(topDevices)}>
                Excel export
              </button>
            }
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Serial number</th>
                  <th>Building</th>
                  <th>Punches</th>
                </tr>
              </thead>
              <tbody>
                {topDevices.map((d) => (
                  <tr
                    key={`${d.serial}|${d.name}`}
                    className={filters.device === d.name ? 'selected' : ''}
                    onClick={() => {
                      setQuick({ device: d.name });
                      setTab('timeline');
                    }}
                  >
                    <td>{d.name}</td>
                    <td className="mono">{d.serial || '—'}</td>
                    <td>
                      <span className="pill">{d.building}</span>
                    </td>
                    <td>{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'presence' && (
        <section className="panel details-panel">
          <PanelHead
            title="Daily presence"
            info="First and last punch that day. Hours are the span between them. Late = first punch after 09:15."
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>First</th>
                  <th>Last</th>
                  <th>Punches</th>
                  <th>Hours</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {days.slice(0, 80).map((d) => (
                  <tr
                    key={`${d.employeeId}-${d.date}`}
                    onClick={() => {
                      setQuick({ emp: d.employeeId, from: d.date, to: d.date });
                      setTab('timeline');
                    }}
                  >
                    <td>{d.date}</td>
                    <td>
                      {d.name}
                      <div className="muted">{d.employeeId}</div>
                    </td>
                    <td>{d.department}</td>
                    <td className="mono">{d.first}</td>
                    <td className="mono">{d.last}</td>
                    <td>{d.punches}</td>
                    <td>{d.hours.toFixed(1)}</td>
                    <td>
                      {d.late && <span className="pill amber">Late</span>}{' '}
                      {d.earlyOut && <span className="pill">Early</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'onsite' && <OnSiteTab events={events} roleMap={roleMap} />}
      {tab === 'bydevice' && <ByDeviceTab events={events} roleMap={roleMap} />}
      {tab === 'doortypes' && (
        <DoorSetupTab
          events={events}
          roleMap={roleMap}
          updatedAt={rolesUpdatedAt}
          saving={savingRoles}
          onSave={saveRoles}
        />
      )}
      {tab === 'foodcourt' && <FoodCourtTab events={events} />}

      {tab === 'timeline' && (
        <section className="panel details-panel">
          <PanelHead title="Punch timeline" info="Raw HQ access events for the current filters." />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Device</th>
                  <th>Building</th>
                  <th>Direction</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((e, i) => (
                  <tr
                    key={`${e.ts}-${e.employeeId}-${i}`}
                    onClick={() => setQuick({ emp: e.employeeId })}
                  >
                    <td>{e.accessDate}</td>
                    <td className="mono">{e.accessTime}</td>
                    <td>
                      {e.name}
                      <div className="muted">{e.employeeId}</div>
                    </td>
                    <td>{e.department}</td>
                    <td>{e.deviceName}</td>
                    <td>
                      <span className="pill">{e.building}</span>
                    </td>
                    <td>
                      <span className={`pill ${e.direction === 'IN' ? 'green' : e.direction === 'OUT' ? 'isuzu' : ''}`}>
                        {e.direction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Prev
            </button>
            <span>
              Page {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
