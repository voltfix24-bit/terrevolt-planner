import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Rocket,
  GripVertical,
  ArrowLeft,
  ArrowRight,
  Copy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COLOR_MAP, COLOR_CODES } from "@/lib/planning-types";
import {
  loadConceptPlanning,
  uitrollenNaarPlanning,
  dagOffsetLabel,
  type ConceptCel,
} from "@/lib/concept-planning";

interface Monteur {
  id: string;
  naam: string;
  type: string;
}
interface ProjectActiviteit {
  id: string;
  naam: string;
}

export const ProjectConceptPlanning: React.FC<{ projectId: string }> = ({
  projectId,
}) => {
  const [cellen, setCellen] = useState<ConceptCel[]>([]);
  const [activiteiten, setActiviteiten] = useState<ProjectActiviteit[]>([]);
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [ploegen, setPloegen] = useState<import("@/lib/ploegen").Ploeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [startWeek, setStartWeek] = useState<string>("");
  const [uitrollen, setUitrollen] = useState(false);

  // Selectie state: set van cel-id's
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Anchor voor shift-range selectie
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [copyTargetOffset, setCopyTargetOffset] = useState<string>("");

  const reload = useCallback(async () => {
    setLoading(true);
    const [c, a, m] = await Promise.all([
      loadConceptPlanning(projectId),
      supabase
        .from("project_activiteiten")
        .select("id,naam")
        .eq("project_id", projectId)
        .order("positie"),
      supabase
        .from("monteurs")
        .select("id,naam,type")
        .eq("actief", true)
        .order("naam"),
    ]);
    setCellen(c);
    setActiviteiten((a.data ?? []) as ProjectActiviteit[]);
    setMonteurs((m.data ?? []) as Monteur[]);
    try {
      const { fetchPloegen } = await import("@/lib/ploegen");
      const pl = await fetchPloegen();
      setPloegen(pl.filter((p) => p.actief));
    } catch {
      setPloegen([]);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Vlakke, gesorteerde lijst (zelfde volgorde als UI) voor shift-range
  const flatOrdered = useMemo(() => {
    return [...cellen].sort(
      (a, b) =>
        a.dag_offset - b.dag_offset || (a.positie ?? 0) - (b.positie ?? 0),
    );
  }, [cellen]);

  const grouped = useMemo(() => {
    const map = new Map<number, ConceptCel[]>();
    flatOrdered.forEach((c) => {
      const arr = map.get(c.dag_offset) ?? [];
      arr.push(c);
      map.set(c.dag_offset, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [flatOrdered]);

  const maxOffset = useMemo(
    () => cellen.reduce((m, c) => Math.max(m, c.dag_offset), 0),
    [cellen],
  );

  // ===== Selectie handlers =====
  const handleSelect = (
    id: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && anchorId) {
        const ids = flatOrdered.map((c) => c.id);
        const a = ids.indexOf(anchorId);
        const b = ids.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
        }
        return next;
      }
      if (e.metaKey || e.ctrlKey) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setAnchorId(id);
        return next;
      }
      // Plain click → enkel deze (of leeg als al enige selectie)
      if (next.size === 1 && next.has(id)) {
        next.clear();
        setAnchorId(null);
        return next;
      }
      next.clear();
      next.add(id);
      setAnchorId(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelected(new Set());
    setAnchorId(null);
  };

  const addCel = async (dag_offset: number) => {
    const positie = cellen.filter((c) => c.dag_offset === dag_offset).length;
    const { data, error } = await supabase
      .from("project_concept_planning")
      .insert({
        project_id: projectId,
        dag_offset,
        positie,
        kleur_code: "c3",
        capaciteit: 1,
        notitie: "",
      })
      .select("*")
      .single();
    if (error) {
      toast.error("Kon activiteit niet toevoegen");
      return;
    }
    setCellen((prev) => [
      ...prev,
      { ...(data as unknown as ConceptCel), monteur_ids: [] },
    ]);
  };

  const addDag = () => addCel(maxOffset + 1);

  const updateCel = async (id: string, patch: Partial<ConceptCel>) => {
    setCellen((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
    const dbPatch: Record<string, unknown> = {};
    (["activiteit_id", "kleur_code", "capaciteit", "notitie"] as const).forEach(
      (k) => {
        if (k in patch) dbPatch[k] = patch[k] as unknown;
      },
    );
    if (Object.keys(dbPatch).length > 0) {
      await supabase
        .from("project_concept_planning")
        .update(dbPatch as never)
        .eq("id", id);
    }
  };

  const removeCel = async (id: string) => {
    setCellen((prev) => prev.filter((c) => c.id !== id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    await supabase
      .from("project_concept_monteurs")
      .delete()
      .eq("concept_cel_id", id);
    await supabase.from("project_concept_planning").delete().eq("id", id);
  };

  const removeSelection = async () => {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} activiteit(en) verwijderen?`)) return;
    const ids = Array.from(selected);
    setCellen((prev) => prev.filter((c) => !selected.has(c.id)));
    clearSelection();
    await supabase
      .from("project_concept_monteurs")
      .delete()
      .in("concept_cel_id", ids);
    await supabase.from("project_concept_planning").delete().in("id", ids);
  };

  const toggleMonteur = async (cel: ConceptCel, monteur_id: string) => {
    const has = cel.monteur_ids.includes(monteur_id);
    const next = has
      ? cel.monteur_ids.filter((m) => m !== monteur_id)
      : [...cel.monteur_ids, monteur_id];
    setCellen((prev) =>
      prev.map((c) => (c.id === cel.id ? { ...c, monteur_ids: next } : c)),
    );
    if (has) {
      await supabase
        .from("project_concept_monteurs")
        .delete()
        .eq("concept_cel_id", cel.id)
        .eq("monteur_id", monteur_id);
    } else {
      await supabase
        .from("project_concept_monteurs")
        .insert({ concept_cel_id: cel.id, monteur_id });
    }
  };

  // ===== Verschuiven (shift) van geselecteerde cellen =====
  const shiftSelection = async (delta: number) => {
    if (selected.size === 0) return;
    const sel = cellen.filter((c) => selected.has(c.id));
    const minOffset = Math.min(...sel.map((c) => c.dag_offset));
    if (minOffset + delta < 1) {
      toast.error("Kan niet vóór D1 verschuiven");
      return;
    }
    // Optimistic update
    setCellen((prev) =>
      prev.map((c) =>
        selected.has(c.id)
          ? { ...c, dag_offset: c.dag_offset + delta }
          : c,
      ),
    );
    const updates = sel.map((c) =>
      supabase
        .from("project_concept_planning")
        .update({ dag_offset: c.dag_offset + delta })
        .eq("id", c.id),
    );
    const results = await Promise.all(updates);
    const failed = results.filter((r) => r.error).length;
    if (failed > 0) {
      toast.error(`${failed} update(s) mislukt, ververs de pagina`);
    } else {
      toast.success(
        `${sel.length} activiteit(en) ${delta > 0 ? "+" : ""}${delta} dag verschoven`,
      );
    }
  };

  // ===== Kopiëren van geselecteerde cellen naar doel-dag =====
  const copySelectionTo = async (targetOffset: number) => {
    if (selected.size === 0) return;
    if (!targetOffset || targetOffset < 1) {
      toast.error("Geef een geldige doel-dag op (≥ 1)");
      return;
    }
    const sel = flatOrdered.filter((c) => selected.has(c.id));
    if (sel.length === 0) return;
    const minOffset = Math.min(...sel.map((c) => c.dag_offset));
    const delta = targetOffset - minOffset;

    // Voor elke source-cel: insert nieuwe cel op nieuw offset, daarna monteurs koppelen
    const startPosByOffset = new Map<number, number>();
    cellen.forEach((c) => {
      const base = c.dag_offset + delta;
      // (we gebruiken alleen offsets die we creëren; hier registreren we alleen de bestaande)
      const cur = startPosByOffset.get(c.dag_offset) ?? 0;
      startPosByOffset.set(
        c.dag_offset,
        Math.max(cur, (c.positie ?? 0) + 1),
      );
    });

    const inserts = sel.map((c) => {
      const newOffset = c.dag_offset + delta;
      const pos = startPosByOffset.get(newOffset) ?? 0;
      startPosByOffset.set(newOffset, pos + 1);
      return {
        project_id: projectId,
        dag_offset: newOffset,
        positie: pos,
        activiteit_id: c.activiteit_id,
        kleur_code: c.kleur_code,
        capaciteit: c.capaciteit ?? 0,
        notitie: c.notitie ?? "",
      };
    });

    const { data: nieuwe, error } = await supabase
      .from("project_concept_planning")
      .insert(inserts)
      .select("*");
    if (error || !nieuwe) {
      toast.error("Kopiëren mislukt");
      return;
    }

    // Monteurs koppelen aan nieuwe cellen
    const monteurRows: { concept_cel_id: string; monteur_id: string }[] = [];
    nieuwe.forEach((n, i) => {
      const src = sel[i];
      src.monteur_ids.forEach((mid) =>
        monteurRows.push({
          concept_cel_id: (n as { id: string }).id,
          monteur_id: mid,
        }),
      );
    });
    if (monteurRows.length > 0) {
      await supabase.from("project_concept_monteurs").insert(monteurRows);
    }

    // Lokale state bijwerken
    const newCellen: ConceptCel[] = nieuwe.map((n, i) => ({
      ...(n as unknown as ConceptCel),
      monteur_ids: [...sel[i].monteur_ids],
    }));
    setCellen((prev) => [...prev, ...newCellen]);
    // Nieuwe selectie = de gekopieerde cellen
    setSelected(new Set(newCellen.map((c) => c.id)));
    setAnchorId(newCellen[0]?.id ?? null);
    toast.success(
      `${sel.length} activiteit(en) gekopieerd naar D${targetOffset}`,
    );
  };

  const handleUitrollen = async () => {
    const wn = parseInt(startWeek, 10);
    if (!wn || wn < 1 || wn > 53) {
      toast.error("Geef een geldig weeknummer (1-53)");
      return;
    }
    if (cellen.length === 0) {
      toast.error("Geen concept-cellen om uit te rollen");
      return;
    }
    setUitrollen(true);
    try {
      const r = await uitrollenNaarPlanning({
        project_id: projectId,
        startWeek: wn,
        cellen,
      });
      toast.success(
        `Uitgerold: ${r.aangemaakteCellen} cellen in ${r.aangemaakteWeken || "bestaande"} weken`,
      );
    } catch (e) {
      toast.error(
        "Uitrollen mislukt: " + (e instanceof Error ? e.message : "onbekend"),
      );
    } finally {
      setUitrollen(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Laden…</div>;
  }

  const hasSelection = selected.size > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2.5">
        <div className="flex-1 min-w-[180px]">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Uitrollen vanaf weeknr
          </Label>
          <Input
            type="number"
            min={1}
            max={53}
            placeholder="bv. 14"
            value={startWeek}
            onChange={(e) => setStartWeek(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <Button
          onClick={handleUitrollen}
          disabled={uitrollen || cellen.length === 0 || !startWeek}
          size="sm"
          className="gap-1.5"
        >
          <Rocket className="h-3.5 w-3.5" />
          Kopieer naar planning
        </Button>
        <div className="basis-full text-[11px] text-muted-foreground">
          D1 = maandag van de gekozen week. D6 = maandag week +1, enz. Weken
          worden aangemaakt indien ze nog niet bestaan.
        </div>
      </div>

      {/* Selectie-toolbar */}
      {hasSelection && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 backdrop-blur">
          <span className="text-[12px] font-semibold text-foreground">
            {selected.size} geselecteerd
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => shiftSelection(-1)}
              className="h-7 gap-1 text-[11px]"
              title="1 dag eerder"
            >
              <ArrowLeft className="h-3 w-3" />
              −1d
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => shiftSelection(1)}
              className="h-7 gap-1 text-[11px]"
              title="1 dag later"
            >
              +1d
              <ArrowRight className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => shiftSelection(5)}
              className="h-7 gap-1 text-[11px]"
              title="1 week later"
            >
              +1w
              <ArrowRight className="h-3 w-3" />
            </Button>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <Input
              type="number"
              min={1}
              placeholder="Doel D…"
              value={copyTargetOffset}
              onChange={(e) => setCopyTargetOffset(e.target.value)}
              className="h-7 w-[80px] text-[12px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => copySelectionTo(parseInt(copyTargetOffset, 10))}
              disabled={!copyTargetOffset}
              className="h-7 gap-1 text-[11px]"
              title="Kopieer selectie naar doel-dag"
            >
              <Copy className="h-3 w-3" />
              Kopieer
            </Button>
            <div className="mx-1 h-5 w-px bg-white/10" />
            <Button
              size="sm"
              variant="ghost"
              onClick={removeSelection}
              className="h-7 gap-1 text-[11px] text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
              Verwijder
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              className="h-7 gap-1 text-[11px]"
            >
              <X className="h-3 w-3" />
              Deselecteer
            </Button>
          </div>
          <div className="basis-full text-[10px] text-muted-foreground">
            Tip: klik = selecteer, shift-klik = bereik, ctrl/cmd-klik = toggle.
          </div>
        </div>
      )}

      {grouped.length === 0 && (
        <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">
          Nog geen concept-planning. Voeg een dag toe om te beginnen.
        </div>
      )}

      <div className="space-y-2">
        {grouped.map(([offset, dagCellen]) => (
          <div
            key={offset}
            className="rounded-md border border-white/10 bg-white/[0.02] p-2"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {dagOffsetLabel(offset)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => addCel(offset)}
                className="h-6 gap-1 text-[11px]"
              >
                <Plus className="h-3 w-3" />
                Activiteit
              </Button>
            </div>
            <div className="space-y-1.5">
              {dagCellen.map((cel) => (
                <ConceptCelRow
                  key={cel.id}
                  cel={cel}
                  activiteiten={activiteiten}
                  monteurs={monteurs}
                  ploegen={ploegen}
                  selected={selected.has(cel.id)}
                  onSelect={(e) => handleSelect(cel.id, e)}
                  onChange={(patch) => updateCel(cel.id, patch)}
                  onRemove={() => removeCel(cel.id)}
                  onToggleMonteur={(mid) => toggleMonteur(cel, mid)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={addDag}
        variant="outline"
        size="sm"
        className="w-full gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Dag toevoegen (D{maxOffset + 1})
      </Button>
    </div>
  );
};

const ConceptCelRow: React.FC<{
  cel: ConceptCel;
  activiteiten: ProjectActiviteit[];
  monteurs: Monteur[];
  ploegen: import("@/lib/ploegen").Ploeg[];
  selected: boolean;
  onSelect: (e: {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
  }) => void;
  onChange: (patch: Partial<ConceptCel>) => void;
  onRemove: () => void;
  onToggleMonteur: (monteur_id: string) => void;
}> = ({
  cel,
  activiteiten,
  monteurs,
  ploegen,
  selected,
  onSelect,
  onChange,
  onRemove,
  onToggleMonteur,
}) => {
  const kleur = cel.kleur_code ? COLOR_MAP[cel.kleur_code] : null;
  // Voor concept: alle ploegen tonen, klik = voeg ontbrekende leden toe
  const eligiblePloegen = ploegen
    .map((p) => {
      const toAdd = p.monteur_ids.filter((id) => !cel.monteur_ids.includes(id));
      return { ploeg: p, toAdd };
    })
    .filter((x) => x.toAdd.length > 0);
  return (
    <div
      className={`rounded border p-2 space-y-1.5 transition-colors ${
        selected
          ? "border-primary bg-primary/10"
          : "border-white/5 bg-white/[0.02]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={(e) =>
            onSelect({
              shiftKey: e.shiftKey,
              metaKey: e.metaKey,
              ctrlKey: e.ctrlKey,
            })
          }
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/10 text-muted-foreground/60 hover:border-white/30 hover:text-foreground"
          }`}
          title="Klik om te selecteren · shift-klik = bereik · ctrl/cmd-klik = toggle"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Select
          value={cel.activiteit_id ?? ""}
          onValueChange={(v) => onChange({ activiteit_id: v })}
        >
          <SelectTrigger className="h-7 flex-1 min-w-[160px] text-[12px]">
            <SelectValue placeholder="Kies activiteit" />
          </SelectTrigger>
          <SelectContent>
            {activiteiten.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.naam}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={cel.kleur_code ?? ""}
          onValueChange={(v) => onChange({ kleur_code: v })}
        >
          <SelectTrigger className="h-7 w-[140px] text-[12px]">
            <SelectValue placeholder="Kleur">
              {kleur && (
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded"
                    style={{ background: kleur.hex }}
                  />
                  {kleur.naam}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COLOR_CODES.map((c) => (
              <SelectItem key={c} value={c}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded"
                    style={{ background: COLOR_MAP[c].hex }}
                  />
                  {COLOR_MAP[c].naam}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          placeholder="Notitie"
          value={cel.notitie ?? ""}
          onChange={(e) => onChange({ notitie: e.target.value })}
          onBlur={(e) => onChange({ notitie: e.target.value })}
          className="h-7 flex-1 min-w-[120px] text-[12px]"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-7 w-7 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {eligiblePloegen.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pl-7">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Ploeg:
          </span>
          {eligiblePloegen.map(({ ploeg, toAdd }) => (
            <button
              key={ploeg.id}
              type="button"
              onClick={() => toAdd.forEach((id) => onToggleMonteur(id))}
              className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] text-foreground transition-colors hover:bg-primary/20"
              title={`Voeg ploeg "${ploeg.naam}" toe (${toAdd.length} monteur${toAdd.length === 1 ? "" : "s"})`}
            >
              + {ploeg.naam} ({toAdd.length})
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1 pl-7">
        {monteurs.map((m) => {
          const active = cel.monteur_ids.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggleMonteur(m.id)}
              className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                active
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]"
              }`}
              title={m.naam}
            >
              {m.naam}
            </button>
          );
        })}
        {monteurs.length === 0 && (
          <span className="text-[10px] text-muted-foreground">
            Geen actieve monteurs
          </span>
        )}
      </div>
    </div>
  );
};
