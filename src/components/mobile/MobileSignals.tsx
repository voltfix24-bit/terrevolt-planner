import { useState } from "react";
import { AlertTriangle, ChevronDown, UserX, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { activityTypes, capacityLink, caseTitle, shortActivityType, unavailableLabel, type WeekException } from "@/lib/mobile-ux";
import { COLOR_MAP } from "@/lib/planning-types";
import type { IsoWeek } from "@/lib/mobile-planning";
import type { MobilePlanningData } from "./useMobilePlanningData";

export function ExceptionsBar({ items, week, data }: { items: WeekException[]; week: IsoWeek; data: MobilePlanningData }) {
  const [open, setOpen] = useState(false); const navigate = useNavigate();
  if (!items.length) return null;
  const counts = (["dubbel", "afwezig", "geen-ploeg"] as const).map((type) => ({ type, count: items.filter((e) => e.type === type).length })).filter((e) => e.count);
  return <section className="border-y border-warning-text/40 bg-warning/5" aria-label="Uitzonderingen">
    <Button variant="ghost" className="h-auto min-h-11 w-full justify-between whitespace-normal px-2 text-left text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span>{items.length} {items.length === 1 ? "uitzondering" : "uitzonderingen"} · {counts.map((e) => `${e.count} ${e.type === "geen-ploeg" ? "geen ploeg" : e.type}`).join(" · ")}</span><ChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
    </Button>
    {open && <div className="divide-y divide-warning-text/20">{items.map((item) => {
      const Icon = item.type === "dubbel" ? AlertTriangle : item.type === "afwezig" ? UserX : Users;
      const date = item.date.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
      const codes = item.projectIds.map((id) => data.projectById.get(id)?.case_nummer || caseTitle(data.projectById.get(id))).join(" + ");
      const reasons = item.monteurId ? data.absences.filter((a) => a.monteur_id === item.monteurId && a.datum_van <= localDate(item.date) && a.datum_tot >= localDate(item.date)).map((a) => a.type) : [];
      const text = item.type === "geen-ploeg" ? `${caseTitle(data.projectById.get(item.projectIds[0]))} · ${date} · geen monteur` : `${data.monteurNameById.get(item.monteurId ?? "") ?? "Monteur"} · ${date} · ${item.type === "dubbel" ? codes : `${reasons.length ? unavailableLabel(reasons).toLowerCase() : "niet beschikbaar"} maar ingepland`}`;
      return <Button variant="ghost" key={`${item.type}-${item.dayIndex}-${item.monteurId ?? item.projectIds[0]}`} className={`h-auto min-h-11 w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left text-xs ${item.type === "dubbel" ? "text-destructive-text hover:text-destructive-text" : "text-warning-text hover:text-warning-text"}`} onClick={() => navigate(item.monteurId ? capacityLink(week, item.monteurId) : `/projecten/${item.projectIds[0]}`)}><Icon className="h-4 w-4 shrink-0" /><span>{text}</span></Button>;
    })}</div>}
  </section>;
}

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function ActivityLegend({ codes }: { codes: string[] }) {
  const unique = [...new Set(codes)].filter((code) => COLOR_MAP[code]);
  const labels = activityTypes(unique);
  if (!unique.length) return null;
  return <ul aria-label="Activiteittypes" className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{labels.map((label) => <li key={label} className="flex items-center gap-1"><span className="flex h-1 w-5 overflow-hidden">{unique.filter((code) => shortActivityType(COLOR_MAP[code].naam) === label).map((code) => <span key={code} className={`activity-${code} h-full flex-1`} />)}</span>{label}</li>)}</ul>;
}