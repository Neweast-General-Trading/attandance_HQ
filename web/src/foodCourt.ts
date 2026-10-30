import type { HqAccessEvent } from './types';

/** Hikvision Food Court: MB GF FC IN / MB GF FC OUT */
export const FC_IN_SERIAL = 'GM9731498';
export const FC_OUT_SERIAL = 'GM9731530';

export type FcGate = 'both' | 'IN' | 'OUT';
export type FcDir = 'IN' | 'OUT';

export type FoodCourtVisit = {
  employeeId: string;
  name: string;
  department: string;
  jobTitle: string;
  date: string;
  weekday: string;
  n: number;
  inTime: string;
  outTime: string;
  hours: number;
  complete: boolean;
  open: boolean;
  inDevice: string;
  outDevice: string;
};

export type FoodCourtDay = {
  employeeId: string;
  name: string;
  department: string;
  jobTitle: string;
  date: string;
  weekday: string;
  inCount: number;
  outCount: number;
  complete: number;
  open: number;
  hours: number;
  pairHours: number[];
};

function serialOf(e: HqAccessEvent): string {
  return (e.deviceSerial || '').trim().toUpperCase();
}

export function isFoodCourtSerial(serial: string): boolean {
  const s = serial.trim().toUpperCase();
  return s === FC_IN_SERIAL || s === FC_OUT_SERIAL;
}

/** Direction from device name / event direction, then serial. */
export function foodCourtDir(e: HqAccessEvent): FcDir | null {
  if (!isFoodCourtSerial(serialOf(e))) return null;
  const name = (e.deviceName || '').toUpperCase();
  if (/\bOUT\b/.test(name)) return 'OUT';
  if (/\bIN\b/.test(name)) return 'IN';
  if (e.direction === 'OUT') return 'OUT';
  if (e.direction === 'IN') return 'IN';
  const s = serialOf(e);
  if (s === FC_OUT_SERIAL) return 'OUT';
  if (s === FC_IN_SERIAL) return 'IN';
  return null;
}

export function foodCourtEvents(events: HqAccessEvent[], gate: FcGate): HqAccessEvent[] {
  return events
    .map((e) => {
      const d = foodCourtDir(e);
      if (!d) return null;
      if (gate !== 'both' && d !== gate) return null;
      return { ...e, direction: d };
    })
    .filter((e): e is HqAccessEvent => Boolean(e))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

function minutes(t: string) {
  const [h, m, s] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0) + (s || 0) / 60;
}

function hoursBetween(a: string, b: string) {
  const d = minutes(b) - minutes(a);
  return d > 0 ? d / 60 : 0;
}

export function formatHours(h: number): string {
  if (!h) return '0h 00m';
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}h ${String(mm).padStart(2, '0')}m`;
}

export function foodCourtVisits(punches: HqAccessEvent[]): FoodCourtVisit[] {
  const grouped = new Map<string, HqAccessEvent[]>();
  for (const e of punches) {
    if (!e.accessDate) continue;
    const k = `${e.employeeId}|${e.accessDate}`;
    const arr = grouped.get(k) ?? [];
    arr.push(e);
    grouped.set(k, arr);
  }
  const visits: FoodCourtVisit[] = [];
  for (const arr of grouped.values()) {
    const sorted = [...arr].sort((a, b) => a.ts.localeCompare(b.ts));
    let open: HqAccessEvent | null = null;
    let n = 0;
    const dayVisits: FoodCourtVisit[] = [];
    for (const e of sorted) {
      if (e.direction === 'IN') {
        if (open) dayVisits.push(visitFrom(open, null, 0));
        open = e;
      } else if (e.direction === 'OUT') {
        if (open) {
          dayVisits.push(visitFrom(open, e, 0));
          open = null;
        }
      }
    }
    if (open) dayVisits.push(visitFrom(open, null, 0));
    for (const v of dayVisits) {
      n += 1;
      visits.push({ ...v, n });
    }
  }
  return visits.sort(
    (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.n - b.n,
  );
}

function visitFrom(inn: HqAccessEvent | null, out: HqAccessEvent | null, n: number): FoodCourtVisit {
  const src = inn ?? out!;
  const inTime = inn?.accessTime ?? '';
  const outTime = out?.accessTime ?? '';
  const complete = Boolean(inn && out);
  return {
    employeeId: src.employeeId,
    name: src.name,
    department: src.department,
    jobTitle: src.jobTitle,
    date: src.accessDate,
    weekday: src.weekday,
    n,
    inTime,
    outTime,
    hours: complete ? hoursBetween(inTime, outTime) : 0,
    complete,
    open: Boolean(inn && !out),
    inDevice: inn?.deviceName ?? '',
    outDevice: out?.deviceName ?? '',
  };
}

export function foodCourtDays(visits: FoodCourtVisit[], punches: HqAccessEvent[]): FoodCourtDay[] {
  const map = new Map<string, FoodCourtDay>();
  const punchDir = new Map<string, { inCount: number; outCount: number }>();
  for (const e of punches) {
    const k = `${e.employeeId}|${e.accessDate}`;
    const cur = punchDir.get(k) ?? { inCount: 0, outCount: 0 };
    if (e.direction === 'IN') cur.inCount += 1;
    if (e.direction === 'OUT') cur.outCount += 1;
    punchDir.set(k, cur);
  }
  for (const v of visits) {
    const k = `${v.employeeId}|${v.date}`;
    const counts = punchDir.get(k) ?? { inCount: 0, outCount: 0 };
    const cur = map.get(k) ?? {
      employeeId: v.employeeId,
      name: v.name,
      department: v.department,
      jobTitle: v.jobTitle,
      date: v.date,
      weekday: v.weekday,
      inCount: counts.inCount,
      outCount: counts.outCount,
      complete: 0,
      open: 0,
      hours: 0,
      pairHours: [],
    };
    if (v.complete) {
      cur.complete += 1;
      cur.hours += v.hours;
      cur.pairHours.push(v.hours);
    }
    if (v.open) cur.open += 1;
    if (v.name && v.name !== v.employeeId) cur.name = v.name;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}
