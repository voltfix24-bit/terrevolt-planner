import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// =====================================================
// Types
// =====================================================
type Status = "concept" | "gepland" | "in_uitvoering" | "afgerond";

interface Lookup {
  id: string;
  naam: string;
}

interface Kabel {
  id?: string;
  diameter: string;
  positie: number;
}

type ProjectRow = Record<string, unknown> & { id: string };

// =====================================================
// Helpers — small UI primitives
// =====================================================
const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="surface-card rounded-lg p-6">
    <div className="mb-5 border-b border-white/10 pb-3">
      <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
    <div className="space-y-5">{children}</div>
  </section>
);

const SubBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
    <div className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-primary">
      {title}
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={className}>
    <Label className="mb-1.5 block text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </Label>
    {children}
  </div>
);

interface OptionPickerProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: { value: string; label: string }[];
  allowDeselect?: boolean;
}

const OptionPicker: React.FC<OptionPickerProps> = ({
  value,
  onChange,
  options,
  allowDeselect = true,
}) => (
  <div className="flex flex-wrap gap-1.5">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(active && allowDeselect ? null : o.value)}
          className={[
            "rounded-md border px-3 py-1.5 text-xs font-display font-semibold transition-all",
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/10 bg-white/[0.04] text-muted-foreground hover:border-white/20 hover:text-foreground",
          ].join(" ")}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const YESNO = [
  { value: "ja", label: "Ja" },
  { value: "nee", label: "Nee" },
];

// =====================================================
// Page
// =====================================================
const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [opdrachtgevers, setOpdrachtgevers] = useState<Lookup[]>([]);
  const [percelen, setPercelen] = useState<Lookup[]>([]);
  const [msKabels, setMsKabels] = useState<Kabel[]>([]);
  const [lsKabels, setLsKabels] = useState<Kabel[]>([]);

  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Load ----------
  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [pRes, oRes, peRes, msRes, lsRes] = await Promise.all([
      supabase.from("projecten").select("*").eq("id", id).maybeSingle(),
      supabase.from("opdrachtgevers").select("id, naam").order("positie"),
      supabase.from("percelen").select("id, naam").order("positie"),
      supabase
        .from("project_ms_kabels")
        .select("*")
        .eq("project_id", id)
        .eq("soort", "huidig")
        .order("positie"),
      supabase
        .from("project_ls_kabels")
        .select("*")
        .eq("project_id", id)
        .eq("soort", "huidig")
        .order("positie"),
    ]);
    if (pRes.error || !pRes.data) {
      toast.error("Project niet gevonden");
      navigate("/projecten");
      return;
    }
    setProject(pRes.data as ProjectRow);
    setOpdrachtgevers((oRes.data ?? []) as Lookup[]);
    setPercelen((peRes.data ?? []) as Lookup[]);
    setMsKabels(
      ((msRes.data ?? []) as { id: string; diameter: string | null; positie: number }[]).map(
        (k) => ({ id: k.id, diameter: k.diameter ?? "", positie: k.positie }),
      ),
    );
    setLsKabels(
      ((lsRes.data ?? []) as { id: string; diameter: string | null; positie: number }[]).map(
        (k) => ({ id: k.id, diameter: k.diameter ?? "", positie: k.positie }),
      ),
    );
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Field setter with debounced autosave ----------
  const setField = (key: string, value: unknown) => {
    setProject((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(() => {
      void persist({ [key]: value });
    }, 600);
  };

  const persist = async (patch: Record<string, unknown>) => {
    if (!id) return;
    setSaving(true);
    const { error } = await supabase
      .from("projecten")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error("Opslaan mislukt");
  };

  const get = <T,>(key: string): T | null => (project ? ((project[key] as T) ?? null) : null);

  // ---------- Sync helpers for repeatable kabels ----------
  const syncKabels = async (
    table: "project_ms_kabels" | "project_ls_kabels",
    rows: Kabel[],
  ) => {
    if (!id) return;
    // Wipe & re-insert (simpler than diff for small lists)
    await supabase.from(table).delete().eq("project_id", id).eq("soort", "huidig");
    if (rows.length > 0) {
      await supabase.from(table).insert(
        rows.map((k, i) => ({
          project_id: id,
          soort: "huidig",
          positie: i,
          diameter: k.diameter || null,
        })),
      );
    }
  };

  // When aantal-veld verandert, lijst aanpassen
  const ensureKabelCount = (
    list: Kabel[],
    setList: (rows: Kabel[]) => void,
    target: number,
  ) => {
    const safe = Math.max(0, Math.min(50, Math.floor(target)));
    if (safe === list.length) return list;
    let next: Kabel[];
    if (safe > list.length) {
      next = [...list];
      for (let i = list.length; i < safe; i++) next.push({ diameter: "", positie: i });
    } else {
      next = list.slice(0, safe);
    }
    setList(next);
    return next;
  };

  // =====================================================
  // Render
  // =====================================================
  if (loading || !project) {
    return (
      <div className="surface-card px-6 py-16 text-center text-sm text-muted-foreground">
        Laden…
      </div>
    );
  }

  const tijdSit = get<string>("tijdelijke_situatie");
  const huidigTrafo = get<string>("huidig_trafo_aanwezig");
  const huidigLs = get<string>("huidig_lsrek_aanwezig");
  const huidigMsKabels = get<string>("huidig_ms_kabels_aanwezig");
  const huidigLsKabels = get<string>("huidig_ls_kabels_aanwezig");
  const defRmuVerv = get<string>("def_rmu_vervangen");
  const defTrafoVerv = get<string>("def_trafo_vervangen");
  const defLsSit = get<string>("def_ls_situatie");
  const defGgi = get<string>("def_ggi_nieuw");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/projecten")}
            className="mt-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            title="Terug"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {(get<string>("station_naam") as string) || "Nieuwe case"}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {(get<string>("case_nummer") as string) || "Geen casenummer"} · Project intake
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving ? (
            <>
              <Save className="h-3.5 w-3.5 animate-pulse" /> Opslaan…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Automatisch opgeslagen
            </>
          )}
        </div>
      </div>

      {/* ============================================ */}
      {/* DEEL A — PROJECTGEGEVENS                     */}
      {/* ============================================ */}
      <Section title="Deel A — Projectgegevens" subtitle="Basisinformatie van het project">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Case nummer">
            <Input
              value={(get<string>("case_nummer") as string) || ""}
              onChange={(e) => setField("case_nummer", e.target.value)}
            />
          </Field>
          <Field label="Case naam / stationsnaam">
            <Input
              value={(get<string>("station_naam") as string) || ""}
              onChange={(e) => setField("station_naam", e.target.value)}
            />
          </Field>
          <Field label="Opdrachtgever">
            <Select
              value={(get<string>("opdrachtgever_id") as string) || ""}
              onValueChange={(v) => setField("opdrachtgever_id", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer opdrachtgever" />
              </SelectTrigger>
              <SelectContent>
                {opdrachtgevers.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Perceel">
            <Select
              value={(get<string>("perceel_id") as string) || ""}
              onValueChange={(v) => setField("perceel_id", v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecteer perceel" />
              </SelectTrigger>
              <SelectContent>
                {percelen.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.naam}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="GSU / GEU">
            <Input
              value={(get<string>("gsu_geu") as string) || ""}
              onChange={(e) => setField("gsu_geu", e.target.value)}
            />
          </Field>
          <Field label="WV / uitvoerder">
            <Input
              value={(get<string>("wv_naam") as string) || ""}
              onChange={(e) => setField("wv_naam", e.target.value)}
            />
          </Field>
          <Field label="Locatie" className="md:col-span-2">
            <Input
              value={(get<string>("locatie") as string) || ""}
              onChange={(e) => setField("locatie", e.target.value)}
              placeholder="Bv. installatieruimte, kelder, …"
            />
          </Field>
          <Field label="Straat">
            <Input
              value={(get<string>("straat") as string) || ""}
              onChange={(e) => setField("straat", e.target.value)}
            />
          </Field>
          <Field label="Postcode">
            <Input
              value={(get<string>("postcode") as string) || ""}
              onChange={(e) => setField("postcode", e.target.value)}
            />
          </Field>
          <Field label="Stad">
            <Input
              value={(get<string>("stad") as string) || ""}
              onChange={(e) => setField("stad", e.target.value)}
            />
          </Field>
          <Field label="Gemeente">
            <Input
              value={(get<string>("gemeente") as string) || ""}
              onChange={(e) => setField("gemeente", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <OptionPicker
              value={(get<string>("status") as Status) || "concept"}
              onChange={(v) => setField("status", v || "concept")}
              allowDeselect={false}
              options={[
                { value: "concept", label: "Concept" },
                { value: "gepland", label: "Gepland" },
                { value: "in_uitvoering", label: "In uitvoering" },
                { value: "afgerond", label: "Afgerond" },
              ]}
            />
          </Field>
          <Field label="Jaar">
            <Input
              type="number"
              value={(get<number>("jaar") as number) || ""}
              onChange={(e) => setField("jaar", e.target.value ? Number(e.target.value) : null)}
            />
          </Field>
          <Field label="Notities" className="md:col-span-2">
            <Textarea
              value={(get<string>("notities") as string) || ""}
              onChange={(e) => setField("notities", e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Section>

      {/* ============================================ */}
      {/* DEEL B — HUIDIGE SITUATIE                    */}
      {/* ============================================ */}
      <Section title="Deel B — Huidige situatie" subtitle="Wat is er nu aanwezig op het station">
        <SubBlock title="B1. MS / RMU huidig">
          <Field label="Huidige RMU / MS-installatie">
            <OptionPicker
              value={get<string>("huidig_rmu_type")}
              onChange={(v) => setField("huidig_rmu_type", v)}
              options={[
                { value: "prefab_hoog", label: "Prefab hoog" },
                { value: "prefab_laag", label: "Prefab laag" },
                { value: "magnefix_md", label: "Magnefix MD" },
                { value: "magnefix_mf", label: "Magnefix MF" },
                { value: "coq", label: "Coq" },
                { value: "abb", label: "ABB" },
                { value: "siemens", label: "Siemens" },
                { value: "anders", label: "Anders" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Aantal MS-richtingen / velden">
              <Input
                type="number"
                value={(get<number>("huidig_rmu_aantal_richtingen") as number) ?? ""}
                onChange={(e) =>
                  setField(
                    "huidig_rmu_aantal_richtingen",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </Field>
            <Field label="Vermogensveld aanwezig?">
              <OptionPicker
                value={get<string>("huidig_vermogensveld")}
                onChange={(v) => setField("huidig_vermogensveld", v)}
                options={YESNO}
              />
            </Field>
          </div>
        </SubBlock>

        <SubBlock title="B2. Trafo huidig">
          <Field label="Trafo aanwezig?">
            <OptionPicker
              value={huidigTrafo}
              onChange={(v) => setField("huidig_trafo_aanwezig", v)}
              options={YESNO}
            />
          </Field>
          {huidigTrafo === "ja" && (
            <Field label="Huidig trafotype / vermogen">
              <Input
                value={(get<string>("huidig_trafo_type") as string) || ""}
                onChange={(e) => setField("huidig_trafo_type", e.target.value)}
                placeholder="Bv. 400 kVA"
              />
            </Field>
          )}
        </SubBlock>

        <SubBlock title="B3. LS huidig">
          <Field label="LS-rek aanwezig?">
            <OptionPicker
              value={huidigLs}
              onChange={(v) => setField("huidig_lsrek_aanwezig", v)}
              options={YESNO}
            />
          </Field>
          {huidigLs === "ja" && (
            <Field label="Type LS-rek">
              <OptionPicker
                value={get<string>("huidig_lsrek_type")}
                onChange={(v) => setField("huidig_lsrek_type", v)}
                options={[
                  { value: "open", label: "Open" },
                  { value: "gesloten", label: "Gesloten" },
                ]}
              />
            </Field>
          )}
        </SubBlock>

        <SubBlock title="B4. OV huidig">
          <Field label="Flex OV kast aanwezig?">
            <OptionPicker
              value={get<string>("huidig_flex_ov_aanwezig")}
              onChange={(v) => setField("huidig_flex_ov_aanwezig", v)}
              options={YESNO}
            />
          </Field>
          <Field label="OV kWh-meter aanwezig?">
            <OptionPicker
              value={get<string>("huidig_ov_kwh_meter")}
              onChange={(v) => setField("huidig_ov_kwh_meter", v)}
              options={[
                { value: "nee", label: "Nee" },
                { value: "1_fase", label: "1-fase" },
                { value: "3_fase", label: "3-fase" },
              ]}
            />
          </Field>
        </SubBlock>

        <SubBlock title="B5. MS-kabels huidig">
          <Field label="Bestaande MS-kabels?">
            <OptionPicker
              value={huidigMsKabels}
              onChange={(v) => {
                setField("huidig_ms_kabels_aanwezig", v);
                if (v !== "ja") {
                  setMsKabels([]);
                  void syncKabels("project_ms_kabels", []);
                  setField("huidig_ms_kabels_aantal", null);
                  setField("huidig_ms_kabels_type", null);
                }
              }}
              options={YESNO}
            />
          </Field>
          {huidigMsKabels === "ja" && (
            <>
              <Field label="Type bestaande MS-kabels">
                <OptionPicker
                  value={get<string>("huidig_ms_kabels_type")}
                  onChange={(v) => setField("huidig_ms_kabels_type", v)}
                  options={[
                    { value: "gplk", label: "GPLK" },
                    { value: "kunststof", label: "Kunststof" },
                    { value: "gemengd", label: "Gemengd" },
                  ]}
                />
              </Field>
              <Field label="Aantal MS-kabelrichtingen / sets">
                <Input
                  type="number"
                  min={0}
                  value={(get<number>("huidig_ms_kabels_aantal") as number) ?? ""}
                  onChange={(e) => {
                    const n = e.target.value ? Number(e.target.value) : 0;
                    setField("huidig_ms_kabels_aantal", n || null);
                    const next = ensureKabelCount(msKabels, setMsKabels, n);
                    void syncKabels("project_ms_kabels", next);
                  }}
                />
              </Field>
              {msKabels.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">
                    Diameters per MS-kabel
                  </Label>
                  {msKabels.map((k, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                      <Input
                        value={k.diameter}
                        placeholder="Bv. 3x95 Al"
                        onChange={(e) => {
                          const next = msKabels.map((row, idx) =>
                            idx === i ? { ...row, diameter: e.target.value } : row,
                          );
                          setMsKabels(next);
                        }}
                        onBlur={() => void syncKabels("project_ms_kabels", msKabels)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SubBlock>

        <SubBlock title="B6. LS-kabels huidig">
          <Field label="Bestaande LS-kabels?">
            <OptionPicker
              value={huidigLsKabels}
              onChange={(v) => {
                setField("huidig_ls_kabels_aanwezig", v);
                if (v !== "ja") {
                  setLsKabels([]);
                  void syncKabels("project_ls_kabels", []);
                  setField("huidig_ls_kabels_aantal", null);
                  setField("huidig_ls_kabels_type", null);
                }
              }}
              options={YESNO}
            />
          </Field>
          {huidigLsKabels === "ja" && (
            <>
              <Field label="Type bestaande LS-kabels">
                <OptionPicker
                  value={get<string>("huidig_ls_kabels_type")}
                  onChange={(v) => setField("huidig_ls_kabels_type", v)}
                  options={[
                    { value: "gplk", label: "GPLK" },
                    { value: "kunststof", label: "Kunststof" },
                    { value: "gemengd", label: "Gemengd" },
                  ]}
                />
              </Field>
              <Field label="Aantal bestaande LS-kabels / groepen">
                <Input
                  type="number"
                  min={0}
                  value={(get<number>("huidig_ls_kabels_aantal") as number) ?? ""}
                  onChange={(e) => {
                    const n = e.target.value ? Number(e.target.value) : 0;
                    setField("huidig_ls_kabels_aantal", n || null);
                    const next = ensureKabelCount(lsKabels, setLsKabels, n);
                    void syncKabels("project_ls_kabels", next);
                  }}
                />
              </Field>
              {lsKabels.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground">
                    Diameters per LS-kabel
                  </Label>
                  {lsKabels.map((k, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">#{i + 1}</span>
                      <Input
                        value={k.diameter}
                        placeholder="Bv. 4x150 Al"
                        onChange={(e) => {
                          const next = lsKabels.map((row, idx) =>
                            idx === i ? { ...row, diameter: e.target.value } : row,
                          );
                          setLsKabels(next);
                        }}
                        onBlur={() => void syncKabels("project_ls_kabels", lsKabels)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SubBlock>

        <SubBlock title="B7. Herbruikbaarheid huidig">
          <Field label="Kunnen bestaande kabels later opnieuw aangesloten worden?">
            <OptionPicker
              value={get<string>("huidig_kabels_herbruikbaar")}
              onChange={(v) => setField("huidig_kabels_herbruikbaar", v)}
              options={[
                { value: "ja", label: "Ja" },
                { value: "nee", label: "Nee" },
                { value: "deels", label: "Deels" },
                { value: "onbekend", label: "Onbekend" },
              ]}
            />
          </Field>
        </SubBlock>
      </Section>

      {/* ============================================ */}
      {/* DEEL C — TIJDELIJKE SITUATIE                 */}
      {/* ============================================ */}
      <Section
        title="Deel C — Tijdelijke situatie"
        subtitle="Hoe wordt het project tijdens uitvoering opgevangen"
      >
        <SubBlock title="C1. Tijdelijke situatie tijdens uitvoering">
          <OptionPicker
            value={tijdSit}
            onChange={(v) => setField("tijdelijke_situatie", v)}
            options={[
              { value: "geen", label: "Geen" },
              { value: "nsa", label: "NSA" },
              { value: "provisorium", label: "Provisorium" },
            ]}
          />
        </SubBlock>

        {tijdSit === "nsa" && (
          <SubBlock title="C2. NSA">
            <Field label="Is er al een NSA-luik?">
              <OptionPicker
                value={get<string>("nsa_luik_aanwezig")}
                onChange={(v) => setField("nsa_luik_aanwezig", v)}
                options={YESNO}
              />
            </Field>
          </SubBlock>
        )}

        {tijdSit === "provisorium" && (
          <>
            <SubBlock title="C3a. MS tijdelijk">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Aantal MS-eindsluitingen">
                  <Input
                    type="number"
                    value={(get<number>("prov_ms_eindsluitingen_aantal") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "prov_ms_eindsluitingen_aantal",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
                <Field label="Type MS-eindsluitingen">
                  <OptionPicker
                    value={get<string>("prov_ms_eindsluitingen_type")}
                    onChange={(v) => setField("prov_ms_eindsluitingen_type", v)}
                    options={[
                      { value: "magnefix", label: "Magnefix" },
                      { value: "anders", label: "Anders" },
                    ]}
                  />
                </Field>
                <Field label="Aantal MS-moffen">
                  <Input
                    type="number"
                    value={(get<number>("prov_ms_moffen_aantal") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "prov_ms_moffen_aantal",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
              </div>
            </SubBlock>

            <SubBlock title="C3b. LS tijdelijk">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Aantal LS-eindsluitingen">
                  <Input
                    type="number"
                    value={(get<number>("prov_ls_eindsluitingen_aantal") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "prov_ls_eindsluitingen_aantal",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
                <Field label="Aantal LS-moffen">
                  <Input
                    type="number"
                    value={(get<number>("prov_ls_moffen_aantal") as number) ?? ""}
                    onChange={(e) =>
                      setField(
                        "prov_ls_moffen_aantal",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </Field>
              </div>
            </SubBlock>

            <SubBlock title="C3c. Tijdelijke installatie">
              <Field label="Tijdelijke LS-kast aansluiten / ontkoppelen?">
                <OptionPicker
                  value={get<string>("prov_tijdelijke_lskast")}
                  onChange={(v) => setField("prov_tijdelijke_lskast", v)}
                  options={YESNO}
                />
              </Field>
            </SubBlock>
          </>
        )}
      </Section>

      {/* ============================================ */}
      {/* DEEL D — DEFINITIEVE SITUATIE                */}
      {/* ============================================ */}
      <Section
        title="Deel D — Gewenste definitieve situatie"
        subtitle="Hoe ziet het station eruit na renovatie"
      >
        <SubBlock title="D1. MS / RMU definitief">
          <Field label="Wordt RMU vervangen?">
            <OptionPicker
              value={defRmuVerv}
              onChange={(v) => setField("def_rmu_vervangen", v)}
              options={YESNO}
            />
          </Field>
          {defRmuVerv === "ja" && (
            <Field label="Gewenst merk / configuratie">
              <Input
                value={(get<string>("def_rmu_merk_configuratie") as string) || ""}
                onChange={(e) => setField("def_rmu_merk_configuratie", e.target.value)}
              />
            </Field>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Ombouw naar iMS?">
              <OptionPicker
                value={get<string>("def_ombouw_ims")}
                onChange={(v) => setField("def_ombouw_ims", v)}
                options={YESNO}
              />
            </Field>
            <Field label="MS-richtingen incl. trafoveld (definitief)">
              <Input
                type="number"
                value={(get<number>("def_aantal_ms_richtingen") as number) ?? ""}
                onChange={(e) =>
                  setField(
                    "def_aantal_ms_richtingen",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </Field>
            <Field label="Vermogensveld definitief?">
              <OptionPicker
                value={get<string>("def_vermogensveld")}
                onChange={(v) => setField("def_vermogensveld", v)}
                options={YESNO}
              />
            </Field>
          </div>
        </SubBlock>

        <SubBlock title="D2. Trafo definitief">
          <Field label="Wordt de trafo vervangen?">
            <OptionPicker
              value={defTrafoVerv}
              onChange={(v) => setField("def_trafo_vervangen", v)}
              options={YESNO}
            />
          </Field>
          {defTrafoVerv === "ja" && (
            <Field label="Gewenst definitief trafotype / vermogen">
              <Input
                value={(get<string>("def_trafo_type") as string) || ""}
                onChange={(e) => setField("def_trafo_type", e.target.value)}
                placeholder="Bv. 630 kVA"
              />
            </Field>
          )}
          <Field label="Wordt de trafo gedraaid?">
            <OptionPicker
              value={get<string>("def_trafo_gedraaid")}
              onChange={(v) => setField("def_trafo_gedraaid", v)}
              options={YESNO}
            />
          </Field>
        </SubBlock>

        <SubBlock title="D3. LS definitief">
          <Field label="Gewenste definitieve LS-situatie">
            <OptionPicker
              value={defLsSit}
              onChange={(v) => setField("def_ls_situatie", v)}
              options={[
                { value: "behouden", label: "Bestaand LS-rek behouden" },
                { value: "herschikken", label: "Bestaand LS-rek herschikken" },
                { value: "uitbreidingsrek", label: "Uitbreidingsrek" },
                { value: "nieuw_le630", label: "Nieuw LS-rek ≤630 kVA" },
                { value: "nieuw_gt630_le1000", label: "Nieuw LS-rek >630 ≤1000 kVA" },
              ]}
            />
          </Field>
          {defLsSit === "herschikken" && (
            <Field label="Aantal stroken / posities herschikken">
              <Input
                type="number"
                value={(get<number>("def_ls_aantal_stroken_herschikken") as number) ?? ""}
                onChange={(e) =>
                  setField(
                    "def_ls_aantal_stroken_herschikken",
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
              />
            </Field>
          )}
          <Field label="Zekeringen wisselen?">
            <OptionPicker
              value={get<string>("def_zekeringen_wisselen")}
              onChange={(v) => setField("def_zekeringen_wisselen", v)}
              options={YESNO}
            />
          </Field>
        </SubBlock>

        <SubBlock title="D4. GGI definitief">
          <Field label="Verlichting / WCD / schakelaar nieuw aanbrengen?">
            <OptionPicker
              value={defGgi}
              onChange={(v) => setField("def_ggi_nieuw", v)}
              options={YESNO}
            />
          </Field>
          {defGgi === "ja" && (
            <Field label="Hoeveel?">
              <OptionPicker
                value={(get<number>("def_ggi_aantal") as number)?.toString() ?? null}
                onChange={(v) => setField("def_ggi_aantal", v ? Number(v) : null)}
                options={[
                  { value: "1", label: "1" },
                  { value: "2", label: "2" },
                ]}
              />
            </Field>
          )}
        </SubBlock>

        <SubBlock title="D5. Vereffeningsleiding / aarding definitief">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Vereffeningsleiding vernieuwen?">
              <OptionPicker
                value={get<string>("def_vereffening_vernieuwen")}
                onChange={(v) => setField("def_vereffening_vernieuwen", v)}
                options={YESNO}
              />
            </Field>
            <Field label="Aardelektrode nodig?">
              <OptionPicker
                value={get<string>("def_aardelektrode")}
                onChange={(v) => setField("def_aardelektrode", v)}
                options={YESNO}
              />
            </Field>
            <Field label="Aardmeting uitvoeren?">
              <OptionPicker
                value={get<string>("def_aardmeting")}
                onChange={(v) => setField("def_aardmeting", v)}
                options={YESNO}
              />
            </Field>
          </div>
        </SubBlock>

        <SubBlock title="D6. OV definitief">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nieuwe Flex OV?">
              <OptionPicker
                value={get<string>("def_flex_ov_nieuw")}
                onChange={(v) => setField("def_flex_ov_nieuw", v)}
                options={YESNO}
              />
            </Field>
            <Field label="Nieuwe OV kWh-meter?">
              <OptionPicker
                value={get<string>("def_ov_kwh_meter_nieuw")}
                onChange={(v) => setField("def_ov_kwh_meter_nieuw", v)}
                options={YESNO}
              />
            </Field>
          </div>
        </SubBlock>

        <SubBlock title="D7. Opleverdossier">
          <OptionPicker
            value={get<string>("def_opleverdossier")}
            onChange={(v) => setField("def_opleverdossier", v)}
            options={[
              { value: "inclusief_civiel", label: "Inclusief civiel" },
              { value: "exclusief_civiel", label: "Exclusief civiel" },
            ]}
          />
        </SubBlock>
      </Section>

      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          onClick={() => navigate("/projecten")}
          className="rounded-md"
        >
          Terug naar projectenlijst
        </Button>
      </div>
    </div>
  );
};

export default ProjectDetail;
