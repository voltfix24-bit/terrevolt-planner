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

import { COLOR_MAP, DAG_LABELS, getMondayOfWeek, formatDate, initialen } from "./planning-types";

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

  // Layout consts (px)
  const COL_PROJECT_W = 220;
  const COL_ACT_W = 170;
  const DAG_W = 30;
  const ROW_H = 26;

  const totalDays = weken.length * 5;
  const gridW = totalDays * DAG_W;
  const sheetW = COL_PROJECT_W + COL_ACT_W + gridW;

  // Build header rows
  const weekHeader = weken
    .map((w) => {
      const monday = getMondayOfWeek(w.week_nr, w.jaar);
      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);
      return `<th colspan="5" class="wk">
        <div class="wk-nr">Week ${w.week_nr}</div>
        <div class="wk-rng">${formatDate(monday)} – ${formatDate(friday)}</div>
      </th>`;
    })
    .join("");

  const dagHeader = weken
    .map((w) =>
      DAG_LABELS.map((d, i) => {
        const monday = getMondayOfWeek(w.week_nr, w.jaar);
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        const isLastOfWeek = i === 4;
        const feestNaam = feestdagenMap.get(ymd(dt));
        const cls = ["dag", isLastOfWeek ? "end-wk" : "", feestNaam ? "feestdag-h" : ""].filter(Boolean).join(" ");
        const tip = feestNaam ? ` title="Feestdag: ${escHtml(feestNaam)}"` : "";
        const feestRow = feestNaam
          ? `<div class="dag-feest" title="${escHtml(feestNaam)}">${escHtml(feestNaam.length > 6 ? feestNaam.slice(0, 6) + "…" : feestNaam)}</div>`
          : "";
        return `<th class="${cls}"${tip}>
          <div class="dag-lbl">${d}</div>
          <div class="dag-dt">${formatDate(dt)}</div>
          ${feestRow}
        </th>`;
      }).join(""),
    )
    .join("");

  // Build body rows
  let bodyRows = "";
  if (zichtbareProjecten.length === 0) {
    bodyRows = `<tr><td colspan="${2 + totalDays}" class="empty">Geen geplande activiteiten in de geselecteerde weken.</td></tr>`;
  } else {
    zichtbareProjecten.forEach((p, pi) => {
      const acts = actsByProject.get(p.id) ?? [];
      if (acts.length === 0) return;
      const firstRowClass = pi === 0 ? "" : " new-project";
      acts.forEach((a, ai) => {
        const isFirst = ai === 0;
        const projectCell = isFirst
          ? `<td rowspan="${acts.length}" class="proj">
              <div class="proj-title">${escHtml(projectLabel(p))}</div>
              ${p.wv_naam && (p.case_nummer || p.station_naam) ? `<div class="proj-sub">${escHtml(p.wv_naam)}</div>` : ""}
            </td>`
          : "";
        const dayCells = weken
          .map((w) =>
            DAG_LABELS.map((_, di) => {
              const cel = cellMap.get(`${a.id}|${w.week_nr}|${di}`);
              const isLastOfWeek = di === 4;
              const endCls = isLastOfWeek ? " end-wk" : "";
              if (!cel) return `<td class="cell empty-cell${endCls}"></td>`;
              const colorEntry = cel.kleur_code ? COLOR_MAP[cel.kleur_code] : null;
              const bg = colorEntry?.hex ?? "#cbd5e1";
              const fg = readableTextColor(bg);
              let label = "";
              if (monteurWeergave !== "geen" && cel.monteur_ids.length > 0) {
                const namen = cel.monteur_ids
                  .map((id) => monteurById.get(id)?.naam)
                  .filter((n): n is string => !!n);
                if (monteurWeergave === "initialen") {
                  label = namen.map(initialen).join(" ");
                } else {
                  label = namen.join(", ");
                }
              }
              return `<td class="cell filled${endCls}" style="background:${bg};color:${fg};">${escHtml(label)}</td>`;
            }).join(""),
          )
          .join("");
        bodyRows += `<tr class="row${isFirst ? firstRowClass : ""}">
          ${projectCell}
          <td class="act">${escHtml(a.naam)}</td>
          ${dayCells}
        </tr>`;
      });
    });
  }

  // Legend — vereenvoudigd: 3 categorieën
  const legendItems: Array<{ hex: string; naam: string }> = [
    { hex: "#1d4ed8", naam: "Montage" },
    { hex: "#fdcb35", naam: "Schakelen" },
    { hex: "#65a30d", naam: "Diverse" },
  ];
  const legend = legendItems
    .map(
      (c) =>
        `<div class="lg-item"><span class="lg-dot" style="background:${c.hex}"></span>${escHtml(c.naam)}</div>`,
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
  @page { size: A3 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #ffffff; color: #0b1220;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .wrap { padding: 8px 4px 24px 4px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; margin: 0 4px 8px 4px; }
  h1 { font-size: 18px; margin: 0 0 2px 0; font-weight: 700; letter-spacing: -0.01em; }
  .sub { font-size: 11px; color: #475569; }
  .meta { font-size: 10px; color: #64748b; text-align: right; }
  table.gantt {
    border-collapse: collapse;
    table-layout: fixed;
    width: ${sheetW}px;
    margin: 0 auto;
  }
  table.gantt th, table.gantt td {
    border: 1px solid #cbd5e1;
    padding: 0;
    text-align: center;
    vertical-align: middle;
    font-size: 10px;
    overflow: hidden;
  }
  thead th { background: #f1f5f9; font-weight: 700; color: #0b1220; }
  thead th.proj-h { width: ${COL_PROJECT_W}px; text-align: left; padding: 4px 8px; }
  thead th.act-h { width: ${COL_ACT_W}px; text-align: left; padding: 4px 8px; }
  thead th.wk { padding: 4px 2px; border-bottom: 1px solid #94a3b8; }
  thead th.wk .wk-nr { font-size: 10px; font-weight: 800; }
  thead th.wk .wk-rng { font-size: 9px; color: #475569; font-weight: 500; }
  thead th.dag { width: ${DAG_W}px; padding: 2px 0; background: #f8fafc; }
  thead th.dag .dag-lbl { font-size: 9px; font-weight: 700; }
  thead th.dag .dag-dt  { font-size: 8px;  color: #64748b; font-weight: 500; }
  thead th.dag.end-wk, td.cell.end-wk { border-right: 1.5px solid #475569; }

  td.proj { text-align: left; padding: 4px 8px; vertical-align: top; background: #f8fafc; }
  td.proj .proj-title { font-weight: 700; font-size: 11px; color: #0b1220; line-height: 1.2; }
  td.proj .proj-sub   { font-size: 9px; color: #64748b; margin-top: 2px; }
  td.act { text-align: left; padding: 4px 8px; font-size: 10px; color: #1e293b; background: #ffffff; }
  tr.new-project td { border-top: 2px solid #475569; }

  td.cell { height: ${ROW_H}px; }
  td.cell.empty-cell { background: #ffffff; }
  td.cell.filled {
    font-size: 9px;
    font-weight: 700;
    line-height: 1.05;
    padding: 1px 2px;
    word-break: break-word;
  }
  td.empty {
    padding: 24px; text-align: center; color: #64748b; font-style: italic;
    background: #f8fafc;
  }

  .legend {
    margin: 12px auto 0 auto;
    width: ${sheetW}px;
    display: flex; flex-wrap: wrap; gap: 8px 14px;
    font-size: 9px; color: #334155;
    padding-top: 8px;
    border-top: 1px solid #cbd5e1;
  }
  .lg-item { display: inline-flex; align-items: center; gap: 4px; }
  .lg-dot { width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.15); display: inline-block; }

  .toolbar {
    position: sticky; top: 0; z-index: 10;
    background: #fff; border-bottom: 1px solid #e2e8f0;
    padding: 8px 12px;
    display: flex; gap: 8px; align-items: center;
    font-size: 12px;
  }
  .toolbar button {
    background: #0b1220; color: #fff; border: 0; padding: 6px 12px;
    border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px;
  }
  .toolbar button:hover { background: #1e293b; }
  .toolbar .hint { color: #64748b; }
  @media print {
    .toolbar { display: none; }
    .wrap { padding-top: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Afdrukken / opslaan als PDF</button>
    <span class="hint">Tip: kies in de printdialoog "Opslaan als PDF" en A3 liggend voor het beste resultaat.</span>
  </div>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>${escHtml(titel)}</h1>
        <div class="sub">${weken.length} ${weken.length === 1 ? "week" : "weken"} · ${zichtbareProjecten.length} ${zichtbareProjecten.length === 1 ? "project" : "projecten"} · ${monteurWeergaveLabel}</div>
      </div>
      <div class="meta">Gegenereerd op ${new Date().toLocaleString("nl-NL")}</div>
    </div>
    <table class="gantt">
      <thead>
        <tr>
          <th rowspan="2" class="proj-h">Project</th>
          <th rowspan="2" class="act-h">Activiteit</th>
          ${weekHeader}
        </tr>
        <tr>${dagHeader}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="legend">${legend}</div>
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
  // Auto-trigger print na korte vertraging zodat de browser klaar is met layout
  setTimeout(() => {
    try {
      w.focus();
      w.print();
    } catch {
      /* gebruiker kan de knop in de toolbar gebruiken */
    }
  }, 400);
}
