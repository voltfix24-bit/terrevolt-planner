/**
 * Splitsing mandagenregister: aardingsdagen krijgen een eigen register.
 * Een dag hoort bij "aarding" als ALLE activiteiten die dag aarding zijn;
 * een gemengde dag blijft in het projectregister zodat uren nooit dubbel tellen.
 */
export type RegisterSoort = "project" | "aarding";

export const isAardingActiviteit = (naam: string): boolean =>
  /^aarding/i.test(naam.trim());

export function registerSoortVoorDag(activiteiten: string | null | undefined): RegisterSoort {
  const namen = (activiteiten ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return namen.length > 0 && namen.every(isAardingActiviteit) ? "aarding" : "project";
}

export function filterRegisterRows<T extends { activiteiten: string | null }>(
  rows: T[],
  soort: RegisterSoort,
): T[] {
  return rows.filter((r) => registerSoortVoorDag(r.activiteiten) === soort);
}
