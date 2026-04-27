import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Download, Eye, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BUCKET = "project-tekeningen";

export type TekeningSoort = "tijdelijk" | "definitief";

export interface Tekening {
  id: string;
  project_id: string;
  soort: TekeningSoort;
  storage_path: string;
  bestandsnaam: string;
  bestandsgrootte: number | null;
  mime_type: string | null;
  titel: string | null;
  tekening_nummer: string | null;
  revisie: string | null;
  notitie: string | null;
  positie: number;
  created_at: string;
}

interface Props {
  projectId: string;
  soort: TekeningSoort;
  emptyHint?: string;
}

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectTekeningen({ projectId, soort, emptyHint }: Props) {
  const [items, setItems] = useState<Tekening[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Tekening>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_tekeningen")
      .select("*")
      .eq("project_id", projectId)
      .eq("soort", soort)
      .order("positie", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Kon tekeningen niet laden");
    } else {
      setItems((data ?? []) as Tekening[]);
    }
    setLoading(false);
  }, [projectId, soort]);

  useEffect(() => {
    load();
  }, [load]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      let uploaded = 0;
      for (const file of list) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${projectId}/${soort}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
        const up = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (up.error) {
          toast.error(`Upload mislukt: ${file.name}`);
          continue;
        }
        const ins = await supabase.from("project_tekeningen").insert({
          project_id: projectId,
          soort,
          storage_path: path,
          bestandsnaam: file.name,
          bestandsgrootte: file.size,
          mime_type: file.type || null,
          positie: items.length + uploaded,
        });
        if (ins.error) {
          toast.error(`Opslaan metadata mislukt: ${file.name}`);
          await supabase.storage.from(BUCKET).remove([path]);
          continue;
        }
        uploaded++;
      }
      setUploading(false);
      if (uploaded > 0) {
        toast.success(`${uploaded} tekening(en) geüpload`);
        load();
      }
    },
    [projectId, soort, items.length, load],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
  };

  const handleView = async (t: Tekening) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(t.storage_path, 60 * 10);
    if (error || !data) {
      toast.error("Kon bestand niet openen");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleDownload = async (t: Tekening) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(t.storage_path, 60 * 5, { download: t.bestandsnaam });
    if (error || !data) {
      toast.error("Kon bestand niet downloaden");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = t.bestandsnaam;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = async (t: Tekening) => {
    if (!confirm(`Tekening "${t.titel || t.bestandsnaam}" verwijderen?`)) return;
    await supabase.storage.from(BUCKET).remove([t.storage_path]);
    const { error } = await supabase.from("project_tekeningen").delete().eq("id", t.id);
    if (error) {
      toast.error("Verwijderen mislukt");
      return;
    }
    setItems((prev) => prev.filter((x) => x.id !== t.id));
    toast.success("Verwijderd");
  };

  const startEdit = (t: Tekening) => {
    setEditingId(t.id);
    setDraft({
      titel: t.titel,
      tekening_nummer: t.tekening_nummer,
      revisie: t.revisie,
      notitie: t.notitie,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("project_tekeningen")
      .update({
        titel: draft.titel ?? null,
        tekening_nummer: draft.tekening_nummer ?? null,
        revisie: draft.revisie ?? null,
        notitie: draft.notitie ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingId);
    if (error) {
      toast.error("Opslaan mislukt");
      return;
    }
    setItems((prev) =>
      prev.map((x) =>
        x.id === editingId
          ? { ...x, ...(draft as Tekening) }
          : x,
      ),
    );
    setEditingId(null);
    setDraft({});
    toast.success("Bijgewerkt");
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 px-4 py-5 text-center transition-all",
          "hover:border-primary/50 hover:bg-primary/[0.03]",
          dragOver && "border-primary bg-primary/[0.06]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.webp,.svg,image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
        <div className="text-xs text-foreground/80">
          <span className="font-medium">Sleep bestanden hierheen</span> of klik om te selecteren
        </div>
        {emptyHint && <div className="text-[11px] text-muted-foreground">{emptyHint}</div>}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs text-muted-foreground">Laden…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground">Nog geen tekeningen toegevoegd.</div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => {
            const isEditing = editingId === t.id;
            return (
              <div
                key={t.id}
                className="rounded-md border border-border/50 bg-card/30 px-3 py-2.5"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="Titel / omschrijving"
                          value={draft.titel ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, titel: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Tekeningnummer"
                          value={draft.tekening_nummer ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, tekening_nummer: e.target.value }))
                          }
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Revisie / versie"
                          value={draft.revisie ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, revisie: e.target.value }))}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="Notitie"
                          value={draft.notitie ?? ""}
                          onChange={(e) => setDraft((d) => ({ ...d, notitie: e.target.value }))}
                          className="h-8 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <div className="text-sm font-medium text-foreground">
                            {t.titel || t.bestandsnaam}
                          </div>
                          {t.tekening_nummer && (
                            <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {t.tekening_nummer}
                            </span>
                          )}
                          {t.revisie && (
                            <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              rev {t.revisie}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          {t.titel && <span className="truncate">{t.bestandsnaam}</span>}
                          {t.bestandsgrootte != null && <span>· {formatBytes(t.bestandsgrootte)}</span>}
                        </div>
                        {t.notitie && (
                          <div className="mt-1 text-xs text-foreground/70">{t.notitie}</div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={saveEdit}
                          title="Opslaan"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => {
                            setEditingId(null);
                            setDraft({});
                          }}
                          title="Annuleren"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleView(t)}
                          title="Bekijken"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleDownload(t)}
                          title="Downloaden"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => startEdit(t)}
                          title="Metadata bewerken"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(t)}
                          title="Verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
