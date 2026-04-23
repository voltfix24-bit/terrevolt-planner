import { PageHeader } from "@/components/PageHeader";

const Capaciteit = () => {
  return (
    <div>
      <PageHeader title="Capaciteit" description="Monteurs en hun beschikbaarheid." />
      <div className="surface-card p-6">
        <p className="text-sm text-muted-foreground">Hier komt het capaciteitsoverzicht.</p>
      </div>
    </div>
  );
};

export default Capaciteit;
