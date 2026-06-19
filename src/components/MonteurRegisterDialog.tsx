import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Dienstverband = "loondienst" | "zzp";
type IdType = "paspoort" | "id-kaart" | "rijbewijs" | "verblijfsdocument";

interface Register {
  geboortedatum: string | null;
  nationaliteit: string | null;
  id_type: IdType | null;
  id_nummer: string | null;
  id_geldig_tot: string | null;
  bsn: string | null;
  bedrijfsnaam: string | null;
  kvk_nummer: string | null;
  btw_nummer: string | null;
  uurtarief: string | null;
}

const EMPTY: Register = {
  geboortedatum: null, nationaliteit: null, id_type: null, id_nummer: null,
  id_geldig_tot: null, bsn: null, bedrijfsnaam: null, kvk_nummer: null,
  btw_nummer: null, uurtarief: null,
};

// elfproef voor BSN (9 cijfers, gewicht 9..2, -1 voor laatste; som %11 == 0)
function isValidBsn(bsn: string): boolean {
  if (!/^[0-9]{9}$/.test(bsn)) return false;
  const w = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  const sum = bsn.split("").reduce((s, c, i) => s + Number(c) * w[i], 0);
  return sum % 11 === 0;
}

function calcMissing(d: Dienstverband, r: Register): string[] {
  const m: string[] = [];
  if (!r.geboortedatum) m.push("geboortedatum");
  if (!r.nationaliteit?.trim()) m.push("nationaliteit");
  if (!r.id_type) m.push("ID-type");
  if (!r.id_nummer?.trim()) m.push("ID-nummer");
  if (!r.id_geldig_tot) m.push("ID geldig tot");
  if (r.id_geldig_tot && new Date(r.id_geldig_tot) < new Date()) m.push("ID verlopen");
  if (d === "zzp") {
    if (!r.bedrijfsnaam?.trim()) m.push("bedrijfsnaam");
    if (!r.kvk_nummer?.trim()) m.push("KvK");
  } else {
    if (!r.bsn?.trim()) m.push("BSN");
  }
  return m;
}

export function MonteurRegisterDialog({
  open,
  onOpenChange,
  monteurId,
  monteurNaam,
  initialDienstverband,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  monteurId: string;
  monteurNaam: string;
  initialDienstverband: Dienstverband;
  onSaved?: (d: Dienstverband) => void;
}) {
  const [dienstverband, setDienstverband] = useState<Dienstverband>(initialDienstverband);
  const [reg, setReg] = useState<Register>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDienstverband(initialDienstverband);
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("monteur_register")
        .select("*")
        .eq("monteur_id", monteurId)
        .maybeSingle();
      if (error && error.code !== "PGRST116") {
        toast.error("Kon registergegevens niet laden");
      }
      if (data) {
        setReg({
          geboortedatum: data.geboortedatum ?? null,
          nationaliteit: data.nationaliteit ?? null,
          id_type: (data.id_type as IdType | null) ?? null,
          id_nummer: data.id_nummer ?? null,
          id_geldig_tot: data.id_geldig_tot ?? null,
          bsn: data.bsn ?? null,
          bedrijfsnaam: data.bedrijfsnaam ?? null,
          kvk_nummer: data.kvk_nummer ?? null,
          btw_nummer: data.btw_nummer ?? null,
          uurtarief: data.uurtarief != null ? String(data.uurtarief) : null,
        });
      } else {
        setReg(EMPTY);
      }
      setLoading(false);
    })();
  }, [open, monteurId, initialDienstverband]);

  // Bij wissel naar ZZP direct BSN uit UI verbergen/wissen.
  useEffect(() => {
    if (dienstverband === "zzp" && reg.bsn) {
      setReg((r) => ({ ...r, bsn: null }));
    }
  }, [dienstverband, reg.bsn]);

  const missing = calcMissing(dienstverband, reg);
  const bsnInvalid =
    dienstverband === "loondienst" && !!reg.bsn && !isValidBsn(reg.bsn);
  const kvkInvalid =
    dienstverband === "zzp" && !!reg.kvk_nummer && !/^[0-9]{8}$/.test(reg.kvk_nummer);

  async function handleSave() {
    if (bsnInvalid) {
      toast.error("BSN voldoet niet aan de elfproef");
      return;
    }
    if (kvkInvalid) {
      toast.error("KvK-nummer moet uit 8 cijfers bestaan");
      return;
    }
    setSaving(true);
    // 1. dienstverband update (kan trigger BSN wissen)
    const { error: dErr } = await supabase
      .from("monteurs")
      .update({ dienstverband } as never)
      .eq("id", monteurId);
    if (dErr) {
      toast.error("Kon dienstverband niet opslaan");
      setSaving(false);
      return;
    }
    // 2. upsert register
    const payload = {
      monteur_id: monteurId,
      geboortedatum: reg.geboortedatum || null,
      nationaliteit: reg.nationaliteit?.trim() || null,
      id_type: reg.id_type,
      id_nummer: reg.id_nummer?.trim() || null,
      id_geldig_tot: reg.id_geldig_tot || null,
      bsn: dienstverband === "loondienst" ? (reg.bsn?.trim() || null) : null,
      bedrijfsnaam: dienstverband === "zzp" ? (reg.bedrijfsnaam?.trim() || null) : null,
      kvk_nummer: dienstverband === "zzp" ? (reg.kvk_nummer?.trim() || null) : null,
      btw_nummer: dienstverband === "zzp" ? (reg.btw_nummer?.trim() || null) : null,
      uurtarief: dienstverband === "zzp" && reg.uurtarief ? Number(reg.uurtarief) : null,
    };
    const { error: rErr } = await supabase
      .from("monteur_register")
      .upsert(payload, { onConflict: "monteur_id" });
    setSaving(false);
    if (rErr) {
      toast.error(rErr.message || "Kon register niet opslaan");
      return;
    }
    toast.success("Mandagenregister-gegevens opgeslagen");
    onSaved?.(dienstverband);
    onOpenChange(false);
  }

  function set<K extends keyof Register>(k: K, v: Register[K]) {
    setReg((r) => ({ ...r, [k]: v }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary" />
              <h2 className="font-display text-base font-bold">
                Mandagenregister · {monteurNaam}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Gegevens voor projectregister en factuurcontrole. Alleen zichtbaar voor managers.
            </p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Laden…</div>
          ) : (
            <>
              {/* Dienstverband */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Dienstverband
                </Label>
                <div className="flex gap-2">
                  {(["loondienst", "zzp"] as Dienstverband[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDienstverband(d)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-display font-semibold ${
                        dienstverband === d
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-fg/15 text-muted-foreground hover:bg-fg/[0.04]"
                      }`}
                    >
                      {d === "zzp" ? "ZZP" : "Loondienst"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Algemeen */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Geboortedatum</Label>
                  <Input
                    type="date"
                    value={reg.geboortedatum ?? ""}
                    onChange={(e) => set("geboortedatum", e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nationaliteit</Label>
                  <Input
                    value={reg.nationaliteit ?? ""}
                    onChange={(e) => set("nationaliteit", e.target.value || null)}
                    placeholder="Nederlandse"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID-type</Label>
                  <select
                    className="h-10 w-full rounded-md border border-fg/15 bg-background px-3 text-sm"
                    value={reg.id_type ?? ""}
                    onChange={(e) => set("id_type", (e.target.value || null) as IdType | null)}
                  >
                    <option value="">— kies —</option>
                    <option value="paspoort">Paspoort</option>
                    <option value="id-kaart">ID-kaart</option>
                    <option value="rijbewijs">Rijbewijs</option>
                    <option value="verblijfsdocument">Verblijfsdocument</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID-nummer</Label>
                  <Input
                    value={reg.id_nummer ?? ""}
                    onChange={(e) => set("id_nummer", e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">ID geldig tot</Label>
                  <Input
                    type="date"
                    value={reg.id_geldig_tot ?? ""}
                    onChange={(e) => set("id_geldig_tot", e.target.value || null)}
                  />
                </div>
              </div>

              {/* Loondienst */}
              {dienstverband === "loondienst" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">BSN (9 cijfers, elfproef)</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={9}
                    value={reg.bsn ?? ""}
                    onChange={(e) => set("bsn", e.target.value.replace(/\D/g, "") || null)}
                    className={bsnInvalid ? "border-destructive" : ""}
                  />
                  {bsnInvalid && (
                    <p className="text-xs text-destructive">Ongeldig BSN (elfproef faalt)</p>
                  )}
                </div>
              )}

              {/* ZZP */}
              {dienstverband === "zzp" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Bedrijfsnaam</Label>
                    <Input
                      value={reg.bedrijfsnaam ?? ""}
                      onChange={(e) => set("bedrijfsnaam", e.target.value || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">KvK-nummer (8 cijfers)</Label>
                    <Input
                      inputMode="numeric"
                      maxLength={8}
                      value={reg.kvk_nummer ?? ""}
                      onChange={(e) =>
                        set("kvk_nummer", e.target.value.replace(/\D/g, "") || null)
                      }
                      className={kvkInvalid ? "border-destructive" : ""}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Btw-nummer</Label>
                    <Input
                      value={reg.btw_nummer ?? ""}
                      onChange={(e) => set("btw_nummer", e.target.value || null)}
                      placeholder="NL123456789B01"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Uurtarief (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={reg.uurtarief ?? ""}
                      onChange={(e) => set("uurtarief", e.target.value || null)}
                    />
                  </div>
                </div>
              )}

              {/* Volledigheid */}
              <div
                className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                  missing.length === 0
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300"
                }`}
              >
                {missing.length === 0 ? (
                  <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
                <div>
                  {missing.length === 0
                    ? "Compleet — klaar voor mandagenregister."
                    : `Ontbreekt: ${missing.join(", ")}`}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                  Annuleren
                </Button>
                <Button onClick={handleSave} disabled={saving || bsnInvalid || kvkInvalid}>
                  {saving ? "Bezig…" : "Opslaan"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
