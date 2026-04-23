import { PageHeader } from "@/components/PageHeader";

const Projecten = () => {
  return (
    <div>
      <PageHeader title="Projecten" description="Overzicht van alle TerreVolt-projecten." />
      <div className="surface-card p-6">
        <p className="text-sm text-muted-foreground">
          Hier komt het projectenoverzicht.
        </p>
      </div>
    </div>
  );
};

export default Projecten;
