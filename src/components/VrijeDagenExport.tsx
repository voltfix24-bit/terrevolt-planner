import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const sb = supabase as any;

interface Monteur {
  id: string;
  naam: string;
  type: "schakelmonteur" | "montagemonteur";
  actief: boolean;
  werkdagen?: number[] | null;
}

interface Afwezigheid {
  monteur_id: string;
  datum_van: string;
  datum_tot: string;
  type: string;
}

const DAG_LABELS = ["MA", "DI", "WO", "DO", "VR"] as const;
const DAG_LANG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag"] as const;

// ===== ISO week helpers =====
function getCurrentISOWeek(): { week: number; jaar: number } {
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, jaar: target.getUTCFullYear() };
}

function getMondayOfISOWeek(week: number, jaar: number): Date {
  const simple = new Date(Date.UTC(jaar, 0, 4));
  const dow = (simple.getUTCDay() + 6) % 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + (week - 1) * 7);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekOf(d: Date): { week: number; jaar: number } {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, jaar: target.getUTCFullYear() };
}

function enumerateWeeks(start: { week: number; jaar: number }, end: { week: number; jaar: number }): { week: number; jaar: number }[] {
  const out: { week: number; jaar: number }[] = [];
  let cur = getMondayOfISOWeek(start.week, start.jaar);
  const last = getMondayOfISOWeek(end.week, end.jaar);
  if (last < cur) return out;
  let guard = 0;
  while (cur <= last && guard++ < 520) {
    out.push(isoWeekOf(cur));
    cur = addDays(cur, 7);
  }
  return out;
}

function fmtDatumLang(d: Date): string {
  const dagen = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
  const maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  return `${dagen[d.getUTCDay()]} ${d.getUTCDate()} ${maanden[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function fmtDatumKort(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

interface VrijeDag {
  datum: Date;
  week: number;
  jaar: number;
  dagIndex: number;
}

interface MonteurResultaat {
  monteur: Monteur;
  vrijeDagen: VrijeDag[];
}

export const VrijeDagenExport = ({ monteurs }: { monteurs: Monteur[] }) => {
  const now = getCurrentISOWeek();
  const endInit = isoWeekOf(addDays(getMondayOfISOWeek(now.week, now.jaar), 7 * 7)); // +8 weken

  const [startWeek, setStartWeek] = useState<number>(now.week);
  const [startJaar, setStartJaar] = useState<number>(now.jaar);
  const [endWeek, setEndWeek] = useState<number>(endInit.week);
  const [endJaar, setEndJaar] = useState<number>(endInit.jaar);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(monteurs.filter((m) => m.actief).map((m) => m.id))
  );
  const [busy, setBusy] = useState(false);
  const [resultaten, setResultaten] = useState<MonteurResultaat[] | null>(null);

  const actieveMonteurs = useMemo(() => monteurs.filter((m) => m.actief), [monteurs]);

  const weeks = useMemo(
    () => enumerateWeeks({ week: startWeek, jaar: startJaar }, { week: endWeek, jaar: endJaar }),
    [startWeek, startJaar, endWeek, endJaar]
  );

  const toggle = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = actieveMonteurs.length > 0 && actieveMonteurs.every((m) => selectedIds.has(m.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(actieveMonteurs.map((m) => m.id)));
  };

  const compute = async (): Promise<MonteurResultaat[] | null> => {
    if (selectedIds.size === 0) {
      toast.error("Selecteer minimaal 1 monteur");
      return null;
    }
    if (weeks.length === 0) {
      toast.error("Ongeldige weekrange");
      return null;
    }
    setBusy(true);
    try {
      const ids = Array.from(selectedIds);
      const startDate = getMondayOfISOWeek(startWeek, startJaar);
      const endDate = addDays(getMondayOfISOWeek(endWeek, endJaar), 4); // vrijdag
      const startIso = isoKey(startDate);
      const endIso = isoKey(endDate);
      const jaren = Array.from(new Set(weeks.map((w) => w.jaar)));

      const [afwRes, feestRes, celMonteursRes] = await Promise.all([
        sb.from("monteur_afwezigheid")
          .select("monteur_id,datum_van,datum_tot,type")
          .in("monteur_id", ids)
          .lte("datum_van", endIso)
          .gte("datum_tot", startIso),
        sb.from("feestdagen").select("datum").in("jaar", jaren),
        sb.from("cel_monteurs")
          .select("monteur_id, planning_cellen!inner(dag_index, project_weken!inner(week_nr, projecten!inner(jaar)))")
          .in("monteur_id", ids),
      ]);

      if (afwRes.error) throw afwRes.error;
      if (feestRes.error) throw feestRes.error;
      if (celMonteursRes.error) throw celMonteursRes.error;

      const afwezig = (afwRes.data ?? []) as Afwezigheid[];
      const feestSet = new Set((feestRes.data ?? []).map((f: any) => f.datum as string));

      // key = monteur_id|jaar|week|dagIndex
      const gepland = new Set<string>();
      for (const row of celMonteursRes.data ?? []) {
        const pc = row.planning_cellen;
        if (!pc) continue;
        const pw = pc.project_weken;
        if (!pw) continue;
        const jaar = pw.projecten?.jaar;
        if (!jaar) continue;
        gepland.add(`${row.monteur_id}|${jaar}|${pw.week_nr}|${pc.dag_index}`);
      }

      const out: MonteurResultaat[] = [];
      for (const m of monteurs) {
        if (!selectedIds.has(m.id)) continue;
        const werkdagen = m.werkdagen && m.werkdagen.length ? m.werkdagen : [1, 2, 3, 4, 5];
        const vrij: VrijeDag[] = [];
        for (const w of weeks) {
          const monday = getMondayOfISOWeek(w.week, w.jaar);
          for (let di = 0; di < 5; di++) {
            const werkdagNr = di + 1;
            if (!werkdagen.includes(werkdagNr)) continue;
            const datum = addDays(monday, di);
            const datumIso = isoKey(datum);
            if (feestSet.has(datumIso)) continue;
            const isAfwezig = afwezig.some(
              (a) => a.monteur_id === m.id && datumIso >= a.datum_van && datumIso <= a.datum_tot
            );
            if (isAfwezig) continue;
            if (gepland.has(`${m.id}|${w.jaar}|${w.week}|${di}`)) continue;
            vrij.push({ datum, week: w.week, jaar: w.jaar, dagIndex: di });
          }
        }
        out.push({ monteur: m, vrijeDagen: vrij });
      }
      setResultaten(out);
      return out;
    } catch (e: any) {
      console.error(e);
      toast.error("Berekenen mislukt");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const rangeLabel = `wk ${startWeek}/${startJaar} t/m wk ${endWeek}/${endJaar}`;

  const buildTekst = (data: MonteurResultaat[]): string => {
    const lines: string[] = [];
    lines.push(`Beschikbare dagen — ${rangeLabel}`);
    lines.push("");
    for (const r of data) {
      lines.push(`${r.monteur.naam} (${r.monteur.type === "schakelmonteur" ? "Schakel" : "Montage"}) — ${r.vrijeDagen.length} vrije dag${r.vrijeDagen.length === 1 ? "" : "en"}`);
      if (r.vrijeDagen.length === 0) {
        lines.push("  (geen vrije dagen)");
      } else {
        for (const d of r.vrijeDagen) {
          lines.push(`  • ${DAG_LANG[d.dagIndex]} ${fmtDatumKort(d.datum)} (wk ${d.week})`);
        }
      }
      lines.push("");
    }
    return lines.join("\n");
  };

  const buildCsv = (data: MonteurResultaat[]): string => {
    const rows = [["Monteur", "Type", "Datum", "Dag", "Week", "Jaar"]];
    for (const r of data) {
      if (r.vrijeDagen.length === 0) {
        rows.push([r.monteur.naam, r.monteur.type, "", "", "", ""]);
        continue;
      }
      for (const d of r.vrijeDagen) {
        rows.push([
          r.monteur.naam,
          r.monteur.type,
          fmtDatumKort(d.datum),
          DAG_LANG[d.dagIndex],
          String(d.week),
          String(d.jaar),
        ]);
      }
    }
    return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
  };

  const buildHtml = (data: MonteurResultaat[]): string => {
    const totaal = data.reduce((s, r) => s + r.vrijeDagen.length, 0);
    const blokken = data.map((r) => {
      const rows = r.vrijeDagen.length === 0
        ? `<tr><td colspan="3" style="padding:8px 12px;color:#888;font-style:italic;">Geen vrije dagen in deze periode</td></tr>`
        : r.vrijeDagen.map((d) => `
            <tr>
              <td style="padding:6px 12px;border-bottom:1px solid #eee;">wk ${d.week}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #eee;text-transform:capitalize;">${DAG_LANG[d.dagIndex]}</td>
              <td style="padding:6px 12px;border-bottom:1px solid #eee;">${fmtDatumLang(d.datum)}</td>
            </tr>`).join("");
      return `
        <section style="margin:0 0 28px 0;page-break-inside:avoid;">
          <h2 style="margin:0 0 8px 0;font-size:15px;border-bottom:2px solid #111;padding-bottom:4px;">
            ${r.monteur.naam}
            <span style="font-weight:normal;color:#666;font-size:12px;margin-left:8px;">
              ${r.monteur.type === "schakelmonteur" ? "Schakelmonteur" : "Montagemonteur"} — ${r.vrijeDagen.length} vrije dag${r.vrijeDagen.length === 1 ? "" : "en"}
            </span>
          </h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f5f5f5;text-align:left;">
                <th style="padding:6px 12px;width:80px;">Week</th>
                <th style="padding:6px 12px;width:120px;">Dag</th>
                <th style="padding:6px 12px;">Datum</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    }).join("");

    return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"/>
<title>Beschikbare dagen — ${rangeLabel}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color:#111; margin:0; padding:24px; }
  .head { margin-bottom: 24px; border-bottom: 3px solid #111; padding-bottom: 12px; }
  .head h1 { margin:0 0 4px 0; font-size: 22px; }
  .head .meta { color:#555; font-size: 12px; }
  .toolbar { margin-bottom: 16px; }
  @media print { .toolbar { display:none; } }
  button { background:#111; color:#fff; border:0; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:13px; }
</style>
</head><body>
  <div class="toolbar"><button onclick="window.print()">Afdrukken / opslaan als PDF</button></div>
  <div class="head">
    <h1>Beschikbare dagen monteurs</h1>
    <div class="meta">${rangeLabel} &middot; ${data.length} monteur${data.length === 1 ? "" : "s"} &middot; ${totaal} vrije dag${totaal === 1 ? "" : "en"} totaal &middot; Gegenereerd ${new Date().toLocaleDateString("nl-NL")}</div>
  </div>
  ${blokken}
</body></html>`;
  };

  const onPdf = async () => {
    const data = await compute();
    if (!data) return;
    const html = buildHtml(data);
    const w = window.open("", "_blank");
    if (!w) { toast.error("Pop-up geblokkeerd"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  const onCsv = async () => {
    const data = await compute();
    if (!data) return;
    const csv = "\ufeff" + buildCsv(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vrije-dagen_wk${startWeek}-${startJaar}_wk${endWeek}-${endJaar}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onCopy = async () => {
    const data = await compute();
    if (!data) return;
    const tekst = buildTekst(data);
    try {
      await navigator.clipboard.writeText(tekst);
      toast.success("Gekopieerd naar klembord");
    } catch {
      toast.error("Kopiëren mislukt");
    }
  };

  return (
    <div className="surface-card p-6 space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight">Vrije dagen — uitdraai</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Bekijk en exporteer hoeveel dagen monteurs in een bepaalde periode beschikbaar zijn (geen planning, geen verlof, geen feestdag).
        </p>
      </div>

      {/* Weekrange */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">Van</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Week</Label>
              <Input type="number" min={1} max={53} value={startWeek}
                onChange={(e) => setStartWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))} />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Jaar</Label>
              <Input type="number" min={2020} max={2099} value={startJaar}
                onChange={(e) => setStartJaar(Number(e.target.value) || now.jaar)} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">Tot en met</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Week</Label>
              <Input type="number" min={1} max={53} value={endWeek}
                onChange={(e) => setEndWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))} />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">Jaar</Label>
              <Input type="number" min={2020} max={2099} value={endJaar}
                onChange={(e) => setEndJaar(Number(e.target.value) || now.jaar)} />
            </div>
          </div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">{weeks.length} week{weeks.length === 1 ? "" : "en"} in geselecteerde periode.</div>

      {/* Monteur selectie */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">Monteurs ({selectedIds.size}/{actieveMonteurs.length})</Label>
          <button onClick={toggleAll} type="button" className="text-xs font-display font-semibold text-primary hover:underline">
            {allSelected ? "Alles deselecteren" : "Alles selecteren"}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-72 overflow-auto rounded-md border border-fg/10 p-3">
          {actieveMonteurs.map((m) => {
            const checked = selectedIds.has(m.id);
            return (
              <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-fg/[0.04]">
                <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} className="accent-primary" />
                <span className="truncate">{m.naam}</span>
              </label>
            );
          })}
          {actieveMonteurs.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-4">Geen actieve monteurs</div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onPdf} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90 font-display font-semibold">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          PDF / Afdrukken
        </Button>
        <Button onClick={onCsv} disabled={busy} variant="outline" className="font-display font-semibold">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Excel / CSV
        </Button>
        <Button onClick={onCopy} disabled={busy} variant="outline" className="font-display font-semibold">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
          Kopieer als tekst
        </Button>
      </div>

      {/* Preview */}
      {resultaten && (
        <div className="mt-4 border-t border-fg/10 pt-4">
          <div className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground mb-3">Voorvertoning</div>
          <div className="space-y-3 max-h-96 overflow-auto">
            {resultaten.map((r) => (
              <div key={r.monteur.id} className="rounded-md border border-fg/10 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display font-semibold">{r.monteur.naam}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.vrijeDagen.length} vrije dag{r.vrijeDagen.length === 1 ? "" : "en"}
                  </div>
                </div>
                {r.vrijeDagen.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.vrijeDagen.slice(0, 30).map((d, i) => (
                      <span key={i} className="text-[11px] rounded bg-fg/[0.06] px-2 py-0.5">
                        {DAG_LABELS[d.dagIndex]} {fmtDatumKort(d.datum)}
                      </span>
                    ))}
                    {r.vrijeDagen.length > 30 && (
                      <span className="text-[11px] text-muted-foreground px-2 py-0.5">
                        +{r.vrijeDagen.length - 30} meer…
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
