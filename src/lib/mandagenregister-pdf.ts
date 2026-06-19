/**
 * Mandagenregister PDF/print-export.
 *
 * Opent een eigen printvenster met eenvoudige, robuuste print-CSS.
 * De gebruiker kiest daarna in de browserprintdialoog "Opslaan als PDF".
 */

export type Dienstverband = "zzp" | "loondienst";

export interface ProjectMeta {
  case_nummer: string | null;
  station_naam: string | null;
  locatie: string | null;
  opdrachtgever: string | null;
}

export interface WeekRow {
  monteur_id: string;
  naam: string;
  kvk_nummer?: string | null;
  bsn?: string | null;
  geboortedatum?: string | null;
  id_type?: string | null;
  id_nummer?: string | null;
  id_geldig_tot?: string | null;
  week: string;
  days: number[];
  total: number;
  opmerking: string;
}

export interface MandagenregisterPdfInput {
  dienstverband: Dienstverband;
  project: ProjectMeta;
  periodeVan: string;
  periodeTot: string;
  rows: WeekRow[];
  preparedBy?: string;
}

const escHtml = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&#39;",
  );

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(+d)) return iso ?? "";
  return d.toLocaleDateString("nl-NL", { year: "numeric", month: "short", day: "numeric" });
};

const fmtShortDate = (d: Date): string =>
  d.toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });

const fmtDay = (d: Date): string => String(d.getUTCDate()).padStart(2, "0");

const fmtTotalUren = (n: number): string => {
  if (!n) return "0.0";
  return Number.isInteger(n) ? `${n}.0` : n.toFixed(2).replace(/\.0+$/, ".0").replace(/\.([1-9])0$/, ".$1");
};

const fmtCellUren = (n: number): string => (n ? fmtTotalUren(n) : "-");

function isoWeekDates(weekKey: string): Date[] | null {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + index);
    return d;
  });
}

function isoWeekLabel(weekKey: string): { badge: string; range: string; dayHeaders: string[] } {
  const dates = isoWeekDates(weekKey);
  if (!dates) {
    return {
      badge: weekKey,
      range: weekKey,
      dayHeaders: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"],
    };
  }
  const shortWeek = weekKey.replace(/^\d{4}-W/, "Week ");
  return {
    badge: shortWeek,
    range: `${fmtShortDate(dates[0])} t/m ${fmtShortDate(dates[6])}`,
    dayHeaders: ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map(
      (label, index) => `${label} (${fmtDay(dates[index])})`,
    ),
  };
}

export function exportMandagenregisterPDF(input: MandagenregisterPdfInput): void {
  const { dienstverband, project, periodeVan, periodeTot, rows } = input;
  const preparedBy = input.preparedBy ?? "TerreVolt Planner";
  const titel = "Mandagenregister";
  const projectLabel = [project.case_nummer, project.station_naam].filter(Boolean).join(" - ");

  const sortedRows = [...rows].sort(
    (a, b) => a.week.localeCompare(b.week) || a.naam.localeCompare(b.naam, "nl"),
  );

  const rowsByWeek = sortedRows.reduce<Record<string, WeekRow[]>>((acc, row) => {
    (acc[row.week] ??= []).push(row);
    return acc;
  }, {});

  const baseHeader = dienstverband === "zzp"
    ? ["Naam zelfstandige", "Status", "KvK-nummer"]
    : ["Naam", "BSN", "Geboortedatum", "ID-type", "ID-nummer", "ID geldig tot"];
  const trailingHeader = ["Totaal", "Opmerking"];
  const columnCount = baseHeader.length + 7 + trailingHeader.length;

  const renderRow = (r: WeekRow): string => {
    if (dienstverband === "zzp") {
      return `<tr>
        <td class="naam">${escHtml(r.naam)}</td>
        <td class="status">Z</td>
        <td class="mono">${escHtml(r.kvk_nummer ?? "")}</td>
        ${r.days.map((u) => `<td class="uren">${escHtml(fmtCellUren(u))}</td>`).join("")}
        <td class="totaal">${escHtml(fmtTotalUren(r.total))}</td>
        <td class="opmerking">${escHtml(r.opmerking)}</td>
      </tr>`;
    }
    return `<tr>
      <td class="naam">${escHtml(r.naam)}</td>
      <td class="mono">${escHtml(r.bsn ?? "")}</td>
      <td>${escHtml(fmtDate(r.geboortedatum))}</td>
      <td>${escHtml(r.id_type ?? "")}</td>
      <td class="mono">${escHtml(r.id_nummer ?? "")}</td>
      <td>${escHtml(fmtDate(r.id_geldig_tot))}</td>
      ${r.days.map((u) => `<td class="uren">${escHtml(fmtCellUren(u))}</td>`).join("")}
      <td class="totaal">${escHtml(fmtTotalUren(r.total))}</td>
      <td class="opmerking">${escHtml(r.opmerking)}</td>
    </tr>`;
  };

  const weekSections = sortedRows.length === 0
    ? `<section class="week-section"><table><tbody><tr><td colspan="${columnCount}" class="empty">Geen geplande monteurs in deze periode.</td></tr></tbody></table></section>`
    : Object.entries(rowsByWeek).map(([week, weekRows]) => {
        const labels = isoWeekLabel(week);
        const dayTotals = Array.from({ length: 7 }, (_, index) =>
          weekRows.reduce((sum, row) => sum + (Number(row.days[index]) || 0), 0),
        );
        const weekTotal = weekRows.reduce((sum, r) => sum + (r.total || 0), 0);
        const headers = [...baseHeader, ...labels.dayHeaders, ...trailingHeader];
        return `<section class="week-section">
          <div class="week-heading">
            <span class="week-badge">${escHtml(labels.badge)}</span>
            <span class="week-range">Weekoverzicht: ${escHtml(labels.range)}</span>
          </div>
          <table aria-label="${escHtml(titel)} ${escHtml(week)}">
            <thead><tr>${headers.map((h, index) => `<th class="${index === headers.length - 2 ? "total-head" : ""}">${escHtml(h)}</th>`).join("")}</tr></thead>
            <tbody>${weekRows.map(renderRow).join("")}</tbody>
            <tfoot>
              <tr>
                <td colspan="${baseHeader.length}" class="daily-label">Dagtotaal</td>
                ${dayTotals.map((u) => `<td class="daily-total">${escHtml(fmtTotalUren(u))}</td>`).join("")}
                <td class="grand-total">${escHtml(fmtTotalUren(weekTotal))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      }).join("");

  const totalAll = sortedRows.reduce((sum, r) => sum + (r.total || 0), 0);
  const monteurCount = new Set(sortedRows.map((r) => r.monteur_id)).size;
  const weekKeys = Object.keys(rowsByWeek);

  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(titel)} - ${escHtml(projectLabel || "Project")}</title>
<style>
  :root {
    --accent: #10b981;
    --accent-dark: #064e3b;
    --accent-soft: #d1fae5;
    --ink: #111827;
    --muted: #64748b;
    --line: #d9e2e8;
    --soft: #f3f6f7;
    --summary: #111827;
  }

  @page { size: A4 landscape; margin: 12mm; }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    background: #ffffff !important;
    color: var(--ink) !important;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10.5px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
  }
  .toolbar button {
    border: 0;
    border-radius: 5px;
    background: var(--accent);
    color: #ffffff;
    padding: 7px 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .toolbar span { color: var(--muted); font-size: 12px; }

  .print-root {
    display: block;
    width: 100%;
    padding: 0;
    background: #ffffff;
    color: var(--ink);
  }

  .doc-header {
    display: grid;
    grid-template-columns: 260px 1fr 230px;
    gap: 18px;
    align-items: start;
    padding-bottom: 16px;
    margin-bottom: 24px;
    border-bottom: 2px solid var(--accent);
  }
  .brand { display: flex; gap: 10px; align-items: center; }
  .logo {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent-dark);
    font-weight: 900;
    font-size: 13px;
  }
  .brand-name {
    font-size: 14px;
    font-weight: 800;
    color: var(--accent-dark);
  }
  .brand-sub {
    margin-top: 2px;
    color: var(--muted);
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .doc-title { text-align: center; }
  .doc-title h1 {
    margin: 0;
    font-size: 20px;
    line-height: 1.1;
    color: var(--ink);
  }
  .doc-title div { margin-top: 4px; color: var(--muted); }
  .doc-meta { text-align: right; color: var(--muted); font-size: 10px; }
  .doc-meta b { color: var(--ink); }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px 20px;
    margin-bottom: 24px;
    padding: 14px 16px;
    border-radius: 7px;
    background: var(--soft) !important;
  }
  .label {
    color: #4b5563;
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .value { margin-top: 4px; font-size: 12px; font-weight: 800; color: var(--ink); }

  .week-section {
    margin-top: 22px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .week-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 8px;
  }
  .week-badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    border-radius: 4px;
    background: var(--accent) !important;
    color: #ffffff;
    padding: 4px 10px;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .week-range {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td {
    border: 0.5px solid var(--line);
    padding: 6px 7px;
    vertical-align: middle;
  }
  th {
    background: #f3f6f7 !important;
    color: var(--ink);
    font-size: 9px;
    font-weight: 800;
    text-align: left;
  }
  th:not(:first-child), td.uren, td.daily-total { text-align: center; }
  th.total-head {
    background: #e8f8f0 !important;
    color: var(--accent-dark);
  }
  td.naam { font-weight: 800; min-width: 135px; }
  td.status { text-align: center; color: var(--accent-dark); font-weight: 900; }
  td.mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.uren { min-width: 27px; font-variant-numeric: tabular-nums; }
  td.totaal { text-align: right; font-weight: 900; background: #fafafa !important; }
  td.opmerking { color: #475569; font-size: 9px; }
  td.empty { padding: 22px; text-align: center; color: var(--muted); font-style: italic; }
  tfoot td {
    background: #eef2f3 !important;
    font-weight: 900;
  }
  .daily-label { color: var(--ink); }
  .grand-total {
    background: var(--accent) !important;
    color: #ffffff;
    text-align: right;
  }

  .bottom-row {
    display: grid;
    grid-template-columns: 1fr 330px;
    gap: 24px;
    align-items: end;
    margin-top: 26px;
  }
  .prepared {
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
    color: var(--muted);
    font-size: 9.5px;
  }
  .prepared b { color: var(--ink); }
  .summary-card {
    border-radius: 8px;
    background: var(--summary) !important;
    color: #ffffff;
    padding: 16px 18px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .summary-title {
    padding-bottom: 7px;
    border-bottom: 1px solid rgb(255 255 255 / 0.18);
    color: #e5e7eb;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    margin-top: 12px;
  }
  .summary-grid span:nth-child(odd) { color: #cbd5e1; }
  .summary-grid span:nth-child(even) { font-weight: 900; text-align: right; }
  .summary-total {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-top: 4px;
    padding-top: 10px;
    border-top: 1px solid rgb(255 255 255 / 0.18);
  }
  .summary-total b:first-child {
    color: var(--accent);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .summary-total b:last-child { font-size: 20px; }

  .footer {
    margin-top: 14px;
    padding-top: 7px;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 8.8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  @media print {
    html, body {
      width: auto !important;
      min-height: auto !important;
      overflow: visible !important;
      background: #ffffff !important;
      color: var(--ink) !important;
    }
    .toolbar { display: none !important; }
    .print-root {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }
    .doc-header,
    .project-grid,
    .week-section,
    table,
    .bottom-row,
    .prepared,
    .summary-card,
    .footer {
      visibility: visible !important;
      opacity: 1 !important;
    }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Afdrukken / opslaan als PDF</button>
    <span>Kies in de printdialoog voor "Opslaan als PDF" en A4 liggend.</span>
  </div>

  <main class="print-root">
    <header class="doc-header">
      <div class="brand">
        <div class="logo">TV</div>
        <div>
          <div class="brand-name">TerreVolt</div>
          <div class="brand-sub">Mandagenregister</div>
        </div>
      </div>
      <div class="doc-title">
        <h1>${escHtml(titel)}</h1>
        <div>${escHtml(projectLabel || "Project")}</div>
      </div>
      <div class="doc-meta">
        <div><b>Periode:</b> ${escHtml(fmtDate(periodeVan))} - ${escHtml(fmtDate(periodeTot))}</div>
      </div>
    </header>

    <section class="project-grid">
      <div><div class="label">Projectnummer</div><div class="value">${escHtml(project.case_nummer ?? "-")}</div></div>
      <div><div class="label">Projectnaam</div><div class="value">${escHtml(project.station_naam ?? "-")}</div></div>
      <div><div class="label">Locatie</div><div class="value">${escHtml(project.locatie ?? "-")}</div></div>
      <div><div class="label">Hoofdaannemer / opdrachtgever</div><div class="value">${escHtml(project.opdrachtgever ?? "-")}</div></div>
    </section>

    ${weekSections}

    <div class="bottom-row">
      <div class="prepared">
        Opgesteld door <b>${escHtml(preparedBy)}</b>.
      </div>
      <aside class="summary-card">
        <div class="summary-title">Registersamenvatting</div>
        <div class="summary-grid">
          <span>Monteurs</span><span>${monteurCount}</span>
          <span>Weken</span><span>${weekKeys.length}</span>
          <span>Weekregels</span><span>${sortedRows.length}</span>
          <div class="summary-total"><b>Totaal uren</b><b>${escHtml(fmtTotalUren(totalAll))}</b></div>
        </div>
      </aside>
    </div>

    <footer class="footer">
      <div>TerreVolt Planner · ${escHtml(titel)}</div>
      <div>${escHtml(projectLabel || "Project")}</div>
    </footer>
  </main>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Pop-up werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}