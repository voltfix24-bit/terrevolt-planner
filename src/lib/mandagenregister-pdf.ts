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

const fmtUren = (n: number): string => {
  if (!n) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.0+$/, "").replace(/\.([1-9])0$/, ".$1");
};

export function exportMandagenregisterPDF(input: MandagenregisterPdfInput): void {
  const { dienstverband, project, periodeVan, periodeTot, rows } = input;
  const preparedBy = input.preparedBy ?? "TerreVolt Planner";
  const titel = dienstverband === "zzp" ? "Mandagenregister ZZP" : "Mandagenregister Loondienst";
  const now = new Date();
  const todayLabel = now.toLocaleDateString("nl-NL", { year: "numeric", month: "long", day: "numeric" });
  const exportTs = now.toLocaleString("nl-NL");
  const projectLabel = [project.case_nummer, project.station_naam].filter(Boolean).join(" - ");

  const zzpHeaders = [
    "Naam zelfstandige", "Status", "KvK-nummer",
    "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo",
    "Totaal", "Opmerking",
  ];
  const loondienstHeaders = [
    "Naam", "BSN", "Geboortedatum", "ID-type", "ID-nummer", "ID geldig tot",
    "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo",
    "Totaal", "Opmerking",
  ];
  const headers = dienstverband === "zzp" ? zzpHeaders : loondienstHeaders;

  const sortedRows = [...rows].sort(
    (a, b) => a.naam.localeCompare(b.naam, "nl") || a.week.localeCompare(b.week),
  );

  const bodyRows = sortedRows.length === 0
    ? `<tr><td colspan="${headers.length}" class="empty">Geen geplande monteurs in deze periode.</td></tr>`
    : sortedRows.map((r) => {
        if (dienstverband === "zzp") {
          return `<tr>
            <td class="naam">${escHtml(r.naam)}</td>
            <td class="status">Z</td>
            <td class="mono">${escHtml(r.kvk_nummer ?? "")}</td>
            ${r.days.map((u) => `<td class="uren">${escHtml(fmtUren(u))}</td>`).join("")}
            <td class="totaal">${escHtml(fmtUren(r.total))}</td>
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
          ${r.days.map((u) => `<td class="uren">${escHtml(fmtUren(u))}</td>`).join("")}
          <td class="totaal">${escHtml(fmtUren(r.total))}</td>
          <td class="opmerking">${escHtml(r.opmerking)}</td>
        </tr>`;
      }).join("");

  const totalAll = sortedRows.reduce((sum, r) => sum + (r.total || 0), 0);

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
    --ink: #1f2937;
    --muted: #64748b;
    --line: #cbd5e1;
    --soft: #f8fafc;
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
    grid-template-columns: 190px 1fr 210px;
    gap: 14px;
    align-items: start;
    padding-bottom: 8px;
    margin-bottom: 10px;
    border-bottom: 2px solid var(--accent);
  }
  .brand { display: flex; gap: 9px; align-items: center; }
  .logo {
    width: 32px;
    height: 32px;
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #d1fae5;
    color: var(--accent);
    font-weight: 900;
    font-size: 13px;
  }
  .brand-name {
    font-size: 13px;
    font-weight: 800;
    color: var(--accent-dark);
    letter-spacing: 0.02em;
  }
  .brand-sub { color: var(--muted); font-size: 9.5px; }
  .doc-title { text-align: center; }
  .doc-title h1 {
    margin: 0;
    font-size: 18px;
    line-height: 1.1;
    color: var(--ink);
  }
  .doc-title div { margin-top: 3px; color: var(--muted); }
  .doc-meta { text-align: right; color: var(--muted); font-size: 9.5px; }
  .doc-meta b { color: var(--ink); }

  .project-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px 14px;
    margin-bottom: 10px;
  }
  .label {
    color: var(--muted);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .value { margin-top: 1px; font-size: 10.8px; font-weight: 700; color: var(--ink); }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th, td {
    border: 0.5px solid var(--line);
    padding: 4px 5px;
    vertical-align: middle;
  }
  th {
    background: #ecfdf5 !important;
    color: var(--accent-dark);
    font-size: 8.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    text-align: center;
  }
  td.naam { font-weight: 700; min-width: 135px; }
  td.status { text-align: center; color: var(--accent-dark); font-weight: 900; }
  td.mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.uren { text-align: center; min-width: 24px; font-variant-numeric: tabular-nums; }
  td.totaal { text-align: right; font-weight: 800; background: var(--soft) !important; }
  td.opmerking { color: #475569; font-size: 9px; }
  td.empty { padding: 22px; text-align: center; color: var(--muted); font-style: italic; }

  .totals {
    margin-top: 8px;
    text-align: right;
    font-size: 10.5px;
  }
  .totals b { color: var(--accent-dark); }

  .notice {
    margin-top: 10px;
    padding: 7px 9px;
    border: 0.5px solid #bbf7d0;
    border-radius: 4px;
    background: #f0fdf4 !important;
    color: #065f46;
    font-size: 9px;
  }
  .notice.loondienst {
    border-color: #fde68a;
    background: #fffbeb !important;
    color: #92400e;
  }

  .signatures {
    margin-top: 18px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .signature {
    border-top: 1px solid var(--ink);
    padding-top: 5px;
  }
  .signature .role {
    color: var(--muted);
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .signature .who { margin-top: 2px; font-weight: 700; }
  .signature .line { height: 34px; border-bottom: 1px dashed var(--line); margin-top: 8px; }
  .signature .date { margin-top: 4px; color: var(--muted); font-size: 9px; }

  .footer {
    margin-top: 14px;
    padding-top: 6px;
    border-top: 1px dashed var(--line);
    display: flex;
    justify-content: space-between;
    color: var(--muted);
    font-size: 8.8px;
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
    table,
    .totals,
    .notice,
    .signatures,
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
          <div class="brand-sub">Planner · Mandagenregister</div>
        </div>
      </div>
      <div class="doc-title">
        <h1>${escHtml(titel)}</h1>
        <div>${escHtml(projectLabel || "Project")}</div>
      </div>
      <div class="doc-meta">
        <div><b>Exportdatum:</b> ${escHtml(todayLabel)}</div>
        <div><b>Periode:</b> ${escHtml(fmtDate(periodeVan))} - ${escHtml(fmtDate(periodeTot))}</div>
      </div>
    </header>

    <section class="project-grid">
      <div><div class="label">Projectnummer</div><div class="value">${escHtml(project.case_nummer ?? "-")}</div></div>
      <div><div class="label">Projectnaam</div><div class="value">${escHtml(project.station_naam ?? "-")}</div></div>
      <div><div class="label">Locatie</div><div class="value">${escHtml(project.locatie ?? "-")}</div></div>
      <div><div class="label">Hoofdaannemer / opdrachtgever</div><div class="value">${escHtml(project.opdrachtgever ?? "-")}</div></div>
    </section>

    <table aria-label="${escHtml(titel)}">
      <thead><tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>

    <div class="totals">
      Totaal uren in deze periode: <b>${escHtml(fmtUren(totalAll) || "0")}</b>
      · ${sortedRows.length} regel${sortedRows.length === 1 ? "" : "s"}
    </div>

    ${dienstverband === "zzp"
      ? `<div class="notice">AVG/dataminimalisatie: deze ZZP-export bevat geen BSN, geboortedatum, nationaliteit of identiteitsdocumenten. Alleen naam, statuscode en KvK-nummer worden verwerkt.</div>`
      : `<div class="notice loondienst">Bevat persoonsgegevens van werknemers. Vertrouwelijk — alleen verstrekken aan geautoriseerde verwerkers.</div>`}

    <section class="signatures">
      <div class="signature">
        <div class="role">Opgesteld door</div>
        <div class="who">${escHtml(preparedBy)}</div>
        <div class="line"></div>
        <div class="date">Datum: ${escHtml(todayLabel)}</div>
      </div>
      <div class="signature">
        <div class="role">Akkoord opdrachtgever / hoofdaannemer</div>
        <div class="who">${escHtml(project.opdrachtgever ?? "")}</div>
        <div class="line"></div>
        <div class="date">Naam & datum: __________________________</div>
      </div>
    </section>

    <footer class="footer">
      <div>TerreVolt Planner · ${escHtml(titel)}</div>
      <div>Geëxporteerd ${escHtml(exportTs)}</div>
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
