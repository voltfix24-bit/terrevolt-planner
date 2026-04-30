/**
 * Gantt-export — print/PDF van de planning per project.
 *
 * X-as: geselecteerde weken × 5 dagen (MA t/m VR).
 * Y-as: projecten (alleen die ingeplande cellen hebben in de gekozen weken).
 *       Per project één regel per activiteit.
 *
 * Cel-kleuren komen uit COLOR_MAP. Inhoud van een cel kan zijn:
 *   - "geen": leeg
 *   - "initialen": initialen van toegewezen monteurs
 *   - "namen": volledige namen (worden getrunceerd indien nodig)
 *
 * De output is een nieuw venster met geoptimaliseerde print-CSS;
 * de browser print-dialog opent zelf, gebruiker kiest "Opslaan als PDF".
 */

import { COLOR_MAP, COLOR_CODES, DAG_LABELS, getMondayOfWeek, formatDate, initialen } from "./planning-types";

export type GanttMonteurWeergave = "geen" | "initialen" | "namen";

export interface GanttCel {
  project_id: string;
  activiteit_id: string;
  week_nr: number;
  dag_index: number;
  kleur_code: string | null;
  monteur_ids: string[];
}

export interface GanttProject {
  id: string;
  case_nummer: string | null;
  station_naam: string | null;
  wv_naam: string | null;
}

export interface GanttActiviteit {
  id: string;
  project_id: string;
  naam: string;
  positie: number | null;
}

export interface GanttMonteur {
  id: string;
  naam: string;
}

export interface GanttWeek {
  week_nr: number;
  jaar: number;
}

export interface GanttExportInput {
  titel: string;
  weken: GanttWeek[];
  projecten: GanttProject[];
  activiteiten: GanttActiviteit[];
  monteurs: GanttMonteur[];
  cellen: GanttCel[];
  monteurWeergave: GanttMonteurWeergave;
  /** Map van YYYY-MM-DD → feestdag-naam. Optioneel. */
  feestdagen?: Map<string, string>;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const escHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
    : c === "<" ? "&lt;"
    : c === ">" ? "&gt;"
    : c === '"' ? "&quot;"
    : "&#39;",
  );

/** Zwart of wit op gegeven hex achtergrond, voor leesbaarheid. */
function readableTextColor(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length !== 6) return "#000";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  // relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

function projectLabel(p: GanttProject): string {
  const parts: string[] = [];
  if (p.case_nummer) parts.push(p.case_nummer);
  if (p.station_naam) parts.push(p.station_naam);
  if (p.wv_naam && parts.length === 0) parts.push(p.wv_naam);
  return parts.join(" — ") || "Onbekend project";
}

export function exportGanttPDF(input: GanttExportInput): void {
  const { titel, weken, projecten, activiteiten, monteurs, cellen, monteurWeergave, feestdagen } = input;
  const feestdagenMap = feestdagen ?? new Map<string, string>();

  if (weken.length === 0) {
    throw new Error("Geen weken geselecteerd");
  }

  // Lookup maps
  const monteurById = new Map(monteurs.map((m) => [m.id, m] as const));

  // Group cellen by project + activiteit + week_nr + dag_index
  type CellKey = string;
  const cellMap = new Map<CellKey, GanttCel>();
  cellen.forEach((c) => {
    cellMap.set(`${c.activiteit_id}|${c.week_nr}|${c.dag_index}`, c);
  });

  // Welke projecten hebben überhaupt cellen in deze weken?
  const weekNrSet = new Set(weken.map((w) => w.week_nr));
  const projectIdsMetCellen = new Set<string>();
  cellen.forEach((c) => {
    if (weekNrSet.has(c.week_nr)) projectIdsMetCellen.add(c.project_id);
  });

  // Filter projecten en activiteiten
  const zichtbareProjecten = projecten.filter((p) => projectIdsMetCellen.has(p.id));
  // Activiteiten per project, gesorteerd op positie
  const actsByProject = new Map<string, GanttActiviteit[]>();
  activiteiten.forEach((a) => {
    if (!projectIdsMetCellen.has(a.project_id)) return;
    const arr = actsByProject.get(a.project_id) ?? [];
    arr.push(a);
    actsByProject.set(a.project_id, arr);
  });
  actsByProject.forEach((arr) =>
    arr.sort((a, b) => (a.positie ?? 0) - (b.positie ?? 0)),
  );

  // Layout consts (px) — bij veel weken automatisch smaller maken zodat alles past
  const totalDays = weken.length * 5;
  // Schaal dagbreedte tussen 34 (weinig weken) en 14 (heel veel weken)
  const DAG_W = weken.length <= 6 ? 34 : weken.length <= 10 ? 28 : weken.length <= 14 ? 22 : weken.length <= 20 ? 18 : 14;
  // Eén gecombineerde "Project & Activity" kolom
  const COL_LABEL_W = weken.length <= 14 ? 320 : 240;
  const ROW_H = 30;

  // Dynamische cel-binnenruimte: bij smalle dagen minder padding zodat block niet wordt
  // weggedrukt en niet overlapt met de cel-rand.
  const CELL_PAD = DAG_W >= 28 ? 3 : DAG_W >= 20 ? 2 : 1;
  const BLOCK_PAD = DAG_W >= 28 ? 2 : DAG_W >= 20 ? 1 : 0;
  // Block label-font schaalt mee zodat initialen altijd in de kleurblok passen
  const BLOCK_FS = DAG_W >= 28 ? 9 : DAG_W >= 22 ? 8 : DAG_W >= 18 ? 7 : 6.5;
  // Effectieve binnenbreedte voor de block (pixels): DAG_W − 2*CELL_PAD − 2px borders
  const BLOCK_INNER_W = Math.max(6, DAG_W - 2 * CELL_PAD - 2);

  const gridW = totalDays * DAG_W;
  const sheetW = COL_LABEL_W + gridW;

  // Kies papierformaat: A3 normaal, A2 bij heel brede planningen
  const paperSize = weken.length <= 16 ? "A3" : "A2";
  const pageWmm = paperSize === "A3" ? 396 : 570;
  const pagePx = pageWmm * 3.7795;
  const fitScale = sheetW > pagePx ? pagePx / sheetW : 1;

  // Reporting period (eerste maandag t/m laatste vrijdag)
  const firstWeek = weken[0];
  const lastWeek = weken[weken.length - 1];
  const periodStart = getMondayOfWeek(firstWeek.week_nr, firstWeek.jaar);
  const periodEnd = new Date(getMondayOfWeek(lastWeek.week_nr, lastWeek.jaar));
  periodEnd.setDate(periodEnd.getDate() + 4);
  const fmtLong = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const jaar = lastWeek.jaar;
  const weekRangeLabel =
    firstWeek.week_nr === lastWeek.week_nr
      ? `Week ${firstWeek.week_nr}`
      : `Week ${firstWeek.week_nr}-${lastWeek.week_nr}`;

  // Build header rows — week label boven, dagen eronder
  const weekHeader = weken
    .map(
      (w) => `<th colspan="5" class="wk">WEEK ${w.week_nr}</th>`,
    )
    .join("");

  const dagHeader = weken
    .map((w) =>
      DAG_LABELS.map((d, i) => {
        const monday = getMondayOfWeek(w.week_nr, w.jaar);
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        const isLastOfWeek = i === 4;
        const isFirstOfWeek = i === 0;
        const feestNaam = feestdagenMap.get(ymd(dt));
        const cls = ["dag",
          isFirstOfWeek ? "start-wk" : "",
          isLastOfWeek ? "end-wk" : "",
          feestNaam ? "feestdag-h" : "",
        ].filter(Boolean).join(" ");
        const tip = feestNaam ? ` title="Feestdag: ${escHtml(feestNaam)}"` : "";
        return `<th class="${cls}"${tip}>${d}</th>`;
      }).join(""),
    )
    .join("");

  // Build body rows — corporate stijl: project header rij + activiteit rijen
  let bodyRows = "";
  if (zichtbareProjecten.length === 0) {
    bodyRows = `<tr><td colspan="${1 + totalDays}" class="empty">Geen geplande activiteiten in de geselecteerde weken.</td></tr>`;
  } else {
    zichtbareProjecten.forEach((p) => {
      const acts = actsByProject.get(p.id) ?? [];
      if (acts.length === 0) return;
      // Project group-header rij: label-kolom + grid-overspan apart, zodat de
      // grid-uitlijning gegarandeerd hetzelfde is als bij activiteit-rijen.
      bodyRows += `<tr class="proj-row">
        <td class="proj-cell">${escHtml(projectLabel(p))}</td>
        <td colspan="${totalDays}" class="proj-spacer"></td>
      </tr>`;
      acts.forEach((a) => {
        const dayCells = weken
          .map((w) =>
            DAG_LABELS.map((_, di) => {
              const cel = cellMap.get(`${a.id}|${w.week_nr}|${di}`);
              const isLastOfWeek = di === 4;
              const monday = getMondayOfWeek(w.week_nr, w.jaar);
              const dt = new Date(monday);
              dt.setDate(monday.getDate() + di);
              const feestNaam = feestdagenMap.get(ymd(dt));
              const endCls = isLastOfWeek ? " end-wk" : "";
              const startCls = di === 0 ? " start-wk" : "";
              const feestCls = feestNaam ? " feestdag" : "";
              const tip = feestNaam ? ` title="Feestdag: ${escHtml(feestNaam)}"` : "";
              if (!cel) return `<td class="cell empty-cell${startCls}${endCls}${feestCls}"${tip}></td>`;
              const colorEntry = cel.kleur_code ? COLOR_MAP[cel.kleur_code] : null;
              const bg = colorEntry?.hex ?? "#cbd5e1";
              const fg = readableTextColor(bg);
              let label = "";
              let fullLabel = "";
              if (monteurWeergave !== "geen" && cel.monteur_ids.length > 0) {
                const namen = cel.monteur_ids
                  .map((id) => monteurById.get(id)?.naam)
                  .filter((n): n is string => !!n);
                if (monteurWeergave === "initialen") {
                  const inits = namen.map(initialen);
                  fullLabel = inits.join(" ");
                  // Bij smalle cellen: max 2 initialen tonen, rest in title-tooltip
                  if (DAG_W < 22 && inits.length > 2) {
                    label = inits.slice(0, 2).join(" ") + "+";
                  } else {
                    label = fullLabel;
                  }
                } else {
                  fullLabel = namen.join(", ");
                  // Volledige namen passen vrijwel nooit in een 14-30px cel:
                  // toon initialen, met volledige namen in tooltip
                  label = namen.map(initialen).join(" ");
                  if (DAG_W < 22 && namen.length > 2) {
                    label = namen.slice(0, 2).map(initialen).join(" ") + "+";
                  }
                }
              }
              const labelTip = fullLabel && fullLabel !== label
                ? ` title="${escHtml(feestNaam ? `Feestdag: ${feestNaam} — ${fullLabel}` : fullLabel)}"`
                : tip;
              // Inner block geeft het corporate "blokje in cel" effect
              return `<td class="cell${startCls}${endCls}${feestCls}"${labelTip}><span class="block" style="background:${bg};color:${fg};">${escHtml(label)}</span></td>`;
            }).join(""),
          )
          .join("");
        bodyRows += `<tr class="act-row">
          <td class="act">${escHtml(a.naam)}</td>
          ${dayCells}
        </tr>`;
      });
    });
  }

  // Status legend — dynamisch op basis van kleurcodes die werkelijk in de export voorkomen.
  // Volgorde = vaste volgorde van COLOR_MAP (c1..c12) zodat de legenda voorspelbaar leest
  // en 1-op-1 correspondeert met de Nederlandse statuswaarden uit planning-types.ts.
  const gebruikteCodes = new Set<string>();
  cellen.forEach((c) => {
    if (c.kleur_code && COLOR_MAP[c.kleur_code]) gebruikteCodes.add(c.kleur_code);
  });
  const legendItems: Array<{ hex: string; naam: string; pattern?: boolean }> = COLOR_CODES
    .filter((code) => gebruikteCodes.has(code))
    .map((code) => ({ hex: COLOR_MAP[code].hex, naam: COLOR_MAP[code].naam }));
  // Voeg feestdag-indicator toe als er feestdagen in de geselecteerde periode vallen
  const heeftFeestdagInPeriode = weken.some((w) => {
    const monday = getMondayOfWeek(w.week_nr, w.jaar);
    for (let i = 0; i < 5; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      if (feestdagenMap.has(ymd(dt))) return true;
    }
    return false;
  });
  if (heeftFeestdagInPeriode) {
    legendItems.push({ hex: "#94a3b8", naam: "Feestdag / vrije dag", pattern: true });
  }
  const legend = legendItems.length === 0
    ? `<span class="lg-empty">Geen statussen in deze periode</span>`
    : legendItems
        .map(
          (c) =>
            `<div class="lg-item"><span class="lg-dot${c.pattern ? " lg-dot-feest" : ""}" style="background:${c.hex}"></span><span class="lg-lbl">${escHtml(c.naam)}</span></div>`,
        )
        .join("");

  const monteurWeergaveLabel =
    monteurWeergave === "geen"
      ? "geen monteurs"
      : monteurWeergave === "initialen"
        ? "monteurs als initialen"
        : "monteurs met volledige naam";

  const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${escHtml(titel)}</title>
<style>
  /* Page margins: top = ruimte voor fixed header (32mm), bottom = ruimte voor fixed footer (18mm).
     Marges zijn iets groter dan header/footer-hoogte zodat er nooit overlap met tabel is. */
  @page { size: ${paperSize} landscape; margin: 36mm 12mm 22mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #ffffff; color: #191b23;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ========== Fixed page header (herhaalt op elke pagina bij print) ==========
     Hoogte 32mm < page-top-margin 36mm → 4mm safety gap, geen overlap mogelijk. */
  .page-header {
    position: fixed;
    top: -34mm;
    left: 0; right: 0;
    height: 32mm;
    padding: 0;
    overflow: hidden;
  }
  /* Compacte fixed page footer: alleen confidential-line + paginanummer.
     Hoogte 18mm < page-bottom-margin 22mm → 4mm safety gap. */
  .page-footer {
    position: fixed;
    bottom: -20mm;
    left: 0; right: 0;
    height: 18mm;
    padding: 0;
    overflow: hidden;
  }

  /* Op scherm: laat header/footer in normale flow staan zodat je een preview ziet */
  @media screen {
    .page-header, .page-footer {
      position: static;
      height: auto;
    }
    .wrap { padding: 14px 14px 24px 14px; }
  }

  .wrap { overflow: hidden; }
  .gantt-scale {
    width: ${sheetW}px;
    transform-origin: top left;
    margin: 0 auto;
  }
  body[data-scale="fit"] .gantt-scale,
  body[data-scale="standard"] .gantt-scale {
    transform: scale(${fitScale.toFixed(4)});
    margin-bottom: ${Math.max(0, (1 - fitScale) * 100)}px;
  }
  body[data-scale="none"] .gantt-scale { transform: none; }
  @media print {
    body[data-scale="fit"] .gantt-scale,
    body[data-scale="standard"] .gantt-scale {
      transform: scale(${fitScale.toFixed(4)});
    }
    body[data-scale="none"] .gantt-scale { transform: none; }
  }

  /* ========== Document header ========== */
  .doc-head {
    width: 100%;
    display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #004ac6;
    padding: 0 0 6px 0;
    margin-bottom: 8px;
  }
  .doc-head .left .title {
    color: #004ac6;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .doc-head .left .sub {
    color: #434655;
    font-size: 10px;
    margin-top: 2px;
  }
  .doc-head .right {
    text-align: right;
    color: #434655;
    font-size: 10px;
    line-height: 1.5;
  }
  .doc-head .right b { color: #191b23; font-weight: 600; }

  /* ========== Reporting period block ========== */
  .meta-grid {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 24px;
    margin-bottom: 8px;
  }
  .meta-grid .lbl {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #737686;
  }
  .meta-grid .val {
    font-size: 11px; color: #191b23; font-weight: 500;
  }
  .meta-grid .right { text-align: right; }

  /* ========== Status legend ========== */
  .legend-row {
    width: 100%;
    display: flex; align-items: center; flex-wrap: wrap;
    gap: 6px 14px;
    padding: 4px 0 0 0;
    font-size: 10px;
  }
  .legend-row .lg-title {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #737686;
    margin-right: 4px;
    flex-shrink: 0;
  }
  .lg-item { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .lg-dot {
    width: 11px; height: 11px; border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.12);
    display: inline-block;
    flex-shrink: 0;
  }
  .lg-dot-feest {
    background-image: repeating-linear-gradient(
      45deg, #94a3b8, #94a3b8 2px, #e2e8f0 2px, #e2e8f0 4px
    ) !important;
  }
  .lg-lbl { color: #191b23; font-size: 10px; }
  .lg-empty { font-size: 10px; color: #737686; font-style: italic; }


  /* ========== Gantt table ========== */
  table.gantt {
    border-collapse: collapse;
    table-layout: fixed;
    width: ${sheetW}px;
    border: 1px solid #c3c6d7;
  }
  /* Belangrijk: thead herhaalt op iedere pagina bij print */
  table.gantt thead { display: table-header-group; }
  /* Activiteit-rijen mogen niet midden over een pagina-einde lopen */
  table.gantt tbody tr { page-break-inside: avoid; break-inside: avoid; }
  /* Een projectkop mag nooit als laatste rij op een pagina staan zonder activiteiten eronder */
  table.gantt tr.proj-row { page-break-after: avoid; break-after: avoid; }
  /* De eerste activiteit-rij van een project blijft bij de projectkop */
  table.gantt tr.proj-row + tr.act-row { page-break-before: avoid; break-before: avoid; }
  table.gantt th, table.gantt td {
    border: 1px solid #c3c6d7;
    padding: 0;
    text-align: center;
    vertical-align: middle;
    font-size: 10px;
    overflow: hidden;
  }
  /* Subtiele dag-gridlines: lichtere haarlijn binnen een week,
     einde-week-streep (#737686) blijft sterker zodat week-grenzen leesbaar blijven */
  table.gantt td.cell,
  table.gantt thead th.dag {
    border-right: 1px solid #ededf9;
    border-left: 0;
  }
  /* Eerste dag van een week krijgt wel een normale linker-grid (week-scheiding) */
  table.gantt td.cell.start-wk,
  table.gantt thead th.dag.start-wk {
    border-left: 1px solid #c3c6d7;
  }
  /* Horizontale rij-grid blijft licht zodat dagblokken visueel "los" staan */
  table.gantt tbody td.cell {
    border-top: 1px solid #f0f0fb;
    border-bottom: 1px solid #f0f0fb;
  }
  thead th {
    background: #ededf9;
    color: #191b23;
    font-weight: 700;
  }
  thead th.label-h {
    width: ${COL_LABEL_W}px;
    text-align: left;
    padding: 8px 12px;
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #434655;
    border-right: 1px solid #c3c6d7;
  }
  thead th.wk {
    padding: 6px 2px;
    font-size: 9.5px;
    letter-spacing: 0.05em;
    color: #434655;
    border-bottom: 1px solid #c3c6d7;
    border-right: 1px solid #c3c6d7;
  }
  thead th.dag {
    width: ${DAG_W}px;
    padding: 4px 0;
    background: #f3f3fe;
    font-size: 9px;
    font-weight: 700;
    color: #434655;
    text-transform: uppercase;
  }
  thead th.dag.end-wk, td.cell.end-wk { border-right: 1.5px solid #737686; }
  thead th.dag.feestdag-h {
    background: repeating-linear-gradient(
      45deg, #e1e2ed, #e1e2ed 3px, #f3f3fe 3px, #f3f3fe 6px
    );
  }
  /* Activiteit-rij scheiding: zachte horizontale lijn zodat blokjes per rij duidelijk zijn */
  tr.act-row + tr.act-row td { border-top: 1px solid #f0f0fb; }

  /* Project group header — label-cel + lege grid-spacer met identiek raster
     zodat activiteit-blokjes daaronder visueel met de week-kolommen uitlijnen */
  tr.proj-row td.proj-cell {
    text-align: left;
    padding: 7px 12px;
    background: #f0f0fb;
    color: #191b23;
    font-size: 11px;
    font-weight: 600;
    border-top: 1.5px solid #004ac6;
    border-bottom: 1px solid #c3c6d7;
    border-right: 1px solid #c3c6d7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: ${COL_LABEL_W}px;
    /* Voorkom dat lange projectnamen kolombreedte oprekken */
    word-break: keep-all;
  }
  tr.proj-row td.proj-spacer {
    background: #f0f0fb;
    border-top: 1.5px solid #004ac6;
    border-bottom: 1px solid #c3c6d7;
    padding: 0;
    height: ${Math.round(ROW_H * 0.85)}px;
  }

  /* Activity row */
  tr.act-row td.act {
    text-align: left;
    padding: ${DAG_W >= 22 ? "6px 12px 6px 24px" : "5px 8px 5px 18px"};
    background: #ffffff;
    color: #191b23;
    font-size: ${DAG_W >= 22 ? 10.5 : 10}px;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: ${COL_LABEL_W}px;
  }

  td.cell {
    height: ${ROW_H}px;
    background: #ffffff;
    padding: ${CELL_PAD}px;
    /* Cel mag nooit breder worden dan zijn vaste week-kolombreedte */
    max-width: ${DAG_W}px;
    min-width: ${DAG_W}px;
    width: ${DAG_W}px;
  }
  td.cell .block {
    width: 100%;
    height: 100%;
    max-width: ${BLOCK_INNER_W}px;
    border-radius: 2px;
    font-size: ${BLOCK_FS}px;
    font-weight: 700;
    line-height: 1;
    padding: ${BLOCK_PAD}px;
    /* Geen wrapping in smalle blokken — overflow wordt afgekapt en zit in title-tooltip */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }
  td.cell.empty-cell .block { display: none; }
  td.empty {
    padding: 24px; text-align: center; color: #737686; font-style: italic;
    background: #f3f3fe;
  }

  td.cell.feestdag {
    background-image: repeating-linear-gradient(
      45deg, rgba(115,118,134,0.14), rgba(115,118,134,0.14) 3px,
      rgba(195,198,215,0.10) 3px, rgba(195,198,215,0.10) 6px
    );
  }

  /* ========== Annotations footer ========== */
  .annotations {
    width: 100%;
    margin: 0 0 8px 0;
    padding: 8px 12px;
    background: #f3f3fe;
    border: 1px solid #c3c6d7;
    border-radius: 4px;
  }
  .annotations .a-title {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #737686;
    margin-bottom: 4px;
  }
  .annotations ul { margin: 0; padding-left: 18px; }
  .annotations li {
    font-size: 10px; color: #191b23;
    margin: 2px 0; line-height: 1.35;
  }

  /* ========== Signatures ========== */
  .signatures {
    width: 100%;
    margin: 6px 0 0 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 32px;
  }
  .sig-block {
    border-top: 1px solid #434655;
    padding-top: 4px;
  }
  .sig-block .lbl {
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    text-transform: uppercase; color: #737686;
    margin-bottom: 1px;
  }
  .sig-block .name {
    font-size: 10.5px; color: #191b23; font-weight: 600;
  }

  /* ========== Document footer line ========== */
  .doc-foot {
    width: 100%;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid #c3c6d7;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px;
    color: #737686;
    letter-spacing: 0.05em;
  }
  .doc-foot .conf {
    color: #ba1a1a;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .doc-foot .ref { color: #434655; margin-left: 18px; }
  .doc-foot .pageinfo { color: #434655; }

  /* ========== Toolbar (alleen scherm) ========== */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    background: #fff; border-bottom: 1px solid #e1e2ed;
    padding: 8px 12px;
    display: flex; gap: 8px; align-items: center;
    font-size: 12px;
  }
  .toolbar button {
    background: #004ac6; color: #fff; border: 0; padding: 6px 14px;
    border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px;
  }
  .toolbar button:hover { background: #003ea8; }
  .toolbar label { color: #434655; font-weight: 600; }
  .toolbar select {
    border: 1px solid #c3c6d7; background: #fff; color: #191b23;
    padding: 5px 8px; border-radius: 4px; font-size: 12px; font-weight: 500;
    cursor: pointer;
  }
  .toolbar .hint { color: #737686; }
  @media print {
    .toolbar { display: none; }
    .wrap { padding-top: 0; }
  }

  /* Scherm-preview separator tussen header/body/footer */
  @media screen {
    .page-header { border-bottom: 1px dashed #c3c6d7; padding-bottom: 8px; margin-bottom: 12px; }
    .page-footer { border-top: 1px dashed #c3c6d7; padding-top: 8px; margin-top: 12px; }
  }
</style>
</head>
<body data-scale="fit">
  <div class="toolbar">
    <button onclick="window.print()">Afdrukken / opslaan als PDF</button>
    <label for="scaleSel">Schaal:</label>
    <select id="scaleSel" onchange="document.body.setAttribute('data-scale', this.value)">
      <option value="standard">Standaard</option>
      <option value="fit" selected>Aanpassen aan pagina</option>
      <option value="none">Geen schaling</option>
    </select>
    <span class="hint">Kies in de printdialoog "Opslaan als PDF" en ${paperSize} liggend. Zet de browser-schaling op 100%. Header, legend, annotaties en voettekst herhalen op elke pagina.</span>
  </div>

  <!-- FIXED PAGE HEADER — herhaalt op elke geprinte pagina -->
  <div class="page-header">
    <div class="doc-head">
      <div class="left">
        <div class="title">Planning Terrevolt ${jaar}</div>
        <div class="sub">${weken.length} ${weken.length === 1 ? "week" : "weken"} · ${zichtbareProjecten.length} ${zichtbareProjecten.length === 1 ? "project" : "projecten"} · ${monteurWeergaveLabel}</div>
      </div>
      <div class="right">
        <div><b>Date:</b> ${todayLabel}</div>
      </div>
    </div>
    <div class="meta-grid">
      <div>
        <div class="lbl">Reporting Period</div>
        <div class="val">${fmtLong(periodStart)} – ${fmtLong(periodEnd)} (${weekRangeLabel})</div>
      </div>
      <div class="right">
        <div class="lbl">Document</div>
        <div class="val">${escHtml(titel)}</div>
      </div>
    </div>
    <div class="legend-row">
      <span class="lg-title">Status Legend:</span>
      ${legend}
    </div>
  </div>

  <!-- FIXED PAGE FOOTER — herhaalt op elke geprinte pagina -->
  <div class="page-footer">
    <div class="annotations">
      <div class="a-title">Planning Annotations</div>
      <ul>
        <li>Planning data based on ${weken.length}-week operational cycle (${weekRangeLabel} ${jaar}).</li>
        <li>Schedule reflects ${zichtbareProjecten.length} ${zichtbareProjecten.length === 1 ? "active project" : "active projects"} with assigned activities in the selected period.</li>
        <li>Resource allocation indicated per cell; schedule is for visualization of project sequence and capacity planning.</li>
      </ul>
    </div>
    <div class="signatures">
      <div class="sig-block">
        <div class="lbl">Prepared By</div>
        <div class="name">Project Planning Lead</div>
      </div>
      <div class="sig-block">
        <div class="lbl">Authorized By</div>
        <div class="name">Operations Director</div>
      </div>
    </div>
    <div class="doc-foot">
      <div>© ${jaar} Corporate Operations Management System.</div>
      <div>
        <span class="conf">Confidential Internal Document</span>
        <span class="ref">Ref: PLAN-${weekRangeLabel.replace(/\s+/g, "")}-${jaar}</span>
      </div>
    </div>
  </div>

  <!-- MAIN CONTENT — alleen de tabel; thead herhaalt automatisch -->
  <div class="wrap">
    <div class="gantt-scale">
      <table class="gantt">
        <thead>
          <tr>
            <th rowspan="2" class="label-h">Project &amp; Activity</th>
            ${weekHeader}
          </tr>
          <tr>${dagHeader}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
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
  // Geen auto-print: gebruiker kiest eerst de schaal en klikt dan op "Afdrukken / opslaan als PDF"
  w.focus();
}
