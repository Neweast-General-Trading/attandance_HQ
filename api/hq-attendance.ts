import sql from 'mssql';

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
  direction: 'IN' | 'OUT' | 'UNKNOWN';
  authResult: string;
  accessDate: string;
  accessTime: string;
  ts: string;
  hour: number;
  weekday: string;
};

type HrPerson = {
  name: string;
  department: string;
  jobTitle: string;
};

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function parseStamp(accessDateTime: string, accessDate: string, accessTime: string): {
  date: string;
  time: string;
  hour: number;
  ts: string;
} {
  const raw = str(accessDateTime);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (iso) {
    const date = `${iso[1]}-${iso[2]}-${iso[3]}`;
    const time = `${iso[4]}:${iso[5]}:${iso[6]}`;
    return { date, time, hour: Number(iso[4]), ts: `${date}T${time}` };
  }
  const dmy = str(accessDate).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const t = str(accessTime).match(/^(\d{2}):(\d{2}):(\d{2})/)?.[0] || '00:00:00';
  if (dmy) {
    const date = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return { date, time: t, hour: Number(t.slice(0, 2)), ts: `${date}T${t}` };
  }
  const ymd = str(accessDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const date = `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    return { date, time: t, hour: Number(t.slice(0, 2)), ts: `${date}T${t}` };
  }
  return { date: '', time: t, hour: 0, ts: raw };
}

function weekday(date: string): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { weekday: 'short' });
}

function inferDirection(device: string, rawDir: string): 'IN' | 'OUT' | 'UNKNOWN' {
  const d = rawDir.toUpperCase();
  if (/\bOUT\b/.test(d)) return 'OUT';
  if (/\bIN\b/.test(d) && !/\bOUT\b/.test(d)) return 'IN';
  const n = device.toUpperCase();
  if (/TURNSTILE OUT|ENT C OUT|\bOUT-\d|\bOUT \d| TO WH/.test(n)) return 'OUT';
  if (/TURNSTILE IN|ENT C IN|\bIN-\d|\bIN \d/.test(n)) return 'IN';
  if (/\bOUT\b/.test(n) && !/\bIN\b/.test(n)) return 'OUT';
  if (/\bIN\b/.test(n) && !/\bOUT\b/.test(n)) return 'IN';
  return 'UNKNOWN';
}

function inferBuilding(device: string): string {
  const n = device.toUpperCase();
  if (n.startsWith('OPB') || /\bOPB\b/.test(n)) return 'OPB';
  if (n.startsWith('MB') || /\bMB\b/.test(n)) return 'Main Building';
  return device ? 'Other' : 'Unknown';
}

function inferFloor(device: string): string {
  const n = device.toUpperCase();
  const m = n.match(/\b([123]F|GF)\b/);
  if (!m) return '';
  if (m[1] === 'GF') return 'Ground';
  if (m[1] === '1F') return '1st';
  if (m[1] === '2F') return '2nd';
  return '3rd';
}

function isGenericDept(v: string): boolean {
  const n = v.replace(/\s+/g, ' ').trim().toLowerCase();
  return !n || n === 'unspecified' || /^all departments?$/.test(n) || n === 'business systems';
}

function punchName(row: Record<string, unknown>): string {
  const person = str(row.PersonName);
  if (person) return person.replace(/\s+/g, ' ');
  const fl = `${str(row.FirstName)} ${str(row.LastName)}`.replace(/\s+/g, ' ').trim();
  return fl;
}

let hqPool: sql.ConnectionPool | null = null;
let hrPool: sql.ConnectionPool | null = null;

async function getHqPool(): Promise<sql.ConnectionPool> {
  if (hqPool?.connected) return hqPool;
  hqPool = await new sql.ConnectionPool({
    server: process.env.HQ_ATTN_SERVER || '192.168.101.46',
    user: process.env.HQ_ATTN_USER || 'Sa',
    password: (process.env.HQ_ATTN_PASSWORD || '').replace(/^"|"$/g, ''),
    database: process.env.HQ_ATTN_DATABASE || 'NEGT_HQ_ATTN',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
  }).connect();
  return hqPool;
}

async function getHrPool(): Promise<sql.ConnectionPool | null> {
  if (!process.env.SQL_DB_SERVER) return null;
  if (hrPool?.connected) return hrPool;
  hrPool = await new sql.ConnectionPool({
    server: process.env.SQL_DB_SERVER,
    user: process.env.SQL_DB_USER,
    password: (process.env.SQL_DB_PASSWORD || '').replace(/^"|"$/g, ''),
    database: process.env.SQL_DB_DATABASE || 'NEGTPAYROLL_UAE',
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
  }).connect();
  return hrPool;
}

async function loadHrPeople(): Promise<Map<string, HrPerson>> {
  const map = new Map<string, HrPerson>();
  try {
    const db = await getHrPool();
    if (!db) return map;
    const result = await db.request().query(`
      SELECT
        LTRIM(RTRIM(CAST(HRM_EmpId AS varchar(20)))) AS HrmId,
        LTRIM(RTRIM(Emp_FullName)) AS FullName,
        LTRIM(RTRIM(Emp_DeptName)) AS DeptName,
        LTRIM(RTRIM(Emp_JobTitleName)) AS JobTitle
      FROM dbo.Pr_EmpMaster
      WHERE HRM_EmpId IS NOT NULL
    `);
    for (const row of result.recordset as Record<string, unknown>[]) {
      const id = str(row.HrmId);
      if (!id || id === '0' || map.has(id)) continue;
      map.set(id, {
        name: str(row.FullName).replace(/\s+/g, ' '),
        department: str(row.DeptName).replace(/\s+/g, ' '),
        jobTitle: str(row.JobTitle).replace(/\s+/g, ' ').replace(/^-+.*Select.*$/i, ''),
      });
    }
  } catch (err) {
    console.warn('HQ attendance: HR lookup failed:', err instanceof Error ? err.message : err);
  }
  return map;
}

function hrFor(id: string, hr: Map<string, HrPerson>): HrPerson | undefined {
  return hr.get(id);
}

export async function fetchHqAccessEvents(): Promise<HqAccessEvent[]> {
  const [db, hr] = await Promise.all([getHqPool(), loadHrPeople()]);
  const result = await db.request().query(`
    SELECT
      ResourceName, ReaderName, FirstName, LastName, PersonName, Department,
      PersonID, CardNo, AccessTime, AccessDate, Direction, EventType,
      DeviceSerial, EmployeeID, AccessDateTime, AuthResult, DeviceName, DeviceSerialNo
    FROM dbo.HCP_Access
  `);
  const rows = result.recordset as Record<string, unknown>[];

  const bestPunch = new Map<string, { name: string; department: string }>();
  for (const row of rows) {
    const id = str(row.EmployeeID) || str(row.PersonID);
    if (!id) continue;
    const name = punchName(row);
    const dept = str(row.Department).replace(/\s+/g, ' ');
    const cur = bestPunch.get(id) ?? { name: '', department: '' };
    if (name && !cur.name) cur.name = name;
    if (dept && !isGenericDept(dept) && isGenericDept(cur.department)) cur.department = dept;
    if (dept && !isGenericDept(dept) && !cur.department) cur.department = dept;
    bestPunch.set(id, cur);
  }

  const events: HqAccessEvent[] = [];
  for (const row of rows) {
    const stamp = parseStamp(str(row.AccessDateTime), str(row.AccessDate), str(row.AccessTime));
    const device = str(row.DeviceName);
    const employeeId = str(row.EmployeeID) || str(row.PersonID) || 'unknown';
    const hrPerson = hrFor(employeeId, hr);
    const punch = bestPunch.get(employeeId);
    const punchDept = str(row.Department).replace(/\s+/g, ' ');
    const department =
      (hrPerson?.department && !isGenericDept(hrPerson.department) ? hrPerson.department : '') ||
      (!isGenericDept(punchDept) ? punchDept : '') ||
      (punch && !isGenericDept(punch.department) ? punch.department : '') ||
      'Unspecified';
    const name =
      hrPerson?.name ||
      punchName(row) ||
      punch?.name ||
      employeeId ||
      'Unknown';

    events.push({
      employeeId,
      name,
      firstName: str(row.FirstName) || (hrPerson?.name.split(' ')[0] ?? ''),
      lastName: str(row.LastName),
      department,
      jobTitle: hrPerson?.jobTitle && !/^-+/.test(hrPerson.jobTitle) ? hrPerson.jobTitle : '',
      deviceName: device || 'Unknown device',
      deviceSerial: str(row.DeviceSerialNo) || str(row.DeviceSerial),
      building: inferBuilding(device),
      floor: inferFloor(device),
      direction: inferDirection(device, str(row.Direction)),
      authResult: str(row.AuthResult) || '—',
      accessDate: stamp.date,
      accessTime: stamp.time,
      ts: stamp.ts,
      hour: stamp.hour,
      weekday: weekday(stamp.date),
    });
  }
  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return events;
}
