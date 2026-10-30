import * as XLSX from 'xlsx';
import type { HqAccessEvent, PresenceDay } from './types';
import type { FoodCourtDay, FoodCourtVisit } from './foodCourt';
import { formatHours } from './foodCourt';
import { ROLE_LABEL } from './deviceRoles';
import type { HoursBucket, HoursGrain } from './hoursWorked';
import type { DeviceDay, PersonSite } from './siteStatus';

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

export function exportAttendance(events: HqAccessEvent[], days: PresenceDay[]) {
  const wb = XLSX.utils.book_new();
  const punches = events.map((e) => ({
    Date: e.accessDate,
    Time: e.accessTime,
    Weekday: e.weekday,
    EmployeeID: e.employeeId,
    Name: e.name,
    Department: e.department,
    JobTitle: e.jobTitle,
    Building: e.building,
    Floor: e.floor,
    Device: e.deviceName,
    Serial: e.deviceSerial,
    Direction: e.direction,
    Auth: e.authResult,
  }));
  const presence = days.map((d) => ({
    Date: d.date,
    EmployeeID: d.employeeId,
    Name: d.name,
    Department: d.department,
    FirstPunch: d.first,
    LastPunch: d.last,
    Punches: d.punches,
    HoursOnSite: Number(d.hours.toFixed(2)),
    Late: d.late ? 'Yes' : '',
    EarlyOut: d.earlyOut ? 'Yes' : '',
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(punches.length ? punches : [{ Note: 'No rows' }]), 'Punches');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(presence.length ? presence : [{ Note: 'No rows' }]), 'Daily presence');
  XLSX.writeFile(wb, `NEWEAST-HQ-Attendance-${stamp()}.xlsx`);
}

export function exportFoodCourt(
  days: FoodCourtDay[],
  visits: FoodCourtVisit[],
  punches: HqAccessEvent[],
  meta?: { from?: string; to?: string },
) {
  const wb = XLSX.utils.book_new();
  const period = meta?.from && meta?.to && meta.from === meta.to ? meta.from : `${meta?.from || ''} – ${meta?.to || ''}`;
  const people = new Set(days.map((d) => d.employeeId)).size;
  const complete = days.reduce((s, d) => s + d.complete, 0);
  const ins = days.reduce((s, d) => s + d.inCount, 0);
  const outs = days.reduce((s, d) => s + d.outCount, 0);
  const hours = days.reduce((s, d) => s + d.hours, 0);
  const summary = XLSX.utils.aoa_to_sheet([
    ['NEWEAST · HQ Food Court report'],
    ['Period', period],
    ['Generated', new Date().toLocaleString()],
    [],
    ['People', people],
    ['Complete cycles', complete],
    ['Total IN', ins],
    ['Total OUT', outs],
    ['Time inside', formatHours(hours)],
    [],
    ['IN reader', 'GM9731498 · MB GF FC IN'],
    ['OUT reader', 'GM9731530 · MB GF FC OUT'],
    ['Hours rule', 'Sum of each complete IN→OUT visit. Not first punch to last punch.'],
  ]);
  summary['!cols'] = [{ wch: 18 }, { wch: 48 }];
  const daily = days.map((d) => ({
    Date: d.date,
    Weekday: d.weekday,
    EmployeeID: d.employeeId,
    Name: d.name,
    Department: d.department,
    JobTitle: d.jobTitle,
    InCount: d.inCount,
    OutCount: d.outCount,
    CompleteVisits: d.complete,
    OpenVisits: d.open,
    VisitHours: d.pairHours.map(formatHours).join(' + '),
    TotalHours: Number(d.hours.toFixed(2)),
    TotalHoursLabel: formatHours(d.hours),
  }));
  const visitRows = visits.map((v) => ({
    Date: v.date,
    VisitNo: v.n,
    EmployeeID: v.employeeId,
    Name: v.name,
    Department: v.department,
    In: v.inTime || '',
    Out: v.outTime || '',
    Complete: v.complete ? 'Yes' : '',
    Hours: Number(v.hours.toFixed(2)),
    HoursLabel: v.complete ? formatHours(v.hours) : '',
    InDevice: v.inDevice,
    OutDevice: v.outDevice,
  }));
  const punchRows = punches.map((e) => ({
    Date: e.accessDate,
    Time: e.accessTime,
    EmployeeID: e.employeeId,
    Name: e.name,
    Department: e.department,
    Device: e.deviceName,
    Serial: e.deviceSerial,
    Direction: e.direction,
  }));
  const dailySheet = XLSX.utils.json_to_sheet(daily.length ? daily : [{ Note: 'No rows' }]);
  dailySheet['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 24 },
    { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 12 }, { wch: 16 },
  ];
  const visitSheet = XLSX.utils.json_to_sheet(visitRows.length ? visitRows : [{ Note: 'No rows' }]);
  const punchSheet = XLSX.utils.json_to_sheet(punchRows.length ? punchRows : [{ Note: 'No rows' }]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.utils.book_append_sheet(wb, dailySheet, 'Daily report');
  XLSX.utils.book_append_sheet(wb, visitSheet, 'Visit details');
  XLSX.utils.book_append_sheet(wb, punchSheet, 'Movements');
  const suffix = meta?.from && meta.from === meta.to ? meta.from : stamp();
  XLSX.writeFile(wb, `NEWEAST-HQ-FoodCourt-Report-${suffix}.xlsx`);
}

export function exportOnSite(day: string, people: PersonSite[], view: string) {
  const wb = XLSX.utils.book_new();
  const rows = people.map((p) => ({
    Date: day,
    EmployeeID: p.employeeId,
    Name: p.name,
    Department: p.department,
    JobTitle: p.jobTitle,
    Status: p.inside ? 'In the building' : 'Already left',
    EnteredAt: p.lastIn?.accessTime || '',
    EntryDoor: p.lastIn?.deviceName || '',
    EntrySerial: p.lastIn?.deviceSerial || '',
    ExitedAt: p.lastOut?.accessTime || '',
    ExitDoor: p.lastOut?.deviceName || '',
    ExitSerial: p.lastOut?.deviceSerial || '',
    Location: (p.inside ? p.lastIn?.building : p.lastOut?.building) || '',
    InCount: p.inCount,
    OutCount: p.outCount,
  }));
  const summary = XLSX.utils.aoa_to_sheet([
    ['NEWEAST · HQ building report'],
    ['Day', day],
    ['View', view],
    ['Rows', people.length],
    ['Generated', new Date().toLocaleString()],
    ['Rule', 'In the building = last building entry with no later building exit. Inside doors (Food Court) do not count as leaving.'],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No rows' }]), 'People');
  XLSX.writeFile(wb, `NEWEAST-HQ-Building-${day}.xlsx`);
}

export function exportDevices(devices: { name: string; serial: string; building: string; n: number }[]) {
  const wb = XLSX.utils.book_new();
  const rows = devices.map((d) => ({
    Device: d.name,
    SerialNumber: d.serial || '',
    Building: d.building,
    Punches: d.n,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No devices' }]), 'Devices');
  XLSX.writeFile(wb, `NEWEAST-HQ-Device-List-${stamp()}.xlsx`);
}

export function exportDeviceDay(day: string, devices: DeviceDay[]) {
  const wb = XLSX.utils.book_new();
  const rows = devices.map((d) => ({
    Date: day,
    Device: d.deviceName,
    Serial: d.deviceSerial,
    Type: ROLE_LABEL[d.role],
    Building: d.building,
    IN: d.inCount,
    OUT: d.outCount,
    Other: d.otherCount,
    StillInsideCount: d.stillInside.length,
    StillInside: d.stillInside.map((p) => `${p.name} (${p.lastIn?.accessTime || ''})`).join('; '),
  }));
  const people = devices.flatMap((d) =>
    d.stillInside.map((p) => ({
      Date: day,
      Device: d.deviceName,
      Serial: d.deviceSerial,
      EmployeeID: p.employeeId,
      Name: p.name,
      Department: p.department,
      LastIn: p.lastIn?.accessTime || '',
    })),
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No devices' }]), 'Devices');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(people.length ? people : [{ Note: 'Nobody inside' }]), 'Still inside by door');
  XLSX.writeFile(wb, `NEWEAST-HQ-Devices-${day}.xlsx`);
}

export function exportHours(rows: HoursBucket[], grain: HoursGrain) {
  const wb = XLSX.utils.book_new();
  const title = grain === 'day' ? 'Daily' : grain === 'week' ? 'Weekly' : 'Monthly';
  const data = rows.map((r) => ({
    Period: r.label,
    From: r.from,
    To: r.to,
    EmployeeID: r.employeeId,
    Name: r.name,
    Department: r.department,
    Days: r.days,
    FirstEntry: r.firstIn,
    LastExit: r.lastOut,
    HoursInBuilding: Number(r.siteHours.toFixed(2)),
    HoursNonProductive: Number(r.idleHours.toFixed(2)),
    HoursProductive: Number(r.activeHours.toFixed(2)),
  }));
  const summary = XLSX.utils.aoa_to_sheet([
    ['NEWEAST · Hours in the building'],
    ['View', title],
    ['Rows', rows.length],
    ['Generated', new Date().toLocaleString()],
    ['Rule', 'In building = each building IN to matching OUT. Non-productive = Food Court / inside doors overlapping that time. Productive = in building − non-productive.'],
  ]);
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ Note: 'No rows' }]), title);
  XLSX.writeFile(wb, `NEWEAST-HQ-Hours-${title}-${stamp()}.xlsx`);
}
