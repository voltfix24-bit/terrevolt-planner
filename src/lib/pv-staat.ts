/**
 * PV-staat (productieverantwoording) per week: medewerker × dag × uren × tarief.
 * Alleen voor opdrachtgevers met pv_staat = true. Zelfde huisstijl als het mandagenregister.
 */
import { TERREVOLT_ICON_DATA_URI } from "@/lib/brand-assets";
import { opdrachtgeverBlockLines, type OpdrachtgeverGegevens } from "@/lib/mandagenregister-pdf";

export interface PvBronRegel {
  monteur_id: string;
  naam: string;
  datum: string; // YYYY-MM-DD
  uren: number;
  locatie?: string | null;
  opmerking?: string | null;
}

export interface PvDagRegel {
  monteur_id: string;
  datum: string;
  omschrijving: string | null;
  case_nummer: string | null;
  uitvoerder: string | null;
  uren: number;
  overuren: number;
  niet_doorgegaan: boolean;
  positie: number;
}

/** Omschrijving van een klus op de PV-staat: "Locatie - Case 0337541 - uitvoerder Anatole". */
export function pvKlusLabel(r: Pick<PvDagRegel, "omschrijving" | "case_nummer" | "uitvoerder">): string {
  return [r.omschrijving?.trim(), r.case_nummer?.trim() ? `Case ${r.case_nummer.trim()}` : null, r.uitvoerder?.trim() ? `uitvoerder ${r.uitvoerder.trim()}` : null]
    .filter(Boolean).join(" - ");
}

/** Geplande monteurdagen; heeft een monteurdag eigen klussen, dan vervangen die de geplande dag (uren + overuren per klus). */
export function buildPvBron(gepland: PvBronRegel[], klussen: PvDagRegel[]): PvBronRegel[] {
  const perDag = new Map<string, PvDagRegel[]>();
  for (const k of klussen) {
    const key = `${k.monteur_id}|${k.datum}`;
    perDag.set(key, [...(perDag.get(key) ?? []), k]);
  }
  const out: PvBronRegel[] = [];
  for (const g of gepland) {
    const ks = perDag.get(`${g.monteur_id}|${g.datum}`);
    if (!ks?.length) { out.push(g); continue; }
    for (const k of [...ks].sort((a, b) => a.positie - b.positie)) {
      out.push({
        monteur_id: g.monteur_id, naam: g.naam, datum: g.datum,
        uren: (Number(k.uren) || 0) + (Number(k.overuren) || 0),
        locatie: pvKlusLabel(k) || null,
        opmerking: [Number(k.overuren) > 0 ? `incl. ${Number(k.overuren)} uur overwerk` : null, k.niet_doorgegaan ? "niet doorgegaan" : null].filter(Boolean).join(", ") || null,
      });
    }
  }
  return out;
}

export interface PvRegel extends PvBronRegel {
  tarief: number;
  totaal: number;
}

export interface PvWeek {
  key: string; // 2026-W35
  weekNr: number;
  regels: PvRegel[];
  uren: number;
  totaal: number;
}

export function isoWeekKey(datum: string): { key: string; weekNr: number } {
  const [y, m, d] = datum.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNr = Math.ceil(((+t - +yStart) / 86400000 + 1) / 7);
  return { key: `${t.getUTCFullYear()}-W${String(weekNr).padStart(2, "0")}`, weekNr };
}

/** Groepeert dagregels per ISO-week, sorteert op datum dan naam, en rekent uren × tarief. Dagen zonder uren vallen weg. */
export function buildPvWeken(bron: PvBronRegel[], standaardTarief: number, tarieven?: Record<string, number | null | undefined>): PvWeek[] {
  const map = new Map<string, PvWeek>();
  const sorted = [...bron]
    .filter((r) => r.uren > 0)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.naam.localeCompare(b.naam, "nl"));
  for (const r of sorted) {
    const { key, weekNr } = isoWeekKey(r.datum);
    const w = map.get(key) ?? { key, weekNr, regels: [], uren: 0, totaal: 0 };
    const eigen = tarieven?.[r.monteur_id];
    const tarief = eigen != null && eigen > 0 ? eigen : standaardTarief;
    const totaal = Math.round(r.uren * tarief * 100) / 100;
    w.regels.push({ ...r, tarief, totaal });
    w.uren += r.uren;
    w.totaal = Math.round((w.totaal + totaal) * 100) / 100;
    map.set(key, w);
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export const fmtEuro = (n: number): string =>
  "€ " + n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s: string | null | undefined) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const fmtLangeDatum = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  const s = d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export interface PvStaatInput {
  project: { case_nummer: string | null; station_naam: string | null; locatie: string | null; opdrachtgever: string | null; opdrachtgeverGegevens?: OpdrachtgeverGegevens | null };
  wbs: string;
  tarief: number;
  tarieven?: Record<string, number | null | undefined>;
  bron: PvBronRegel[];
  datum?: Date;
}

export function buildPvStaatHtml(input: PvStaatInput): string {
  const { project, wbs, tarief, tarieven, bron } = input;
  const weken = buildPvWeken(bron, tarief, tarieven);
  const og = opdrachtgeverBlockLines(project.opdrachtgever, project.opdrachtgeverGegevens);
  const projectLabel = [project.case_nummer, project.station_naam].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" - ");
  const vandaag = (input.datum ?? new Date()).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

  const pages = weken.map((w) => `
  <section class="page">
    <header class="doc-top">
      <div>
        <h1>PV-staat</h1>
        <div class="project-line">Project ${esc(projectLabel || "-")} · Week ${w.weekNr}</div>
      </div>
      <div class="logo"><img src="${TERREVOLT_ICON_DATA_URI}" alt="TerreVolt" /><div><strong>TERREVOLT</strong><small>Projectplanning</small></div></div>
    </header>
    <section class="parties">
      <div>
        <b>${esc(og.titel)}</b>${og.regels.map((r) => `<span>${esc(r)}</span>`).join("")}
        <span class="muted">Opdrachtgever</span>
      </div>
      <div class="meta">
        <span>Datum</span><span>${esc(vandaag)}</span>
        <span>Project</span><span>${esc(projectLabel || "-")}</span>
        <span>WBS-nummer</span><span>${esc(wbs.trim() || "-")}</span>
        <span>Weeknummer</span><span>Week ${w.weekNr}</span>
      </div>
      <div class="right">
        <b>TerreVolt B.V.</b><span>Overvliet 97</span><span>3545 NH Utrecht</span><span>info@terrevolt.nl</span><span>KvK: 98495976</span><span>BTW: NL868519522B01</span>
      </div>
    </section>
    <table>
      <thead><tr><th>Medewerker</th><th>Datum</th><th>Locatie</th><th class="r">Uren</th><th class="r">Tarief p/u</th><th class="r">Totaal</th></tr></thead>
      <tbody>${w.regels.map((r) => `<tr><td>${esc(r.naam)}</td><td>${esc(fmtLangeDatum(r.datum))}</td><td>${esc(r.locatie || project.locatie || "-")}${r.opmerking ? ` <span class="opm">(${esc(r.opmerking)})</span>` : ""}</td><td class="r">${r.uren} uur</td><td class="r">${fmtEuro(r.tarief)}</td><td class="r">${fmtEuro(r.totaal)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Totaal excl. btw</td><td class="r">${w.uren} uur</td><td></td><td class="r">${fmtEuro(w.totaal)}</td></tr></tfoot>
    </table>
  </section>`).join("");

  return `<!doctype html><html lang="nl"><head><meta charset="utf-8" /><title>PV-staat - ${esc(projectLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #111; font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10px; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #e5e5e5; background: #fff; }
  .toolbar button { border: 0; border-radius: 4px; background: #111; color: #fff; padding: 7px 14px; font-weight: 700; cursor: pointer; }
  .page { padding: 24px 28px; max-width: 1200px; margin: 0 auto; }
  .page + .page { break-before: page; page-break-before: always; }
  .doc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .doc-top h1 { margin: 0; font-size: 32px; font-weight: 700; }
  .project-line { font-size: 15px; font-weight: 700; margin-top: 4px; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo img { height: 46px; width: auto; object-fit: contain; }
  .logo strong { font-size: 16px; letter-spacing: .04em; display: block; }
  .logo small { color: #666; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; }
  .parties { display: grid; grid-template-columns: 1fr auto 1fr; gap: 40px; margin-bottom: 24px; }
  .parties > div > * { display: block; }
  .parties .right { text-align: right; }
  .parties .muted { color: #555; margin-top: 4px; }
  .meta { display: grid !important; grid-template-columns: 110px 220px; gap: 2px 0; align-content: start; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-weight: 600; border-top: 1px solid #111; border-bottom: 1px solid #111; }
  .opm { color: #666; font-style: italic; }
  tbody td { border-bottom: 1px solid #eee; }
  tr { break-inside: avoid; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { font-weight: 700; font-size: 12px; border-top: 1px solid #111; border-bottom: 1px solid #111; }
  @media print { .toolbar { display: none; } .page { padding: 0; max-width: none; } }
</style></head><body>
<div class="toolbar"><button onclick="window.print()">Afdrukken / opslaan als PDF</button><span>A4 liggend · elke week op een eigen pagina</span></div>
${pages || '<section class="page"><p>Geen uren in deze periode.</p></section>'}
</body></html>`;
}

export function exportPvStaat(input: PvStaatInput): void {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Pop-up werd geblokkeerd. Sta pop-ups toe en probeer opnieuw.");
  w.document.open();
  w.document.write(buildPvStaatHtml(input));
  w.document.close();
  w.focus();
}
