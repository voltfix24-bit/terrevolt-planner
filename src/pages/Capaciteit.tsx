import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Power, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type MonteurType = "schakelmonteur" | "montagemonteur";
type Aanwijzing = "VOP" | "VP" | "AVP";

interface Monteur {
  id: string;
  naam: string;
  type: MonteurType;
  aanwijzing_ls: Aanwijzing | null;
  aanwijzing_ms: Aanwijzing | null;
  actief: boolean;
  created_at: string;
}

const AANWIJZINGEN: Aanwijzing[] = ["VOP", "VP", "AVP"];

const aanwijzingStyle = (a: Aanwijzing | null): React.CSSProperties => {
  if (a === "AVP") return { backgroundColor: "#3fff8b", color: "#0a1a30" };
  if (a === "VP") return { backgroundColor: "#7cc1ff", color: "#0a1a30" };
  if (a === "VOP") return { backgroundColor: "#cbd5e1", color: "#0a1a30" };
  return { backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" };
};

const typeStyle = (t: MonteurType): React.CSSProperties =>
  t === "schakelmonteur"
    ? { backgroundColor: "#feb300", color: "#0a1a30" }
    : { backgroundColor: "#378add", color: "#0a1a30" };

const typeLabel = (t: MonteurType) =>
  t === "schakelmonteur" ? "Schakelmonteur" : "Montagemonteur";

const Capaciteit = () => {
  const [monteurs, setMonteurs] = useState<Monteur[]>([]);
  const [loading, setLoading] = useState(true);
  const [toonInactieven, setToonInactieven] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Monteur | null>(null);

  // form state
  const [naam, setNaam] = useState("");
  const [type, setType] = useState<MonteurType>("schakelmonteur");
  const [aanwijzingLs, setAanwijzingLs] = useState<Aanwijzing | null>(null);
  const [aanwijzingMs, setAanwijzingMs] = useState<Aanwijzing | null>(null);
  const [actief, setActief] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("monteurs")
        .select("*")
        .order("naam", { ascending: true });
      if (error) {
        toast.error("Kon monteurs niet laden");
      } else {
        setMonteurs((data ?? []) as Monteur[]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const zichtbaar = useMemo(
    () => monteurs.filter((m) => (toonInactieven ? true : m.actief)),
    [monteurs, toonInactieven]
  );

  const openNew = () => {
    setEditing(null);
    setNaam("");
    setType("schakelmonteur");
    setAanwijzingLs(null);
    setAanwijzingMs(null);
    setActief(true);
    setModalOpen(true);
  };

  const openEdit = (m: Monteur) => {
    setEditing(m);
    setNaam(m.naam);
    setType(m.type);
    setAanwijzingLs(m.aanwijzing_ls);
    setAanwijzingMs(m.aanwijzing_ms);
    setActief(m.actief);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const payload = {
      naam: naam.trim(),
      type,
      aanwijzing_ls: aanwijzingLs,
      aanwijzing_ms: aanwijzingMs,
      actief,
    };

    if (editing) {
      // optimistic
      const prev = monteurs;
      const optimistic = monteurs.map((m) =>
        m.id === editing.id ? { ...m, ...payload } : m
      );
      setMonteurs(optimistic);
      const { error } = await supabase
        .from("monteurs")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setMonteurs(prev);
        toast.error("Opslaan mislukt");
      } else {
        toast.success("Monteur opgeslagen");
        setModalOpen(false);
      }
    } else {
      const { data, error } = await supabase
        .from("monteurs")
        .insert(payload)
        .select()
        .single();
      if (error || !data) {
        toast.error("Opslaan mislukt");
      } else {
        setMonteurs((cur) =>
          [...cur, data as Monteur].sort((a, b) => a.naam.localeCompare(b.naam))
        );
        toast.success("Monteur opgeslagen");
        setModalOpen(false);
      }
    }
    setSaving(false);
  };

  const toggleActief = async (m: Monteur) => {
    const prev = monteurs;
    const next = monteurs.map((x) =>
      x.id === m.id ? { ...x, actief: !x.actief } : x
    );
    setMonteurs(next);
    const { error } = await supabase
      .from("monteurs")
      .update({ actief: !m.actief })
      .eq("id", m.id);
    if (error) {
      setMonteurs(prev);
      toast.error("Wijzigen mislukt");
    }
  };

  const PillButton = ({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md px-3.5 py-1.5 text-xs font-display font-semibold tracking-wide transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary))]"
          : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <PageHeader title="Capaciteit" description="Monteurs en hun beschikbaarheid." />
        <Button
          onClick={openNew}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Monteur toevoegen
        </Button>
      </div>

      <div className="surface-card overflow-hidden">
        {/* Top bar with toggle */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {zichtbaar.length} monteur{zichtbaar.length === 1 ? "" : "s"}
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
            <span className="font-display">Toon inactieven</span>
            <Switch
              checked={toonInactieven}
              onCheckedChange={setToonInactieven}
              className="data-[state=checked]:bg-primary"
            />
          </label>
        </div>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            Laden…
          </div>
        ) : zichtbaar.length === 0 ? (
          <EmptyState onAdd={openNew} totalCount={monteurs.length} />
        ) : (
          <div className="px-2 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-display font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Naam</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Aanwijzing LS</th>
                  <th className="px-4 py-3 font-semibold">Aanwijzing MS</th>
                  <th className="px-4 py-3 text-right font-semibold">Acties</th>
                </tr>
              </thead>
              <tbody>
                {zichtbaar.map((m) => (
                  <tr
                    key={m.id}
                    className="group border-b transition-colors hover:bg-white/[0.04]"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-display font-semibold text-foreground">
                        {m.naam}
                        {!m.actief && (
                          <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            inactief
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-semibold"
                        style={typeStyle(m.type)}
                      >
                        {typeLabel(m.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {m.aanwijzing_ls ? (
                        <span
                          className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
                          style={aanwijzingStyle(m.aanwijzing_ls)}
                        >
                          {m.aanwijzing_ls}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {m.aanwijzing_ms ? (
                        <span
                          className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
                          style={aanwijzingStyle(m.aanwijzing_ms)}
                        >
                          {m.aanwijzing_ms}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(m)}
                          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                          aria-label="Wijzigen"
                          title="Wijzigen"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleActief(m)}
                          className={[
                            "rounded-md p-2 transition-colors hover:bg-white/[0.06]",
                            m.actief
                              ? "text-primary hover:text-primary"
                              : "text-muted-foreground hover:text-foreground",
                          ].join(" ")}
                          aria-label={m.actief ? "Op inactief zetten" : "Activeren"}
                          title={m.actief ? "Op inactief zetten" : "Activeren"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-md gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Monteur wijzigen" : "Monteur toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Annuleren
            </button>
          </div>

          <div className="space-y-5 px-6 py-6">
            {/* Naam */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Naam
              </Label>
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="Bijv. Hassan"
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary"
              />
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <div className="flex gap-2">
                {(["schakelmonteur", "montagemonteur"] as MonteurType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={[
                      "flex-1 rounded-md px-4 py-2.5 text-sm font-display font-semibold transition-all",
                      type === t
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </div>

            {/* Aanwijzing LS */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aanwijzing LS
              </Label>
              <div className="flex gap-2">
                {AANWIJZINGEN.map((a) => (
                  <PillButton
                    key={a}
                    active={aanwijzingLs === a}
                    onClick={() => setAanwijzingLs(aanwijzingLs === a ? null : a)}
                  >
                    {a}
                  </PillButton>
                ))}
              </div>
            </div>

            {/* Aanwijzing MS */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Aanwijzing MS
              </Label>
              <div className="flex gap-2">
                {AANWIJZINGEN.map((a) => (
                  <PillButton
                    key={a}
                    active={aanwijzingMs === a}
                    onClick={() => setAanwijzingMs(aanwijzingMs === a ? null : a)}
                  >
                    {a}
                  </PillButton>
                ))}
              </div>
            </div>

            {/* Actief */}
            <div className="flex items-center justify-between rounded-md bg-white/[0.03] px-4 py-3">
              <div>
                <div className="font-display text-sm font-semibold text-foreground">
                  Actief
                </div>
                <div className="text-xs text-muted-foreground">
                  Monteur is beschikbaar voor planning
                </div>
              </div>
              <Switch
                checked={actief}
                onCheckedChange={setActief}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>

          <div className="px-6 pb-6">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              {saving ? "Bezig met opslaan…" : "Opslaan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const EmptyState = ({
  onAdd,
  totalCount,
}: {
  onAdd: () => void;
  totalCount: number;
}) => (
  <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Plus className="h-7 w-7" strokeWidth={2} />
    </div>
    <h3 className="font-display text-lg font-bold text-foreground">
      {totalCount === 0
        ? "Nog geen monteurs toegevoegd"
        : "Geen actieve monteurs"}
    </h3>
    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
      {totalCount === 0
        ? "Voeg je eerste monteur toe om te beginnen met plannen"
        : "Schakel ‘Toon inactieven’ in om inactieve monteurs te zien"}
    </p>
    {totalCount === 0 && (
      <Button
        onClick={onAdd}
        className="mt-6 font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
      >
        <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Monteur toevoegen
      </Button>
    )}
  </div>
);

export default Capaciteit;
