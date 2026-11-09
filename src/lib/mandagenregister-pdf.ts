/**
 * Mandagenregister PDF/print-export.
 *
 * Opent een eigen printvenster met eenvoudige, robuuste print-CSS.
 * De gebruiker kiest daarna in de browserprintdialoog "Opslaan als PDF".
 */

import { TERREVOLT_ICON_DATA_URI } from "@/lib/brand-assets";

export type Dienstverband = "zzp" | "loondienst";

export interface ProjectMeta {
  case_nummer: string | null;
  station_naam: string | null;
  locatie: string | null;
  opdrachtgever: string | null;
  opdrachtgeverGegevens?: OpdrachtgeverGegevens | null;
}

export interface OpdrachtgeverGegevens {
  bedrijfsnaam: string | null;
  adres: string | null;
  postcode_plaats: string | null;
  telefoon: string | null;
  email: string | null;
  website: string | null;
}

export function opdrachtgeverBlockLines(naam: string | null, g?: OpdrachtgeverGegevens | null): { titel: string; regels: string[] } {
  const titel = (g?.bedrijfsnaam?.trim() || naam?.trim() || "-");
  const regels = [g?.adres, g?.postcode_plaats, g?.telefoon, g?.email, g?.website]
    .map((v) => v?.trim() ?? "")
    .filter(Boolean);
  return { titel, regels };
}

/** "2026-W44","2026-W45" → "Week 44, 45" */
export function weekNumbersLabel(keys: string[]): string {
  const nrs = [...new Set(keys)].sort().map((k) => String(Number(k.split("-W")[1] ?? k)));
  if (nrs.length === 0) return "-";
  return `${nrs.length === 1 ? "Week" : "Weken"} ${nrs.join(", ")}`;
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
  titel?: string;
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

const fmtShortDateIso = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
};

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

export function buildMandagenregisterHtml(input: MandagenregisterPdfInput): string {
  const { dienstverband, project, periodeVan, periodeTot, rows } = input;
  const preparedBy = input.preparedBy ?? "TerreVolt Planner";
  const titel = input.titel ?? "Mandagenregister";
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

  const dayNames = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  const headers = [...baseHeader, ...dayNames, ...trailingHeader];
  const headRow = `<tr>${headers.map((h, i) => {
    const isDay = i >= baseHeader.length && i < baseHeader.length + 7;
    const cls = isDay ? "c" : i === baseHeader.length + 7 ? "r" : "";
    return `<th class="${cls}">${escHtml(h)}</th>`;
  }).join("")}</tr>`;

  const weekSections = sortedRows.length === 0
    ? `<p class="empty">Geen geplande monteurs in deze periode.</p>`
    : Object.entries(rowsByWeek).map(([week, weekRows]) => {
        const dates = isoWeekDates(week);
        const m = week.match(/^(\d{4})-W(\d{2})$/);
        const weekTitle = m ? `Week ${Number(m[2])}, ${m[1]}` : week;
        const dayTotals = Array.from({ length: 7 }, (_, index) =>
          weekRows.reduce((sum, row) => sum + (Number(row.days[index]) || 0), 0),
        );
        const weekTotal = weekRows.reduce((sum, r) => sum + (r.total || 0), 0);
        const dateCells = Array.from({ length: 7 }, (_, i) =>
          `<td class="c">${dates ? `${fmtDay(dates[i])}-${String(dates[i].getUTCMonth() + 1).padStart(2, "0")}` : ""}</td>`,
        ).join("");
        return `<section class="week-section">
          <table aria-label="${escHtml(titel)} ${escHtml(week)}">
            <thead>${headRow}</thead>
            <tbody>
              <tr class="week-row"><td colspan="${baseHeader.length}">${escHtml(weekTitle)}</td>${dateCells}<td></td><td></td></tr>
              ${weekRows.map(renderRow).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="${baseHeader.length}">Totaal</td>
                ${dayTotals.map((u) => `<td class="c">${escHtml(fmtTotalUren(u))}</td>`).join("")}
                <td class="r">${escHtml(fmtTotalUren(weekTotal))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </section>`;
      }).join("");

  const totalAll = sortedRows.reduce((sum, r) => sum + (r.total || 0), 0);
  const monteurCount = new Set(sortedRows.map((r) => r.monteur_id)).size;
  const weekKeys = Object.keys(rowsByWeek);
  const dvLabel = dienstverband === "zzp" ? "ZZP (zelfstandigen)" : "Loondienst";

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(titel)} - ${escHtml(projectLabel || "Project")}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #ffffff !important; color: #111111 !important;
    font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
    font-size: 10px; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-bottom: 1px solid #e5e5e5; background: #ffffff; }
  .toolbar button { border: 0; border-radius: 4px; background: #111111; color: #ffffff;
    padding: 7px 14px; font-weight: 700; cursor: pointer; }
  .toolbar span { color: #666666; font-size: 12px; }
  .print-root { padding: 24px 28px; max-width: 1200px; margin: 0 auto; }

  .doc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .doc-top h1 { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.01em; }
  .doc-top .logo { display: flex; align-items: center; gap: 10px; }
  .doc-top .logo img { height: 46px; width: auto; object-fit: contain; display: block; }
  .doc-top .logo strong { font-size: 16px; letter-spacing: 0.04em; display: block; }
  .doc-top .logo small { color: #666666; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; }

  .parties { display: grid; grid-template-columns: 1fr auto 1fr; gap: 40px; margin-bottom: 24px; }
  .project-line { font-size: 15px; font-weight: 700; margin-top: 4px; }
  .parties .right { text-align: right; }
  .parties b { display: block; font-weight: 700; }
  .parties .muted { color: #555555; }

  .meta { display: grid; grid-template-columns: 110px 150px; gap: 2px 0; align-content: start; }
  .meta span:nth-child(odd) { color: #333333; }

  h2 { font-size: 13px; font-weight: 700; margin: 0 0 8px; }
  .week-section { margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td { padding: 4px 6px; text-align: left; vertical-align: top; border: 0; }
  th { font-weight: 600; border-top: 1px solid #111111; border-bottom: 1px solid #111111; }
  .c { text-align: center; }
  .r { text-align: right; }
  .week-row td { font-weight: 700; border-bottom: 1px solid #cccccc; }
  tbody tr:not(.week-row) td { border-bottom: 1px solid #eeeeee; }
  td.uren { text-align: center; font-variant-numeric: tabular-nums; }
  td.totaal { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  td.status { text-align: center; }
  td.mono { white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.opmerking { color: #555555; font-size: 9px; }
  tfoot td { font-weight: 700; border-top: 1px solid #111111; border-bottom: 1px solid #111111; font-variant-numeric: tabular-nums; }
  .empty { color: #666666; font-style: italic; }

  .grand { display: flex; justify-content: flex-end; gap: 28px; border-top: 1px solid #111111;
    padding-top: 10px; margin-top: 8px; font-size: 13px; }
  .grand span { color: #444444; font-size: 10px; align-self: center; }
  .grand b { font-weight: 700; }


  @media print {
    .toolbar { display: none !important; }
    .print-root { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Afdrukken / opslaan als PDF</button>
    <span>Kies in de printdialoog voor "Opslaan als PDF" en A4 liggend.</span>
  </div>

  <main class="print-root">
    <header class="doc-top">
      <div>
        <h1>${escHtml(titel)}</h1>
        <div class="project-line">Project ${escHtml(projectLabel || "-")}</div>
      </div>
      <div class="logo">
        <img class="brand-logo" src="${TERREVOLT_ICON_DATA_URI}" alt="TerreVolt" />
        <div><strong>TERREVOLT</strong><small>Projectplanning</small></div>
      </div>
    </header>

    <section class="parties">
      <div>
        ${(() => { const og = opdrachtgeverBlockLines(project.opdrachtgever, project.opdrachtgeverGegevens); return `<b>${escHtml(og.titel)}</b>${og.regels.map((r) => `<span>${escHtml(r)}</span>`).join("")}`; })()}
        <span class="muted">Hoofdaannemer / opdrachtgever</span>
        <span class="muted" style="margin-top:12px;display:block">Project</span>
        <b>${escHtml(projectLabel || "-")}</b>
        <span class="muted">${escHtml(project.locatie ?? "")}</span>
      </div>
      <div class="meta">
        <span>Projectnummer</span><span>${escHtml(project.case_nummer ?? "-")}</span>
        <span>Begindatum</span><span>${escHtml(fmtShortDateIso(periodeVan))}</span>
        <span>Einddatum</span><span>${escHtml(fmtShortDateIso(periodeTot))}</span>
        <span>Dienstverband</span><span>${escHtml(dvLabel)}</span>
        <span>Monteurs</span><span>${monteurCount}</span>
        <span>Weken</span><span>${escHtml(weekNumbersLabel(weekKeys))}</span>
      </div>
      <div class="right">
        <b>TerreVolt B.V.</b>
        <span>Overvliet 97</span><br />
        <span>3545 NH Utrecht</span><br />
        <span>info@terrevolt.nl</span><br />
        <span>KvK: 98495976</span><br />
        <span>BTW: NL868519522B01</span><br />
        <span class="muted" style="display:inline-block;margin-top:6px">Opgesteld door ${escHtml(preparedBy)}</span>
      </div>
    </section>

    <h2>Uren</h2>
    ${weekSections}

    <div class="grand"><span>Totaal uren</span><b>${escHtml(fmtTotalUren(totalAll))}</b></div>

  </main>
</body>
</html>`;
}

export function exportMandagenregisterPDF(input: MandagenregisterPdfInput): void {
  const html = buildMandagenregisterHtml(input);
  const w = window.open("", "_blank");
  if (!w) {
    throw new Error("Pop-up werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.");
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}