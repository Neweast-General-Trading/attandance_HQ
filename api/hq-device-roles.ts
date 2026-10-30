import fs from 'fs';
import path from 'path';

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

const filePath = path.join(process.cwd(), 'data', 'hq-device-roles.json');

const DEFAULT_DOORS: SavedDoor[] = [
  { serial: 'GM9731498', name: 'MB GF FC IN', role: 'internal_in' },
  { serial: 'GM9731530', name: 'MB GF FC OUT', role: 'internal_out' },
];

function isRole(v: unknown): v is DoorRole {
  return typeof v === 'string' && (DOOR_ROLES as readonly string[]).includes(v);
}

export function loadDoorRoles(): DoorRolesFile {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DoorRolesFile>;
    const devices = Array.isArray(parsed.devices)
      ? parsed.devices
          .filter((d): d is SavedDoor => !!d && typeof d === 'object' && isRole(d.role))
          .map((d) => ({
            serial: String(d.serial ?? '').trim(),
            name: String(d.name ?? '').trim(),
            role: d.role,
          }))
      : [];
    const forced = new Map(DEFAULT_DOORS.map((d) => [d.serial, d]));
    const merged = devices.map((d) => (d.serial && forced.has(d.serial) ? { ...d, role: forced.get(d.serial)!.role } : d));
    const have = new Set(merged.map((d) => d.serial).filter(Boolean));
    for (const d of DEFAULT_DOORS) {
      if (d.serial && !have.has(d.serial)) merged.push(d);
    }
    return {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      devices: merged,
    };
  } catch {
    return { updatedAt: '', devices: DEFAULT_DOORS };
  }
}

export function saveDoorRoles(devices: SavedDoor[]): DoorRolesFile {
  const next: DoorRolesFile = {
    updatedAt: new Date().toISOString(),
    devices: devices.filter((d) => d.serial || d.name),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n');
  return next;
}
