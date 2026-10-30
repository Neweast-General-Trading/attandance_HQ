import { FC_IN_SERIAL, FC_OUT_SERIAL } from './foodCourt';
import type { HqAccessEvent } from './types';

export const DOOR_ROLES = [
  'building_in',
  'building_out',
  'internal_in',
  'internal_out',
  'other',
] as const;

export type DoorRole = (typeof DOOR_ROLES)[number];

export type SavedDoor = {
  serial: string;
  name: string;
  role: DoorRole;
};

export type DoorRolesFile = {
  updatedAt: string;
  devices: SavedDoor[];
};

export type DeviceCatalogRow = {
  key: string;
  serial: string;
  name: string;
  building: string;
  punches: number;
  role: DoorRole;
  suggested: DoorRole;
  saved: boolean;
};

export const ROLE_LABEL: Record<DoorRole, string> = {
  building_in: 'Building entry',
  building_out: 'Building exit',
  internal_in: 'Inside entry',
  internal_out: 'Inside exit',
  other: 'Room / other',
};

export function deviceKey(serial: string, name: string): string {
  return (serial || name || '').trim();
}

export function guessDoorRole(name: string, serial: string): DoorRole {
  const n = name.toUpperCase();
  const s = serial.toUpperCase();
  if (s === FC_IN_SERIAL || /FC\b.*\bIN\b|\bIN\b.*FC\b|FOOD COURT.*\bIN\b/.test(n)) return 'internal_in';
  if (s === FC_OUT_SERIAL || /FC\b.*\bOUT\b|\bOUT\b.*FC\b|FOOD COURT.*\bOUT\b/.test(n)) return 'internal_out';
  if (/\bFC\b|FOOD COURT|FOODCOURT/.test(n)) {
    if (/\bOUT\b/.test(n)) return 'internal_out';
    if (/\bIN\b/.test(n)) return 'internal_in';
    return 'internal_in';
  }
  if (/IDF|ARCHIVE|SERVER ROOM|CONTROL ROOM|AUDITORIUM|LABOUR/.test(n)) return 'other';
  if (/\bOUT\b/.test(n) && !/\bIN\b/.test(n)) return 'building_out';
  if (/\bIN\b/.test(n) && !/\bOUT\b/.test(n)) return 'building_in';
  if (/\bEXIT\b/.test(n)) return 'building_out';
  if (/\bENT(RY|RANCE)?\b/.test(n)) return 'building_in';
  return 'other';
}

export function rolesToMap(saved: SavedDoor[]): Record<string, DoorRole> {
  const map: Record<string, DoorRole> = {};
  for (const d of saved) {
    if (d.serial) map[d.serial] = d.role;
    if (d.name) map[d.name] = d.role;
  }
  return map;
}

export function doorRoleOf(event: Pick<HqAccessEvent, 'deviceSerial' | 'deviceName'>, map: Record<string, DoorRole>): DoorRole {
  const serial = (event.deviceSerial || '').toUpperCase();
  if (serial === FC_IN_SERIAL) return 'internal_in';
  if (serial === FC_OUT_SERIAL) return 'internal_out';
  return (
    (event.deviceSerial && map[event.deviceSerial]) ||
    (event.deviceName && map[event.deviceName]) ||
    guessDoorRole(event.deviceName, event.deviceSerial)
  );
}

export function occupancyOf(role: DoorRole): 'in' | 'out' | 'none' {
  if (role === 'building_in') return 'in';
  if (role === 'building_out') return 'out';
  return 'none';
}

export function catalogDevices(events: HqAccessEvent[], map: Record<string, DoorRole>): DeviceCatalogRow[] {
  const grouped = new Map<string, DeviceCatalogRow>();
  for (const e of events) {
    const serial = e.deviceSerial;
    const name = e.deviceName;
    const key = deviceKey(serial, name);
    if (!key) continue;
    const suggested = guessDoorRole(name, serial);
    const saved = Boolean((serial && map[serial]) || (name && map[name]));
    const role = doorRoleOf(e, map);
    const cur = grouped.get(key);
    if (cur) {
      cur.punches += 1;
      if (name && !cur.name) cur.name = name;
      if (e.building && cur.building === '—') cur.building = e.building;
    } else {
      grouped.set(key, {
        key,
        serial,
        name,
        building: e.building || '—',
        punches: 1,
        role,
        suggested,
        saved,
      });
    }
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name) || a.serial.localeCompare(b.serial));
}
