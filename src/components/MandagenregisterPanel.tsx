import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  Download,
  FileText,
  History,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { exportMandagenregisterPDF } from "@/lib/mandagenregister-pdf";

type Dienstverband = "loondienst" | "zzp";

type Row = {
  project_id: string;
  project_label: string | null;
  monteur_id: string;
  naam: string;
  dienstverband: Dienstverband;
  bedrijfsnaam: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  bsn: string | null;
  geboortedatum: string | null;
  nationaliteit: string | null;
  id_type: string | null;
  id_nummer: string | null;
  id_geldig_tot: string | null;
  datum: string; // YYYY-MM-DD
  uren: number;
  status: string;
  activiteiten: string | null;
  activiteit_count: number;
  compleet: boolean;
  ontbrekende_velden: string[] | null;
};

type ExportLog = {
  id: string;
  periode_van: string;
  periode_tot: string;
  dienstverband: string;
  bestandsnaam: string | null;
  rij_count: number;
  aangemaakt_op: string;
};

const DAY_LABELS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function isoMondayOfWeek(d: Date): Date {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dow = x.getUTCDay() || 7;
  if (dow !== 1) x.setUTCDate(x.getUTCDate() - (dow - 1));
  return x;
}
function isoSundayOfWeek(d: Date): Date {
  const m = isoMondayOfWeek(d);
  m.setUTCDate(m.getUTCDate() + 6);
  return m;
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function getISOWeek(d: Date): { year: number; week: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+t - +yStart) / 86400000 + 1) / 7);
  return { year: t.getUTCFullYear(), week };
}
function dayIndex(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  return (d.getUTCDay() + 6) % 7; // ma=0
}
function weekKey(dateStr: string): string {
  const { year, week } = getISOWeek(new Date(dateStr + "T00:00:00Z"));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const lines = [header.map(csvEscape).join(";")];
  for (const r of rows) lines.push(r.map(csvEscape).join(";"));
  // BOM voor Excel UTF-8 herkenning
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MandagenregisterPanel({
  projectId,
  projectLabel,
  defaultVan,
  defaultTot,
}: {
  projectId: string;
  projectLabel?: string | null;
  defaultVan?: string | null;
  defaultTot?: string | null;
}) {
  const today = useMemo(() => new Date(), []);
  const [van, setVan] = useState<string>(() => defaultVan || fmt(isoMondayOfWeek(today)));
  const [tot, setTot] = useState<string>(() => defaultTot || fmt(isoSundayOfWeek(today)));
  const [userTouchedRange, setUserTouchedRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [logs, setLogs] = useState<ExportLog[]>([]);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [projectMeta, setProjectMeta] = useState<{
    case_nummer: string | null;
    station_naam: string | null;
    locatie: string | null;
    opdrachtgever: string | null;
  }>({ case_nummer: null, station_naam: null, locatie: null, opdrachtgever: null });

  useEffect(() => {
    let cancelled = false;
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from("projecten")
        .select("case_nummer, station_naam, locatie, opdrachtgever_id")
        .eq("id", projectId)
        .maybeSingle();
      if (cancelled || !data) return;
      let opdrachtgeverNaam: string | null = null;
      if (data.opdrachtgever_id) {
        const { data: og } = await supabase
          .from("opdrachtgevers")
          .select("naam")
          .eq("id", data.opdrachtgever_id)
          .maybeSingle();
        opdrachtgeverNaam = og?.naam ?? null;
      }
      if (cancelled) return;
      setProjectMeta({
        case_nummer: data.case_nummer ?? null,
        station_naam: data.station_naam ?? null,
        locatie: data.locatie ?? null,
        opdrachtgever: opdrachtgeverNaam,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Sync incoming default range if user has not manually overridden it.
  useEffect(() => {
    if (userTouchedRange) return;
    if (defaultVan) setVan(defaultVan);
    if (defaultTot) setTot(defaultTot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVan, defaultTot]);


  const fetchRows = useCallback(async () => {
    if (!projectId || !van || !tot) return;
    if (tot < van) {
      toast.error("Einddatum ligt voor begindatum");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("mandagenregister_export", {
      p_project_id: projectId,
      p_van: van,
      p_tot: tot,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Kon mandagenregister niet ophalen");
      setRows([]);
      return;
    }
    setRows((data ?? []) as Row[]);
  }, [projectId, van, tot]);

  const fetchLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from("mandagen_exports")
      .select("id, periode_van, periode_tot, dienstverband, bestandsnaam, rij_count, aangemaakt_op")
      .eq("project_id", projectId)
      .order("aangemaakt_op", { ascending: false })
      .limit(10);
    if (!error) setLogs((data ?? []) as ExportLog[]);
  }, [projectId]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Auto-load when projectId/range changes (initial open with default range).
  useEffect(() => {
    if (projectId && van && tot && tot >= van) {
      void fetchRows();
    }
  }, [fetchRows, projectId, van, tot]);

  async function saveHours(row: Row, urenStr: string) {
    const uren = Number(urenStr);
    if (Number.isNaN(uren) || uren < 0 || uren > 24) {
      toast.error("Uren moeten tussen 0 en 24 liggen");
      return;
    }
    const key = `${row.monteur_id}-${row.datum}`;
    setSavingKey(key);
    const { error } = await supabase.rpc("upsert_mandagen_regel", {
      p_project_id: projectId,
      p_monteur_id: row.monteur_id,
      p_datum: row.datum,
      p_uren: uren,
      p_status: "gecontroleerd",
      p_opmerking: null,
    });
    setSavingKey(null);
    if (error) {
      toast.error(error.message || "Kon uren niet opslaan");
      return;
    }
    setRows((rs) =>
      rs.map((r) =>
        r.monteur_id === row.monteur_id && r.datum === row.datum
          ? { ...r, uren, status: "gecontroleerd" }
          : r
      )
    );
  }

  // Groepering voor weergave: per dienstverband → per monteur → per week → per dag.
  const grouped = useMemo(() => {
    const out: Record<
      Dienstverband,
      {
        naam: string;
        monteur_id: string;
        ontbrekende: Set<string>;
        weeks: Map<string, { week: string; days: (Row | null)[]; total: number }>;
      }[]
    > = { zzp: [], loondienst: [] };
    const monteurMap = new Map<string, ReturnType<typeof makeM>>();
    function makeM(row: Row) {
      return {
        naam: row.naam,
        monteur_id: row.monteur_id,
        dienstverband: row.dienstverband,
        ontbrekende: new Set<string>(),
        weeks: new Map<string, { week: string; days: (Row | null)[]; total: number }>(),
      };
    }
    for (const r of rows) {
      const key = `${r.dienstverband}::${r.monteur_id}`;
      let m = monteurMap.get(key);
      if (!m) {
        m = makeM(r);
        monteurMap.set(key, m);
      }
      for (const o of r.ontbrekende_velden ?? []) m.ontbrekende.add(o);
      const wk = weekKey(r.datum);
      let w = m.weeks.get(wk);
      if (!w) {
        w = { week: wk, days: [null, null, null, null, null, null, null], total: 0 };
        m.weeks.set(wk, w);
      }
      const di = dayIndex(r.datum);
      w.days[di] = r;
      w.total += Number(r.uren) || 0;
    }
    for (const m of monteurMap.values()) {
      const sortedWeeks = new Map(
        [...m.weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      );
      out[m.dienstverband].push({
        naam: m.naam,
        monteur_id: m.monteur_id,
        ontbrekende: m.ontbrekende,
        weeks: sortedWeeks,
      });
    }
    out.zzp.sort((a, b) => a.naam.localeCompare(b.naam));
    out.loondienst.sort((a, b) => a.naam.localeCompare(b.naam));
    return out;
  }, [rows]);

  const incompleteByDienst = useMemo(() => {
    const out: Record<Dienstverband, { naam: string; monteur_id: string; missing: string[] }[]> = {
      zzp: [],
      loondienst: [],
    };
    for (const d of ["zzp", "loondienst"] as Dienstverband[]) {
      for (const m of grouped[d]) {
        if (m.ontbrekende.size > 0) {
          out[d].push({ naam: m.naam, monteur_id: m.monteur_id, missing: [...m.ontbrekende] });
        }
      }
    }
    return out;
  }, [grouped]);

  function aggregateByMonteurWeek(filtered: Row[]) {
    type WeekAgg = {
      monteur_id: string;
      naam: string;
      kvk_nummer: string | null;
      bsn: string | null;
      geboortedatum: string | null;
      id_type: string | null;
      id_nummer: string | null;
      id_geldig_tot: string | null;
      week: string;
      days: number[];
      total: number;
      opmerkingen: Set<string>;
    };
    const aggMap = new Map<string, WeekAgg>();
    for (const r of filtered) {
      const wk = weekKey(r.datum);
      const key = `${r.monteur_id}::${wk}`;
      let a = aggMap.get(key);
      if (!a) {
        a = {
          monteur_id: r.monteur_id,
          naam: r.naam,
          kvk_nummer: r.kvk_nummer,
          bsn: r.bsn,
          geboortedatum: r.geboortedatum,
          id_type: r.id_type,
          id_nummer: r.id_nummer,
          id_geldig_tot: r.id_geldig_tot,
          week: wk,
          days: [0, 0, 0, 0, 0, 0, 0],
          total: 0,
          opmerkingen: new Set<string>(),
        };
        aggMap.set(key, a);
      }
      const di = dayIndex(r.datum);
      const u = Number(r.uren) || 0;
      a.days[di] += u;
      a.total += u;
      if (r.activiteiten) a.opmerkingen.add(r.activiteiten);
    }
    return [...aggMap.values()].sort(
      (x, y) => x.naam.localeCompare(y.naam) || x.week.localeCompare(y.week),
    );
  }

  function preflightExport(d: Dienstverband): { ok: boolean; filtered: Row[]; baseSlug: string } | null {
    const filtered = rows.filter((r) => r.dienstverband === d);
    if (filtered.length === 0) {
      toast.info(`Geen ${d === "zzp" ? "ZZP" : "loondienst"}-regels in deze periode`);
      return null;
    }
    if (incompleteByDienst[d].length > 0 && !allowIncomplete) {
      toast.error("Er ontbreken nog gegevens — corrigeer of vink override aan");
      return null;
    }
    const baseSlug = (projectLabel || projectId).replace(/[^\w-]+/g, "_").slice(0, 40);
    return { ok: true, filtered, baseSlug };
  }

  async function logExport(d: Dienstverband, filename: string) {
    const { error } = await supabase.rpc("log_mandagen_export", {
      p_project_id: projectId,
      p_van: van,
      p_tot: tot,
      p_dienstverband: d,
      p_bestandsnaam: filename,
    });
    if (error) {
      toast.warning(`Bestand aangemaakt, maar log mislukte: ${error.message}`);
    } else {
      toast.success(
        d === "zzp" ? "Mandagenregister ZZP gelogd" : "Mandagenregister Loondienst gelogd",
      );
      void fetchLogs();
      void fetchRows();
    }
  }

  async function handleDownload(d: Dienstverband) {
    const pre = preflightExport(d);
    if (!pre) return;
    const { filtered, baseSlug } = pre;
    const filename = `Mandagenregister_${d === "zzp" ? "ZZP" : "Loondienst"}_${baseSlug}_${van}_${tot}.csv`;

    if (d === "zzp") {
      const aggs = aggregateByMonteurWeek(filtered);
      downloadCsv(
        filename,
        [
          "Hoofdaannemer/opdrachtgever",
          "Projectnummer",
          "Projectnaam",
          "Locatie",
          "Week",
          "Naam zelfstandige",
          "Statuscode",
          "KvK-nummer",
          "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo",
          "Totaal uren",
          "Opmerking",
        ],
        aggs.map((a) => [
          projectMeta.opdrachtgever,
          projectMeta.case_nummer,
          projectMeta.station_naam,
          projectMeta.locatie,
          a.week,
          a.naam,
          "Z",
          a.kvk_nummer,
          a.days[0] || "", a.days[1] || "", a.days[2] || "", a.days[3] || "",
          a.days[4] || "", a.days[5] || "", a.days[6] || "",
          a.total,
          [...a.opmerkingen].join("; "),
        ]),
      );
    } else {
      downloadCsv(
        filename,
        [
          "naam", "bsn", "geboortedatum", "nationaliteit",
          "id_type", "id_nummer", "id_geldig_tot",
          "datum", "uren", "activiteiten", "status",
        ],
        filtered.map((r) => [
          r.naam, r.bsn, r.geboortedatum, r.nationaliteit,
          r.id_type, r.id_nummer, r.id_geldig_tot,
          r.datum, r.uren, r.activiteiten, r.status,
        ]),
      );
    }

    await logExport(d, filename);
  }

  async function handleDownloadPdf(d: Dienstverband) {
    const pre = preflightExport(d);
    if (!pre) return;
    const { filtered, baseSlug } = pre;
    const filename = `Mandagenregister_${d === "zzp" ? "ZZP" : "Loondienst"}_${baseSlug}_${van}_${tot}.pdf`;
    const aggs = aggregateByMonteurWeek(filtered);
    try {
      exportMandagenregisterPDF({
        dienstverband: d,
        project: projectMeta,
        periodeVan: van,
        periodeTot: tot,
        rows: aggs.map((a) => ({
          monteur_id: a.monteur_id,
          naam: a.naam,
          // ZZP: alleen KvK; expliciet geen BSN/ID-velden meegeven.
          kvk_nummer: d === "zzp" ? a.kvk_nummer : null,
          bsn: d === "loondienst" ? a.bsn : null,
          geboortedatum: d === "loondienst" ? a.geboortedatum : null,
          id_type: d === "loondienst" ? a.id_type : null,
          id_nummer: d === "loondienst" ? a.id_nummer : null,
          id_geldig_tot: d === "loondienst" ? a.id_geldig_tot : null,
          week: a.week,
          days: a.days,
          total: a.total,
          opmerking: [...a.opmerkingen].join("; "),
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "PDF kon niet worden geopend";
      toast.error(msg);
      return;
    }
    await logExport(d, filename);
  }


  const hasRows = rows.length > 0;

  return (
    <div className="space-y-4">
      {/* Periode + actie */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-fg/10 bg-fg/[0.02] px-3 py-2.5">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Van</Label>
          <Input type="date" value={van} onChange={(e) => { setUserTouchedRange(true); setVan(e.target.value); }} className="h-9 w-[160px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">T/m</Label>
          <Input type="date" value={tot} onChange={(e) => { setUserTouchedRange(true); setTot(e.target.value); }} className="h-9 w-[160px]" />
        </div>
        <Button onClick={fetchRows} disabled={loading} className="h-9">
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Register ophalen
        </Button>
        {defaultVan && defaultTot && (defaultVan !== van || defaultTot !== tot) && (
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              setUserTouchedRange(false);
              setVan(defaultVan);
              setTot(defaultTot);
            }}
          >
            Volledige planning
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {hasRows ? `${rows.length} regels` : "Geen data geladen"}
        </div>
      </div>

      {hasRows && (
        <>
          {(["loondienst", "zzp"] as Dienstverband[]).map((d) => {
            const monteurs = grouped[d];
            if (monteurs.length === 0) return null;
            const incomplete = incompleteByDienst[d];
            return (
              <div key={d} className="space-y-2 rounded-md border border-fg/10 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-bold">
                    {d === "zzp" ? "ZZP" : "Loondienst"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({monteurs.length} monteur{monteurs.length === 1 ? "" : "s"})
                    </span>
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(d)}
                    disabled={incomplete.length > 0 && !allowIncomplete}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Download CSV
                  </Button>
                </div>

                {incomplete.length > 0 && (
                  <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Onvolledige gegevens — download geblokkeerd
                    </div>
                    {incomplete.map((m) => (
                      <div key={m.monteur_id} className="pl-5">
                        <span className="font-semibold">{m.naam}:</span> {m.missing.join(", ")}
                      </div>
                    ))}
                    <label className="flex items-center gap-1.5 pl-5 pt-1">
                      <input
                        type="checkbox"
                        checked={allowIncomplete}
                        onChange={(e) => setAllowIncomplete(e.target.checked)}
                      />
                      Toch exporteren ondanks ontbrekende gegevens
                    </label>
                  </div>
                )}

                <div className="space-y-3">
                  {monteurs.map((m) => (
                    <div key={m.monteur_id} className="rounded-md border border-fg/10">
                      <div className="flex items-center justify-between gap-2 border-b border-fg/10 px-3 py-2">
                        <div className="font-display text-sm font-semibold">{m.naam}</div>
                        {m.ontbrekende.size === 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                            <BadgeCheck className="h-3 w-3" /> Compleet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="h-3 w-3" /> Mist {[...m.ontbrekende].join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                              <th className="px-3 py-1.5 font-semibold">Week</th>
                              {DAY_LABELS.map((d) => (
                                <th key={d} className="px-2 py-1.5 text-center font-semibold">
                                  {d}
                                </th>
                              ))}
                              <th className="px-3 py-1.5 text-right font-semibold">Totaal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...m.weeks.values()].map((w) => (
                              <tr key={w.week} className="border-t border-fg/5">
                                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                                  {w.week}
                                </td>
                                {w.days.map((cell, di) => (
                                  <td key={di} className="px-1 py-1 text-center">
                                    {cell ? (
                                      <input
                                        type="number"
                                        step="0.5"
                                        min={0}
                                        max={24}
                                        defaultValue={cell.uren}
                                        onBlur={(e) => {
                                          const v = e.target.value;
                                          if (Number(v) !== Number(cell.uren)) {
                                            void saveHours(cell, v);
                                          }
                                        }}
                                        title={cell.activiteiten ?? undefined}
                                        disabled={
                                          savingKey === `${cell.monteur_id}-${cell.datum}`
                                        }
                                        className={`w-14 rounded border px-1.5 py-0.5 text-center text-xs ${
                                          cell.status === "gecontroleerd"
                                            ? "border-primary/40 bg-primary/5"
                                            : cell.status === "geexporteerd"
                                            ? "border-emerald-500/40 bg-emerald-500/5"
                                            : "border-fg/15"
                                        }`}
                                      />
                                    ) : (
                                      <span className="text-muted-foreground/40">—</span>
                                    )}
                                  </td>
                                ))}
                                <td className="px-3 py-1.5 text-right font-display font-semibold">
                                  {w.total.toFixed(1)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Exportlog */}
      <div className="rounded-md border border-fg/10 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          Eerdere exports
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nog geen exports gelogd voor dit project.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="py-1 font-semibold">Datum</th>
                <th className="py-1 font-semibold">Periode</th>
                <th className="py-1 font-semibold">Dienstverband</th>
                <th className="py-1 text-right font-semibold">Regels</th>
                <th className="py-1 font-semibold">Bestand</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-fg/5">
                  <td className="py-1.5 font-mono text-[11px]">
                    {new Date(l.aangemaakt_op).toLocaleString("nl-NL")}
                  </td>
                  <td className="py-1.5">
                    {l.periode_van} → {l.periode_tot}
                  </td>
                  <td className="py-1.5 uppercase">{l.dienstverband}</td>
                  <td className="py-1.5 text-right">{l.rij_count}</td>
                  <td className="py-1.5 text-muted-foreground truncate">
                    {l.bestandsnaam ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
