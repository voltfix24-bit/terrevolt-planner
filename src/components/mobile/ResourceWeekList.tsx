import type { MonteurDayState } from "@/lib/mobile-planning";
import type { ResourceGroups } from "@/lib/mobile-ux";
import { FreeMonteursGroup, MonteurWeekCard } from "./MobileWeekCards";
import type { MobileMonteur, MobilePlanningData } from "./useMobilePlanningData";

/** Capacity is the only resource-row perspective; a focused free resource is shown separately. */
export function ResourceWeekList({ groups, states, data, highlight, open, setOpen }: { groups: ResourceGroups<MobileMonteur>; states: Map<string, MonteurDayState[]>; data: MobilePlanningData; highlight?: string | null; open: string | null; setOpen: (id: string | null) => void }) {
  const card = (m: MobileMonteur) => <MonteurWeekCard key={m.id} id={m.id} highlight={highlight === m.id} name={m.naam} states={states.get(m.id) ?? []} data={data} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />;
  const busy = [...groups.conflict, ...groups.planned];
  const empty = !busy.length && !groups.partial.length && !groups.free.length;
  if (empty) return <p className="py-12 text-center text-sm text-muted-foreground">Geen monteurs gevonden</p>;
  const focusedFree = groups.free.find((m) => m.id === open);
  const free = <>{focusedFree && card(focusedFree)}<FreeMonteursGroup names={groups.free.filter((m) => m.id !== focusedFree?.id).map((m) => m.naam)} open={open === "__free"} onToggle={() => setOpen(open === "__free" ? null : "__free")} /></>;
  const section = (title: string, list: MobileMonteur[]) => list.length > 0 && <section className="space-y-2" aria-label={title}><h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} · {list.length}</h2>{list.map(card)}</section>;
  return <>{section("Ingezet", busy)}{section("Deels vrij / afwezig", groups.partial)}{groups.free.length > 0 && <section className="space-y-2" aria-label="Vrij hele week">{free}</section>}</>;
}
