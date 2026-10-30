export type Direction = 'IN' | 'OUT' | 'UNKNOWN';

export type HqAccessEvent = {
  employeeId: string;
  name: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  deviceName: string;
  deviceSerial: string;
  building: string;
  floor: string;
  direction: Direction;
  authResult: string;
  accessDate: string;
  accessTime: string;
  ts: string;
  hour: number;
  weekday: string;
};

export type ApiResponse = {
  cachedAt: string;
  source: string;
  rowCount: number;
  events: HqAccessEvent[];
};

export type PresenceDay = {
  employeeId: string;
  name: string;
  department: string;
  date: string;
  weekday: string;
  first: string;
  last: string;
  punches: number;
  hours: number;
  firstDir: Direction;
  lastDir: Direction;
  late: boolean;
  earlyOut: boolean;
};
