import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Pencil, Plus, Trash2, Users, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type CapType = "schakel" | "montage" | "geen";
type Aanwijzing = "VOP" | "VP" | "AVP";

interface ActiviteitType {
  id: string;
  naam: string;
  capaciteit_type: CapType | null;
  min_personen: number | null;
  min_personen_totaal: number | null;
  min_personen_gekwalificeerd: number | null;
  min_aanwijzing_ls: Aanwijzing | null;
  min_aanwijzing_ms: Aanwijzing | null;
  kleur_default: string | null;
  positie: number | null;
}

const AANWIJZINGEN: Aanwijzing[] = ["VOP", "VP", "AVP"];

const PLANNING_COLORS: { code: string; hex: string }[] = [
  { code: "c1", hex: "#00642f" },
  { code: "c2", hex: "#fdcb35" },
  { code: "c3", hex: "#1a4a2e" },
  { code: "c4", hex: "#0f766e" },
  { code: "c5", hex: "#1d4ed8" },
  { code: "c6", hex: "#dc2626" },
  { code: "c7", hex: "#9333ea" },
  { code: "c8", hex: "#ea580c" },
  { code: "c9", hex: "#0891b2" },
  { code: "c10", hex: "#65a30d" },
  { code: "c11", hex: "#be185d" },
  { code: "c12", hex: "#78716c" },
];

const capStyle = (c: CapType | null): React.CSSProperties => {
  if (c === "schakel") return { backgroundColor: "#feb300", color: "#0a1a30" };
  if (c === "montage") return { backgroundColor: "#378add", color: "#0a1a30" };
  return { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" };
};

const capLabel = (c: CapType | null) =>
  c === "schakel" ? "Schakel" : c === "montage" ? "Montage" : "Geen";

const Activiteiten = () => {
  const [items, setItems] = useState<ActiviteitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ActiviteitType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActiviteitType | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [naam, setNaam] = useState("");
  const [capType, setCapType] = useState<CapType>("geen");
  const [minPersonenTotaal, setMinPersonenTotaal] = useState(1);
  const [minPersonenGekwalificeerd, setMinPersonenGekwalificeerd] = useState(1);
  const [minLs, setMinLs] = useState<Aanwijzing | null>(null);
  const [minMs, setMinMs] = useState<Aanwijzing | null>(null);
  const [kleur, setKleur] = useState<string>("c3");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("activiteit_types")
        .select("*")
        .order("positie", { ascending: true });
      if (error) {
        toast.error("Kon activiteiten niet laden");
      } else {
        setItems((data ?? []) as ActiviteitType[]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const maxPositie = useMemo(
    () => items.reduce((m, i) => Math.max(m, i.positie ?? 0), -1),
    [items]
  );

  const openNew = () => {
    setEditing(null);
    setNaam("");
    setCapType("geen");
    setMinPersonenTotaal(1);
    setMinPersonenGekwalificeerd(1);
    setMinLs(null);
    setMinMs(null);
    setKleur("c3");
    setModalOpen(true);
  };

  const openEdit = (a: ActiviteitType) => {
    setEditing(a);
    setNaam(a.naam);
    setCapType((a.capaciteit_type ?? "geen") as CapType);
    setMinPersonenTotaal(a.min_personen_totaal ?? a.min_personen ?? 1);
    setMinPersonenGekwalificeerd(
      a.min_personen_gekwalificeerd ?? a.min_personen ?? 1
    );
    setMinLs(a.min_aanwijzing_ls);
    setMinMs(a.min_aanwijzing_ms);
    setKleur(a.kleur_default ?? "c3");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!naam.trim()) {
      toast.error("Naam is verplicht");
      return;
    }
    setSaving(true);
    const isCap = capType !== "geen";
    const totaal = Math.max(1, Math.min(10, minPersonenTotaal));
    const gekwal = Math.max(1, Math.min(totaal, minPersonenGekwalificeerd));
    const payload = {
      naam: naam.trim(),
      capaciteit_type: capType,
      min_personen: isCap ? totaal : 1,
      min_personen_totaal: isCap ? totaal : 1,
      min_personen_gekwalificeerd: isCap ? gekwal : 1,
      min_aanwijzing_ls: isCap ? minLs : null,
      min_aanwijzing_ms: isCap ? minMs : null,
      kleur_default: kleur,
    };

    if (editing) {
      const prev = items;
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...payload } : i)));
      const { error } = await supabase
        .from("activiteit_types")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setItems(prev);
        toast.error("Opslaan mislukt");
      } else {
        toast.success("Activiteit opgeslagen");
        setModalOpen(false);
      }
    } else {
      const { data, error } = await supabase
        .from("activiteit_types")
        .insert({ ...payload, positie: maxPositie + 1 })
        .select()
        .single();
      if (error || !data) {
        toast.error("Opslaan mislukt");
      } else {
        setItems((cur) =>
          [...cur, data as ActiviteitType].sort(
            (a, b) => (a.positie ?? 0) - (b.positie ?? 0)
          )
        );
        toast.success("Activiteit opgeslagen");
        setModalOpen(false);
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    // Soft check: warn if in use by project_activiteiten
    const { count } = await supabase
      .from("project_activiteiten")
      .select("id", { count: "exact", head: true })
      .eq("activiteit_type_id", deleteTarget.id);
    if ((count ?? 0) > 0) {
      toast.error(
        `Activiteit is in gebruik door ${count} projectactiviteit${count === 1 ? "" : "en"}`
      );
      setDeleteTarget(null);
      return;
    }
    const prev = items;
    setItems(items.filter((i) => i.id !== deleteTarget.id));
    const { error } = await supabase
      .from("activiteit_types")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      setItems(prev);
      toast.error("Verwijderen mislukt");
    } else {
      toast.success("Activiteit verwijderd");
    }
    setDeleteTarget(null);
  };

  const handleDuplicate = async (a: ActiviteitType) => {
    const { id: _id, positie: _p, naam: origNaam, ...rest } = a;
    const payload = {
      ...rest,
      naam: origNaam + " (kopie)",
      positie: maxPositie + 1,
    };
    const { data, error } = await supabase
      .from("activiteit_types")
      .insert(payload)
      .select()
      .single();
    if (error || !data) {
      toast.error("Dupliceren mislukt");
      return;
    }
    setItems((cur) =>
      [...cur, data as ActiviteitType].sort(
        (x, y) => (x.positie ?? 0) - (y.positie ?? 0)
      )
    );
    toast.success("Activiteit gedupliceerd");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((it, idx) => ({
      ...it,
      positie: idx,
    }));
    const prev = items;
    setItems(reordered);

    // Batch update positions in parallel
    const updates = reordered.map((it) =>
      supabase.from("activiteit_types").update({ positie: it.positie }).eq("id", it.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      setItems(prev);
      toast.error("Volgorde opslaan mislukt");
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-end justify-between gap-4">
        <PageHeader
          title="Activiteiten"
          description="Configureer activiteiten en hun capaciteitsvereisten"
        />
        <Button
          onClick={openNew}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
        >
          <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Activiteit toevoegen
        </Button>
      </div>

      {loading ? (
        <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
          Laden…
        </div>
      ) : items.length === 0 ? (
        <div className="surface-card flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Plus className="h-7 w-7" strokeWidth={2} />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            Nog geen activiteiten geconfigureerd
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Voeg activiteiten toe om ze in projecten te kunnen plannen
          </p>
          <Button
            onClick={openNew}
            className="mt-6 font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.5} /> Activiteit toevoegen
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2.5">
              {items.map((a) => (
                <ActiviteitRow
                  key={a.id}
                  a={a}
                  onEdit={() => openEdit(a)}
                  onDuplicate={() => handleDuplicate(a)}
                  onDelete={() => setDeleteTarget(a)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-lg gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Activiteit wijzigen" : "Activiteit toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Annuleren
            </button>
          </div>

          <div className="space-y-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
            {/* Naam */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Naam
              </Label>
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="bijv. Schakelen/Montage MS"
                className="rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-primary"
              />
            </div>

            {/* Capaciteit type */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Capaciteit type
              </Label>
              <div className="flex gap-2">
                {(["geen", "montage", "schakel"] as CapType[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCapType(c)}
                    className={[
                      "flex-1 rounded-md px-4 py-2.5 text-sm font-display font-semibold transition-all",
                      capType === c
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                    ].join(" ")}
                  >
                    {capLabel(c)}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional capaciteit fields */}
            {capType !== "geen" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Minimaal aantal personen totaal
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={minPersonenTotaal}
                      onChange={(e) => {
                        const v = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                        setMinPersonenTotaal(v);
                        if (minPersonenGekwalificeerd > v) {
                          setMinPersonenGekwalificeerd(v);
                        }
                      }}
                      className="rounded-md border-white/10 bg-white/[0.04] text-foreground focus-visible:ring-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Inclusief assistenten (VOP)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Waarvan minimaal met aanwijzing
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={minPersonenTotaal}
                      value={minPersonenGekwalificeerd}
                      onChange={(e) =>
                        setMinPersonenGekwalificeerd(
                          Math.max(
                            1,
                            Math.min(minPersonenTotaal, parseInt(e.target.value) || 1)
                          )
                        )
                      }
                      className="rounded-md border-white/10 bg-white/[0.04] text-foreground focus-visible:ring-primary"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Deze personen moeten de minimale aanwijzing hebben of hoger
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Minimale aanwijzing laagspanning (verantwoordelijke)
                  </Label>
                  <div className="flex gap-2">
                    {AANWIJZINGEN.map((a) => (
                      <PillButton
                        key={a}
                        active={minLs === a}
                        onClick={() => setMinLs(minLs === a ? null : a)}
                      >
                        {a}
                      </PillButton>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Minimale aanwijzing middenspanning (verantwoordelijke)
                  </Label>
                  <div className="flex gap-2">
                    {AANWIJZINGEN.map((a) => (
                      <PillButton
                        key={a}
                        active={minMs === a}
                        onClick={() => setMinMs(minMs === a ? null : a)}
                      >
                        {a}
                      </PillButton>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Kleur */}
            <div className="space-y-2">
              <Label className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Standaard kleur
              </Label>
              <div className="grid grid-cols-6 gap-2.5">
                {PLANNING_COLORS.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setKleur(c.code)}
                    aria-label={c.code}
                    className={[
                      "relative h-9 w-9 rounded-full transition-transform hover:scale-110",
                      kleur === c.code
                        ? "ring-2 ring-white ring-offset-2 ring-offset-[#0a1a30]"
                        : "",
                    ].join(" ")}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
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

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-foreground">
              Weet je zeker dat je '{deleteTarget?.naam}' wilt verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Deze activiteit wordt verwijderd uit de configuratie. Bestaande
              planningen worden niet aangepast.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md border-white/10 bg-transparent text-foreground hover:bg-white/[0.06]">
              Annuleren
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
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
        ? "bg-primary text-primary-foreground"
        : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
    ].join(" ")}
  >
    {children}
  </button>
);

const ActiviteitRow = ({
  a,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  a: ActiviteitType;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: a.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : "auto",
  };

  const showAanwijzing =
    a.capaciteit_type === "schakel" || a.capaciteit_type === "montage";

  const colorHex = PLANNING_COLORS.find((c) => c.code === a.kleur_default)?.hex;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="surface-card flex items-center gap-4 px-4 py-3.5"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground active:cursor-grabbing"
        aria-label="Versleep"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Color dot */}
      {colorHex && (
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
      )}

      {/* Naam */}
      <div className="min-w-[180px] flex-shrink-0">
        <div className="font-display font-bold text-foreground">{a.naam}</div>
      </div>

      {/* Pills */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-display font-semibold"
          style={capStyle(a.capaciteit_type)}
        >
          {a.capaciteit_type === "schakel" ? (
            <Zap className="h-3 w-3" strokeWidth={2.5} />
          ) : a.capaciteit_type === "montage" ? (
            <Users className="h-3 w-3" strokeWidth={2.5} />
          ) : null}
          {capLabel(a.capaciteit_type)}
        </span>

        <span className="inline-flex items-center rounded-md bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          min. {a.min_personen_totaal ?? a.min_personen ?? 1} man (
          {a.min_personen_gekwalificeerd ?? a.min_personen ?? 1} gekwal.)
        </span>

        {showAanwijzing && a.min_aanwijzing_ls && (
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
            style={{ backgroundColor: "rgba(63,255,139,0.15)", color: "#3fff8b" }}
          >
            LS: {a.min_aanwijzing_ls}+
          </span>
        )}
        {showAanwijzing && a.min_aanwijzing_ms && (
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-display font-bold tracking-wide"
            style={{ backgroundColor: "rgba(63,255,139,0.15)", color: "#3fff8b" }}
          >
            MS: {a.min_aanwijzing_ms}+
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onEdit}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          aria-label="Wijzigen"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          aria-label="Verwijderen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Activiteiten;
