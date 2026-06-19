type ErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

const TECHNICAL_PATTERNS: Array<{ match: RegExp; message: string }> = [
  {
    match: /duplicate key value|violates unique constraint|23505|project_weken_project_positie_unique|project_weken_project_id_jaar_week_nr/i,
    message: "Deze wijziging botst met bestaande gegevens. Ververs de pagina en probeer het opnieuw.",
  },
  {
    match: /row-level security|new row violates row-level security|permission denied|not authorized|niet geautoriseerd|42501/i,
    message: "Je hebt geen rechten om deze wijziging uit te voeren.",
  },
  {
    match: /column reference .* is ambiguous|ambiguous/i,
    message: "Deze actie kon niet worden verwerkt door een technische instelling. Probeer opnieuw of meld dit bij beheer.",
  },
  {
    match: /foreign key constraint|violates foreign key|23503/i,
    message: "Deze wijziging verwijst naar gegevens die niet meer bestaan. Ververs de pagina en probeer opnieuw.",
  },
  {
    match: /not-null constraint|null value in column|23502/i,
    message: "Er ontbreekt verplichte informatie. Vul de gegevens aan en probeer opnieuw.",
  },
  {
    match: /check constraint|violates check constraint|23514/i,
    message: "Deze waarde valt buiten de toegestane grenzen.",
  },
  {
    match: /invalid input syntax|invalid uuid|22P02/i,
    message: "Een waarde heeft niet het juiste formaat. Ververs de pagina en probeer opnieuw.",
  },
  {
    match: /deadlock detected|could not serialize access|40001|40P01/i,
    message: "Deze gegevens werden tegelijk aangepast. Probeer de actie nog een keer.",
  },
  {
    match: /jwt expired|invalid claim|auth session missing|not authenticated/i,
    message: "Je sessie is verlopen. Log opnieuw in en probeer het nog een keer.",
  },
  {
    match: /not found|niet gevonden|P0002/i,
    message: "De gegevens zijn niet meer gevonden. Ververs de pagina en probeer opnieuw.",
  },
  {
    match: /network|failed to fetch|fetch failed|timeout|timed out/i,
    message: "Er is tijdelijk geen verbinding. Controleer je netwerk en probeer opnieuw.",
  },
];

function getRawErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as ErrorLike;
    return [e.code, e.message, e.details, e.hint].filter(Boolean).join(" ");
  }
  return String(error);
}

export function toUserFacingError(error: unknown, fallback = "De actie is mislukt. Probeer het opnieuw."): string {
  const raw = getRawErrorText(error);
  if (!raw) return fallback;

  for (const pattern of TECHNICAL_PATTERNS) {
    if (pattern.match.test(raw)) return pattern.message;
  }

  // Laat korte, gewone meldingen door, maar voorkom dat SQL/constraint-details
  // direct in beeld komen bij gebruikers.
  const looksTechnical = /constraint|violates|SQL|Postgres|column|relation|schema|uuid|jsonb|null value|duplicate key|foreign key/i.test(raw);
  if (looksTechnical) return fallback;

  return raw.length > 180 ? fallback : raw;
}

export function logTechnicalError(scope: string, error: unknown): void {
  if (typeof console === "undefined") return;
  console.warn(`[${scope}]`, error);
}
