import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Rocket, GripVertical } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [startWeek, setStartWeek] = useState<string>("");
  const [uitrollen, setUitrollen] = useState(false);

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
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => {
    const map = new Map<number, ConceptCel[]>();
    cellen.forEach((c) => {
      const arr = map.get(c.dag_offset) ?? [];
      arr.push(c);
      map.set(c.dag_offset, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [cellen]);

  const maxOffset = useMemo(
    () => cellen.reduce((m, c) => Math.max(m, c.dag_offset), 0),
    [cellen],
  );

  const addCel = async (dag_offset: number) => {
    const positie =
      cellen.filter((c) => c.dag_offset === dag_offset).length;
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
    await supabase.from("project_concept_monteurs").delete().eq("concept_cel_id", id);
    await supabase.from("project_concept_planning").delete().eq("id", id);
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
      toast.error("Uitrollen mislukt: " + (e instanceof Error ? e.message : "onbekend"));
    } finally {
      setUitrollen(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Laden…</div>;
  }

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
  onChange: (patch: Partial<ConceptCel>) => void;
  onRemove: () => void;
  onToggleMonteur: (monteur_id: string) => void;
}> = ({ cel, activiteiten, monteurs, onChange, onRemove, onToggleMonteur }) => {
  const kleur = cel.kleur_code ? COLOR_MAP[cel.kleur_code] : null;
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
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
      <div className="flex flex-wrap gap-1 pl-5">
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
