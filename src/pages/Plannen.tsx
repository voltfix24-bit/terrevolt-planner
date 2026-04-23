import { PageHeader } from "@/components/PageHeader";

const Plannen = () => {
  return (
    <div>
      <PageHeader title="Plannen" description="Weekplanning per project." />
      <div className="surface-card p-6">
        <p className="text-sm text-muted-foreground">Hier komt het planningsraster.</p>
      </div>
    </div>
  );
};

export default Plannen;
