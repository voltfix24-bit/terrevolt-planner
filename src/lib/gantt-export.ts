/** Client-safe, explicitly paginated Gantt print export. */
import { COLOR_CODES, COLOR_MAP, DAG_LABELS, getMondayOfWeek, initialen } from "./planning-types";

export type GanttMonteurWeergave = "geen" | "initialen" | "namen";
export type GanttExportMode = "opdrachtgever" | "intern";
export type GanttPrintLayout = "detail" | "standaard" | "compact";

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
  opdrachtgever_id: string | null;
  opdrachtgever_naam: string | null;
}

export interface GanttActiviteit {
  id: string;
  project_id: string;
  naam: string;
  positie: number | null;
}

export interface GanttMonteur { id: string; naam: string }
export interface GanttWeek { week_nr: number; jaar: number }

export interface GanttExportInput {
  titel: string;
  weken: GanttWeek[];
  projecten: GanttProject[];
  activiteiten: GanttActiviteit[];
  monteurs: GanttMonteur[];
  cellen: GanttCel[];
  monteurWeergave: GanttMonteurWeergave;
  feestdagen?: Map<string, string>;
  exportMode: GanttExportMode;
  opdrachtgeverId?: string;
  opdrachtgeverNaam?: string;
  printLayout?: GanttPrintLayout;
}

export interface ProjectRowGroup {
  project: GanttProject;
  activiteiten: GanttActiviteit[];
  continued: boolean;
}

export const WEEKS_PER_LAYOUT: Record<GanttPrintLayout, 4 | 6 | 8> = {
  detail: 4,
  standaard: 6,
  compact: 8,
};

export function chunkWeken<T>(items: T[], size: 4 | 6 | 8): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function filterProjectsForExport(
  projects: GanttProject[],
  mode: GanttExportMode,
  opdrachtgeverId?: string,
): GanttProject[] {
  if (mode === "intern") return [...projects];
  if (!opdrachtgeverId) return [];
  return projects.filter((project) => project.opdrachtgever_id === opdrachtgeverId);
}

export function assertClientSafeExport(projects: GanttProject[], opdrachtgeverId?: string): void {
  if (!opdrachtgeverId) throw new Error("Kies eerst een opdrachtgever");
  if (projects.length === 0) throw new Error("Selecteer minimaal één project van deze opdrachtgever");
  const unsafe = projects.some(
    (project) => !project.opdrachtgever_id || project.opdrachtgever_id !== opdrachtgeverId,
  );
  if (unsafe) {
    throw new Error("Export geblokkeerd: de selectie bevat een project van een andere of onbekende opdrachtgever");
  }
}

export function groupProjectsByOpdrachtgever(projects: GanttProject[]): Array<{
  opdrachtgever: string;
  projects: GanttProject[];
}> {
  const groups = new Map<string, GanttProject[]>();
  for (const project of projects) {
    const label = project.opdrachtgever_naam?.trim() || "Geen opdrachtgever";
    const current = groups.get(label) ?? [];
    current.push(project);
    groups.set(label, current);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === "Geen opdrachtgever") return 1;
      if (b === "Geen opdrachtgever") return -1;
      return a.localeCompare(b, "nl");
    })
    .map(([opdrachtgever, groupedProjects]) => ({ opdrachtgever, projects: groupedProjects }));
}

/** Project header costs one row; a project header always stays with its first activity. */
export function paginateProjectRows(
  projects: GanttProject[],
  activities: GanttActiviteit[],
  rowBudget = 16,
): ProjectRowGroup[][] {
  if (rowBudget < 2) throw new Error("Row budget moet minimaal 2 zijn");
  const activitiesByProject = new Map<string, GanttActiviteit[]>();
  for (const activity of activities) {
    const list = activitiesByProject.get(activity.project_id) ?? [];
    list.push(activity);
    activitiesByProject.set(activity.project_id, list);
  }
  activitiesByProject.forEach((list) => list.sort((a, b) => (a.positie ?? 0) - (b.positie ?? 0)));

  const pages: ProjectRowGroup[][] = [];
  let page: ProjectRowGroup[] = [];
  let remaining = rowBudget;
  const flush = () => {
    if (page.length > 0) pages.push(page);
    page = [];
    remaining = rowBudget;
  };

  for (const project of projects) {
    const projectActivities = activitiesByProject.get(project.id) ?? [];
    if (projectActivities.length === 0) continue;
    const fullCost = 1 + projectActivities.length;
    if (fullCost <= remaining) {
      page.push({ project, activiteiten: projectActivities, continued: false });
      remaining -= fullCost;
      continue;
    }
    if (fullCost <= rowBudget) {
      flush();
      page.push({ project, activiteiten: projectActivities, continued: false });
      remaining -= fullCost;
      continue;
    }

    let cursor = 0;
    let continued = false;
    while (cursor < projectActivities.length) {
      if (remaining < 2) flush();
      const take = Math.min(remaining - 1, projectActivities.length - cursor);
      page.push({
        project,
        activiteiten: projectActivities.slice(cursor, cursor + take),
        continued,
      });
      remaining -= 1 + take;
      cursor += take;
      continued = true;
      if (cursor < projectActivities.length) flush();
    }
  }
  flush();
  return pages;
}

const esc = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

const ymd = (date: Date): string => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, "0"),
  String(date.getDate()).padStart(2, "0"),
].join("-");

const shortDate = (date: Date): string =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;

const projectLabel = (project: GanttProject): string =>
  [project.case_nummer, project.station_naam, project.wv_naam].filter(Boolean).slice(0, 2).join(" — ") || "Onbekend project";

function readableTextColor(hex: string): string {
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "#111827";
  const [r, g, b] = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)].map((part) => parseInt(part, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#111827" : "#ffffff";
}

function renderPageHeader(
  input: GanttExportInput,
  weeks: GanttWeek[],
  projectCount: number,
  legend: string,
): string {
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const start = getMondayOfWeek(first.week_nr, first.jaar);
  const end = new Date(getMondayOfWeek(last.week_nr, last.jaar));
  end.setDate(end.getDate() + 4);
  const audience = input.exportMode === "opdrachtgever"
    ? esc(input.opdrachtgeverNaam ?? "Opdrachtgever")
    : "Intern planningsoverzicht";
  return `<header class="doc-head">
    <div class="brand"><span class="brand-mark"></span><div><strong>TERREVOLT</strong><small>Projectplanning</small></div></div>
    <div class="doc-title"><h1>${esc(input.titel)}</h1><strong>${audience}</strong></div>
    <div class="doc-meta"><b>${shortDate(start)}–${shortDate(end)}</b><span>Week ${first.week_nr}–${last.week_nr}</span><span>Gegenereerd ${new Date().toLocaleDateString("nl-NL")}</span></div>
    <div class="summary">${projectCount} ${projectCount === 1 ? "project" : "projecten"} · A3 liggend</div>
    <div class="legend"><b>Status</b>${legend}</div>
  </header>`;
}

function usedLegend(cells: GanttCel[], weeks: GanttWeek[], holidays: Map<string, string>): string {
  const weekSet = new Set(weeks.map((week) => week.week_nr));
  const used = new Set(cells.filter((cell) => weekSet.has(cell.week_nr)).map((cell) => cell.kleur_code).filter(Boolean));
  const items = COLOR_CODES.filter((code) => used.has(code)).map((code) =>
    `<span><i style="--swatch:${COLOR_MAP[code].hex}"></i>${esc(COLOR_MAP[code].naam)}</span>`,
  );
  const hasHoliday = weeks.some((week) => {
    const monday = getMondayOfWeek(week.week_nr, week.jaar);
    return DAG_LABELS.some((_, index) => {
      const day = new Date(monday); day.setDate(day.getDate() + index);
      return holidays.has(ymd(day));
    });
  });
  if (hasHoliday) items.push(`<span><i class="holiday-swatch"></i>Feestdag</span>`);
  return items.join("");
}

function renderTable(
  input: GanttExportInput,
  weeks: GanttWeek[],
  rowGroups: ProjectRowGroup[],
  cellMap: Map<string, GanttCel>,
  monteurById: Map<string, GanttMonteur>,
): { table: string; monteurs: Set<string> } {
  const pageMonteurs = new Set<string>();
  const weekHeader = weeks.map((week) => `<th colspan="5" class="week">WEEK ${week.week_nr}</th>`).join("");
  const dayHeader = weeks.map((week) => {
    const monday = getMondayOfWeek(week.week_nr, week.jaar);
    return DAG_LABELS.map((day, index) => {
      const date = new Date(monday); date.setDate(date.getDate() + index);
      const holiday = input.feestdagen?.get(ymd(date));
      return `<th class="day ${index === 0 ? "week-start" : ""} ${index === 4 ? "week-end" : ""} ${holiday ? "holiday" : ""}">${day}<small>${shortDate(date)}</small></th>`;
    }).join("");
  }).join("");

  let previousCustomer = "";
  const body = rowGroups.map((group) => {
    const customer = group.project.opdrachtgever_naam?.trim() || "Geen opdrachtgever";
    const customerRow = input.exportMode === "intern" && customer !== previousCustomer
      ? `<tr class="customer-row"><td colspan="${1 + weeks.length * 5}">Opdrachtgever · ${esc(customer)}</td></tr>`
      : "";
    previousCustomer = customer;
    const header = `<tr class="project-row"><td>${esc(projectLabel(group.project))}${group.continued ? " <small>(vervolg)</small>" : ""}</td><td colspan="${weeks.length * 5}"><span>${esc(customer)}</span></td></tr>`;
    const activities = group.activiteiten.map((activity) => {
      const days = weeks.map((week) => DAG_LABELS.map((_, dayIndex) => {
        const date = getMondayOfWeek(week.week_nr, week.jaar); date.setDate(date.getDate() + dayIndex);
        const holiday = input.feestdagen?.has(ymd(date));
        const cell = cellMap.get(`${activity.id}|${week.week_nr}|${dayIndex}`);
        if (!cell) return `<td class="slot ${dayIndex === 0 ? "week-start" : ""} ${dayIndex === 4 ? "week-end" : ""} ${holiday ? "holiday" : ""}"></td>`;
        const color = cell.kleur_code && COLOR_MAP[cell.kleur_code] ? COLOR_MAP[cell.kleur_code].hex : "#94a3b8";
        const names = cell.monteur_ids.map((id) => monteurById.get(id)?.naam).filter((name): name is string => Boolean(name));
        names.forEach((name) => pageMonteurs.add(name));
        const label = input.monteurWeergave === "geen" ? "" : names.map(initialen).join(" ");
        return `<td class="slot ${dayIndex === 0 ? "week-start" : ""} ${dayIndex === 4 ? "week-end" : ""} ${holiday ? "holiday" : ""}"><span class="work" style="--work:${color};--work-fg:${readableTextColor(color)}">${esc(label)}</span></td>`;
      }).join("")).join("");
      return `<tr class="activity-row"><td>${esc(activity.naam)}</td>${days}</tr>`;
    }).join("");
    return customerRow + header + activities;
  }).join("");
  return {
    table: `<table class="gantt"><thead><tr><th rowspan="2" class="label">Project &amp; activiteit</th>${weekHeader}</tr><tr>${dayHeader}</tr></thead><tbody>${body}</tbody></table>`,
    monteurs: pageMonteurs,
  };
}

export function buildGanttHtml(input: GanttExportInput): string {
  if (input.weken.length === 0) throw new Error("Geen weken geselecteerd");
  if (input.projecten.length === 0) throw new Error("Selecteer minimaal één project");
  if (input.exportMode === "opdrachtgever") assertClientSafeExport(input.projecten, input.opdrachtgeverId);

  const layout = input.printLayout ?? "standaard";
  const orderedProjects = input.exportMode === "intern"
    ? groupProjectsByOpdrachtgever(input.projecten).flatMap((group) => group.projects)
    : input.projecten;
  const visibleProjectIds = new Set(input.cellen.map((cell) => cell.project_id));
  const printableProjects = orderedProjects.filter((project) => visibleProjectIds.has(project.id));
  if (printableProjects.length === 0) throw new Error("Geen geplande activiteiten in deze selectie");
  const printableIds = new Set(printableProjects.map((project) => project.id));
  const plannedActivityIds = new Set(input.cellen.map((cell) => cell.activiteit_id));
  const printableActivities = input.activiteiten.filter(
    (activity) => printableIds.has(activity.project_id) && plannedActivityIds.has(activity.id),
  );
  const rowPages = paginateProjectRows(printableProjects, printableActivities, 24);
  const weekPages = chunkWeken(input.weken, WEEKS_PER_LAYOUT[layout]);
  const cellMap = new Map(input.cellen.map((cell) => [`${cell.activiteit_id}|${cell.week_nr}|${cell.dag_index}`, cell]));
  const monteurById = new Map(input.monteurs.map((monteur) => [monteur.id, monteur]));
  const holidays = input.feestdagen ?? new Map<string, string>();
  const pages: Array<{ weeks: GanttWeek[]; rows: ProjectRowGroup[] }> = [];
  for (const weeks of weekPages) for (const rows of rowPages) pages.push({ weeks, rows });
  const ref = `${input.exportMode === "intern" ? "INT" : "KLANT"}-${input.weken[0].jaar}-W${input.weken[0].week_nr}-W${input.weken[input.weken.length - 1].week_nr}`;

  const pageHtml = pages.map((page, index) => {
    const { table, monteurs: pageMonteurs } = renderTable(input, page.weeks, page.rows, cellMap, monteurById);
    const names = input.monteurWeergave === "namen"
      ? [...pageMonteurs].sort((a, b) => a.localeCompare(b, "nl")).map((name) => `<span><b>${esc(initialen(name))}</b> ${esc(name)}</span>`).join("")
      : "";
    return `<section class="print-page">
      ${renderPageHeader(input, page.weeks, printableProjects.length, usedLegend(input.cellen, page.weeks, holidays))}
      ${table}
      ${names ? `<aside class="people"><strong>Monteurs</strong>${names}</aside>` : ""}
      <footer><span>${input.exportMode === "intern" ? "Intern gebruik" : `Voor ${esc(input.opdrachtgeverNaam ?? "opdrachtgever")}`}</span><span>Ref ${esc(ref)}</span><b>Pagina ${index + 1} / ${pages.length}</b></footer>
    </section>`;
  }).join("");

  const dayWidth = layout === "detail" ? 42 : layout === "standaard" ? 31 : 24;
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(input.titel)}</title><style>
    @page{size:A3 landscape;margin:9mm}*{box-sizing:border-box}html,body{margin:0;background:#e8ebef;color:#18202a;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.toolbar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:10px 16px;background:#fff;border-bottom:1px solid #ccd3db}.toolbar button{border:0;border-radius:4px;padding:8px 14px;background:#166534;color:#fff;font-weight:700;cursor:pointer}.toolbar span{color:#586574}.print-page{width:396mm;min-height:279mm;margin:16px auto;padding:9mm;background:#fff;display:flex;flex-direction:column;page-break-after:always;break-after:page}.print-page:last-child{page-break-after:auto}.doc-head{display:grid;grid-template-columns:180px 1fr 220px;gap:8px 18px;align-items:end;border-bottom:2px solid #166534;padding-bottom:8px;margin-bottom:8px}.brand{display:flex;gap:9px;align-items:center}.brand-mark{width:24px;height:24px;border-radius:3px;background:#166534;border:4px solid #d9eadf}.brand strong{display:block;letter-spacing:.08em}.brand small{display:block;color:#66717d}.doc-title{text-align:center}.doc-title h1{font-size:17px;margin:0 0 2px}.doc-title strong{font-size:11px;color:#166534}.doc-meta{text-align:right;display:flex;flex-direction:column;font-size:10px}.summary{font-size:9px;color:#66717d}.legend{grid-column:2/4;display:flex;align-items:center;justify-content:flex-end;gap:9px;font-size:8px;flex-wrap:wrap}.legend span{display:inline-flex;align-items:center;gap:3px}.legend i{width:9px;height:9px;border:1px solid #374151;background:var(--swatch);display:inline-block}.holiday-swatch{background:repeating-linear-gradient(45deg,#a3aab4,#a3aab4 2px,#fff 2px,#fff 4px)!important}.gantt{width:auto;max-width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}.gantt th,.gantt td{border:1px solid #c9d0d8;text-align:center;padding:0;height:25px}.gantt .label{width:285px;min-width:285px;text-align:left;padding:7px 10px;text-transform:uppercase;letter-spacing:.06em}.week{height:23px;background:#dce8df;color:#123b21;letter-spacing:.08em}.day{width:${dayWidth}px;min-width:${dayWidth}px;background:#f0f3f5;font-size:8px}.day small{display:block;font-size:7px;font-weight:400;color:#596572;margin-top:2px}.week-start{border-left:2px solid #66717d!important}.week-end{border-right:2px solid #66717d!important}.holiday{background:repeating-linear-gradient(45deg,#edf0f2,#edf0f2 3px,#fff 3px,#fff 6px)}.customer-row td{text-align:left;height:20px;padding:3px 8px;background:#27313b;color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.project-row td{height:23px;background:#e9eef1;border-top:2px solid #166534;text-align:left;padding:4px 8px;font-weight:700}.project-row td+td{text-align:right;color:#586574;font-size:8px;font-weight:600}.project-row small{font-weight:400;color:#66717d}.activity-row td:first-child{text-align:left;padding:4px 8px 4px 18px;white-space:normal;line-height:1.15}.slot{width:${dayWidth}px;min-width:${dayWidth}px;padding:2px!important}.work{display:flex;width:100%;height:20px;align-items:center;justify-content:center;overflow:hidden;background:var(--work);color:var(--work-fg);font-size:7px;font-weight:700;border:1px solid #374151;background-image:repeating-linear-gradient(135deg,transparent,transparent 7px,rgba(255,255,255,.16) 7px,rgba(255,255,255,.16) 9px)}.people{display:flex;gap:8px 16px;flex-wrap:wrap;border-top:1px solid #ccd3db;margin-top:8px;padding-top:6px;font-size:8px}.people>strong{text-transform:uppercase;letter-spacing:.07em}.people span b{margin-right:3px;color:#166534}footer{margin-top:auto;padding-top:7px;border-top:1px solid #ccd3db;display:flex;justify-content:space-between;font-size:8px;color:#66717d}footer b{color:#27313b}@media print{html,body{background:#fff}.toolbar{display:none}.print-page{margin:0;padding:0;width:auto;min-height:260mm}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Afdrukken / opslaan als PDF</button><span>A3 liggend · browser-schaal 100%</span></div>${pageHtml}</body></html>`;
}

export function exportGanttPDF(input: GanttExportInput): void {
  const html = buildGanttHtml(input);
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Pop-up werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
}