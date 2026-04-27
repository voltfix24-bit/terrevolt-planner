/**
 * Shared value-to-label maps that mirror the intake form options
 * used in src/pages/ProjectDetail.tsx. These keep the dossier (web)
 * and the print/PDF export in sync, and they degrade gracefully
 * for older or partially-filled projects.
 */

export const yesNoLabel = (v: unknown): string => {
  const s = (v as string | null | undefined)?.toLowerCase().trim();
  if (!s) return "—";
  if (s === "ja") return "Ja";
  if (s === "nee") return "Nee";
  if (s === "deels") return "Deels";
  if (s === "onbekend") return "Onbekend";
  if (s === "nvt" || s === "n.v.t." || s === "n_v_t") return "N.v.t.";
  return String(v);
};

export const valOr = (v: unknown, fallback = "—"): string =>
  v === null || v === undefined || v === "" ? fallback : String(v);

const LABEL_MAPS: Record<string, Record<string, string>> = {
  tijdelijke_situatie: {
    geen: "Geen",
    nsa: "NSA",
    provisorium: "Provisorium",
  },
  huidig_rmu_type: {
    prefab_laag: "Prefab laag",
    magnefix_md: "Magnefix MD",
    magnefix_mf: "Magnefix MF",
  },
  huidig_lsrek_type: {
    open: "Open",
    gesloten: "Gesloten",
  },
  huidig_ov_kwh_meter: {
    "1_fase": "1-fase",
    "3_fase": "3-fase",
    geen: "Geen",
  },
  huidig_ms_kabels_type: {
    gplk: "GPLK",
    kunststof: "Kunststof",
    gemengd: "Gemengd",
  },
  huidig_ls_kabels_type: {
    gplk: "GPLK",
    kunststof: "Kunststof",
    gemengd: "Gemengd",
  },
  prov_ms_eindsluitingen_type: {
    magnefix: "Magnefix",
    cmu: "CMU",
    standaard: "Standaard",
  },
  def_ls_situatie: {
    behouden: "Behouden",
    nieuw_le630: "Nieuw ≤630 A",
    nieuw_gt630_le1000: "Nieuw >630 ≤1000 A",
  },
  def_opleverdossier: {
    inclusief_civiel: "Incl. civiel",
    exclusief_civiel: "Excl. civiel",
  },
  status: {
    concept: "Concept",
    gepland: "Gepland",
    in_uitvoering: "In uitvoering",
    afgerond: "Afgerond",
  },
};

/**
 * Translate a stored intake value into its human label.
 * Falls back to the raw value (capitalised) when no map entry exists,
 * so legacy projects with free-text values still render readably.
 */
export const intakeLabel = (field: string, v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  const raw = String(v).toLowerCase().trim();
  const map = LABEL_MAPS[field];
  if (map && map[raw]) return map[raw];
  // Generic fallback: replace underscores with spaces.
  if (raw.includes("_")) {
    const pretty = raw.replace(/_/g, " ");
    return pretty.charAt(0).toUpperCase() + pretty.slice(1);
  }
  return String(v);
};

export const tijdelijkeLabel = (v: unknown): string =>
  intakeLabel("tijdelijke_situatie", v);
