import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PvDagRegel } from "@/lib/pv-staat";

type Klus = PvDagRegel & { id: string };
type Gepland = { monteur_id: string; naam: string; datum: string };

const fmtDag = (iso: string) => {
  const s = new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Verdeel per monteur per dag de uren over klussen (locatie, case, uitvoerder, uren, overwerk). */
export function PvKlussenEditor({ projectId, gepland, van, tot, onChange }: {
  projectId: string; gepland: Gepland[]; van: string; tot: string; onChange: (k: PvDagRegel[]) => void;
}) {
  const [klussen, setKlussen] = useState<Klus[]>([]);

  useEffect(() => {
    let cancel = false;
    supabase.from("pv_regels").select("*").eq("project_id", projectId).gte("datum", van).lte("datum", tot).order("positie")
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) { toast.error("Klussen konden niet worden geladen"); return; }
        setKlussen((data ?? []).map((d) => ({ ...d, uren: Number(d.uren), overuren: Number(d.overuren) })) as Klus[]);
      });
    return () => { cancel = true; };
  }, [projectId, van, tot]);

  useEffect(() => { onChange(klussen); }, [klussen, onChange]);

  const perMonteur = useMemo(() => {
    const m = new Map<string, { naam: string; dagen: string[] }>();
    for (const g of [...gepland].sort((a, b) => a.naam.localeCompare(b.naam, "nl") || a.datum.localeCompare(b.datum))) {
      const e = m.get(g.monteur_id) ?? { naam: g.naam, dagen: [] };
      if (!e.dagen.includes(g.datum)) e.dagen.push(g.datum);
      m.set(g.monteur_id, e);
    }
    return [...m.entries()];
  }, [gepland]);

  const add = async (monteur_id: string, datum: string) => {
    const positie = klussen.filter((k) => k.monteur_id === monteur_id && k.datum === datum).length;
    const { data, error } = await supabase.from("pv_regels").insert({ project_id: projectId, monteur_id, datum, positie }).select().single();
    if (error || !data) { toast.error("Klus niet toegevoegd"); return; }
    setKlussen((ks) => [...ks, { ...data, uren: Number(data.uren), overuren: Number(data.overuren) } as Klus]);
  };
  const patch = (id: string, p: Partial<Klus>) => setKlussen((ks) => ks.map((k) => (k.id === id ? { ...k, ...p } : k)));
  const save = async (k: Klus) => {
    const { error } = await supabase.from("pv_regels").update({
      omschrijving: k.omschrijving?.trim() || null, case_nummer: k.case_nummer?.trim() || null, uitvoerder: k.uitvoerder?.trim() || null,
      uren: Number(k.uren) || 0, overuren: Number(k.overuren) || 0, niet_doorgegaan: k.niet_doorgegaan, updated_at: new Date().toISOString(),
    }).eq("id", k.id);
    if (error) toast.error("Klus niet opgeslagen");
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("pv_regels").delete().eq("id", id);
    if (error) { toast.error("Klus niet verwijderd"); return; }
    setKlussen((ks) => ks.filter((k) => k.id !== id));
  };

  return (
    <div className="w-full space-y-3">
      <p className="text-xs text-muted-foreground">
        Verdeel per dag de klussen. Een dag zonder klus komt op de PV-staat met de projectlocatie. Standaard 8 uur; vul overwerk apart in.
      </p>
      {perMonteur.map(([mid, m]) => (
        <div key={mid} className="rounded-md border border-fg/10">
          <div className="border-b border-fg/10 px-3 py-1.5 font-display text-sm font-semibold">{m.naam}</div>
          {m.dagen.map((datum) => {
            const ks = klussen.filter((k) => k.monteur_id === mid && k.datum === datum);
            return (
              <div key={datum} className="space-y-1.5 border-b border-fg/5 px-3 py-2 last:border-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-36 font-semibold">{fmtDag(datum)}</span>
                  {ks.length === 0 && <span className="text-muted-foreground">Geen klus — projectlocatie</span>}
                  <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => add(mid, datum)}>
                    <Plus className="mr-1 h-3 w-3" /> Klus
                  </Button>
                </div>
                {ks.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center gap-2 pl-2">
                    <Input className="h-8 w-[220px] text-xs" placeholder="Locatie / omschrijving" value={k.omschrijving ?? ""} onChange={(e) => patch(k.id, { omschrijving: e.target.value })} onBlur={() => save(k)} />
                    <Input className="h-8 w-[110px] text-xs" placeholder="Case" value={k.case_nummer ?? ""} onChange={(e) => patch(k.id, { case_nummer: e.target.value })} onBlur={() => save(k)} />
                    <Input className="h-8 w-[150px] text-xs" placeholder="Uitvoerder" value={k.uitvoerder ?? ""} onChange={(e) => patch(k.id, { uitvoerder: e.target.value })} onBlur={() => save(k)} />
                    <label className="flex items-center gap-1 text-xs">Uren
                      <Input className="h-8 w-[64px] text-xs" inputMode="decimal" value={String(k.uren)} onChange={(e) => patch(k.id, { uren: Number(e.target.value.replace(",", ".")) || 0 })} onBlur={() => save(k)} />
                    </label>
                    <label className="flex items-center gap-1 text-xs">Overwerk
                      <Input className="h-8 w-[64px] text-xs" inputMode="decimal" value={String(k.overuren)} onChange={(e) => patch(k.id, { overuren: Number(e.target.value.replace(",", ".")) || 0 })} onBlur={() => save(k)} />
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={k.niet_doorgegaan} onChange={(e) => { const n = { ...k, niet_doorgegaan: e.target.checked }; patch(k.id, n); save(n); }} />
                      Niet doorgegaan
                    </label>
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Klus verwijderen" onClick={() => remove(k.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
