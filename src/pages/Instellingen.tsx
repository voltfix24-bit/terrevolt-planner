import { PageHeader } from "@/components/PageHeader";

const Instellingen = () => {
  return (
    <div>
      <PageHeader title="Instellingen" description="Configuratie van TerreVolt Planner." />
      <div className="surface-card p-6">
        <p className="text-sm text-muted-foreground">Hier komen de instellingen.</p>
      </div>
    </div>
  );
};

export default Instellingen;
