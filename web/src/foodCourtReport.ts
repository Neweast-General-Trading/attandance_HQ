import type { HqAccessEvent } from './types';
import type { FoodCourtDay, FoodCourtVisit } from './foodCourt';
import { formatHours } from './foodCourt';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function clock(t: string) {
  return t ? t.slice(0, 8) : '—';
}

export function printFoodCourtReport(opts: {
  from: string;
  to: string;
  days: FoodCourtDay[];
  visits: FoodCourtVisit[];
  punches: HqAccessEvent[];
}) {
  const { from, to, days, visits, punches } = opts;
  const period = from && to && from === to ? from : `${from || '…'} → ${to || '…'}`;
  const people = new Set(days.map((d) => d.employeeId)).size;
  const complete = days.reduce((s, d) => s + d.complete, 0);
  const ins = days.reduce((s, d) => s + d.inCount, 0);
  const outs = days.reduce((s, d) => s + d.outCount, 0);
  const hours = days.reduce((s, d) => s + d.hours, 0);
  const logo = `${window.location.origin}${import.meta.env.BASE_URL}logo.png`;

  const peopleRows = days
    .map(
      (d) => `<tr>
        <td>${esc(d.date)}<div class="sub">${esc(d.weekday)}</div></td>
        <td><strong>${esc(d.name)}</strong><div class="sub">${esc(d.employeeId)}</div></td>
        <td>${esc(d.department || '—')}</td>
        <td>${esc(d.jobTitle || '—')}</td>
        <td class="num">${d.complete}</td>
        <td class="num">${d.inCount} / ${d.outCount}</td>
        <td class="num">${esc(d.pairHours.map(formatHours).join(' + ') || '—')}</td>
        <td class="num">${esc(formatHours(d.hours))}</td>
        <td>${d.open ? `${d.open} open` : 'Closed'}</td>
      </tr>`,
    )
    .join('');

  const visitBlocks = days
    .map((d) => {
      const vs = visits.filter((v) => v.employeeId === d.employeeId && v.date === d.date);
      const ps = punches.filter((e) => e.employeeId === d.employeeId && e.accessDate === d.date);
      const vRows = vs
        .map(
          (v) => `<tr>
            <td>#${v.n}</td>
            <td>${esc(clock(v.inTime))}</td>
            <td>${esc(clock(v.outTime))}</td>
            <td>${v.complete ? esc(formatHours(v.hours)) : 'Open'}</td>
          </tr>`,
        )
        .join('');
      const pRows = ps
        .map(
          (e) => `<tr>
            <td>${esc(clock(e.accessTime))}</td>
            <td>${esc(e.direction)}</td>
            <td>${esc(e.deviceName)}</td>
            <td>${esc(e.deviceSerial)}</td>
          </tr>`,
        )
        .join('');
      return `<section class="person">
        <h2>${esc(d.name)} <span>${esc(d.employeeId)} · ${esc(d.department || '')} · ${esc(d.date)}</span></h2>
        <p class="meta">${d.complete} complete cycles · ${esc(formatHours(d.hours))} inside · IN ${d.inCount} / OUT ${d.outCount}</p>
        <h3>Visits</h3>
        <table>
          <thead><tr><th>Visit</th><th>IN</th><th>OUT</th><th>Hours</th></tr></thead>
          <tbody>${vRows || '<tr><td colspan="4">No visits</td></tr>'}</tbody>
        </table>
        <h3>Movements</h3>
        <table>
          <thead><tr><th>Time</th><th>Direction</th><th>Reader</th><th>Serial</th></tr></thead>
          <tbody>${pRows || '<tr><td colspan="4">No punches</td></tr>'}</tbody>
        </table>
      </section>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Food Court report · ${esc(period)}</title>
  <style>
    :root { color: #0f172a; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; }
    .page { max-width: 920px; margin: 0 auto; padding: 28px 32px 48px; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 2px solid #e00410; padding-bottom: 16px; }
    header img { height: 42px; }
    header h1 { margin: 0; font-size: 22px; }
    header p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 20px 0; }
    .kpis div { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
    .kpis em { display: block; font-style: normal; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .kpis strong { display: block; margin-top: 4px; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #64748b; background: #f8fafc; }
    .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
    .person { break-inside: avoid; margin-top: 28px; padding-top: 8px; border-top: 1px solid #e2e8f0; }
    .person h2 { margin: 0; font-size: 16px; }
    .person h2 span { font-weight: 500; color: #64748b; font-size: 12px; }
    .person h3 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
    .meta { margin: 4px 0 0; color: #334155; font-size: 13px; }
    footer { margin-top: 32px; font-size: 11px; color: #94a3b8; }
    @media print { header { border-color: #e00410; } .page { padding: 12px 0; } }
  </style>
</head>
<body>
  <div class="page">
    <header>
      <div>
        <h1>HQ Food Court report</h1>
        <p>Period ${esc(period)} · generated ${esc(new Date().toLocaleString())}</p>
      </div>
      <img src="${esc(logo)}" alt="NEWEAST" />
    </header>
    <div class="kpis">
      <div><em>People</em><strong>${people}</strong></div>
      <div><em>Complete cycles</em><strong>${complete}</strong></div>
      <div><em>IN</em><strong>${ins}</strong></div>
      <div><em>OUT</em><strong>${outs}</strong></div>
      <div><em>Time inside</em><strong>${esc(formatHours(hours))}</strong></div>
    </div>
    <h2 style="font-size:15px;margin:0 0 8px">Daily summary</h2>
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Employee</th><th>Department</th><th>Job title</th>
          <th>Cycles</th><th>IN / OUT</th><th>Each visit</th><th>Total time</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${peopleRows || '<tr><td colspan="9">No rows</td></tr>'}</tbody>
    </table>
    ${visitBlocks}
    <footer>NEWEAST HQ Access · Food Court readers GM9731498 (IN) / GM9731530 (OUT). Hours are the sum of complete IN→OUT visits.</footer>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'noopener,noreferrer,width=1024,height=768');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
