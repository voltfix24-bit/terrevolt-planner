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
import {
  Copy,
  GripVertical,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
type FilterType = "alle" | CapType;

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

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "montage", label: "Montage" },
  { value: "schakel", label: "Schakel" },
  { value: "geen", label: "Geen" },
];

const capLabel = (c: CapType | null) =>
  c === "schakel" ? "Schakel" : c === "montage" ? "Montage" : "Geen";

const capAccent = (c: CapType | null): string => {
  if (c === "montage") return "#378add";
  if (c === "schakel") return "#feb300";
  return "rgba(255,255,255,0.2)";
};

const capIconBg = (c: CapType | null): { bg: string; color: string } => {
  if (c === "montage") return { bg: "rgba(55,138,221,0.12)", color: "#378add" };
  if (c === "schakel") return { bg: "rgba(254,179,0,0.12)", color: "#feb300" };
  return { bg: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" };
};

const capBadgeStyle = (c: CapType | null): React.CSSProperties => {
  if (c === "montage")
    return { background: "rgba(55,138,221,0.15)", color: "#378add" };
  if (c === "schakel")
    return { background: "rgba(254,179,0,0.15)", color: "#feb300" };
  return {
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.55)",
  };
};

const Activiteiten = () => {
  const [items, setItems] = useState<ActiviteitType[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ActiviteitType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ActiviteitType | null>(null);
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<FilterType>("alle");
  const [search, setSearch] = useState("");

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

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((a) => {
        if (filter !== "alle") {
          const cap = a.capaciteit_type ?? "geen";
          if (cap !== filter) return false;
        }
        if (q && !a.naam.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => (a.positie ?? 0) - (b.positie ?? 0));
  }, [items, filter, search]);

  const openNew = () => {
    setEditing(null);
    setNaam("");
    setCapType("geen");
    setMinPersonenTotaal(1);
    setMinPersonenGekwalificeerd(1);
    setMinLs(null);
    setMinMs(null);
    setKleur("c3");
    setDrawerOpen(true);
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
    setDrawerOpen(true);
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
      setItems(
        items.map((i) => (i.id === editing.id ? { ...i, ...payload } : i))
      );
      const { error } = await supabase
        .from("activiteit_types")
        .update(payload)
        .eq("id", editing.id);
      if (error) {
        setItems(prev);
        toast.error("Opslaan mislukt");
      } else {
        toast.success("Activiteit opgeslagen");
        setDrawerOpen(false);
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
        setDrawerOpen(false);
      }
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { count } = await supabase
      .from("project_activiteiten")
      .select("id", { count: "exact", head: true })
      .eq("activiteit_type_id", deleteTarget.id);
    if ((count ?? 0) > 0) {
      toast.error(
        `Activiteit is in gebruik door ${count} projectactiviteit${
          count === 1 ? "" : "en"
        }`
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

    const updates = reordered.map((it) =>
      supabase
        .from("activiteit_types")
        .update({ positie: it.positie })
        .eq("id", it.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      setItems(prev);
      toast.error("Volgorde opslaan mislukt");
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1
          style={{
            fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 28,
            color: "#ffffff",
            letterSpacing: "-0.01em",
          }}
        >
          Activiteiten
        </h1>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-lg transition-colors hover:brightness-110"
          style={{
            background: "#3fff8b",
            color: "#030e20",
            fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            fontWeight: 700,
            padding: "10px 20px",
            fontSize: 14,
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Activiteit toevoegen
        </button>
      </div>

      {/* Filter + search bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className="rounded-lg transition-colors"
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                  background: active ? "#3fff8b" : "rgba(255,255,255,0.05)",
                  color: active ? "#030e20" : "rgba(255,255,255,0.55)",
                  border: active
                    ? "1px solid #3fff8b"
                    : "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ width: 16, height: 16, color: "rgba(255,255,255,0.4)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam..."
            className="w-full transition-colors focus:outline-none"
            style={{
              background: "rgba(10,26,48,0.6)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "10px 16px 10px 40px",
              color: "#ffffff",
              fontSize: 13,
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#3fff8b")}
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")
            }
          />
        </div>
      </div>

      {loading ? (
        <div
          className="px-6 py-16 text-center text-sm"
          style={{
            background: "rgba(10,26,48,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Laden…
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center px-6 py-20 text-center"
          style={{
            background: "rgba(10,26,48,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <div
            className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: "rgba(63,255,139,0.1)",
              color: "#3fff8b",
            }}
          >
            <Plus className="h-7 w-7" strokeWidth={2} />
          </div>
          <h3
            style={{
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 700,
              fontSize: 18,
              color: "#ffffff",
            }}
          >
            Nog geen activiteiten geconfigureerd
          </h3>
          <p
            className="mt-1.5 max-w-sm text-sm"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Voeg activiteiten toe om ze in projecten te kunnen plannen
          </p>
          <button
            type="button"
            onClick={openNew}
            className="mt-6 flex items-center gap-2 rounded-lg transition-colors hover:brightness-110"
            style={{
              background: "#3fff8b",
              color: "#030e20",
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              fontWeight: 700,
              padding: "10px 20px",
              fontSize: 14,
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Activiteit toevoegen
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          className="px-6 py-12 text-center text-sm"
          style={{
            background: "rgba(10,26,48,0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Geen activiteiten gevonden voor deze filter.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div>
              {filteredItems.map((a) => (
                <ActiviteitCard
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

      {/* Side drawer for add/edit */}
      {drawerOpen && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0"
            style={{
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
              zIndex: 40,
              animation: "fadeIn 0.2s ease",
            }}
          />
          <div
            className="fixed right-0 top-0 flex flex-col"
            style={{
              width: 440,
              maxWidth: "100vw",
              height: "100vh",
              background: "rgba(8, 18, 38, 0.97)",
              borderLeft: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              zIndex: 50,
              animation: "slideInRight 0.25s ease",
            }}
          >
            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}</style>
            {/* Drawer header */}
            <div
              className="flex items-center gap-3"
              style={{
                padding: "24px 32px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: 3,
                  height: 24,
                  background: "#3fff8b",
                  borderRadius: 2,
                }}
              />
              <h2
                style={{
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 20,
                  color: "#ffffff",
                  flex: 1,
                }}
              >
                {editing ? "Activiteit wijzigen" : "Activiteit toevoegen"}
              </h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1.5 transition-colors hover:bg-white/[0.06]"
                style={{ color: "rgba(255,255,255,0.5)" }}
                aria-label="Sluiten"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer content */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ padding: 32 }}
            >
              {/* Section 1: Naam */}
              <DrawerLabel>Naam van de activiteit</DrawerLabel>
              <input
                type="text"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="bijv. Schakelen/Montage MS"
                className="w-full transition-colors focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.15)",
                  padding: "12px 4px",
                  color: "#ffffff",
                  fontSize: 15,
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderBottom = "1px solid #3fff8b")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderBottom =
                    "1px solid rgba(255,255,255,0.15)")
                }
              />

              {/* Section 2: Capaciteit type */}
              <div style={{ marginTop: 28 }}>
                <DrawerLabel>Capaciteit type</DrawerLabel>
                <div className="flex gap-2">
                  {(["geen", "montage", "schakel"] as CapType[]).map((c) => {
                    const active = capType === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCapType(c)}
                        className="flex-1 transition-colors"
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily:
                            "Manrope, ui-sans-serif, system-ui, sans-serif",
                          background: active
                            ? "rgba(63,255,139,0.15)"
                            : "rgba(255,255,255,0.04)",
                          border: active
                            ? "1px solid #3fff8b"
                            : "1px solid rgba(255,255,255,0.1)",
                          color: active ? "#3fff8b" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        {capLabel(c)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {capType !== "geen" && (
                <>
                  {/* Section 3: Personen */}
                  <div style={{ marginTop: 28 }}>
                    <DrawerLabel>Minimaal aantal personen</DrawerLabel>
                    <div className="grid grid-cols-2 gap-3">
                      <PersonInput
                        label="Totaal"
                        value={minPersonenTotaal}
                        min={1}
                        max={10}
                        onChange={(v) => {
                          setMinPersonenTotaal(v);
                          if (minPersonenGekwalificeerd > v)
                            setMinPersonenGekwalificeerd(v);
                        }}
                      />
                      <PersonInput
                        label="Waarvan minimaal"
                        value={minPersonenGekwalificeerd}
                        min={1}
                        max={minPersonenTotaal}
                        onChange={(v) =>
                          setMinPersonenGekwalificeerd(
                            Math.max(1, Math.min(minPersonenTotaal, v))
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* Section 4: Kwalificaties */}
                  <div style={{ marginTop: 28 }}>
                    <DrawerLabel>Kwalificatie selectie</DrawerLabel>
                    <KwalRow
                      label="Laagspanning (LS)"
                      value={minLs}
                      onChange={(v) => setMinLs(v)}
                    />
                    <div style={{ height: 12 }} />
                    <KwalRow
                      label="Middenspanning (MS)"
                      value={minMs}
                      onChange={(v) => setMinMs(v)}
                    />
                  </div>
                </>
              )}

              {/* Section 5: Kleur */}
              <div style={{ marginTop: 28 }}>
                <DrawerLabel>Standaard kleurcode</DrawerLabel>
                <div className="flex flex-wrap" style={{ gap: 10 }}>
                  {PLANNING_COLORS.map((c) => {
                    const selected = kleur === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setKleur(c.code)}
                        aria-label={c.code}
                        className="transition-transform hover:scale-110"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: c.hex,
                          boxShadow: selected
                            ? "0 0 0 2px rgba(8,18,38,0.97), 0 0 0 4px #ffffff"
                            : "none",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drawer footer */}
            <div
              className="flex items-center gap-3"
              style={{
                padding: "20px 32px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg transition-colors hover:bg-white/[0.06]"
                style={{
                  padding: "10px 16px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg transition-colors hover:brightness-110 disabled:opacity-50"
                style={{
                  padding: "10px 16px",
                  background: "#3fff8b",
                  color: "#030e20",
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {saving ? "Bezig met opslaan…" : "Opslaan"}
              </button>
            </div>
          </div>
        </>
      )}

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

// ============== Drawer subcomponents ==============

const DrawerLabel = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "rgba(255,255,255,0.4)",
      marginBottom: 10,
    }}
  >
    {children}
  </div>
);

const PersonInput = ({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) => (
  <div>
    <div
      style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 6,
        fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {label}
    </div>
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value) || min))}
      className="w-full text-center transition-colors focus:outline-none"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 8px",
        color: "#3fff8b",
        fontWeight: 700,
        fontSize: 18,
        fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#3fff8b")}
      onBlur={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")
      }
    />
  </div>
);

const KwalRow = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Aanwijzing | null;
  onChange: (v: Aanwijzing | null) => void;
}) => (
  <div>
    <div
      style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.5)",
        marginBottom: 6,
        fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {label}
    </div>
    <div className="flex gap-2">
      {AANWIJZINGEN.map((a) => {
        const active = value === a;
        return (
          <button
            key={a}
            type="button"
            onClick={() => onChange(active ? null : a)}
            className="flex-1 transition-colors"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              background: active
                ? "rgba(63,255,139,0.15)"
                : "rgba(255,255,255,0.04)",
              border: active
                ? "1px solid #3fff8b"
                : "1px solid rgba(255,255,255,0.1)",
              color: active ? "#3fff8b" : "rgba(255,255,255,0.6)",
            }}
          >
            {a}
          </button>
        );
      })}
    </div>
  </div>
);

// ============== Card ==============

const ActiviteitCard = ({
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

  const cap = a.capaciteit_type;
  const hasCap = cap === "schakel" || cap === "montage";
  const accent = capAccent(cap);
  const iconStyle = capIconBg(cap);
  const Icon =
    cap === "montage" ? Wrench : cap === "schakel" ? Zap : Package;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: "rgba(10,26,48,0.6)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 8,
        position: "relative",
        transition: "border-color 0.15s",
      }}
      className="group flex items-center gap-4"
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "rgba(63,255,139,0.25)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")
      }
    >
      {/* Left accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 8,
          bottom: 8,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: accent,
        }}
      />

      {/* Icon container */}
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: iconStyle.bg,
          color: iconStyle.color,
        }}
      >
        <Icon style={{ width: 20, height: 20 }} strokeWidth={2.2} />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            fontWeight: 700,
            fontSize: 15,
            color: "#ffffff",
            lineHeight: 1.3,
          }}
          className="truncate"
        >
          {a.naam}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: 4,
              letterSpacing: "0.05em",
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              ...capBadgeStyle(cap),
            }}
          >
            {capLabel(cap)}
          </span>

          {hasCap && (
            <span
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.5)",
                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              }}
            >
              min. {a.min_personen_totaal ?? a.min_personen ?? 1} man
            </span>
          )}

          {hasCap && a.min_aanwijzing_ls && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 4,
                letterSpacing: "0.05em",
                background: "rgba(63,255,139,0.15)",
                color: "#3fff8b",
                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              }}
            >
              LS: {a.min_aanwijzing_ls}+
            </span>
          )}
          {hasCap && a.min_aanwijzing_ms && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 4,
                letterSpacing: "0.05em",
                background: "rgba(63,255,139,0.15)",
                color: "#3fff8b",
                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              }}
            >
              MS: {a.min_aanwijzing_ms}+
            </span>
          )}
        </div>
      </div>

      {/* Right side info (kwalificaties) — hidden on small */}
      {hasCap && (
        <div className="hidden lg:flex flex-col items-end" style={{ gap: 4 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)",
              fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
            }}
          >
            Kwalificaties
          </div>
          <div className="flex items-center gap-1.5">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
              }}
            >
              {a.min_personen_totaal ?? a.min_personen ?? 1} man
            </span>
            {(a.min_aanwijzing_ms || a.min_aanwijzing_ls) && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)",
                  fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif",
                }}
              >
                {a.min_aanwijzing_ms
                  ? `MS ${a.min_aanwijzing_ms}+`
                  : `LS ${a.min_aanwijzing_ls}+`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Action buttons - show on hover */}
      <div
        className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ flexShrink: 0 }}
      >
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded-md p-2 transition-colors hover:bg-white/[0.06] active:cursor-grabbing"
          style={{ color: "rgba(255,255,255,0.4)" }}
          aria-label="Versleep"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md p-2 transition-colors hover:bg-white/[0.06] hover:text-white"
          style={{ color: "rgba(255,255,255,0.4)" }}
          aria-label="Wijzigen"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-md p-2 transition-colors hover:bg-white/[0.06] hover:text-white"
          style={{ color: "rgba(255,255,255,0.4)" }}
          aria-label="Dupliceren"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-2 transition-colors hover:bg-destructive/15"
          style={{ color: "rgba(255,255,255,0.4)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = "rgba(255,255,255,0.4)")
          }
          aria-label="Verwijderen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default Activiteiten;
