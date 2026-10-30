import { doorRoleOf, occupancyOf, type DoorRole } from './deviceRoles';
import type { HqAccessEvent } from './types';

export type PersonSite = {
  employeeId: string;
  name: string;
  department: string;
  jobTitle: string;
  date: string;
  inside: boolean;
  inCount: number;
  outCount: number;
  lastIn?: HqAccessEvent;
  lastOut?: HqAccessEvent;
  lastPunch?: HqAccessEvent;
  /** Last building IN or OUT — the movement that decides their status. */
  lastAction?: HqAccessEvent;
};

export type DeviceDay = {
  key: string;
  deviceName: string;
  deviceSerial: string;
  building: string;
  inCount: number;
  outCount: number;
  otherCount: number;
  stillInside: PersonSite[];
  lastOutPeople: PersonSite[];
  role: DoorRole;
};

function minutesSince(time: string, date: string) {
  if (!time || !date) return 0;
  const [h, m, s] = time.split(':').map(Number);
  const start = new Date(`${date}T00:00:00`);
  start.setHours(h || 0, m || 0, s || 0, 0);
  return Math.max(0, (Date.now() - start.getTime()) / 60000);
}

export function formatSince(time: string, date: string): string {
  const mins = Math.round(minutesSince(time, date));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function peopleOnDate(
  events: HqAccessEvent[],
  date: string,
  roleMap: Record<string, DoorRole> = {},
): PersonSite[] {
  const grouped = new Map<string, HqAccessEvent[]>();
  for (const e of events) {
    if (e.accessDate !== date) continue;
    const arr = grouped.get(e.employeeId) ?? [];
    arr.push(e);
    grouped.set(e.employeeId, arr);
  }
  const out: PersonSite[] = [];
  for (const arr of grouped.values()) {
    const sorted = [...arr].sort((a, b) => a.ts.localeCompare(b.ts));
    let inside = false;
    let lastIn: HqAccessEvent | undefined;
    let lastOut: HqAccessEvent | undefined;
    let inCount = 0;
    let outCount = 0;
    for (const e of sorted) {
      const role = doorRoleOf(e, roleMap);
      if (role === 'building_in') {
        inside = true;
        lastIn = e;
        inCount += 1;
      } else if (role === 'building_out') {
        inside = false;
        lastOut = e;
        outCount += 1;
      } else if (role === 'internal_in' || role === 'internal_out') {
        inside = true;
      }
    }
    const last = sorted[sorted.length - 1];
    const lastAction =
      [...sorted].reverse().find((e) => {
        const role = doorRoleOf(e, roleMap);
        return occupancyOf(role) !== 'none' || role === 'internal_in' || role === 'internal_out';
      }) || last;
    out.push({
      employeeId: last.employeeId,
      name: last.name,
      department: last.department,
      jobTitle: last.jobTitle,
      date,
      inside,
      inCount,
      outCount,
      lastIn,
      lastOut,
      lastPunch: last,
      lastAction,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function stillInside(people: PersonSite[]): PersonSite[] {
  return people.filter((p) => p.inside);
}

export function devicesOnDate(
  events: HqAccessEvent[],
  people: PersonSite[],
  date: string,
  roleMap: Record<string, DoorRole> = {},
): DeviceDay[] {
  const map = new Map<string, DeviceDay>();
  for (const e of events) {
    if (e.accessDate !== date) continue;
    const key = `${e.deviceSerial || e.deviceName}|${e.deviceName}`;
    const cur = map.get(key) ?? {
      key,
      deviceName: e.deviceName,
      deviceSerial: e.deviceSerial,
      building: e.building,
      inCount: 0,
      outCount: 0,
      otherCount: 0,
      stillInside: [],
      lastOutPeople: [],
      role: doorRoleOf(e, roleMap),
    };
    if (e.direction === 'IN') cur.inCount += 1;
    else if (e.direction === 'OUT') cur.outCount += 1;
    else cur.otherCount += 1;
    map.set(key, cur);
  }
  for (const p of people) {
    const presence = p.inside ? p.lastIn || p.lastPunch : undefined;
    if (p.inside && presence) {
      const key = `${presence.deviceSerial || presence.deviceName}|${presence.deviceName}`;
      const cur = map.get(key);
      if (cur) cur.stillInside.push(p);
    } else if (!p.inside && p.lastOut) {
      const key = `${p.lastOut.deviceSerial || p.lastOut.deviceName}|${p.lastOut.deviceName}`;
      const cur = map.get(key);
      if (cur) cur.lastOutPeople.push(p);
    }
  }
  return [...map.values()].sort((a, b) => b.inCount + b.outCount - (a.inCount + a.outCount) || a.deviceName.localeCompare(b.deviceName));
}
