import { doorRoleOf, occupancyOf, type DoorRole } from './deviceRoles';
import type { HqAccessEvent } from './types';

export type TimeSpan = {
  kind: 'site' | 'idle';
  start: string;
  end: string;
  hours: number;
  complete: boolean;
  open: boolean;
  inDevice: string;
  outDevice: string;
};

export type HoursDay = {
  employeeId: string;
  name: string;
  department: string;
  jobTitle: string;
  date: string;
  weekday: string;
  firstIn: string;
  lastOut: string;
  siteHours: number;
  idleHours: number;
  activeHours: number;
  siteVisits: number;
  idleVisits: number;
  openSite: boolean;
  spans: TimeSpan[];
};

export type HoursBucket = {
  key: string;
  label: string;
  from: string;
  to: string;
  employeeId: string;
  name: string;
  department: string;
  jobTitle: string;
  days: number;
  siteHours: number;
  idleHours: number;
  activeHours: number;
  firstIn: string;
  lastOut: string;
};

function pad(n: number) {
  return String(Math.floor(n)).padStart(2, '0');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toMinutes(t: string): number {
  const [h, m, s] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0) + (s || 0) / 60;
}

export function fromMinutes(mins: number): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}:00`;
}

export function hoursBetween(a: string, b: string): number {
  const d = toMinutes(b) - toMinutes(a);
  return d > 0 ? d / 60 : 0;
}

function nowClock(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pairSpans(
  sorted: HqAccessEvent[],
  kind: 'site' | 'idle',
  isIn: (e: HqAccessEvent) => boolean,
  isOut: (e: HqAccessEvent) => boolean,
  closeOpen: boolean,
): TimeSpan[] {
  const spans: TimeSpan[] = [];
  let open: HqAccessEvent | null = null;
  for (const e of sorted) {
    if (isIn(e)) {
      open = e;
    } else if (isOut(e) && open) {
      spans.push({
        kind,
        start: open.accessTime,
        end: e.accessTime,
        hours: hoursBetween(open.accessTime, e.accessTime),
        complete: true,
        open: false,
        inDevice: open.deviceName,
        outDevice: e.deviceName,
      });
      open = null;
    }
  }
  if (open && closeOpen) {
    const end = nowClock();
    spans.push({
      kind,
      start: open.accessTime,
      end,
      hours: hoursBetween(open.accessTime, end),
      complete: false,
      open: true,
      inDevice: open.deviceName,
      outDevice: '',
    });
  }
  return spans;
}

function overlapHours(a: TimeSpan, b: TimeSpan): number {
  const start = Math.max(toMinutes(a.start), toMinutes(b.start));
  const end = Math.min(toMinutes(a.end), toMinutes(b.end));
  return Math.max(0, (end - start) / 60);
}

export function hoursOnDate(
  events: HqAccessEvent[],
  roleMap: Record<string, DoorRole>,
  today = todayISO(),
): HoursDay[] {
  const grouped = new Map<string, HqAccessEvent[]>();
  for (const e of events) {
    if (!e.accessDate) continue;
    const k = `${e.employeeId}|${e.accessDate}`;
    const arr = grouped.get(k) ?? [];
    arr.push(e);
    grouped.set(k, arr);
  }
  const out: HoursDay[] = [];
  for (const arr of grouped.values()) {
    const sorted = [...arr].sort((a, b) => a.ts.localeCompare(b.ts));
    const first = sorted[0];
    const closeOpen = first.accessDate === today;
    const site = pairSpans(
      sorted,
      'site',
      (e) => occupancyOf(doorRoleOf(e, roleMap)) === 'in',
      (e) => occupancyOf(doorRoleOf(e, roleMap)) === 'out',
      closeOpen,
    );
    const idleRaw = pairSpans(
      sorted,
      'idle',
      (e) => doorRoleOf(e, roleMap) === 'internal_in',
      (e) => doorRoleOf(e, roleMap) === 'internal_out',
      closeOpen,
    );
    const idle = idleRaw.map((idleSpan) => {
      if (!site.length) return { ...idleSpan, hours: 0 };
      const hours = site.reduce((sum, s) => sum + overlapHours(s, idleSpan), 0);
      return { ...idleSpan, hours };
    });
    const siteHours = site.reduce((s, x) => s + x.hours, 0);
    const idleHours = Math.min(siteHours, idle.reduce((s, x) => s + x.hours, 0));
    const siteComplete = site.filter((x) => x.complete || x.open);
    const idleComplete = idle.filter((x) => x.hours > 0);
    out.push({
      employeeId: first.employeeId,
      name: first.name,
      department: first.department,
      jobTitle: first.jobTitle,
      date: first.accessDate,
      weekday: first.weekday,
      firstIn: site[0]?.start || '',
      lastOut: site.length ? site[site.length - 1].end : '',
      siteHours,
      idleHours,
      activeHours: Math.max(0, siteHours - idleHours),
      siteVisits: siteComplete.length,
      idleVisits: idleComplete.length,
      openSite: site.some((x) => x.open),
      spans: [...site, ...idle].sort((a, b) => a.start.localeCompare(b.start)),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

function isoWeekKey(date: string): { key: string; label: string; from: string; to: string } {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDay() || 7;
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - day + 4);
  const year = thursday.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const from = new Date(thursday);
  from.setDate(thursday.getDate() - 3);
  const to = new Date(thursday);
  to.setDate(thursday.getDate() + 3);
  const fmt = (x: Date) => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  const key = `${year}-W${pad(week)}`;
  return { key, label: `${year} · Week ${week}`, from: fmt(from), to: fmt(to) };
}

function monthKey(date: string): { key: string; label: string; from: string; to: string } {
  const [y, m] = date.split('-');
  const last = new Date(Number(y), Number(m), 0).getDate();
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    key: `${y}-${m}`,
    label: `${names[Number(m) - 1]} ${y}`,
    from: `${y}-${m}-01`,
    to: `${y}-${m}-${pad(last)}`,
  };
}

export type HoursGrain = 'day' | 'week' | 'month';

export function rollHours(days: HoursDay[], grain: HoursGrain): HoursBucket[] {
  if (grain === 'day') {
    return days.map((d) => ({
      key: `${d.employeeId}|${d.date}`,
      label: d.date,
      from: d.date,
      to: d.date,
      employeeId: d.employeeId,
      name: d.name,
      department: d.department,
      jobTitle: d.jobTitle,
      days: d.siteHours > 0 || d.firstIn ? 1 : 0,
      siteHours: d.siteHours,
      idleHours: d.idleHours,
      activeHours: d.activeHours,
      firstIn: d.firstIn,
      lastOut: d.lastOut,
    }));
  }
  const map = new Map<string, HoursBucket>();
  for (const d of days) {
    const meta = grain === 'week' ? isoWeekKey(d.date) : monthKey(d.date);
    const k = `${d.employeeId}|${meta.key}`;
    const cur = map.get(k) ?? {
      key: k,
      label: meta.label,
      from: d.date,
      to: d.date,
      employeeId: d.employeeId,
      name: d.name,
      department: d.department,
      jobTitle: d.jobTitle,
      days: 0,
      siteHours: 0,
      idleHours: 0,
      activeHours: 0,
      firstIn: '',
      lastOut: '',
    };
    cur.days += 1;
    cur.siteHours += d.siteHours;
    cur.idleHours += d.idleHours;
    cur.activeHours += d.activeHours;
    if (d.date < cur.from) cur.from = d.date;
    if (d.date > cur.to) cur.to = d.date;
    if (d.name && d.name !== d.employeeId) cur.name = d.name;
    if (d.department) cur.department = d.department;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.to.localeCompare(a.to) || a.name.localeCompare(b.name));
}

export function hoursTrend(days: HoursDay[], grain: HoursGrain) {
  const map = new Map<
    string,
    { key: string; label: string; from: string; to: string; site: number; idle: number; active: number; people: Set<string> }
  >();
  for (const d of days) {
    const meta =
      grain === 'day'
        ? { key: d.date, label: d.date.slice(5), from: d.date, to: d.date }
        : grain === 'week'
          ? isoWeekKey(d.date)
          : monthKey(d.date);
    const cur = map.get(meta.key) ?? {
      key: meta.key,
      label: grain === 'day' ? d.date.slice(5) : meta.label,
      from: meta.from,
      to: meta.to,
      site: 0,
      idle: 0,
      active: 0,
      people: new Set<string>(),
    };
    cur.site += d.siteHours;
    cur.idle += d.idleHours;
    cur.active += d.activeHours;
    cur.people.add(d.employeeId);
    map.set(meta.key, cur);
  }
  return [...map.values()]
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((x) => ({
      key: x.key,
      label: x.label,
      from: x.from,
      to: x.to,
      site: Number(x.site.toFixed(2)),
      idle: Number(x.idle.toFixed(2)),
      active: Number(x.active.toFixed(2)),
      people: x.people.size,
    }));
}
