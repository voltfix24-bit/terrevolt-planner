/**
 * Mandagenregister PDF/print-export.
 *
 * Volgt het patroon van src/lib/gantt-export.ts: opent een nieuw venster met
 * print-CSS (A4 liggend) en laat de browser printen of opslaan als PDF.
 *
 * Twee varianten:
 *   - ZZP: dataminimalisatie (geen BSN, geen ID-velden). Vaste statuscode "Z".
 *   - Loondienst: BSN + identiteitsgegevens worden wél meegenomen.
 *
 * De aanroeper levert al-gepivot data per (monteur, ISO-week) aan. De CSV-
 * export in MandagenregisterPanel gebruikt dezelfde aggregatie.
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
  /** Alleen voor ZZP relevant; mag null zijn. */
  kvk_nummer?: string | null;
  /** Alleen voor loondienst; nooit invullen voor ZZP. */
  bsn?: string | null;
  geboortedatum?: string | null;
  id_type?: string | null;
  id_nummer?: string | null;
  id_geldig_tot?: string | null;
  /** ISO-week key, bv. "2026-W12". */
  week: string;
  /** Index 0..6 (ma..zo) → uren */
  days: number[];
  total: number;
  opmerking: string;
}

export interface MandagenregisterPdfInput {
  dienstverband: Dienstverband;
  project: ProjectMeta;
  periodeVan: string; // YYYY-MM-DD
  periodeTot: string; // YYYY-MM-DD
  rows: WeekRow[];
  /** Tonen in de header "Opgesteld door"; default "TerreVolt Planner". */
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
  const d = new Date(iso + "T00:00:00");
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
  const titel =
    dienstverband === "zzp" ? "Mandagenregister ZZP" : "Mandagenregister Loondienst";
  const today = new Date();
  const todayLabel = today.toLocaleDateString("nl-NL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const exportTs = today.toLocaleString("nl-NL");

  const projectLabel = [project.case_nummer, project.station_naam]
    .filter(Boolean)
    .join(" — ");

  // Tabel-kolommen per variant. ZZP = minimum volgens AVG; geen BSN/ID.
  // Loondienst = inclusief BSN + identiteit (managers-only context).
  const zzpHeaders = [
    "Naam zelfstandige",
    "Status",
    "KvK-nummer",
    "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo",
    "Totaal",
    "Opmerking",
  ];
  const loondienstHeaders = [
    "Naam",
    "BSN",
    "Geboortedatum",
    "ID-type",
    "ID-nummer",
    "ID geldig tot",
    "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo",
    "Totaal",
    "Opmerking",
  ];
  const headers = dienstverband === "zzp" ? zzpHeaders : loondienstHeaders;

  const sortedRows = [...rows].sort(
    (a, b) => a.naam.localeCompare(b.naam) || a.week.localeCompare(b.week),
  );

  const bodyRows = sortedRows.length === 0
    ? `<tr><td colspan="${headers.length}" class="empty">Geen geplande monteurs in deze periode.</td></tr>`
    : sortedRows
        .map((r) => {
          if (dienstverband === "zzp") {
            return `<tr>
              <td class="naam">${escHtml(r.naam)}</td>
              <td class="status">Z</td>
              <td class="kvk">${escHtml(r.kvk_nummer ?? "")}</td>
              ${r.days
                .map((u) => `<td class="d">${escHtml(fmtUren(u))}</td>`)
                .join("")}
              <td class="tot">${escHtml(fmtUren(r.total))}</td>
              <td class="opm">${escHtml(r.opmerking)}</td>
            </tr>`;
          }
          return `<tr>
            <td class="naam">${escHtml(r.naam)}</td>
            <td>${escHtml(r.bsn ?? "")}</td>
            <td>${escHtml(fmtDate(r.geboortedatum))}</td>
            <td>${escHtml(r.id_type ?? "")}</td>
            <td>${escHtml(r.id_nummer ?? "")}</td>
            <td>${escHtml(fmtDate(r.id_geldig_tot))}</td>
            ${r.days
              .map((u) => `<td class="d">${escHtml(fmtUren(u))}</td>`)
              .join("")}
            <td class="tot">${escHtml(fmtUren(r.total))}</td>
            <td class="opm">${escHtml(r.opmerking)}</td>
          </tr>`;
        })
        .join("");

  const totalAll = sortedRows.reduce((s, r) => s + (r.total || 0), 0);

  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${escHtml(titel)} — ${escHtml(projectLabel || "Project")}</title>
<style>
  :root { --accent: #004ac6; --ink: #191b23; --muted: #737686; --line: #c3c6d7; }
  @page { size: A4 landscape; margin: 14mm 12mm 18mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #fff; color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 10.5px; line-height: 1.35;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    background: #fff; border-bottom: 1px solid #e1e2ed;
    padding: 8px 12px;
    display: flex; gap: 8px; align-items: center; font-size: 12px;
  }
  .toolbar button {
    background: var(--accent); color: #fff; border: 0; padding: 6px 14px;
    border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px;
  }
  .toolbar .hint { color: var(--muted); }
  @media print { .toolbar { display: none; } }

  .header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; padding-bottom: 8px; margin-bottom: 10px;
    border-bottom: 2px solid var(--accent);
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand .logo {
    width: 32px; height: 32px; border-radius: 6px;
    background: var(--accent); color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px; letter-spacing: 0.5px;
  }
  .brand .brand-name {
    font-weight: 700; font-size: 12px; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--accent);
  }
  .brand .brand-sub {
    font-size: 9.5px; color: var(--muted); letter-spacing: 0.04em;
  }
  .title-wrap { text-align: center; flex: 1; }
  .title-wrap .title { font-size: 16px; font-weight: 800; color: var(--ink); }
  .title-wrap .sub { font-size: 10px; color: var(--muted); margin-top: 2px; }
  .meta-right { text-align: right; font-size: 9.5px; color: var(--muted); }
  .meta-right b { color: var(--ink); }

  .meta-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 16px;
    margin-bottom: 10px;
  }
  .meta-grid .lbl {
    font-size: 8.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted);
  }
  .meta-grid .val { font-size: 11px; color: var(--ink); font-weight: 600; }

  table.mdr {
    width: 100%; border-collapse: collapse; table-layout: auto;
    font-size: 10px;
  }
  table.mdr thead { display: table-header-group; }
  table.mdr th, table.mdr td {
    border: 0.5px solid var(--line);
    padding: 4px 6px; vertical-align: middle;
  }
  table.mdr th {
    background: #f3f3fe; color: #434655;
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    text-align: center;
  }
  table.mdr td.naam { font-weight: 600; }
  table.mdr td.status { text-align: center; font-weight: 700; color: var(--accent); }
  table.mdr td.kvk { font-variant-numeric: tabular-nums; }
  table.mdr td.d { text-align: center; font-variant-numeric: tabular-nums; min-width: 26px; }
  table.mdr td.tot {
    text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;
    background: #f8f9ff;
  }
  table.mdr td.opm { color: #434655; font-size: 9.5px; }
  table.mdr tr { page-break-inside: avoid; }
  td.empty {
    padding: 24px; text-align: center; color: var(--muted); font-style: italic;
    background: #f3f3fe;
  }

  .totals {
    margin-top: 8px; text-align: right;
    font-size: 10.5px; color: var(--ink);
  }
  .totals b { color: var(--accent); }

  .privacy {
    margin-top: 10px; padding: 6px 8px;
    background: #f0fdf4; border: 0.5px solid #bbf7d0;
    color: #065f46; font-size: 9px; border-radius: 3px;
  }
  .privacy.loondienst {
    background: #fef3c7; border-color: #fcd34d; color: #92400e;
  }

  /* Handtekeningblok op laatste pagina */
  .end-block { margin-top: 18px; page-break-inside: avoid; break-inside: avoid; }
  .sig-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 30px;
    margin-top: 8px;
  }
  .sig {
    border-top: 1px solid var(--ink);
    padding-top: 4px;
  }
  .sig .role {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--muted);
  }
  .sig .who { font-size: 10.5px; color: var(--ink); font-weight: 600; margin-top: 2px; }
  .sig .line {
    height: 36px; border-bottom: 1px dashed var(--line);
    margin-top: 8px;
  }
  .sig .date-line {
    margin-top: 4px; font-size: 9px; color: var(--muted);
  }

  /* Vaste footer per pagina */
  @media print {
    @page {
      @bottom-left  { content: "TerreVolt Planner · ${escHtml(titel)}"; font-size: 8.5px; color: #737686; }
      @bottom-center{ content: "Geëxporteerd ${escHtml(exportTs)}"; font-size: 8.5px; color: #737686; }
      @bottom-right { content: "Pagina " counter(page) " / " counter(pages); font-size: 8.5px; color: #737686; }
    }
  }
  .screen-foot {
    margin-top: 18px; padding-top: 6px; border-top: 1px dashed var(--line);
    display: flex; justify-content: space-between;
    font-size: 9px; color: var(--muted);
  }
  @media print { .screen-foot { display: none; } }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Afdrukken / opslaan als PDF</button>
    <span class="hint">Kies in de printdialoog "Opslaan als PDF" en A4 liggend. Zet schaling op 100%.</span>
  </div>

  <div class="header">
    <div class="brand">
      <span class="logo">TV</span>
      <div>
        <div class="brand-name">TerreVolt</div>
        <div class="brand-sub">Planner · Mandagenregister</div>
      </div>
    </div>
    <div class="title-wrap">
      <div class="title">${escHtml(titel)}</div>
      <div class="sub">${escHtml(projectLabel || "Project")}</div>
    </div>
    <div class="meta-right">
      <div><b>Exportdatum:</b> ${escHtml(todayLabel)}</div>
      <div><b>Periode:</b> ${escHtml(fmtDate(periodeVan))} – ${escHtml(fmtDate(periodeTot))}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div>
      <div class="lbl">Projectnummer</div>
      <div class="val">${escHtml(project.case_nummer ?? "—")}</div>
    </div>
    <div>
      <div class="lbl">Projectnaam</div>
      <div class="val">${escHtml(project.station_naam ?? "—")}</div>
    </div>
    <div>
      <div class="lbl">Locatie</div>
      <div class="val">${escHtml(project.locatie ?? "—")}</div>
    </div>
    <div>
      <div class="lbl">Hoofdaannemer / opdrachtgever</div>
      <div class="val">${escHtml(project.opdrachtgever ?? "—")}</div>
    </div>
  </div>

  <table class="mdr">
    <thead>
      <tr>
        ${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>

  <div class="totals">
    Totaal uren in deze periode: <b>${escHtml(fmtUren(totalAll) || "0")}</b>
    · ${sortedRows.length} regel${sortedRows.length === 1 ? "" : "s"}
  </div>

  ${
    dienstverband === "zzp"
      ? `<div class="privacy">
          Conform AVG / dataminimalisatie: deze ZZP-export bevat geen BSN, geboortedatum,
          nationaliteit of identiteitsdocumenten. Alleen naam, statuscode en KvK-nummer
          worden verwerkt voor de mandagenregistratie.
        </div>`
      : `<div class="privacy loondienst">
          Bevat persoonsgegevens van werknemers (o.a. BSN). Vertrouwelijk — alleen
          verstrekken aan geautoriseerde verwerkers.
        </div>`
  }

  <div class="end-block">
    <div class="sig-grid">
      <div class="sig">
        <div class="role">Opgesteld door</div>
        <div class="who">${escHtml(preparedBy)}</div>
        <div class="line"></div>
        <div class="date-line">Datum: ${escHtml(todayLabel)}</div>
      </div>
      <div class="sig">
        <div class="role">Akkoord opdrachtgever / hoofdaannemer</div>
        <div class="who">${escHtml(project.opdrachtgever ?? "")}</div>
        <div class="line"></div>
        <div class="date-line">Naam &amp; datum: __________________________</div>
      </div>
    </div>
  </div>

  <div class="screen-foot">
    <div>TerreVolt Planner · ${escHtml(titel)}</div>
    <div>Geëxporteerd ${escHtml(exportTs)}</div>
  </div>
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
