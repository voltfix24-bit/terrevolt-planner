import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";

// =====================================================
// Types (loose — same shape as ProjectDossier)
// =====================================================
type ProjectRow = Record<string, unknown> & { id: string };

interface KabelRow {
  id: string;
  diameter: string | null;
  positie: number;
}

interface TekeningRow {
  id: string;
  soort: "tijdelijk" | "definitief";
  bestandsnaam: string;
  titel: string | null;
  tekening_nummer: string | null;
  revisie: string | null;
  notitie: string | null;
  created_at: string;
}

interface Critical {
  title: string;
  body: string;
  tone: "danger" | "warning" | "info";
}

export interface DossierPrintProps {
  project: ProjectRow;
  opdrachtgeverNaam: string;
  perceelNaam: string;
  msKabels: KabelRow[];
  lsKabels: KabelRow[];
  tekeningen: TekeningRow[];
  criticals: Critical[];
  samenvatting: string;
  periodeLabel: string;
  periodeDuur: number | null;
}

// =====================================================
// Helpers (mirror dossier — but plain output for print)
// =====================================================
const fmtDate = (d: unknown): string => {
  if (!d || typeof d !== "string") return "—";
  const p = parseISO(d);
  if (!isValid(p)) return "—";
  return format(p, "d MMMM yyyy", { locale: nl });
};

const yesNo = (v: unknown): string => {
  const s = (v as string | null | undefined)?.toLowerCase();
  if (s === "ja") return "Ja";
  if (s === "nee") return "Nee";
  if (s === "deels") return "Deels";
  if (s === "onbekend") return "Onbekend";
  if (s === "nvt" || s === "n.v.t.") return "N.v.t.";
  return v ? String(v) : "—";
};

const valOr = (v: unknown, fb = "—"): string =>
  v === null || v === undefined || v === "" ? fb : String(v);

const tijdLabel = (v: unknown) => {
  const s = (v as string | null | undefined)?.toLowerCase();
  if (s === "nsa") return "NSA";
  if (s === "provisorium") return "Provisorium";
  if (s === "geen") return "Geen";
  return "—";
};

// =====================================================
// Print-only layout. Hidden on screen, visible on print.
// Light theme, A4 sized, dark legible text.
// =====================================================
const DossierPrint: React.FC<DossierPrintProps> = (props) => {
  const {
    project,
    opdrachtgeverNaam,
    perceelNaam,
    msKabels,
    lsKabels,
    tekeningen,
    criticals,
    samenvatting,
    periodeLabel,
    periodeDuur,
  } = props;

  const get = <T,>(k: string): T | undefined => project?.[k] as T | undefined;
  const tijd = (get<string>("tijdelijke_situatie") ?? "").toLowerCase();
  const tijdelijkeTekeningen = tekeningen.filter((t) => t.soort === "tijdelijk");
  const definitieveTekeningen = tekeningen.filter((t) => t.soort === "definitief");
  const today = format(new Date(), "d MMMM yyyy", { locale: nl });

  return (
    <div className="print-root" aria-hidden>
      {/* =================================== */}
      {/* PAGE 1 — MONTEURSBRIEFING           */}
      {/* =================================== */}
      <section className="print-page">
        <header className="pp-header">
          <div className="pp-brand">
            <div className="pp-brand-dot" />
            <div>
              <div className="pp-brand-name">TerreVolt BV</div>
              <div className="pp-brand-sub">Monteursbriefing</div>
            </div>
          </div>
          <div className="pp-meta">
            <div>
              <span className="pp-meta-l">Case</span>
              <span className="pp-meta-v">{valOr(get("case_nummer"))}</span>
            </div>
            <div>
              <span className="pp-meta-l">Datum</span>
              <span className="pp-meta-v">{today}</span>
            </div>
          </div>
        </header>

        <h1 className="pp-title">{valOr(get("station_naam"), "Naamloos station")}</h1>
        <div className="pp-subtitle">
          {valOr(get("straat"), "")} {valOr(get("postcode"), "")} {valOr(get("stad"), "")}
          {get<string>("gemeente") ? ` · ${get<string>("gemeente")}` : ""}
        </div>

        {/* Top facts strip */}
        <div className="pp-facts">
          <Fact label="Opdrachtgever" value={opdrachtgeverNaam} />
          <Fact label="Perceel" value={perceelNaam} />
          <Fact label="GSU / GEU" value={periodeLabel} sub={periodeDuur ? `${periodeDuur} dagen` : undefined} />
          <Fact label="WV / Uitvoerder" value={valOr(get("wv_naam"))} />
        </div>

        {/* Operationeel overzicht */}
        <div className="pp-section">
          <div className="pp-section-h">Operationeel overzicht</div>
          <p className="pp-paragraph">{samenvatting}</p>
        </div>

        {/* 3-kolom samenvatting situaties */}
        <div className="pp-cols-3">
          <Block title="Huidige situatie">
            <Line k="RMU type" v={valOr(get("huidig_rmu_type"))} />
            <Line k="Richtingen" v={valOr(get("huidig_rmu_aantal_richtingen"))} />
            <Line k="Vermogensveld" v={valOr(get("huidig_vermogensveld"))} />
            <Line k="Trafo" v={valOr(get("huidig_trafo_type"))} />
            <Line k="LS-rek" v={valOr(get("huidig_lsrek_type"))} />
          </Block>
          <Block title={`Tijdelijke situatie · ${tijdLabel(tijd)}`} accent="amber">
            {tijd === "nsa" && (
              <>
                <Line k="NSA-luik" v={yesNo(get("nsa_luik_aanwezig"))} />
                <Line k="Tekeningen" v={yesNo(get("tijd_tekeningen_aanwezig"))} />
              </>
            )}
            {tijd === "provisorium" && (
              <>
                <Line k="MS eindsl." v={valOr(get("prov_ms_eindsluitingen_aantal"))} />
                <Line k="MS moffen" v={valOr(get("prov_ms_moffen_aantal"))} />
                <Line k="LS eindsl." v={valOr(get("prov_ls_eindsluitingen_aantal"))} />
                <Line k="LS moffen" v={valOr(get("prov_ls_moffen_aantal"))} />
                <Line k="LS-kast" v={yesNo(get("prov_tijdelijke_lskast"))} />
              </>
            )}
            {tijd !== "nsa" && tijd !== "provisorium" && (
              <div className="pp-empty">Geen aparte tijdelijke voorziening.</div>
            )}
          </Block>
          <Block title="Definitieve situatie" accent="green">
            <Line k="RMU" v={valOr(get("def_rmu_merk_configuratie"))} />
            <Line k="MS richtingen" v={valOr(get("def_aantal_ms_richtingen"))} />
            <Line k="Trafo" v={valOr(get("def_trafo_type"))} />
            <Line k="LS situatie" v={valOr(get("def_ls_situatie"))} />
            <Line k="Aardmeting" v={yesNo(get("def_aardmeting"))} />
          </Block>
        </div>

        {/* Aandachtspunten */}
        <div className="pp-section">
          <div className="pp-section-h">Aandachtspunten voor uitvoering</div>
          {criticals.length === 0 ? (
            <div className="pp-empty">Geen openstaande aandachtspunten.</div>
          ) : (
            <ul className="pp-criticals">
              {criticals.map((c, i) => (
                <li key={i} className={`pp-crit pp-crit-${c.tone}`}>
                  <div className="pp-crit-title">{c.title}</div>
                  <div className="pp-crit-body">{c.body}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Document checklist */}
        <div className="pp-section">
          <div className="pp-section-h">Documenten mee te nemen</div>
          <table className="pp-table">
            <thead>
              <tr>
                <th style={{ width: "5%" }}></th>
                <th>Document</th>
                <th style={{ width: "18%" }}>Type</th>
                <th style={{ width: "12%" }}>Revisie</th>
              </tr>
            </thead>
            <tbody>
              {tekeningen.length === 0 && (
                <tr>
                  <td colSpan={4} className="pp-empty-row">Geen documenten gekoppeld.</td>
                </tr>
              )}
              {tekeningen.map((t) => (
                <tr key={t.id}>
                  <td>☐</td>
                  <td>
                    {t.titel || t.bestandsnaam}
                    {t.tekening_nummer && <div className="pp-mono pp-sub">{t.tekening_nummer}</div>}
                  </td>
                  <td className="pp-cap">{t.soort}</td>
                  <td className="pp-mono">{t.revisie || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Monteur checklist */}
        <div className="pp-section">
          <div className="pp-section-h">Monteur checklist</div>
          <ul className="pp-checklist">
            <li>☐ Sleutels / toegang geregeld via {valOr(get("wv_naam"), "WV")}</li>
            <li>☐ Tijdelijke tekeningen gecontroleerd</li>
            <li>☐ Definitieve tekeningen gecontroleerd</li>
            <li>☐ Aardmeting apparatuur indien vereist</li>
            <li>☐ Veiligheidsmiddelen / aanwijzing controleren</li>
            <li>☐ Materiaal volgens definitieve situatie compleet</li>
          </ul>
        </div>

        <PrintFooter caseNr={valOr(get("case_nummer"))} pageLabel="Monteursbriefing · pagina 1" />
      </section>

      {/* =================================== */}
      {/* PAGE 2 — PROJECTGEGEVENS + HUIDIG   */}
      {/* =================================== */}
      <section className="print-page">
        <header className="pp-header">
          <div className="pp-brand">
            <div className="pp-brand-dot" />
            <div>
              <div className="pp-brand-name">TerreVolt BV</div>
              <div className="pp-brand-sub">Project dossier</div>
            </div>
          </div>
          <div className="pp-meta">
            <div>
              <span className="pp-meta-l">Case</span>
              <span className="pp-meta-v">{valOr(get("case_nummer"))}</span>
            </div>
            <div>
              <span className="pp-meta-l">Station</span>
              <span className="pp-meta-v">{valOr(get("station_naam"))}</span>
            </div>
          </div>
        </header>

        <h2 className="pp-h2">Projectgegevens</h2>
        <div className="pp-grid-2">
          <Line k="Opdrachtgever" v={opdrachtgeverNaam} />
          <Line k="Perceel" v={perceelNaam} />
          <Line k="WV / Uitvoerder" v={valOr(get("wv_naam"))} />
          <Line k="Behuizing" v={valOr(get("behuizing_nummer"))} />
          <Line k="GSU" v={fmtDate(get("gsu_datum"))} />
          <Line k="GEU" v={fmtDate(get("geu_datum"))} />
          <Line k="GSU / GEU label" v={valOr(get("gsu_geu"))} />
          <Line k="Locatie" v={valOr(get("locatie"))} />
          <Line k="Straat" v={valOr(get("straat"))} />
          <Line k="Postcode / Stad" v={`${valOr(get("postcode"), "")} ${valOr(get("stad"), "")}`.trim() || "—"} />
          <Line k="Gemeente" v={valOr(get("gemeente"))} />
          <Line k="Status" v={valOr(get("status"))} />
        </div>

        <div className="pp-cols-2">
          <Block title="Bouwkundig">
            <Line k="Vereist" v={yesNo(get("bouwkundig_benodigd"))} />
            <Line k="Aannemer" v={valOr(get("bouwkundig_aannemer"))} />
            <Line k="Aantal dagen" v={valOr(get("bouwkundig_dagen"))} />
          </Block>
          <Block title="Asbest">
            <Line k="Sanering" v={yesNo(get("asbest_benodigd"))} />
            <Line k="Uitvoerder" v={valOr(get("asbest_uitvoerder"))} />
            <Line k="Aantal dagen" v={valOr(get("asbest_dagen"))} />
          </Block>
        </div>

        {get<string>("notities") && (
          <div className="pp-section">
            <div className="pp-section-h">Notities</div>
            <p className="pp-paragraph">{get<string>("notities")}</p>
          </div>
        )}

        <h2 className="pp-h2">Huidige situatie</h2>
        <div className="pp-cols-3">
          <Block title="MS / RMU">
            <Line k="Type" v={valOr(get("huidig_rmu_type"))} />
            <Line k="Richtingen" v={valOr(get("huidig_rmu_aantal_richtingen"))} />
            <Line k="Vermogensveld" v={valOr(get("huidig_vermogensveld"))} />
          </Block>
          <Block title="Transformator">
            <Line k="Aanwezig" v={yesNo(get("huidig_trafo_aanwezig"))} />
            <Line k="Type" v={valOr(get("huidig_trafo_type"))} />
          </Block>
          <Block title="LS-Rek / OV">
            <Line k="LS-rek aanwezig" v={yesNo(get("huidig_lsrek_aanwezig"))} />
            <Line k="Type" v={valOr(get("huidig_lsrek_type"))} />
            <Line k="Flex OV" v={yesNo(get("huidig_flex_ov_aanwezig"))} />
            <Line k="OV kWh meter" v={yesNo(get("huidig_ov_kwh_meter"))} />
          </Block>
        </div>
        <div className="pp-cols-2">
          <Block title="MS Kabels">
            <Line k="Aanwezig" v={yesNo(get("huidig_ms_kabels_aanwezig"))} />
            <Line k="Type" v={valOr(get("huidig_ms_kabels_type"))} />
            <Line k="Aantal" v={valOr(get("huidig_ms_kabels_aantal"))} />
            <Line
              k="Diameters"
              v={msKabels.length > 0 ? msKabels.map((k) => k.diameter || "?").join(" · ") : "—"}
            />
          </Block>
          <Block title="LS Kabels">
            <Line k="Aanwezig" v={yesNo(get("huidig_ls_kabels_aanwezig"))} />
            <Line k="Type" v={valOr(get("huidig_ls_kabels_type"))} />
            <Line k="Aantal" v={valOr(get("huidig_ls_kabels_aantal"))} />
            <Line
              k="Diameters"
              v={lsKabels.length > 0 ? lsKabels.map((k) => k.diameter || "?").join(" · ") : "—"}
            />
          </Block>
        </div>
        <div className="pp-inline">
          <span className="pp-inline-k">Hergebruik kabels:</span>
          <span className="pp-inline-v">{yesNo(get("huidig_kabels_herbruikbaar"))}</span>
        </div>

        <PrintFooter caseNr={valOr(get("case_nummer"))} pageLabel="Dossier · pagina 2" />
      </section>

      {/* =================================== */}
      {/* PAGE 3 — TIJDELIJK + DEFINITIEF     */}
      {/* =================================== */}
      <section className="print-page">
        <header className="pp-header">
          <div className="pp-brand">
            <div className="pp-brand-dot" />
            <div>
              <div className="pp-brand-name">TerreVolt BV</div>
              <div className="pp-brand-sub">Project dossier</div>
            </div>
          </div>
          <div className="pp-meta">
            <div>
              <span className="pp-meta-l">Case</span>
              <span className="pp-meta-v">{valOr(get("case_nummer"))}</span>
            </div>
            <div>
              <span className="pp-meta-l">Station</span>
              <span className="pp-meta-v">{valOr(get("station_naam"))}</span>
            </div>
          </div>
        </header>

        <h2 className="pp-h2">Tijdelijke situatie · {tijdLabel(tijd)}</h2>
        {tijd === "nsa" && (
          <Block title="NSA Setup" accent="amber">
            <Line k="NSA-luik aanwezig" v={yesNo(get("nsa_luik_aanwezig"))} />
            <Line k="Tijdelijke tekeningen" v={yesNo(get("tijd_tekeningen_aanwezig"))} />
          </Block>
        )}
        {tijd === "provisorium" && (
          <div className="pp-cols-2">
            <Block title="MS provisorium" accent="amber">
              <Line k="Eindsluitingen aantal" v={valOr(get("prov_ms_eindsluitingen_aantal"))} />
              <Line k="Eindsluitingen type" v={valOr(get("prov_ms_eindsluitingen_type"))} />
              <Line k="Moffen" v={valOr(get("prov_ms_moffen_aantal"))} />
            </Block>
            <Block title="LS provisorium" accent="amber">
              <Line k="Eindsluitingen aantal" v={valOr(get("prov_ls_eindsluitingen_aantal"))} />
              <Line k="Moffen" v={valOr(get("prov_ls_moffen_aantal"))} />
              <Line k="Tijdelijke LS-kast" v={yesNo(get("prov_tijdelijke_lskast"))} />
            </Block>
          </div>
        )}
        {tijd !== "nsa" && tijd !== "provisorium" && (
          <p className="pp-paragraph">Geen aparte tijdelijke voorziening — werkzaamheden binnen één onderbreking.</p>
        )}

        <div className="pp-section">
          <div className="pp-section-h">Tijdelijke tekeningen</div>
          <DocTable items={tijdelijkeTekeningen} />
        </div>

        <h2 className="pp-h2">Definitieve situatie</h2>
        <div className="pp-cols-2">
          <Block title="RMU & MS" accent="green">
            <Line k="RMU vervangen" v={yesNo(get("def_rmu_vervangen"))} />
            <Line k="Merk / configuratie" v={valOr(get("def_rmu_merk_configuratie"))} />
            <Line k="Ombouw IMS" v={yesNo(get("def_ombouw_ims"))} />
            <Line k="MS richtingen" v={valOr(get("def_aantal_ms_richtingen"))} />
            <Line k="Vermogensveld" v={valOr(get("def_vermogensveld"))} />
          </Block>
          <Block title="Trafo" accent="green">
            <Line k="Vervangen" v={yesNo(get("def_trafo_vervangen"))} />
            <Line k="Type" v={valOr(get("def_trafo_type"))} />
            <Line k="Gedraaid" v={yesNo(get("def_trafo_gedraaid"))} />
          </Block>
          <Block title="LS & GGI" accent="green">
            <Line k="LS situatie" v={valOr(get("def_ls_situatie"))} />
            <Line k="LS stroken herschikken" v={valOr(get("def_ls_aantal_stroken_herschikken"))} />
            <Line k="Zekeringen wisselen" v={yesNo(get("def_zekeringen_wisselen"))} />
            <Line k="GGI nieuw" v={yesNo(get("def_ggi_nieuw"))} />
            <Line k="GGI aantal" v={valOr(get("def_ggi_aantal"))} />
          </Block>
          <Block title="Aarding & OV" accent="green">
            <Line k="Vereffening vernieuwen" v={yesNo(get("def_vereffening_vernieuwen"))} />
            <Line k="Aardelektrode" v={yesNo(get("def_aardelektrode"))} />
            <Line k="Aardmeting" v={yesNo(get("def_aardmeting"))} />
            <Line k="Flex OV nieuw" v={yesNo(get("def_flex_ov_nieuw"))} />
            <Line k="OV kWh meter nieuw" v={yesNo(get("def_ov_kwh_meter_nieuw"))} />
          </Block>
        </div>
        <div className="pp-inline">
          <span className="pp-inline-k">Opleverdossier:</span>
          <span className="pp-inline-v">{valOr(get("def_opleverdossier"))}</span>
        </div>

        <div className="pp-section">
          <div className="pp-section-h">Definitieve tekeningen</div>
          <DocTable items={definitieveTekeningen} />
        </div>

        <PrintFooter caseNr={valOr(get("case_nummer"))} pageLabel="Dossier · pagina 3" />
      </section>
    </div>
  );
};

// =====================================================
// Print sub-components
// =====================================================
const Fact: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="pp-fact">
    <div className="pp-fact-l">{label}</div>
    <div className="pp-fact-v">{value}</div>
    {sub && <div className="pp-fact-sub">{sub}</div>}
  </div>
);

const Block: React.FC<{
  title: string;
  accent?: "default" | "amber" | "green";
  children: React.ReactNode;
}> = ({ title, accent = "default", children }) => (
  <div className={`pp-block pp-block-${accent}`}>
    <div className="pp-block-h">{title}</div>
    <div className="pp-block-body">{children}</div>
  </div>
);

const Line: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="pp-line">
    <span className="pp-line-k">{k}</span>
    <span className="pp-line-v">{v ?? "—"}</span>
  </div>
);

const DocTable: React.FC<{ items: TekeningRow[] }> = ({ items }) => {
  if (items.length === 0) {
    return <div className="pp-empty">Geen documenten beschikbaar.</div>;
  }
  return (
    <table className="pp-table">
      <thead>
        <tr>
          <th>Document</th>
          <th style={{ width: "20%" }}>Tekening nr.</th>
          <th style={{ width: "12%" }}>Revisie</th>
          <th style={{ width: "16%" }}>Datum</th>
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t.id}>
            <td>{t.titel || t.bestandsnaam}</td>
            <td className="pp-mono">{t.tekening_nummer || "—"}</td>
            <td className="pp-mono">{t.revisie || "—"}</td>
            <td className="pp-mono">
              {t.created_at && isValid(parseISO(t.created_at))
                ? format(parseISO(t.created_at), "d MMM yyyy", { locale: nl })
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const PrintFooter: React.FC<{ caseNr: string; pageLabel: string }> = ({ caseNr, pageLabel }) => (
  <footer className="pp-footer">
    <span>TerreVolt BV · Project dossier · Case {caseNr}</span>
    <span>{pageLabel}</span>
  </footer>
);

export default DossierPrint;
