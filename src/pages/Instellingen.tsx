import { useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const TEMPLATE_MAPPINGS: { type: string; namen: string[] }[] = [
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

const Instellingen = () => {
  const [running, setRunning] = useState(false);

  const handleKoppelTemplates = async () => {
    setRunning(true);
    try {
      const { data: types, error: typesError } = await supabase
        .from("activiteit_types")
        .select("id, naam, positie")
        .order("positie", { ascending: true });
      if (typesError || !types) throw typesError ?? new Error("Geen activiteiten");

      const { data: templates, error: tmplError } = await supabase
        .from("project_templates")
        .select("id, type");
      if (tmplError || !templates) throw tmplError ?? new Error("Geen templates");

      let allOk = true;
      for (const mapping of TEMPLATE_MAPPINGS) {
        const tpl = templates.find((t) => t.type === mapping.type);
        if (!tpl) {
          allOk = false;
          continue;
        }
        // Filter activities matching the requested names, in positie order
        const matching = types
          .filter((t) => mapping.namen.includes(t.naam))
          .sort((a, b) => (a.positie ?? 0) - (b.positie ?? 0))
          .map((t) => t.id);

        const { error: updErr } = await supabase
          .from("project_templates")
          .update({ activiteit_type_ids: matching })
          .eq("id", tpl.id);
        if (updErr) allOk = false;
      }

      if (allOk) toast.success("Templates gekoppeld");
      else toast.error("Koppelen mislukt");
    } catch {
      toast.error("Koppelen mislukt");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader title="Instellingen" description="Configuratie van TerreVolt Planner." />
      <div className="surface-card p-6 space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold tracking-tight text-foreground">
              Templates koppelen (eenmalig)
            </h3>
            <p className="text-sm text-muted-foreground">
              Koppelt de standaard activiteiten aan de project templates
            </p>
          </div>
          <Button
            onClick={handleKoppelTemplates}
            disabled={running}
            className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
          >
            <Link2 className="h-4 w-4 mr-2" />
            {running ? "Bezig…" : "Templates koppelen"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Instellingen;
