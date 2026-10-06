import { AlertTriangle, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { MobileDayBlock, MonteurDayState } from "@/lib/mobile-planning";
import { COLOR_MAP } from "@/lib/planning-types";
import { DAY_LABELS, formatShort, StatusChip } from "./MobileShared";
import type { MobilePlanningData, MobileProject } from "./useMobilePlanningData";

export function CaseWeekCard({ project, blocks, monday, data, open, onToggle }: { project: MobileProject; blocks: MobileDayBlock[]; monday: Date; data: MobilePlanningData; open: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const byDay = new Map(blocks.map((b) => [b.dayIndex, b]));
  return <article className="overflow-hidden rounded-lg border border-border bg-card">
    <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left" onClick={onToggle} aria-expanded={open}>
      <span className="min-w-0 flex-1"><strong className="block truncate">{project.case_nummer || "Geen casenummer"} · {project.station_naam || "Naamloos station"}</strong><span className="block truncate text-xs text-muted-foreground">{project.opdrachtgever_id ? data.opdrachtgeverNameById.get(project.opdrachtgever_id) : "Geen opdrachtgever"}</span></span>
      {project.status === "on_hold" && <StatusChip status={project.status} />}
      <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <div className="grid grid-cols-5 gap-1 border-y border-border px-3 py-2">{DAY_LABELS.map((label, i) => { const planned = byDay.has(i); return <div key={label} className={`flex h-10 flex-col items-center justify-center rounded ${planned ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><span className="text-[10px] font-bold">{label}</span><span className="text-xs">{new Date(monday.getTime() + i * 86400000).getDate()}</span></div>; })}</div>
    {open && <div className="divide-y divide-border">{blocks.map((block) => <div key={block.key} className="px-4 py-3">
      <div className="flex items-center gap-2"><strong className="text-sm">{DAY_LABELS[block.dayIndex]} {formatShort(block.date)}</strong>{block.colorCodes.map((c) => COLOR_MAP[c] && <span key={c} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLOR_MAP[c].hex }} />{COLOR_MAP[c].naam}</span>)}</div>
      <p className="mt-1 text-sm">{block.activities.join(" · ")}</p>
      <p className="text-sm text-muted-foreground">{block.monteurIds.map((id) => data.monteurNameById.get(id)).filter(Boolean).join(", ") || "Nog geen monteurs"}</p>
    </div>)}</div>}
    <button className="min-h-11 w-full px-4 text-left text-sm font-medium text-primary" onClick={() => navigate(`/projecten/${project.id}`)}>Case bekijken</button>
  </article>;
}

function stripClass(state: MonteurDayState | undefined) {
  if (!state) return "bg-muted text-muted-foreground";
  if (state.conflict || state.plannedWhileUnavailable) return "bg-destructive text-destructive-foreground";
  if (state.kind === "planned") return state.entries.every((e) => e.onHold) ? "bg-primary/30 text-foreground" : "bg-primary text-primary-foreground";
  if (state.kind === "unavailable") return "bg-muted/40 text-muted-foreground line-through";
  return "bg-muted text-muted-foreground";
}

export function MonteurWeekCard({ name, states, data, open, onToggle }: { name: string; states: MonteurDayState[]; data: MobilePlanningData; open: boolean; onToggle: () => void }) {
  const plannedDays = states.filter((s) => s.kind === "planned" && s.entries.some((e) => !e.onHold)).length;
  const conflicts = states.filter((s) => s.conflict).length;
  return <article className="overflow-hidden rounded-lg border border-border bg-card">
    <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left" onClick={onToggle} aria-expanded={open}>
      <span className="min-w-0 flex-1"><strong className="block truncate">{name}</strong><span className="block text-xs text-muted-foreground">{plannedDays} {plannedDays === 1 ? "dag" : "dagen"} ingepland</span></span>
      {conflicts > 0 && <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{conflicts}</span>}
      <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <div className="grid grid-cols-5 gap-1 border-t border-border px-3 py-2">{DAY_LABELS.map((label, i) => <div key={label} className={`flex h-10 flex-col items-center justify-center rounded ${stripClass(states[i])}`}><span className="text-[10px] font-bold">{label}</span><span className="text-xs">{states[i]?.date.getDate()}</span></div>)}</div>
    {open && <div className="divide-y divide-border border-t border-border">{states.map((s) => <div key={s.dayIndex} className="px-4 py-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{DAY_LABELS[s.dayIndex]} {formatShort(s.date)}</strong>
        {s.conflict && <span className="text-xs font-semibold text-destructive">⚠ Conflict</span>}
        {!s.conflict && s.kind === "free" && <span className="text-xs text-muted-foreground">Vrij</span>}
      </div>
      {s.reasons.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Niet beschikbaar: {s.reasons.join(", ")}{s.plannedWhileUnavailable ? " — toch ingepland" : ""}</p>}
      {s.entries.map((e) => { const p = data.projectById.get(e.projectId); return <p key={e.projectId} className="mt-1 text-sm"><span className="font-medium">{p?.case_nummer || "Case"} · {p?.station_naam || "Naamloos station"}</span>{e.onHold && <span className="ml-1 rounded bg-destructive/15 px-1 text-[10px] font-semibold uppercase text-destructive">On hold</span>}<span className="block text-muted-foreground">{e.activities.join(" · ")}</span></p>; })}
    </div>)}</div>}
  </article>;
}
