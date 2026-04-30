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

  // Layout consts (px) — bij veel weken automatisch smaller maken zodat alles past
  const totalDays = weken.length * 5;
  // Schaal dagbreedte tussen 30 (weinig weken) en 14 (heel veel weken)
  const DAG_W = weken.length <= 8 ? 30 : weken.length <= 14 ? 24 : weken.length <= 20 ? 19 : 15;
  const COL_PROJECT_W = weken.length <= 14 ? 220 : 170;
  const COL_ACT_W = weken.length <= 14 ? 170 : 130;
  const ROW_H = 26;

  const gridW = totalDays * DAG_W;
  const sheetW = COL_PROJECT_W + COL_ACT_W + gridW;

  // Kies papierformaat: A3 normaal, A2 bij heel brede planningen
  const paperSize = weken.length <= 16 ? "A3" : "A2";
  // Beschikbare breedte op pagina (mm) na marges (12mm aan beide kanten)
  // A3 landscape = 420mm, A2 landscape = 594mm → bruikbaar 396 / 570
  const pageWmm = paperSize === "A3" ? 396 : 570;
  // 1mm ≈ 3.7795px. Schaalfactor zodat tabel altijd binnen pagina past.
  const pagePx = pageWmm * 3.7795;
  const fitScale = sheetW > pagePx ? pagePx / sheetW : 1;

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
              const monday = getMondayOfWeek(w.week_nr, w.jaar);
              const dt = new Date(monday);
              dt.setDate(monday.getDate() + di);
              const feestNaam = feestdagenMap.get(ymd(dt));
              const endCls = isLastOfWeek ? " end-wk" : "";
              const feestCls = feestNaam ? " feestdag" : "";
              const tip = feestNaam ? ` title="Feestdag: ${escHtml(feestNaam)}"` : "";
              if (!cel) return `<td class="cell empty-cell${endCls}${feestCls}"${tip}></td>`;
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
              return `<td class="cell filled${endCls}${feestCls}"${tip} style="background:${bg};color:${fg};">${escHtml(label)}</td>`;
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

  // Legend — vereenvoudigd: 3 categorieën + feestdag indicator
  const legendItems: Array<{ hex: string; naam: string; pattern?: boolean }> = [
    { hex: "#1d4ed8", naam: "Montage" },
    { hex: "#fdcb35", naam: "Schakelen" },
    { hex: "#65a30d", naam: "Diverse" },
    { hex: "#94a3b8", naam: "Feestdag / vrije dag", pattern: true },
  ];
  const legend = legendItems
    .map(
      (c) =>
        `<div class="lg-item"><span class="lg-dot${c.pattern ? " lg-dot-feest" : ""}" style="background:${c.hex}"></span>${escHtml(c.naam)}</div>`,
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
  @page { size: ${paperSize} landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #ffffff; color: #0b1220;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    font-size: 11px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .wrap { padding: 8px 0 24px 0; overflow: hidden; }
  .head {
    display: flex; justify-content: space-between; align-items: flex-end;
    width: ${sheetW}px;
    margin: 0 0 8px 0;
    padding: 0 2px;
  }
  h1 { font-size: 18px; margin: 0 0 2px 0; font-weight: 700; letter-spacing: -0.01em; }
  .sub { font-size: 11px; color: #475569; }
  .meta { font-size: 10px; color: #64748b; text-align: right; }
  .gantt-scale {
    width: ${sheetW}px;
    transform-origin: top left;
    margin: 0 auto;
  }
  /* Schermweergave: standaard fit-to-page zodat preview overeenkomt met print */
  body[data-scale="fit"] .gantt-scale {
    transform: scale(${fitScale.toFixed(4)});
    margin-bottom: ${Math.max(0, (1 - fitScale) * 100)}px;
  }
  body[data-scale="none"] .gantt-scale {
    transform: none;
  }
  body[data-scale="standard"] .gantt-scale {
    transform: scale(${Math.min(1, fitScale * 1.15).toFixed(4)});
    margin-bottom: ${Math.max(0, (1 - Math.min(1, fitScale * 1.15)) * 100)}px;
  }
  @media print {
    body[data-scale="fit"] .gantt-scale {
      transform: scale(${fitScale.toFixed(4)});
      margin-bottom: ${Math.max(0, (1 - fitScale) * 100)}px;
    }
    body[data-scale="none"] .gantt-scale { transform: none; }
    body[data-scale="standard"] .gantt-scale {
      transform: scale(${Math.min(1, fitScale * 1.15).toFixed(4)});
      margin-bottom: ${Math.max(0, (1 - Math.min(1, fitScale * 1.15)) * 100)}px;
    }
  }
  table.gantt {
    border-collapse: collapse;
    table-layout: fixed;
    width: ${sheetW}px;
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

  /* Feestdag / vrije dag — diagonale grijze streep over hele kolom */
  thead th.dag.feestdag-h {
    background: repeating-linear-gradient(
      45deg, #e2e8f0, #e2e8f0 3px, #f1f5f9 3px, #f1f5f9 6px
    );
  }
  thead th.dag .dag-feest {
    font-size: 7px; font-weight: 700; color: #475569;
    margin-top: 1px; line-height: 1; letter-spacing: 0.02em;
  }
  td.cell.feestdag {
    background-image: repeating-linear-gradient(
      45deg, rgba(100,116,139,0.18), rgba(100,116,139,0.18) 3px,
      rgba(148,163,184,0.10) 3px, rgba(148,163,184,0.10) 6px
    );
  }
  /* Wanneer er ook een gevulde activiteit op een feestdag staat: stripes bovenop kleur */
  td.cell.filled.feestdag {
    background-image: repeating-linear-gradient(
      45deg, rgba(0,0,0,0.18), rgba(0,0,0,0.18) 3px,
      rgba(0,0,0,0) 3px, rgba(0,0,0,0) 6px
    );
  }

  .legend {
    margin: 12px 0 0 0;
    width: ${sheetW}px;
    display: flex; flex-wrap: wrap; gap: 8px 14px;
    font-size: 9px; color: #334155;
    padding: 8px 2px 0 2px;
    border-top: 1px solid #cbd5e1;
  }
  .lg-item { display: inline-flex; align-items: center; gap: 4px; }
  .lg-dot { width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgba(0,0,0,0.15); display: inline-block; }
  .lg-dot-feest {
    background-image: repeating-linear-gradient(
      45deg, #94a3b8, #94a3b8 2px, #e2e8f0 2px, #e2e8f0 4px
    ) !important;
  }

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
  .toolbar label { color: #334155; font-weight: 600; }
  .toolbar select {
    border: 1px solid #cbd5e1; background: #fff; color: #0b1220;
    padding: 5px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;
    cursor: pointer;
  }
  .toolbar .hint { color: #64748b; }
  @media print {
    .toolbar { display: none; }
    .wrap { padding-top: 0; }
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
    <span class="hint">Kies in de printdialoog "Opslaan als PDF" en ${paperSize} liggend. Zet de browser-schaling op 100%.</span>
  </div>
  <div class="wrap">
    <div class="head">
      <div>
        <h1>${escHtml(titel)}</h1>
        <div class="sub">${weken.length} ${weken.length === 1 ? "week" : "weken"} · ${zichtbareProjecten.length} ${zichtbareProjecten.length === 1 ? "project" : "projecten"} · ${monteurWeergaveLabel}</div>
      </div>
      <div class="meta"></div>
    </div>
    <div class="gantt-scale">
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
