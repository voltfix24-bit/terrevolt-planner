/**
 * Gedeelde helpers voor de download-knoppen in de overzichten:
 *  - Capaciteit-tijdlijn (monteurs × dagen)
 *  - Projecten-overzicht (klussen-lijst)
 *  - Gecombineerd totaal-overzicht
 *
 * Alle Excel-exports gebruiken `xlsx-js-style` voor cel-styling (kleuren,
 * borders, fonts). PDF-exports openen een nieuwe browser-tab met een
 * print-vriendelijk licht thema en triggeren `window.print()`.
 */

import { toast } from "sonner";

/* ----------------------------- xlsx loader ----------------------------- */

let sheetJsPromise: Promise<any> | null = null;
export function loadSheetJS(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as unknown as { XLSX?: any };
  if (w.XLSX) return Promise.resolve(w.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    s.onload = () => {
      const xw = window as unknown as { XLSX?: any };
      if (xw.XLSX) resolve(xw.XLSX);
      else reject(new Error("XLSX not available"));
    };
    s.onerror = () => reject(new Error("Failed to load SheetJS"));
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

export const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const openPrintWindow = (html: string): void => {
  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) {
    toast.error("Sta pop-ups toe om de PDF te genereren");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
};

const BORDER = {
  top: { style: "thin", color: { rgb: "BFBFBF" } },
  bottom: { style: "thin", color: { rgb: "BFBFBF" } },
  left: { style: "thin", color: { rgb: "BFBFBF" } },
  right: { style: "thin", color: { rgb: "BFBFBF" } },
};

const setStyle = (XLSX: any, ws: any, r: number, c: number, style: any) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!ws[ref]) ws[ref] = { t: "s", v: "" };
  ws[ref].s = { ...(ws[ref].s ?? {}), ...style };
};

/* Gemeenschappelijke print-styles voor PDF (licht thema, hoog contrast) */
const PRINT_STYLES = `
  @page { size: A3 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 18px 0 6px; color: #111; }
  .meta { font-size: 12px; color: #374151; margin-bottom: 12px; }
  .meta strong { color: #111; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
  th, td { border: 1px solid #9ca3af; padding: 4px 6px; text-align: left; vertical-align: middle; }
  thead th { background: #1f2937; color: #fff; font-weight: 700; font-size: 11px; }
  thead th.dag { background: #e5e7eb; color: #111; text-align: center; font-size: 10px; }
  td.center { text-align: center; }
  td.cap-vol { background: #ef4444; color: #fff; font-weight: 700; text-align: center; }
  td.cap-deels { background: #fde68a; color: #111; font-weight: 700; text-align: center; }
  td.cap-vrij { background: #fff; color: #111; text-align: center; }
  td.cap-weekend { background: #f3f4f6; color: #6b7280; text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700; }
  .b-concept { background: #e5e7eb; color: #374151; }
  .b-gepland { background: #fde68a; color: #92400e; }
  .b-uitvoering { background: #bbf7d0; color: #14532d; }
  .b-afgerond { background: #cbd5e1; color: #1e293b; }
  .section { page-break-inside: avoid; margin-top: 18px; }
  @media print { body { padding: 0; } }
`;

/* ===================== Capaciteit ===================== */

export interface CapaciteitDay {
  date: Date;
  isWeekend?: boolean;
}
export interface CapaciteitMonteur {
  id: string;
  naam: string;
  type: "schakelmonteur" | "montagemonteur";
}
export interface CapaciteitInput {
  titel: string; // bv "Capaciteit week 12 — 4 weken"
  monteurs: CapaciteitMonteur[];
  /** Geordende dag-kolommen */
  days: { date: Date; weekNr: number; dayIdx: number }[];
  /** monteur_id -> isoKey(date) -> case_nummers */
  bezetting: Record<string, Record<string, string[]>>;
  /** Optioneel: monteur_id -> isoKey(date) -> "vakantie" | "ziek" | "vrije_dag" | "opleiding" | "feestdag" */
  afwezig?: Record<string, Record<string, string>>;
}

const isoKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayLabel = (d: Date) => ["MA", "DI", "WO", "DO", "VR", "ZA", "ZO"][(d.getDay() + 6) % 7];

const formatDM = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

export async function exportCapaciteitExcel(input: CapaciteitInput): Promise<void> {
  try {
    const XLSX: any = await loadSheetJS();
    const aoa: (string | number)[][] = [];

    aoa.push([input.titel]);
    aoa.push([]);

    // Header rij 1: weken
    const weekRow: string[] = ["Monteur", "Type"];
    const dayRow: string[] = ["", ""];
    // Bouw week-mergegroepen op in dezelfde lus
    let prevWeek: number | null = null;
    let weekStart = 2;
    const merges: any[] = [];
    input.days.forEach((d, i) => {
      const col = 2 + i;
      if (prevWeek === null) {
        prevWeek = d.weekNr;
        weekStart = col;
      } else if (d.weekNr !== prevWeek) {
        if (col - 1 > weekStart) {
          merges.push({ s: { r: 2, c: weekStart }, e: { r: 2, c: col - 1 } });
        }
        prevWeek = d.weekNr;
        weekStart = col;
      }
      weekRow.push(`Week ${d.weekNr}`);
      dayRow.push(`${dayLabel(d.date)} ${formatDM(d.date)}`);
      // Sluiten aan het eind
      if (i === input.days.length - 1 && col > weekStart) {
        merges.push({ s: { r: 2, c: weekStart }, e: { r: 2, c: col } });
      }
    });
    aoa.push(weekRow);
    aoa.push(dayRow);

    // Sorteer monteurs: schakelmonteurs eerst
    const sorted = [...input.monteurs].sort((a, b) => {
      if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
      return a.naam.localeCompare(b.naam, "nl");
    });

    const monteurStartRow = aoa.length;
    sorted.forEach((m) => {
      const row: string[] = [
        m.naam,
        m.type === "schakelmonteur" ? "Schakel" : "Montage",
      ];
      input.days.forEach((d) => {
        const key = isoKey(d.date);
        const afw = input.afwezig?.[m.id]?.[key];
        if (afw) {
          row.push(afw === "feestdag" ? "FD" : afw === "vakantie" ? "V" : afw === "ziek" ? "Z" : afw === "opleiding" ? "O" : afw === "vrije_dag" ? "VD" : "—");
          return;
        }
        const cases = input.bezetting[m.id]?.[key] ?? [];
        row.push(cases.join(", "));
      });
      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const totalCols = 2 + input.days.length;
    const cols: { wch: number }[] = [{ wch: 26 }, { wch: 10 }];
    for (let i = 2; i < totalCols; i++) cols.push({ wch: 9 });
    ws["!cols"] = cols;
    ws["!merges"] = merges;
    ws["!freeze"] = { xSplit: 2, ySplit: 4 };
    (ws as any)["!views"] = [{ state: "frozen", xSplit: 2, ySplit: 4 }];

    // Titel
    setStyle(XLSX, ws, 0, 0, { font: { bold: true, sz: 14, color: { rgb: "111111" } } });

    // Week-rij + dag-rij stijl
    for (let c = 0; c < totalCols; c++) {
      setStyle(XLSX, ws, 2, c, {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: BORDER,
      });
      setStyle(XLSX, ws, 3, c, {
        font: { bold: true, sz: 10, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: BORDER,
      });
    }

    // Monteur-rijen kleur: rood = bezet, geel = afwezig, wit = vrij
    sorted.forEach((m, mi) => {
      const r = monteurStartRow + mi;
      setStyle(XLSX, ws, r, 0, {
        font: { bold: true, sz: 11, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
        alignment: { vertical: "center" },
        border: BORDER,
      });
      setStyle(XLSX, ws, r, 1, {
        font: { sz: 10, bold: true, color: { rgb: m.type === "schakelmonteur" ? "92400E" : "1E3A8A" } },
        fill: { patternType: "solid", fgColor: { rgb: m.type === "schakelmonteur" ? "FDE68A" : "DBEAFE" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: BORDER,
      });
      input.days.forEach((d, di) => {
        const c = 2 + di;
        const key = isoKey(d.date);
        const afw = input.afwezig?.[m.id]?.[key];
        const cases = input.bezetting[m.id]?.[key] ?? [];
        let bg = "FFFFFF";
        let fg = "111111";
        if (afw) {
          bg = "FDE68A";
          fg = "92400E";
        } else if (cases.length > 0) {
          bg = "FCA5A5";
          fg = "7F1D1D";
        }
        setStyle(XLSX, ws, r, c, {
          font: { bold: cases.length > 0 || !!afw, sz: 9, color: { rgb: fg } },
          fill: { patternType: "solid", fgColor: { rgb: bg } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: BORDER,
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Capaciteit");
    XLSX.writeFile(wb, `Capaciteit_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    console.error(e);
    toast.error("Excel export mislukt");
  }
}

export function exportCapaciteitPDF(input: CapaciteitInput): void {
  try {
    const sorted = [...input.monteurs].sort((a, b) => {
      if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
      return a.naam.localeCompare(b.naam, "nl");
    });

    // Bouw week-headers
    const weekGroups: { weekNr: number; count: number }[] = [];
    input.days.forEach((d) => {
      const last = weekGroups[weekGroups.length - 1];
      if (last && last.weekNr === d.weekNr) last.count++;
      else weekGroups.push({ weekNr: d.weekNr, count: 1 });
    });
    const weekHeader = weekGroups
      .map((w) => `<th class="dag" colspan="${w.count}">Week ${w.weekNr}</th>`)
      .join("");
    const dayHeader = input.days
      .map((d) => `<th class="dag">${dayLabel(d.date)}<br>${formatDM(d.date)}</th>`)
      .join("");

    const rows = sorted
      .map((m) => {
        const cells = input.days
          .map((d) => {
            const key = isoKey(d.date);
            const afw = input.afwezig?.[m.id]?.[key];
            if (afw) {
              const lbl = afw === "feestdag" ? "FD" : afw === "vakantie" ? "V" : afw === "ziek" ? "Z" : afw === "opleiding" ? "O" : "VD";
              return `<td class="cap-deels" title="${escHtml(afw)}">${lbl}</td>`;
            }
            const cases = input.bezetting[m.id]?.[key] ?? [];
            if (cases.length === 0) return `<td class="cap-vrij"></td>`;
            return `<td class="cap-vol">${escHtml(cases.join(", "))}</td>`;
          })
          .join("");
        const typeBadge = m.type === "schakelmonteur"
          ? `<span class="badge b-gepland">Schakel</span>`
          : `<span class="badge b-uitvoering" style="background:#dbeafe;color:#1e3a8a">Montage</span>`;
        return `<tr><th style="width:160px">${escHtml(m.naam)}</th><td class="center" style="width:90px">${typeBadge}</td>${cells}</tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"/>
<title>${escHtml(input.titel)}</title>
<style>${PRINT_STYLES}</style></head><body>
<h1>${escHtml(input.titel)}</h1>
<div class="meta">Gegenereerd op ${new Date().toLocaleDateString("nl-NL")} — Rood = ingepland op project · Geel = afwezig · Wit = vrij</div>
<table>
  <thead>
    <tr><th rowspan="2" style="width:160px">Monteur</th><th rowspan="2" class="dag" style="width:90px">Type</th>${weekHeader}</tr>
    <tr>${dayHeader}</tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},150);});</script>
</body></html>`;

    openPrintWindow(html);
  } catch (e) {
    console.error(e);
    toast.error("PDF export mislukt");
  }
}

/* ===================== Projecten / Klussen ===================== */

export interface ProjectExportRow {
  case_nummer: string | null;
  station_naam: string | null;
  wv_naam: string | null;
  status: string | null;
  jaar: number | null;
  opdrachtgever: string | null;
  straat: string | null;
  postcode: string | null;
  stad: string | null;
  gemeente: string | null;
  notities: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  afgerond: "Afgerond",
};
const STATUS_BADGE: Record<string, string> = {
  concept: "b-concept",
  gepland: "b-gepland",
  in_uitvoering: "b-uitvoering",
  afgerond: "b-afgerond",
};
const STATUS_BG: Record<string, string> = {
  concept: "E5E7EB",
  gepland: "FDE68A",
  in_uitvoering: "BBF7D0",
  afgerond: "CBD5E1",
};

export async function exportProjectenExcel(rows: ProjectExportRow[], titel = "Projecten-overzicht"): Promise<void> {
  try {
    const XLSX: any = await loadSheetJS();
    const aoa: (string | number)[][] = [];
    aoa.push([titel]);
    aoa.push([]);
    aoa.push([
      "Case", "Station", "WV", "Status", "Jaar", "Opdrachtgever",
      "Straat", "Postcode", "Stad", "Gemeente", "Notities",
    ]);
    rows.forEach((p) => {
      aoa.push([
        p.case_nummer ?? "",
        p.station_naam ?? "",
        p.wv_naam ?? "",
        STATUS_LABEL[p.status ?? "concept"] ?? p.status ?? "",
        p.jaar ?? "",
        p.opdrachtgever ?? "",
        p.straat ?? "",
        p.postcode ?? "",
        p.stad ?? "",
        p.gemeente ?? "",
        p.notities ?? "",
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 6 },
      { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 60 },
    ];
    ws["!freeze"] = { xSplit: 0, ySplit: 3 };
    (ws as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: 3 }];

    setStyle(XLSX, ws, 0, 0, { font: { bold: true, sz: 14, color: { rgb: "111111" } } });

    // Header rij styling
    for (let c = 0; c < 11; c++) {
      setStyle(XLSX, ws, 2, c, {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "left", vertical: "center" },
        border: BORDER,
      });
    }

    rows.forEach((p, ri) => {
      const r = 3 + ri;
      const status = p.status ?? "concept";
      const statusBg = STATUS_BG[status] ?? "E5E7EB";
      for (let c = 0; c < 11; c++) {
        setStyle(XLSX, ws, r, c, {
          font: { sz: 10, color: { rgb: "111111" }, bold: c === 0 },
          alignment: { vertical: "center", wrapText: c === 10 },
          border: BORDER,
        });
      }
      setStyle(XLSX, ws, r, 3, {
        font: { sz: 10, bold: true, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: statusBg } },
        alignment: { horizontal: "center", vertical: "center" },
        border: BORDER,
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projecten");
    XLSX.writeFile(wb, `Projecten_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    console.error(e);
    toast.error("Excel export mislukt");
  }
}

export function exportProjectenPDF(rows: ProjectExportRow[], titel = "Projecten-overzicht"): void {
  try {
    const body = rows
      .map((p) => {
        const st = p.status ?? "concept";
        const badgeClass = STATUS_BADGE[st] ?? "b-concept";
        const adres = [p.straat, [p.postcode, p.stad].filter(Boolean).join(" "), p.gemeente].filter(Boolean).join(", ");
        return `<tr>
          <td style="font-weight:700">${escHtml(p.case_nummer ?? "—")}</td>
          <td>${escHtml(p.station_naam ?? "—")}</td>
          <td>${escHtml(p.wv_naam ?? "—")}</td>
          <td class="center"><span class="badge ${badgeClass}">${escHtml(STATUS_LABEL[st] ?? st)}</span></td>
          <td class="center">${p.jaar ?? "—"}</td>
          <td>${escHtml(p.opdrachtgever ?? "—")}</td>
          <td>${escHtml(adres || "—")}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"/>
<title>${escHtml(titel)}</title>
<style>${PRINT_STYLES}</style></head><body>
<h1>${escHtml(titel)}</h1>
<div class="meta">${rows.length} project${rows.length === 1 ? "" : "en"} — gegenereerd op ${new Date().toLocaleDateString("nl-NL")}</div>
<table>
  <thead><tr>
    <th style="width:90px">Case</th>
    <th style="width:160px">Station</th>
    <th style="width:120px">WV</th>
    <th style="width:90px" class="dag">Status</th>
    <th style="width:50px" class="dag">Jaar</th>
    <th style="width:150px">Opdrachtgever</th>
    <th>Adres</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>
<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},150);});</script>
</body></html>`;

    openPrintWindow(html);
  } catch (e) {
    console.error(e);
    toast.error("PDF export mislukt");
  }
}

/* ===================== Totaal-overzicht ===================== */

export async function exportTotaalExcel(
  capaciteit: CapaciteitInput,
  projecten: ProjectExportRow[]
): Promise<void> {
  try {
    const XLSX: any = await loadSheetJS();
    // Hergebruik de single-sheet generators door één workbook met meerdere
    // sheets te bouwen — eenvoudig: trigger ze als losse files niet, maar
    // bouw inline twee sheets.
    const wb = XLSX.utils.book_new();

    // ---- Sheet 1: Projecten ----
    const projAoa: (string | number)[][] = [];
    projAoa.push(["Projecten-overzicht"]);
    projAoa.push([]);
    projAoa.push(["Case", "Station", "WV", "Status", "Jaar", "Opdrachtgever", "Straat", "Postcode", "Stad", "Gemeente", "Notities"]);
    projecten.forEach((p) => {
      projAoa.push([
        p.case_nummer ?? "", p.station_naam ?? "", p.wv_naam ?? "",
        STATUS_LABEL[p.status ?? "concept"] ?? p.status ?? "",
        p.jaar ?? "", p.opdrachtgever ?? "",
        p.straat ?? "", p.postcode ?? "", p.stad ?? "", p.gemeente ?? "", p.notities ?? "",
      ]);
    });
    const wsProj = XLSX.utils.aoa_to_sheet(projAoa);
    wsProj["!cols"] = [
      { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 6 },
      { wch: 22 }, { wch: 24 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 60 },
    ];
    wsProj["!freeze"] = { xSplit: 0, ySplit: 3 };
    (wsProj as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: 3 }];
    setStyle(XLSX, wsProj, 0, 0, { font: { bold: true, sz: 14, color: { rgb: "111111" } } });
    for (let c = 0; c < 11; c++) {
      setStyle(XLSX, wsProj, 2, c, {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "left", vertical: "center" },
        border: BORDER,
      });
    }
    projecten.forEach((p, ri) => {
      const r = 3 + ri;
      const status = p.status ?? "concept";
      const statusBg = STATUS_BG[status] ?? "E5E7EB";
      for (let c = 0; c < 11; c++) {
        setStyle(XLSX, wsProj, r, c, {
          font: { sz: 10, color: { rgb: "111111" }, bold: c === 0 },
          alignment: { vertical: "center", wrapText: c === 10 },
          border: BORDER,
        });
      }
      setStyle(XLSX, wsProj, r, 3, {
        font: { sz: 10, bold: true, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: statusBg } },
        alignment: { horizontal: "center", vertical: "center" },
        border: BORDER,
      });
    });
    XLSX.utils.book_append_sheet(wb, wsProj, "Projecten");

    // ---- Sheet 2: Capaciteit ----
    const sorted = [...capaciteit.monteurs].sort((a, b) => {
      if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
      return a.naam.localeCompare(b.naam, "nl");
    });
    const capAoa: (string | number)[][] = [];
    capAoa.push([capaciteit.titel]);
    capAoa.push([]);
    const weekRow: string[] = ["Monteur", "Type"];
    const dayRow: string[] = ["", ""];
    let prevWeek: number | null = null;
    let weekStart = 2;
    const merges: any[] = [];
    capaciteit.days.forEach((d, i) => {
      const col = 2 + i;
      if (prevWeek === null) { prevWeek = d.weekNr; weekStart = col; }
      else if (d.weekNr !== prevWeek) {
        if (col - 1 > weekStart) merges.push({ s: { r: 2, c: weekStart }, e: { r: 2, c: col - 1 } });
        prevWeek = d.weekNr; weekStart = col;
      }
      weekRow.push(`Week ${d.weekNr}`);
      dayRow.push(`${dayLabel(d.date)} ${formatDM(d.date)}`);
      if (i === capaciteit.days.length - 1 && col > weekStart) {
        merges.push({ s: { r: 2, c: weekStart }, e: { r: 2, c: col } });
      }
    });
    capAoa.push(weekRow);
    capAoa.push(dayRow);
    const monteurStartRow = capAoa.length;
    sorted.forEach((m) => {
      const row: string[] = [m.naam, m.type === "schakelmonteur" ? "Schakel" : "Montage"];
      capaciteit.days.forEach((d) => {
        const key = isoKey(d.date);
        const afw = capaciteit.afwezig?.[m.id]?.[key];
        if (afw) { row.push(afw === "feestdag" ? "FD" : afw === "vakantie" ? "V" : afw === "ziek" ? "Z" : afw === "opleiding" ? "O" : "VD"); return; }
        row.push((capaciteit.bezetting[m.id]?.[key] ?? []).join(", "));
      });
      capAoa.push(row);
    });
    const wsCap = XLSX.utils.aoa_to_sheet(capAoa);
    const totalCols = 2 + capaciteit.days.length;
    const cols: { wch: number }[] = [{ wch: 26 }, { wch: 10 }];
    for (let i = 2; i < totalCols; i++) cols.push({ wch: 9 });
    wsCap["!cols"] = cols;
    wsCap["!merges"] = merges;
    wsCap["!freeze"] = { xSplit: 2, ySplit: 4 };
    (wsCap as any)["!views"] = [{ state: "frozen", xSplit: 2, ySplit: 4 }];
    setStyle(XLSX, wsCap, 0, 0, { font: { bold: true, sz: 14, color: { rgb: "111111" } } });
    for (let c = 0; c < totalCols; c++) {
      setStyle(XLSX, wsCap, 2, c, {
        font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
        alignment: { horizontal: "center", vertical: "center" }, border: BORDER,
      });
      setStyle(XLSX, wsCap, 3, c, {
        font: { bold: true, sz: 10, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: "E5E7EB" } },
        alignment: { horizontal: "center", vertical: "center" }, border: BORDER,
      });
    }
    sorted.forEach((m, mi) => {
      const r = monteurStartRow + mi;
      setStyle(XLSX, wsCap, r, 0, {
        font: { bold: true, sz: 11, color: { rgb: "111111" } },
        fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
        alignment: { vertical: "center" }, border: BORDER,
      });
      setStyle(XLSX, wsCap, r, 1, {
        font: { sz: 10, bold: true, color: { rgb: m.type === "schakelmonteur" ? "92400E" : "1E3A8A" } },
        fill: { patternType: "solid", fgColor: { rgb: m.type === "schakelmonteur" ? "FDE68A" : "DBEAFE" } },
        alignment: { horizontal: "center", vertical: "center" }, border: BORDER,
      });
      capaciteit.days.forEach((d, di) => {
        const c = 2 + di;
        const key = isoKey(d.date);
        const afw = capaciteit.afwezig?.[m.id]?.[key];
        const cases = capaciteit.bezetting[m.id]?.[key] ?? [];
        let bg = "FFFFFF"; let fg = "111111";
        if (afw) { bg = "FDE68A"; fg = "92400E"; }
        else if (cases.length > 0) { bg = "FCA5A5"; fg = "7F1D1D"; }
        setStyle(XLSX, wsCap, r, c, {
          font: { bold: cases.length > 0 || !!afw, sz: 9, color: { rgb: fg } },
          fill: { patternType: "solid", fgColor: { rgb: bg } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: BORDER,
        });
      });
    });
    XLSX.utils.book_append_sheet(wb, wsCap, "Capaciteit");

    XLSX.writeFile(wb, `Totaal_overzicht_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (e) {
    console.error(e);
    toast.error("Excel export mislukt");
  }
}

export function exportTotaalPDF(
  capaciteit: CapaciteitInput,
  projecten: ProjectExportRow[]
): void {
  try {
    // Projecten sectie
    const projBody = projecten
      .map((p) => {
        const st = p.status ?? "concept";
        const badgeClass = STATUS_BADGE[st] ?? "b-concept";
        const adres = [p.straat, [p.postcode, p.stad].filter(Boolean).join(" "), p.gemeente].filter(Boolean).join(", ");
        return `<tr>
          <td style="font-weight:700">${escHtml(p.case_nummer ?? "—")}</td>
          <td>${escHtml(p.station_naam ?? "—")}</td>
          <td>${escHtml(p.wv_naam ?? "—")}</td>
          <td class="center"><span class="badge ${badgeClass}">${escHtml(STATUS_LABEL[st] ?? st)}</span></td>
          <td class="center">${p.jaar ?? "—"}</td>
          <td>${escHtml(p.opdrachtgever ?? "—")}</td>
          <td>${escHtml(adres || "—")}</td>
        </tr>`;
      })
      .join("");

    // Capaciteit sectie
    const sorted = [...capaciteit.monteurs].sort((a, b) => {
      if (a.type !== b.type) return a.type === "schakelmonteur" ? -1 : 1;
      return a.naam.localeCompare(b.naam, "nl");
    });
    const weekGroups: { weekNr: number; count: number }[] = [];
    capaciteit.days.forEach((d) => {
      const last = weekGroups[weekGroups.length - 1];
      if (last && last.weekNr === d.weekNr) last.count++;
      else weekGroups.push({ weekNr: d.weekNr, count: 1 });
    });
    const weekHeader = weekGroups
      .map((w) => `<th class="dag" colspan="${w.count}">Week ${w.weekNr}</th>`)
      .join("");
    const dayHeader = capaciteit.days
      .map((d) => `<th class="dag">${dayLabel(d.date)}<br>${formatDM(d.date)}</th>`)
      .join("");
    const capRows = sorted
      .map((m) => {
        const cells = capaciteit.days
          .map((d) => {
            const key = isoKey(d.date);
            const afw = capaciteit.afwezig?.[m.id]?.[key];
            if (afw) {
              const lbl = afw === "feestdag" ? "FD" : afw === "vakantie" ? "V" : afw === "ziek" ? "Z" : afw === "opleiding" ? "O" : "VD";
              return `<td class="cap-deels">${lbl}</td>`;
            }
            const cases = capaciteit.bezetting[m.id]?.[key] ?? [];
            if (cases.length === 0) return `<td class="cap-vrij"></td>`;
            return `<td class="cap-vol">${escHtml(cases.join(", "))}</td>`;
          })
          .join("");
        const typeBadge = m.type === "schakelmonteur"
          ? `<span class="badge b-gepland">Schakel</span>`
          : `<span class="badge" style="background:#dbeafe;color:#1e3a8a">Montage</span>`;
        return `<tr><th style="width:160px">${escHtml(m.naam)}</th><td class="center" style="width:90px">${typeBadge}</td>${cells}</tr>`;
      })
      .join("");

    const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"/>
<title>Totaal-overzicht</title>
<style>${PRINT_STYLES}</style></head><body>
<h1>Totaal-overzicht TerreVolt</h1>
<div class="meta">Gegenereerd op ${new Date().toLocaleDateString("nl-NL")}</div>

<div class="section">
  <h2>Projecten (${projecten.length})</h2>
  <table>
    <thead><tr>
      <th style="width:90px">Case</th>
      <th style="width:160px">Station</th>
      <th style="width:120px">WV</th>
      <th style="width:90px" class="dag">Status</th>
      <th style="width:50px" class="dag">Jaar</th>
      <th style="width:150px">Opdrachtgever</th>
      <th>Adres</th>
    </tr></thead>
    <tbody>${projBody}</tbody>
  </table>
</div>

<div class="section" style="page-break-before: always">
  <h2>${escHtml(capaciteit.titel)}</h2>
  <div class="meta">Rood = ingepland · Geel = afwezig · Wit = vrij</div>
  <table>
    <thead>
      <tr><th rowspan="2" style="width:160px">Monteur</th><th rowspan="2" class="dag" style="width:90px">Type</th>${weekHeader}</tr>
      <tr>${dayHeader}</tr>
    </thead>
    <tbody>${capRows}</tbody>
  </table>
</div>

<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},150);});</script>
</body></html>`;

    openPrintWindow(html);
  } catch (e) {
    console.error(e);
    toast.error("PDF export mislukt");
  }
}
