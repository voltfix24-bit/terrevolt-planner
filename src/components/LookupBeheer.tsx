import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Lookup {
  id: string;
  naam: string;
  positie: number | null;
}

interface Props {
  table: "opdrachtgevers" | "percelen";
  title: string;
  description?: string;
  placeholder?: string;
}

export const LookupBeheer: React.FC<Props> = ({ table, title, description, placeholder }) => {
  const [items, setItems] = useState<Lookup[]>([]);
  const [naam, setNaam] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(table)
      .select("id, naam, positie")
      .order("positie", { ascending: true });
    if (error) toast.error(`Kon ${title.toLowerCase()} niet laden`);
    else setItems((data ?? []) as Lookup[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  const handleAdd = async () => {
    const v = naam.trim();
    if (!v) return;
    const positie = items.length;
    const { error } = await supabase.from(table).insert({ naam: v, positie });
    if (error) {
      toast.error("Toevoegen mislukt");
      return;
    }
    setNaam("");
    void load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      toast.error("Verwijderen mislukt");
      return;
    }
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3">
        <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>

      <div className="mb-3 flex gap-2">
        <Input
          value={naam}
          onChange={(e) => setNaam(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder={placeholder ?? "Nieuwe naam"}
          className="rounded-md"
        />
        <Button
          onClick={handleAdd}
          disabled={!naam.trim()}
          className="font-display font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" /> Toevoegen
        </Button>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-2">Laden…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">Nog niets toegevoegd.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2"
            >
              <span className="text-sm text-foreground">{it.naam}</span>
              <button
                onClick={() => handleDelete(it.id)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                title="Verwijderen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
