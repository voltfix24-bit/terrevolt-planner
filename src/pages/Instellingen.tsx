import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Link2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { supabase } from "@/integrations/supabase/client";
import { LookupBeheer } from "@/components/LookupBeheer";

// ---------- types ----------
type TemplateType = "NSA" | "provisorium" | "compact" | "custom";

interface ActiviteitType {
  id: string;
  naam: string;
  capaciteit_type: string | null;
  positie: number | null;
}

interface ProjectTemplate {
  id: string;
  naam: string;
  type: string;
  omschrijving: string | null;
  activiteit_type_ids: string[] | null;
}

const BUILTIN_TYPES: TemplateType[] = ["NSA", "provisorium", "compact"];

const TYPE_LABEL: Record<TemplateType, string> = {
  NSA: "NSA",
  provisorium: "Provisorium",
  compact: "Compact",
  custom: "Custom",
};

const TYPE_BADGE_STYLE: Record<TemplateType, string> = {
  NSA: "bg-[#feb300] text-[#1a1200]",
  provisorium: "bg-[#378add] text-[#0a1428]",
  compact: "bg-[#0f766e] text-white",
  custom: "bg-white/10 text-muted-foreground",
};

const KOPPELING: { type: TemplateType; namen: string[] }[] = [
  {
    type: "NSA",
    namen: [
      "Civiele werkzaamheden",
      "Levering provisorium/NSA",
      "Aarding slaan",
      "Eindsluitingen prov./compact",
      "Schakelen/montage MS",
      "Schakelen/montage LS",
      "Inmeten",
      "Transport",
      "Bouwkunde",
      "Inrichten",
      "Afvoeren provisorium/NSA",
    ],
  },
  {
    type: "provisorium",
    namen: [
      "Levering provisorium/NSA",
      "Aarding slaan",
      "Schakelen/montage MS",
      "Schakelen/montage LS",
      "Inmeten",
      "Afvoeren provisorium/NSA",
    ],
  },
  {
    type: "compact",
    namen: [
      "Civiele werkzaamheden",
      "Levering provisorium/NSA",
      "Aarding slaan",
      "Eindsluitingen prov./compact",
      "Schakelen/montage MS",
      "Schakelen/montage LS",
      "Inmeten",
      "Transport",
      "Bouwkunde",
      "Inrichten",
    ],
  },
];

// ---------- shared classes ----------
const inputCls =
  "rounded-md border-white/10 bg-white/[0.04] text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-primary";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <span className="block text-[11px] font-display font-semibold uppercase tracking-[0.14em] text-primary/80">
      {label}
    </span>
    {children}
  </div>
);

// ---------- main page ----------
const Instellingen = () => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [activiteiten, setActiviteiten] = useState<ActiviteitType[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectTemplate | null>(null);

  const [naam, setNaam] = useState("");
  const [type, setType] = useState<TemplateType>("custom");
  const [omschrijving, setOmschrijving] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [dataOpen, setDataOpen] = useState(false);
  const [koppelRunning, setKoppelRunning] = useState(false);
  const [feestdagenRunning, setFeestdagenRunning] = useState(false);

  const autoRanRef = useRef(false);

  // ---------- load ----------
  const load = async () => {
    setLoading(true);
    const [tmplRes, actRes] = await Promise.all([
      supabase
        .from("project_templates")
        .select("id, naam, type, omschrijving, activiteit_type_ids")
        .order("created_at", { ascending: true }),
      supabase
        .from("activiteit_types")
        .select("id, naam, capaciteit_type, positie")
        .order("positie", { ascending: true }),
    ]);
    setTemplates((tmplRes.data ?? []) as ProjectTemplate[]);
    setActiviteiten((actRes.data ?? []) as ActiviteitType[]);
    setLoading(false);
    return {
      templates: (tmplRes.data ?? []) as ProjectTemplate[],
      activiteiten: (actRes.data ?? []) as ActiviteitType[],
    };
  };

  // ---------- koppel logic ----------
  const runKoppel = async (
    tmplsArg?: ProjectTemplate[],
    actsArg?: ActiviteitType[],
  ): Promise<boolean> => {
    const tmpls = tmplsArg ?? templates;
    const acts = actsArg ?? activiteiten;
    let allOk = true;
    for (const k of KOPPELING) {
      const tpl = tmpls.find((t) => t.type === k.type);
      if (!tpl) {
        allOk = false;
        continue;
      }
      const ids = k.namen
        .map((n) => acts.find((a) => a.naam === n)?.id)
        .filter((x): x is string => !!x);
      const { error } = await supabase
        .from("project_templates")
        .update({ activiteit_type_ids: ids })
        .eq("id", tpl.id);
      if (error) allOk = false;
    }
    return allOk;
  };

  const handleKoppelClick = async () => {
    setKoppelRunning(true);
    const ok = await runKoppel();
    if (ok) toast.success("Templates gekoppeld ✓");
    else toast.error("Koppelen mislukt");
    await load();
    setKoppelRunning(false);
  };

  const handleSeedFeestdagen = async () => {
    setFeestdagenRunning(true);
    // Bevrijdingsdag (5 mei) is alleen een officiële vrije dag
    // in lustrumjaren (deelbaar door 5): 2025, 2030, 2035...
    // Niet in 2026, 2027, 2028, 2029.
    const feestdagen = [
      { datum: "2025-01-01", naam: "Nieuwjaarsdag", jaar: 2025 },
      { datum: "2025-04-18", naam: "Goede Vrijdag", jaar: 2025 },
      { datum: "2025-04-20", naam: "Eerste Paasdag", jaar: 2025 },
      { datum: "2025-04-21", naam: "Tweede Paasdag", jaar: 2025 },
      { datum: "2025-04-26", naam: "Koningsdag", jaar: 2025 },
      { datum: "2025-05-05", naam: "Bevrijdingsdag", jaar: 2025 },
      { datum: "2025-05-29", naam: "Hemelvaartsdag", jaar: 2025 },
      { datum: "2025-06-08", naam: "Eerste Pinksterdag", jaar: 2025 },
      { datum: "2025-06-09", naam: "Tweede Pinksterdag", jaar: 2025 },
      { datum: "2025-12-25", naam: "Eerste Kerstdag", jaar: 2025 },
      { datum: "2025-12-26", naam: "Tweede Kerstdag", jaar: 2025 },
      { datum: "2026-01-01", naam: "Nieuwjaarsdag", jaar: 2026 },
      { datum: "2026-04-03", naam: "Goede Vrijdag", jaar: 2026 },
      { datum: "2026-04-05", naam: "Eerste Paasdag", jaar: 2026 },
      { datum: "2026-04-06", naam: "Tweede Paasdag", jaar: 2026 },
      { datum: "2026-04-27", naam: "Koningsdag", jaar: 2026 },
      { datum: "2026-05-14", naam: "Hemelvaartsdag", jaar: 2026 },
      { datum: "2026-05-24", naam: "Eerste Pinksterdag", jaar: 2026 },
      { datum: "2026-05-25", naam: "Tweede Pinksterdag", jaar: 2026 },
      { datum: "2026-12-25", naam: "Eerste Kerstdag", jaar: 2026 },
      { datum: "2026-12-26", naam: "Tweede Kerstdag", jaar: 2026 },
      { datum: "2027-01-01", naam: "Nieuwjaarsdag", jaar: 2027 },
      { datum: "2027-03-26", naam: "Goede Vrijdag", jaar: 2027 },
      { datum: "2027-03-28", naam: "Eerste Paasdag", jaar: 2027 },
      { datum: "2027-03-29", naam: "Tweede Paasdag", jaar: 2027 },
      { datum: "2027-04-27", naam: "Koningsdag", jaar: 2027 },
      { datum: "2027-05-06", naam: "Hemelvaartsdag", jaar: 2027 },
      { datum: "2027-05-16", naam: "Eerste Pinksterdag", jaar: 2027 },
      { datum: "2027-05-17", naam: "Tweede Pinksterdag", jaar: 2027 },
      { datum: "2027-12-25", naam: "Eerste Kerstdag", jaar: 2027 },
      { datum: "2027-12-26", naam: "Tweede Kerstdag", jaar: 2027 },
    ];

    const lustrumCheck = async () => {
      const nonLustrumYears = [2026, 2027, 2028, 2029, 2031, 2032, 2033, 2034];
      await supabase
        .from("feestdagen")
        .delete()
        .eq("naam", "Bevrijdingsdag")
        .in("jaar", nonLustrumYears);
    };

    await lustrumCheck();

    const { error } = await supabase
      .from("feestdagen")
      .upsert(feestdagen, { onConflict: "datum" });
    if (error) {
      toast.error("Seeden mislukt: " + error.message);
    } else {
      toast.success("Feestdagen geseed ✓ — Bevrijdingsdag alleen in lustrumjaren");
    }
    setFeestdagenRunning(false);
  };

  // ---------- mount ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { templates: tmpls, activiteiten: acts } = await load();
      if (cancelled || autoRanRef.current) return;
      const needsKoppel = BUILTIN_TYPES.some((bt) => {
        const tpl = tmpls.find((t) => t.type === bt);
        return tpl && (!tpl.activiteit_type_ids || tpl.activiteit_type_ids.length === 0);
      });
      if (needsKoppel && acts.length > 0) {
        autoRanRef.current = true;
        const ok = await runKoppel(tmpls, acts);
        if (ok) toast("Templates automatisch gekoppeld");
        await load();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- modal helpers ----------
  const openNew = () => {
    setEditing(null);
    setNaam("");
    setType("custom");
    setOmschrijving("");
    setSelectedIds([]);
    setModalOpen(true);
  };

  const openEdit = (t: ProjectTemplate) => {
    setEditing(t);
    setNaam(t.naam);
    setType((t.type as TemplateType) ?? "custom");
    setOmschrijving(t.omschrijving ?? "");
    setSelectedIds(t.activiteit_type_ids ?? []);
    setModalOpen(true);
  };

  const toggleActiviteit = (id: string) => {
    setSelectedIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  };

  // drag-reorder selected list
  const dragIndexRef = useRef<number | null>(null);
  const onDragStart = (idx: number) => {
    dragIndexRef.current = idx;
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === idx) return;
    setSelectedIds((cur) => {
      const next = [...cur];
      const [m] = next.splice(from, 1);
      next.splice(idx, 0, m);
      dragIndexRef.current = idx;
      return next;
    });
  };
  const onDragEnd = () => {
    dragIndexRef.current = null;
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
      omschrijving: omschrijving.trim() || null,
      activiteit_type_ids: selectedIds,
    };
    let error;
    if (editing) {
      ({ error } = await supabase
        .from("project_templates")
        .update(payload)
        .eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("project_templates").insert(payload));
    }
    if (error) {
      toast.error("Opslaan mislukt");
    } else {
      toast.success("Template opgeslagen");
      setModalOpen(false);
      await load();
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("project_templates")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) toast.error("Verwijderen mislukt");
    else {
      toast.success("Template verwijderd");
      await load();
    }
    setDeleteTarget(null);
  };

  // ---------- derived ----------
  const actById = useMemo(() => {
    const m = new Map<string, ActiviteitType>();
    activiteiten.forEach((a) => m.set(a.id, a));
    return m;
  }, [activiteiten]);

  const selectedActs = useMemo(
    () => selectedIds.map((id) => actById.get(id)).filter((x): x is ActiviteitType => !!x),
    [selectedIds, actById],
  );

  const unselectedActs = useMemo(
    () => activiteiten.filter((a) => !selectedIds.includes(a.id)),
    [activiteiten, selectedIds],
  );

  const isLockedType = editing && BUILTIN_TYPES.includes(editing.type as TemplateType);

  // ---------- render ----------
  return (
    <div>
      <PageHeader
        title="Instellingen"
        description="Beheer project templates en data."
      />

      {/* Section 1: templates */}
      <section className="surface-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              Project templates
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-xl">
              Templates bepalen welke activiteiten automatisch worden aangemaakt
              bij een nieuw project.
            </p>
          </div>
          <Button
            onClick={openNew}
            className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
          >
            <Plus className="h-4 w-4 mr-1.5" strokeWidth={3} />
            Template toevoegen
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen templates.</p>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => {
              const tt = (t.type as TemplateType) ?? "custom";
              const isBuiltin = BUILTIN_TYPES.includes(tt);
              const linked = (t.activiteit_type_ids ?? [])
                .map((id) => actById.get(id))
                .filter((x): x is ActiviteitType => !!x);
              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <h3 className="font-display text-base font-bold tracking-tight text-foreground">
                        {t.naam}
                      </h3>
                      <span
                        className={[
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-display font-semibold uppercase tracking-wider",
                          TYPE_BADGE_STYLE[tt],
                        ].join(" ")}
                      >
                        {TYPE_LABEL[tt]}
                      </span>
                      {isBuiltin && (
                        <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
                          ingebouwd
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(t)}
                        className="rounded-md p-2 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                        title="Wijzigen"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {!isBuiltin && (
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {t.omschrijving && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t.omschrijving}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {linked.length === 0 ? (
                      <span className="text-xs text-destructive/80">
                        Geen activiteiten gekoppeld
                      </span>
                    ) : (
                      linked.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-foreground/85"
                        >
                          {a.naam}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: data & onderhoud */}
      <section className="surface-card p-6">
        <button
          onClick={() => setDataOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
              Data &amp; onderhoud
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hulpfuncties voor eenmalige data-acties.
            </p>
          </div>
          {dataOpen ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </button>

        {dataOpen && (
          <div className="mt-5 space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold tracking-tight text-foreground">
                    Templates koppelen (eenmalig)
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Koppelt de standaard activiteiten aan de ingebouwde templates.
                    Alleen nodig als de templates leeg zijn.
                  </p>
                </div>
                <Button
                  onClick={handleKoppelClick}
                  disabled={koppelRunning}
                  className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
                >
                  <Link2 className="h-4 w-4 mr-1.5" />
                  {koppelRunning ? "Bezig…" : "Templates koppelen"}
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold tracking-tight text-foreground">
                    Feestdagen seeden (eenmalig)
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Voegt Nederlandse feestdagen toe voor 2025, 2026 en 2027.
                  </p>
                </div>
                <Button
                  onClick={handleSeedFeestdagen}
                  disabled={feestdagenRunning}
                  className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
                >
                  <CalendarDays className="h-4 w-4 mr-1.5" />
                  {feestdagenRunning ? "Bezig…" : "Feestdagen seeden"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Lookup beheer voor project intake */}
      <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
        <div className="mb-4">
          <h2 className="font-display text-lg font-bold tracking-tight text-foreground">
            Project intake — beheer
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Beheer de selecteerbare opties voor opdrachtgever en perceel in de project intake.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LookupBeheer
            table="opdrachtgevers"
            title="Opdrachtgevers"
            description="Bv. Stedin, Liander, Enexis"
            placeholder="Naam opdrachtgever"
          />
          <LookupBeheer
            table="percelen"
            title="Percelen"
            description="Bv. Perceel 1, Perceel Noord, …"
            placeholder="Naam perceel"
          />
        </div>
      </section>

      {/* Add/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          className="max-w-[640px] gap-0 border-0 p-0 [&>button]:hidden"
          style={{
            backgroundColor: "rgba(10, 26, 48, 0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            backdropFilter: "blur(18px)",
          }}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              {editing ? "Template wijzigen" : "Template toevoegen"}
            </h2>
            <button
              onClick={() => setModalOpen(false)}
              className="-mr-2 -mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Annuleren
            </button>
          </div>

          <div className="space-y-5 px-6 py-6 max-h-[70vh] overflow-y-auto">
            <Field label="Naam">
              <Input
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
                placeholder="bijv. Mijn template"
                className={inputCls}
              />
            </Field>

            <Field label="Type">
              <div className="grid grid-cols-4 gap-2">
                {(["NSA", "provisorium", "compact", "custom"] as TemplateType[]).map(
                  (c) => {
                    const disabled = !!isLockedType && c !== type;
                    return (
                      <button
                        key={c}
                        type="button"
                        disabled={disabled}
                        onClick={() => !isLockedType && setType(c)}
                        className={[
                          "rounded-md px-4 py-3 text-sm font-display font-bold tracking-tight transition-all",
                          type === c
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground",
                          disabled ? "opacity-40 cursor-not-allowed" : "",
                        ].join(" ")}
                      >
                        {TYPE_LABEL[c]}
                      </button>
                    );
                  },
                )}
              </div>
              {isLockedType && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Het type van een ingebouwde template kan niet worden gewijzigd.
                </p>
              )}
            </Field>

            <Field label="Omschrijving">
              <Textarea
                value={omschrijving}
                onChange={(e) => setOmschrijving(e.target.value)}
                rows={2}
                placeholder="Korte toelichting…"
                className={inputCls + " min-h-[64px] resize-none"}
              />
            </Field>

            <Field label={`Activiteiten (${selectedIds.length} geselecteerd)`}>
              <div className="space-y-3">
                {/* Selected (draggable) */}
                {selectedActs.length > 0 && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1">
                    <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-primary/70">
                      Geselecteerd — sleep om te sorteren
                    </div>
                    {selectedActs.map((a, idx) => (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDragEnd={onDragEnd}
                        className="flex items-center gap-2 rounded-md border-l-2 border-primary bg-white/[0.04] px-2 py-1.5 cursor-move hover:bg-white/[0.07] transition-colors"
                      >
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <span className="text-[10px] font-mono text-muted-foreground/60 w-5">
                          {idx + 1}.
                        </span>
                        <span className="flex-1 text-sm text-foreground">{a.naam}</span>
                        {a.capaciteit_type && (
                          <span className="rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {a.capaciteit_type}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleActiviteit(a.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Available */}
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 space-y-1 max-h-[280px] overflow-y-auto">
                  <div className="px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Beschikbaar
                  </div>
                  {unselectedActs.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">
                      Alle activiteiten zijn geselecteerd.
                    </p>
                  ) : (
                    unselectedActs.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleActiviteit(a.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex h-4 w-4 items-center justify-center rounded border border-white/15">
                          {/* unchecked */}
                        </div>
                        <span className="flex-1 text-sm text-foreground/90">{a.naam}</span>
                        {a.capaciteit_type && (
                          <span className="rounded-sm bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {a.capaciteit_type}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </Field>
          </div>

          <div className="px-6 pb-6">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md"
            >
              {saving ? (
                "Bezig met opslaan…"
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1.5" strokeWidth={3} />
                  Opslaan
                </>
              )}
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
              Weet je zeker dat je '{deleteTarget?.naam ?? "—"}' wilt verwijderen?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Bestaande projecten met deze template behouden hun activiteiten,
              maar de template zelf wordt permanent verwijderd.
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

export default Instellingen;
