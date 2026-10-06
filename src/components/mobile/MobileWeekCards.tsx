import { AlertTriangle, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { compactCaseLabels, compactMonteurLabels, type MobileDayBlock, type MonteurDayState } from "@/lib/mobile-planning";
import { COLOR_MAP } from "@/lib/planning-types";
import { CELL_TONE, DAY_LABELS, formatShort } from "./MobileShared";
import type { MobilePlanningData, MobileProject } from "./useMobilePlanningData";


export function CaseWeekCard({ project, blocks, cells, data, open, onToggle }: { project: MobileProject; blocks: MobileDayBlock[]; cells: (MobileDayBlock | null)[]; data: MobilePlanningData; open: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  return <article className="overflow-hidden rounded-lg border border-border bg-card">
    <Button variant="ghost" className="block h-auto w-full rounded-none p-0 text-left font-normal hover:bg-transparent" onClick={onToggle} aria-expanded={open} aria-label={`${project.case_nummer || "Case"} · ${project.station_naam || "Naamloos station"}`}>
      <span className="flex h-11 items-center gap-2 px-2.5"><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{project.case_nummer || "Case"} · {project.station_naam || "Naamloos station"}</strong><span className="block truncate text-[10px] text-muted-foreground">{project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</span></span><ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      <span className="grid grid-cols-5 gap-1 px-1 pb-1">{DAY_LABELS.map((label, index) => {
        const block = cells[index]; const compact = compactMonteurLabels(block?.monteurIds ?? [], data.monteurNameById);
        const content = compact.labels.length ? `${compact.labels.join(" ")}${compact.extra ? ` +${compact.extra}` : ""}` : block?.activities[0]?.slice(0, 8) || (block ? "Gepland" : "–");
        return <span key={label} className={`flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded ${block ? CELL_TONE.planned : CELL_TONE.free}`}><span className="text-[10px] font-medium">{label}</span><span className="block max-w-full truncate px-0.5 text-[11px] font-bold">{content}</span></span>;
      })}</span>
    </Button>
    {open && <div className="divide-y divide-border border-t border-border">{blocks.map((block) => <div key={block.key} className="px-3 py-3">
      <strong className="text-sm capitalize">{block.date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</strong>
      <p className="mt-1 text-sm">{block.activities.join(" · ")}</p>
      <p className="text-sm text-muted-foreground">{block.monteurIds.map((id) => data.monteurNameById.get(id)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{block.colorCodes.map((code) => COLOR_MAP[code]?.naam).filter(Boolean).join(" · ")}</p>
    </div>)}<Button variant="ghost" className="h-11 w-full justify-start rounded-none px-3 text-primary" onClick={() => navigate(`/projecten/${project.id}`)}>Case bekijken</Button></div>}
  </article>;
}

function absenceLabel(reasons: string[]) {
  const reason = reasons.join(" ").toLowerCase();
  if (reason.includes("ziek")) return "Ziek";
  if (reason.includes("verlof") || reason.includes("vak")) return "Vak";
  if (reason.includes("opl")) return "Opl";
  if (reason.includes("vrije dag")) return "Vrije dag";
  return reasons.length ? "Feest/afw" : "Afw";
}

export function MonteurWeekCard({ name, states, data, open, onToggle }: { name: string; states: MonteurDayState[]; data: MobilePlanningData; open: boolean; onToggle: () => void }) {
  const conflicts = states.filter((state) => state.conflict).length;
  return <article className="overflow-hidden rounded-lg border border-border bg-card">
    <Button variant="ghost" className="block h-auto w-full rounded-none p-0 text-left font-normal hover:bg-transparent" onClick={onToggle} aria-expanded={open} aria-label={name}>
      <span className="flex h-11 items-center gap-2 px-2.5"><strong className="min-w-0 flex-1 truncate text-sm">{name}</strong>{conflicts > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{conflicts}</span>}<ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      <span className="grid grid-cols-5 gap-1 px-1 pb-1">{DAY_LABELS.map((label, index) => {
        const state = states[index]; const compact = compactCaseLabels(state?.entries ?? [], data.projectById);
        const tone = state?.conflict || state?.plannedWhileUnavailable ? CELL_TONE.conflict : state?.kind === "planned" ? CELL_TONE.planned : state?.kind === "unavailable" ? CELL_TONE.unavailable : CELL_TONE.free;
        return <span key={label} className={`flex h-12 min-w-0 flex-col items-center justify-center gap-1 rounded ${tone}`}><span className="text-[10px] font-medium">{label}</span><span className="flex w-full min-w-0 items-center justify-center gap-0.5 px-0.5 text-[11px] font-bold"><span className="min-w-0 truncate">{state?.kind === "planned" ? compact.label : state?.kind === "unavailable" ? absenceLabel(state.reasons) : "Vrij"}</span>{compact.extra > 0 && <span className="shrink-0">+{compact.extra}</span>}</span></span>;
      })}</span>
    </Button>
    {open && <div className="divide-y divide-border border-t border-border">{states.map((state) => <div key={state.dayIndex} className="px-3 py-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{DAY_LABELS[state.dayIndex]} {formatShort(state.date)}</strong>{state.conflict && <span className="text-xs font-semibold text-destructive">Conflict · {state.entries.length} cases</span>}{state.kind === "free" && <span className="text-xs text-muted-foreground">Vrij / beschikbaar</span>}</div>
      {state.reasons.length > 0 && <p className={`mt-1 text-xs ${state.plannedWhileUnavailable ? "text-destructive" : "text-muted-foreground"}`}>Niet beschikbaar: {state.reasons.join(", ")}{state.plannedWhileUnavailable ? " — toch ingepland" : ""}</p>}
      {state.entries.map((entry) => { const project = data.projectById.get(entry.projectId); return <p key={entry.projectId} className="mt-2 text-sm"><span className="font-medium">{project?.case_nummer || "Case"} · {project?.station_naam || "Naamloos station"}</span><span className="block text-muted-foreground">{entry.activities.join(" · ")}</span></p>; })}
    </div>)}</div>}
  </article>;
}


/** Volledig vrije resources als één ingeklapte groep; uitklap toont namen met 5 rustige dagcellen. */
export function FreeMonteursGroup({ names, open, onToggle }: { names: string[]; open: boolean; onToggle: () => void }) {
  if (!names.length) return null;
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
  return <article className="overflow-hidden rounded-lg border border-dashed border-border bg-card">
    <Button variant="ghost" className="flex h-auto min-h-11 w-full items-center gap-2 whitespace-normal rounded-none px-3 py-2 text-left font-normal hover:bg-transparent" onClick={onToggle} aria-expanded={open}>
      <span className="min-w-0 flex-1 text-sm"><strong>Vrij hele week · {names.length}</strong>{!open && <span className="block truncate text-xs text-muted-foreground">{preview}</span>}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </Button>
    {open && <ul className="divide-y divide-border border-t border-border">{names.map((n) => <li key={n} className="flex items-center gap-2 px-3 py-2"><span className="min-w-0 flex-1 truncate text-sm">{n}</span><span className="grid w-40 shrink-0 grid-cols-5 gap-0.5">{DAY_LABELS.map((d) => <span key={d} className={`flex h-6 items-center justify-center rounded text-[10px] ${CELL_TONE.free}`}>{d}</span>)}</span></li>)}</ul>}
  </article>;
}
