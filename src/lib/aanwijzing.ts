export type Aanwijzing = "VOP" | "VP" | "AVP";

const HIERARCHY: Record<Aanwijzing, number> = {
  VOP: 1,
  VP: 2,
  AVP: 3,
};

export function voldoetAanwijzing(
  monteurAanwijzing: Aanwijzing,
  minimumAanwijzing: Aanwijzing
): boolean {
  return HIERARCHY[monteurAanwijzing] >= HIERARCHY[minimumAanwijzing];
}

export function checkCelVoldoet(params: {
  monteurs: { aanwijzing_ls: Aanwijzing; aanwijzing_ms: Aanwijzing }[];
  min_personen_totaal: number;
  min_personen_gekwalificeerd: number;
  min_aanwijzing_ls: Aanwijzing | null;
  min_aanwijzing_ms: Aanwijzing | null;
  discipline: "LS" | "MS" | "beide";
}): { voldoet: boolean; reden: string | null } {
  const {
    monteurs,
    min_personen_totaal,
    min_personen_gekwalificeerd,
    min_aanwijzing_ls,
    min_aanwijzing_ms,
    discipline,
  } = params;

  if (monteurs.length < min_personen_totaal) {
    return {
      voldoet: false,
      reden: `Minimaal ${min_personen_totaal} personen vereist, ${monteurs.length} ingepland`,
    };
  }

  if (discipline === "LS" || discipline === "beide") {
    if (min_aanwijzing_ls) {
      const gekwalificeerd = monteurs.filter((m) =>
        voldoetAanwijzing(m.aanwijzing_ls, min_aanwijzing_ls)
      ).length;
      if (gekwalificeerd < min_personen_gekwalificeerd) {
        return {
          voldoet: false,
          reden: `Minimaal ${min_personen_gekwalificeerd} persoon met LS ${min_aanwijzing_ls} of hoger vereist`,
        };
      }
    }
  }

  if (discipline === "MS" || discipline === "beide") {
    if (min_aanwijzing_ms) {
      const gekwalificeerd = monteurs.filter((m) =>
        voldoetAanwijzing(m.aanwijzing_ms, min_aanwijzing_ms)
      ).length;
      if (gekwalificeerd < min_personen_gekwalificeerd) {
        return {
          voldoet: false,
          reden: `Minimaal ${min_personen_gekwalificeerd} persoon met MS ${min_aanwijzing_ms} of hoger vereist`,
        };
      }
    }
  }

  return { voldoet: true, reden: null };
}
