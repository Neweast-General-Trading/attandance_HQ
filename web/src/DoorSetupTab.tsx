import { useMemo, useState } from 'react';
import { PanelHead } from './components/PanelHead';
import {
  catalogDevices,
  DOOR_ROLES,
  ROLE_LABEL,
  type DoorRole,
  type SavedDoor,
} from './deviceRoles';
import type { HqAccessEvent } from './types';

type Props = {
  events: HqAccessEvent[];
  roleMap: Record<string, DoorRole>;
  updatedAt: string;
  saving: boolean;
  onSave: (devices: SavedDoor[]) => Promise<void>;
};

export function DoorSetupTab({ events, roleMap, updatedAt, saving, onSave }: Props) {
  const catalog = useMemo(() => catalogDevices(events, roleMap), [events, roleMap]);
  const [draft, setDraft] = useState<Record<string, DoorRole>>({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | DoorRole>('all');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const effective = useMemo(() => {
    return catalog.map((d) => ({ ...d, role: draft[d.key] ?? d.role }));
  }, [catalog, draft]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return effective.filter((d) => {
      if (filter !== 'all' && d.role !== filter) return false;
      if (!qq) return true;
      return `${d.name} ${d.serial} ${d.building}`.toLowerCase().includes(qq);
    });
  }, [effective, q, filter]);

  const counts = useMemo(() => {
    const c: Record<DoorRole | 'all', number> = {
      all: effective.length,
      building_in: 0,
      building_out: 0,
      internal_in: 0,
      internal_out: 0,
      other: 0,
    };
    for (const d of effective) c[d.role] += 1;
    return c;
  }, [effective]);

  const dirty = Object.keys(draft).length > 0;

  const setRole = (key: string, role: DoorRole) => {
    setDraft((prev) => ({ ...prev, [key]: role }));
    setMsg('');
    setErr('');
  };

  const applySuggested = () => {
    const next: Record<string, DoorRole> = {};
    for (const d of catalog) next[d.key] = d.suggested;
    setDraft(next);
    setMsg('');
    setErr('');
  };

  const save = async () => {
    setErr('');
    setMsg('');
    try {
      await onSave(
        effective.map((d) => ({
          serial: d.serial,
          name: d.name,
          role: d.role,
        })),
      );
      setDraft({});
      setMsg('Door types saved. In building now uses building entry/exit only.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save door types.');
    }
  };

  return (
    <div className="fc-wrap">
      <section className="panel filters-panel">
        <PanelHead
          title="Door types"
          info="Building entry/exit decide who is inside HQ. Inside entry/exit (Food Court and similar) stay inside the building and never count as leaving. Room readers are ignored for occupancy."
          actions={
            <>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!q && filter === 'all'}
                onClick={() => {
                  setQ('');
                  setFilter('all');
                }}
              >
                Reset
              </button>
              <button type="button" className="btn btn-sm" onClick={applySuggested} disabled={saving}>
                Apply suggested
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save door types'}
              </button>
            </>
          }
        />
        <div className="filters-grid">
          <label className="span-2">
            <span className="filter-label">Search</span>
            <input type="search" placeholder="Door name or serial…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        {updatedAt ? (
          <p className="meta">Last saved {new Date(updatedAt).toLocaleString()}{dirty ? ' · unsaved changes' : ''}</p>
        ) : (
          <p className="meta">Not saved yet — types below are suggestions from the door name. Save to keep them.</p>
        )}
        {msg ? <p className="door-msg ok">{msg}</p> : null}
        {err ? <p className="door-msg bad">{err}</p> : null}
      </section>

      <div className="kpi-grid fc-kpis site-kpis door-role-kpis">
        {(
          [
            ['all', 'All doors', 'slate'],
            ['building_in', 'Building entry', 'green'],
            ['building_out', 'Building exit', 'cyan'],
            ['internal_in', 'Inside entry', 'blue'],
            ['internal_out', 'Inside exit', 'violet'],
            ['other', 'Room / other', 'amber'],
          ] as const
        ).map(([id, label, tone]) => (
          <button
            key={id}
            type="button"
            className={`kpi ${tone}${filter === id ? ' active' : ''}`}
            onClick={() => setFilter(id)}
          >
            <label>{label}</label>
            <strong>{counts[id]}</strong>
            <span className="kpi-foot">{id === 'all' ? 'used in this data' : ROLE_LABEL[id]}</span>
          </button>
        ))}
      </div>

      <section className="panel details-panel">
        <PanelHead
          title="Assign each device"
          info="Food Court IN/OUT belong in Inside entry / Inside exit. Staff and main gates belong in Building entry / Building exit."
        />
        <div className="table-wrap">
          <table className="site-table door-setup-table">
            <thead>
              <tr>
                <th>Door</th>
                <th>Serial</th>
                <th>Location</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((d) => (
                  <tr key={d.key}>
                    <td>
                      <div className="site-door">{d.name || '—'}</div>
                      <div className="muted">{d.punches} punches</div>
                    </td>
                    <td className="mono">{d.serial || '—'}</td>
                    <td>{d.building}</td>
                    <td>
                      <div className="door-role-picks" role="radiogroup" aria-label={`Type for ${d.name}`}>
                        {DOOR_ROLES.map((role) => (
                          <label key={role} className={`door-role-pick${d.role === role ? ' on' : ''}`}>
                            <input
                              type="radio"
                              name={`role-${d.key}`}
                              checked={d.role === role}
                              onChange={() => setRole(d.key, role)}
                            />
                            {ROLE_LABEL[role]}
                          </label>
                        ))}
                      </div>
                      {!d.saved && draft[d.key] == null ? <div className="muted">Suggested from name</div> : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="muted">
                    No devices match.
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
