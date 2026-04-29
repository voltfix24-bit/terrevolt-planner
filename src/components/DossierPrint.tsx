import { format, parseISO, isValid } from "date-fns";
import { nl } from "date-fns/locale";
import {
  yesNoLabel,
  valOr,
  intakeLabel,
  tijdelijkeLabel,
} from "@/lib/dossier-labels";

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
  mime_type?: string | null;
  previewUrl?: string | null;
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
// Helpers
// =====================================================
const fmtDate = (d: unknown): string => {
  if (!d || typeof d !== "string") return "—";
  const p = parseISO(d);
  if (!isValid(p)) return "—";
  return format(p, "d MMMM yyyy", { locale: nl });
};

const adresLine = (project: ProjectRow): string => {
  const parts = [
    project.straat,
    `${valOr(project.postcode, "")} ${valOr(project.stad, "")}`.trim(),
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  if (project.gemeente && project.gemeente !== project.stad) {
    parts.push(`gem. ${project.gemeente}`);
  }
  return parts.join(" · ");
};

const hasVal = (v: unknown): boolean =>
  !(v === null || v === undefined || v === "");

// =====================================================
// Print-only layout. Light A4. Page 1 = monteursbriefing.
// Pages 2+ = full project dossier.
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
  const adres = adresLine(project);

  // Build a concrete "wat moet er gebeuren" list from the intake.
  const acties: string[] = [];
  if (yesNoLabel(get("def_rmu_vervangen")) === "Ja") {
    acties.push(
      `RMU vervangen door ${valOr(get("def_rmu_merk_configuratie"), "nieuwe RMU")}` +
        (hasVal(get("def_aantal_ms_richtingen"))
          ? ` (${get<number>("def_aantal_ms_richtingen")} MS-richtingen)`
          : ""),
    );
  } else if (yesNoLabel(get("def_ombouw_ims")) === "Ja") {
    acties.push("Bestaande RMU ombouwen (IMS)");
  }
  if (yesNoLabel(get("def_trafo_vervangen")) === "Ja") {
    acties.push(
      `Transformator vervangen${hasVal(get("def_trafo_type")) ? ` door ${get<string>("def_trafo_type")}` : ""}`,
    );
  } else if (yesNoLabel(get("def_trafo_gedraaid")) === "Ja") {
    acties.push("Transformator draaien (handhaven)");
  }
  const lsSit = (get<string>("def_ls_situatie") ?? "").toLowerCase();
  if (lsSit && lsSit !== "behouden") {
    acties.push(`LS-rek: ${intakeLabel("def_ls_situatie", lsSit)}`);
  }
  if (yesNoLabel(get("def_ggi_nieuw")) === "Ja") {
    acties.push(
      `GGI nieuw${hasVal(get("def_ggi_aantal")) ? ` (${get<number>("def_ggi_aantal")} stuks)` : ""}`,
    );
  }
  if (yesNoLabel(get("def_aardelektrode")) === "Ja") acties.push("Aardelektrode aanbrengen");
  if (yesNoLabel(get("def_aardmeting")) === "Ja") acties.push("Aardmeting uitvoeren");
  if (yesNoLabel(get("def_zekeringen_wisselen")) === "Ja") acties.push("Zekeringen wisselen");
  if (yesNoLabel(get("def_vereffening_vernieuwen")) === "Ja")
    acties.push("Vereffeningsleiding vernieuwen");
  if (yesNoLabel(get("def_flex_ov_nieuw")) === "Ja") acties.push("Nieuwe Flex-OV plaatsen");
  if (yesNoLabel(get("def_ov_kwh_meter_nieuw")) === "Ja") acties.push("OV kWh-meter vervangen");

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
        {adres && <div className="pp-subtitle">{adres}</div>}

        {/* Top facts strip */}
        <div className="pp-facts">
          <Fact label="Opdrachtgever" value={opdrachtgeverNaam} />
          <Fact label="Perceel" value={perceelNaam} />
          <Fact
            label="GSU / GEU"
            value={periodeLabel}
            sub={periodeDuur ? `${periodeDuur} dagen` : undefined}
          />
          <Fact label="WV / Uitvoerder" value={valOr(get("wv_naam"))} />
        </div>

        {/* Operationeel overzicht */}
        <div className="pp-section">
          <div className="pp-section-h">Operationeel overzicht</div>
          <p className="pp-paragraph">{samenvatting}</p>
        </div>

        {/* Wat moet er gebeuren */}
        {acties.length > 0 && (
          <div className="pp-section">
            <div className="pp-section-h">Wat moet er gebeuren</div>
            <ul className="pp-checklist">
              {acties.map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 3-kolom samenvatting situaties */}
        <div className="pp-cols-3">
          <Block title="Huidige situatie">
            <Line k="RMU" v={intakeLabel("huidig_rmu_type", get("huidig_rmu_type"))} />
            <Line k="Richtingen" v={valOr(get("huidig_rmu_aantal_richtingen"))} />
            <Line k="Vermogensveld" v={yesNoLabel(get("huidig_vermogensveld"))} />
            <Line k="Trafo" v={valOr(get("huidig_trafo_type"))} />
            <Line k="LS-rek" v={intakeLabel("huidig_lsrek_type", get("huidig_lsrek_type"))} />
          </Block>
          <Block title={`Tijdelijk · ${tijdelijkeLabel(tijd)}`} accent="amber">
            {tijd === "nsa" && (
              <>
                <Line k="NSA-luik" v={yesNoLabel(get("nsa_luik_aanwezig"))} />
                <Line k="Tekeningen" v={yesNoLabel(get("tijd_tekeningen_aanwezig"))} />
              </>
            )}
            {tijd === "provisorium" && (
              <>
                <Line k="MS eindsl." v={valOr(get("prov_ms_eindsluitingen_aantal"))} />
                <Line k="MS moffen" v={valOr(get("prov_ms_moffen_aantal"))} />
                <Line k="LS eindsl." v={valOr(get("prov_ls_eindsluitingen_aantal"))} />
                <Line k="LS moffen" v={valOr(get("prov_ls_moffen_aantal"))} />
                <Line k="LS-kast" v={yesNoLabel(get("prov_tijdelijke_lskast"))} />
              </>
            )}
            {tijd !== "nsa" && tijd !== "provisorium" && (
              <div className="pp-empty">Geen aparte tijdelijke voorziening.</div>
            )}
          </Block>
          <Block title="Definitieve situatie" accent="green">
            <Line k="RMU" v={valOr(get("def_rmu_merk_configuratie"))} />
            <Line k="MS richt." v={valOr(get("def_aantal_ms_richtingen"))} />
            <Line k="Trafo" v={valOr(get("def_trafo_type"))} />
            <Line k="LS" v={intakeLabel("def_ls_situatie", get("def_ls_situatie"))} />
            <Line k="Aardmeting" v={yesNoLabel(get("def_aardmeting"))} />
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
                  <td colSpan={4} className="pp-empty-row">
                    Geen documenten gekoppeld.
                  </td>
                </tr>
              )}
              {tekeningen.map((t) => (
                <tr key={t.id}>
                  <td>☐</td>
                  <td>
                    {t.titel || t.bestandsnaam}
                    {t.tekening_nummer && (
                      <div className="pp-mono pp-sub">{t.tekening_nummer}</div>
                    )}
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
            <li>☐ LMRA uitgevoerd op locatie</li>
            <li>☐ Tijdelijke tekeningen gecontroleerd</li>
            <li>☐ Definitieve tekeningen gecontroleerd</li>
            <li>☐ Aardmeting apparatuur indien vereist</li>
            <li>☐ Veiligheidsmiddelen / aanwijzing controleren</li>
            <li>☐ Materiaal volgens definitieve situatie compleet</li>
            {yesNoLabel(get("asbest_benodigd")) === "Ja" && (
              <li>☐ Afstemming asbestsanering met {valOr(get("asbest_uitvoerder"), "uitvoerder")}</li>
            )}
            {yesNoLabel(get("bouwkundig_benodigd")) === "Ja" && (
              <li>☐ Afstemming bouwkundig met {valOr(get("bouwkundig_aannemer"), "aannemer")}</li>
            )}
          </ul>
        </div>

        <PrintFooter
          caseNr={valOr(get("case_nummer"))}
          pageLabel="Monteursbriefing · pagina 1"
        />
      </section>

      {/* =================================== */}
      {/* PAGE 2 — PROJECTGEGEVENS + HUIDIG   */}
      {/* =================================== */}
      <section className="print-page">
        <DossierPageHeader project={project} subtitle="Projectgegevens & huidige situatie" />

        <h2 className="pp-h2">Projectgegevens</h2>
        <div className="pp-grid-2">
          <Line k="Opdrachtgever" v={opdrachtgeverNaam} />
          <Line k="Perceel" v={perceelNaam} />
          <Line k="WV / Uitvoerder" v={valOr(get("wv_naam"))} />
          <Line k="Behuizing" v={valOr(get("behuizing_nummer"))} />
          <Line k="GSU" v={fmtDate(get("gsu_datum"))} />
          <Line k="GEU" v={fmtDate(get("geu_datum"))} />
          <Line k="Status" v={intakeLabel("status", get("status"))} />
          <Line k="Adres" v={adres || "—"} />
        </div>

        <div className="pp-cols-2">
          <Block title="Bouwkundig">
            <Line k="Vereist" v={yesNoLabel(get("bouwkundig_benodigd"))} />
            {hasVal(get("bouwkundig_aannemer")) && (
              <Line k="Aannemer" v={valOr(get("bouwkundig_aannemer"))} />
            )}
            {hasVal(get("bouwkundig_dagen")) && (
              <Line k="Aantal dagen" v={valOr(get("bouwkundig_dagen"))} />
            )}
          </Block>
          <Block title="Asbest">
            <Line k="Sanering" v={yesNoLabel(get("asbest_benodigd"))} />
            {hasVal(get("asbest_uitvoerder")) && (
              <Line k="Uitvoerder" v={valOr(get("asbest_uitvoerder"))} />
            )}
            {hasVal(get("asbest_dagen")) && (
              <Line k="Aantal dagen" v={valOr(get("asbest_dagen"))} />
            )}
          </Block>
        </div>

        {get<string>("notities") && (
          <div className="pp-section">
            <div className="pp-section-h">Notities</div>
            <p className="pp-paragraph" style={{ whiteSpace: "pre-wrap" }}>
              {get<string>("notities")}
            </p>
          </div>
        )}

        <h2 className="pp-h2">Huidige situatie</h2>
        <div className="pp-cols-3">
          <Block title="MS / RMU">
            <Line k="Type" v={intakeLabel("huidig_rmu_type", get("huidig_rmu_type"))} />
            <Line k="Richtingen" v={valOr(get("huidig_rmu_aantal_richtingen"))} />
            <Line k="Vermogensveld" v={yesNoLabel(get("huidig_vermogensveld"))} />
          </Block>
          <Block title="Transformator">
            <Line k="Aanwezig" v={yesNoLabel(get("huidig_trafo_aanwezig"))} />
            <Line k="Type" v={valOr(get("huidig_trafo_type"))} />
          </Block>
          <Block title="LS-Rek / OV">
            <Line k="LS-rek aanwezig" v={yesNoLabel(get("huidig_lsrek_aanwezig"))} />
            <Line k="LS-rek type" v={intakeLabel("huidig_lsrek_type", get("huidig_lsrek_type"))} />
            <Line k="Flex OV" v={yesNoLabel(get("huidig_flex_ov_aanwezig"))} />
            <Line
              k="OV kWh-meter"
              v={intakeLabel("huidig_ov_kwh_meter", get("huidig_ov_kwh_meter"))}
            />
          </Block>
        </div>
        <div className="pp-cols-2">
          <Block title="MS Kabels">
            <Line k="Aanwezig" v={yesNoLabel(get("huidig_ms_kabels_aanwezig"))} />
            <Line
              k="Type"
              v={intakeLabel("huidig_ms_kabels_type", get("huidig_ms_kabels_type"))}
            />
            <Line k="Aantal" v={valOr(get("huidig_ms_kabels_aantal"))} />
            <Line
              k="Diameters"
              v={msKabels.length > 0 ? msKabels.map((k) => k.diameter || "?").join(" · ") : "—"}
            />
          </Block>
          <Block title="LS Kabels">
            <Line k="Aanwezig" v={yesNoLabel(get("huidig_ls_kabels_aanwezig"))} />
            <Line
              k="Type"
              v={intakeLabel("huidig_ls_kabels_type", get("huidig_ls_kabels_type"))}
            />
            <Line k="Aantal" v={valOr(get("huidig_ls_kabels_aantal"))} />
            <Line
              k="Diameters"
              v={lsKabels.length > 0 ? lsKabels.map((k) => k.diameter || "?").join(" · ") : "—"}
            />
          </Block>
        </div>
        <div className="pp-inline">
          <span className="pp-inline-k">Hergebruik kabels:</span>
          <span className="pp-inline-v">{yesNoLabel(get("huidig_kabels_herbruikbaar"))}</span>
        </div>

        <PrintFooter caseNr={valOr(get("case_nummer"))} pageLabel="Dossier · pagina 2" />
      </section>

      {/* =================================== */}
      {/* PAGE 3 — TIJDELIJK + DEFINITIEF     */}
      {/* =================================== */}
      <section className="print-page">
        <DossierPageHeader project={project} subtitle="Tijdelijke & definitieve situatie" />

        <h2 className="pp-h2">Tijdelijke situatie · {tijdelijkeLabel(tijd)}</h2>
        {tijd === "nsa" && (
          <Block title="NSA Setup" accent="amber">
            <Line k="NSA-luik aanwezig" v={yesNoLabel(get("nsa_luik_aanwezig"))} />
            <Line k="Tijdelijke tekeningen" v={yesNoLabel(get("tijd_tekeningen_aanwezig"))} />
          </Block>
        )}
        {tijd === "provisorium" && (
          <div className="pp-cols-2">
            <Block title="MS provisorium" accent="amber">
              <Line k="Eindsluitingen aantal" v={valOr(get("prov_ms_eindsluitingen_aantal"))} />
              <Line
                k="Eindsluitingen type"
                v={intakeLabel(
                  "prov_ms_eindsluitingen_type",
                  get("prov_ms_eindsluitingen_type"),
                )}
              />
              <Line k="Moffen" v={valOr(get("prov_ms_moffen_aantal"))} />
            </Block>
            <Block title="LS provisorium" accent="amber">
              <Line k="Eindsluitingen aantal" v={valOr(get("prov_ls_eindsluitingen_aantal"))} />
              <Line k="Moffen" v={valOr(get("prov_ls_moffen_aantal"))} />
              <Line k="Tijdelijke LS-kast" v={yesNoLabel(get("prov_tijdelijke_lskast"))} />
            </Block>
          </div>
        )}
        {tijd !== "nsa" && tijd !== "provisorium" && (
          <p className="pp-paragraph">
            Geen aparte tijdelijke voorziening — werkzaamheden binnen één onderbreking.
          </p>
        )}

        <div className="pp-section">
          <div className="pp-section-h">Tijdelijke tekeningen</div>
          <DocTable items={tijdelijkeTekeningen} />
        </div>

        <h2 className="pp-h2">Definitieve situatie</h2>
        <div className="pp-cols-2">
          <Block title="RMU & MS" accent="green">
            <Line k="RMU vervangen" v={yesNoLabel(get("def_rmu_vervangen"))} />
            <Line k="Merk / configuratie" v={valOr(get("def_rmu_merk_configuratie"))} />
            <Line k="Ombouw IMS" v={yesNoLabel(get("def_ombouw_ims"))} />
            <Line k="MS richtingen" v={valOr(get("def_aantal_ms_richtingen"))} />
            <Line k="Vermogensveld" v={yesNoLabel(get("def_vermogensveld"))} />
          </Block>
          <Block title="Trafo" accent="green">
            <Line k="Vervangen" v={yesNoLabel(get("def_trafo_vervangen"))} />
            <Line k="Type" v={valOr(get("def_trafo_type"))} />
            <Line k="Gedraaid" v={yesNoLabel(get("def_trafo_gedraaid"))} />
          </Block>
          <Block title="LS & GGI" accent="green">
            <Line k="LS situatie" v={intakeLabel("def_ls_situatie", get("def_ls_situatie"))} />
            <Line
              k="LS stroken herschikken"
              v={valOr(get("def_ls_aantal_stroken_herschikken"))}
            />
            <Line k="Zekeringen wisselen" v={yesNoLabel(get("def_zekeringen_wisselen"))} />
            <Line k="GGI nieuw" v={yesNoLabel(get("def_ggi_nieuw"))} />
            <Line k="GGI aantal" v={valOr(get("def_ggi_aantal"))} />
          </Block>
          <Block title="Aarding & OV" accent="green">
            <Line k="Vereffening vernieuwen" v={yesNoLabel(get("def_vereffening_vernieuwen"))} />
            <Line k="Aardelektrode" v={yesNoLabel(get("def_aardelektrode"))} />
            <Line k="Aardmeting" v={yesNoLabel(get("def_aardmeting"))} />
            <Line k="Flex OV nieuw" v={yesNoLabel(get("def_flex_ov_nieuw"))} />
            <Line k="OV kWh meter nieuw" v={yesNoLabel(get("def_ov_kwh_meter_nieuw"))} />
          </Block>
        </div>
        <div className="pp-inline">
          <span className="pp-inline-k">Opleverdossier:</span>
          <span className="pp-inline-v">
            {intakeLabel("def_opleverdossier", get("def_opleverdossier"))}
          </span>
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
const DossierPageHeader: React.FC<{ project: ProjectRow; subtitle: string }> = ({
  project,
  subtitle,
}) => (
  <header className="pp-header">
    <div className="pp-brand">
      <div className="pp-brand-dot" />
      <div>
        <div className="pp-brand-name">TerreVolt BV</div>
        <div className="pp-brand-sub">{subtitle}</div>
      </div>
    </div>
    <div className="pp-meta">
      <div>
        <span className="pp-meta-l">Case</span>
        <span className="pp-meta-v">{valOr(project.case_nummer)}</span>
      </div>
      <div>
        <span className="pp-meta-l">Station</span>
        <span className="pp-meta-v">{valOr(project.station_naam)}</span>
      </div>
    </div>
  </header>
);

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

const isImageMime = (m?: string | null) =>
  !!m && m.toLowerCase().startsWith("image/");

const DocTable: React.FC<{ items: TekeningRow[] }> = ({ items }) => {
  if (items.length === 0) {
    return <div className="pp-empty">Geen documenten beschikbaar.</div>;
  }
  return (
    <>
      <table className="pp-table">
        <thead>
          <tr>
            <th>Document</th>
            <th style={{ width: "22%" }}>Tekening nr.</th>
            <th style={{ width: "12%" }}>Revisie</th>
            <th style={{ width: "16%" }}>Bestand</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>
                {t.titel || t.bestandsnaam}
                {t.notitie && <div className="pp-sub">{t.notitie}</div>}
              </td>
              <td className="pp-mono">{t.tekening_nummer || "—"}</td>
              <td className="pp-mono">{t.revisie || "—"}</td>
              <td className="pp-mono pp-sub" style={{ wordBreak: "break-all" }}>
                {t.bestandsnaam}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Visuele previews — alleen voor afbeeldingen */}
      {items.some((t) => isImageMime(t.mime_type) && t.previewUrl) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "8pt",
            marginTop: "8pt",
          }}
        >
          {items
            .filter((t) => isImageMime(t.mime_type) && t.previewUrl)
            .map((t) => (
              <figure
                key={`fig-${t.id}`}
                style={{
                  margin: 0,
                  border: "1px solid #d6dde6",
                  borderRadius: "3pt",
                  background: "#ffffff",
                  padding: "6pt",
                  pageBreakInside: "avoid",
                  breakInside: "avoid",
                }}
              >
                <img
                  src={t.previewUrl as string}
                  alt={t.titel || t.bestandsnaam}
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    maxHeight: "180mm",
                    objectFit: "contain",
                  }}
                />
                <figcaption
                  style={{
                    marginTop: "4pt",
                    fontSize: "8.5pt",
                    color: "#5b6b7d",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "8pt",
                  }}
                >
                  <span>{t.titel || t.bestandsnaam}</span>
                  <span className="pp-mono">
                    {t.tekening_nummer ? `${t.tekening_nummer}` : ""}
                    {t.revisie ? ` · rev ${t.revisie}` : ""}
                  </span>
                </figcaption>
              </figure>
            ))}
        </div>
      )}
    </>
  );
};

const PrintFooter: React.FC<{ caseNr: string; pageLabel: string }> = ({ caseNr, pageLabel }) => (
  <footer className="pp-footer">
    <span>TerreVolt BV · Project dossier · Case {caseNr}</span>
    <span>{pageLabel}</span>
  </footer>
);

export default DossierPrint;
