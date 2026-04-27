import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import DossierPrint, { type DossierPrintProps } from "@/components/DossierPrint";

/**
 * Print-only stylesheet, mirrors the @media print rules in src/index.css
 * but applied unconditionally so the popup window can render the same look
 * both on screen and when printed.
 */
const PRINT_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    background: #ffffff;
    color: #0d1b2a;
    margin: 0; padding: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    padding: 14mm 12mm;
  }
  @media print { body { padding: 0; } }

  .print-root { display: block; }
  .print-page { page-break-after: always; break-after: page; padding-bottom: 8mm; }
  .print-page:last-child { page-break-after: auto; break-after: auto; }

  .pp-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1f7a3a; padding-bottom: 6pt; margin-bottom: 10pt; }
  .pp-brand { display: flex; align-items: center; gap: 8pt; }
  .pp-brand-dot { width: 18pt; height: 18pt; border-radius: 4pt; background: linear-gradient(135deg, #1f7a3a, #3fff8b); }
  .pp-brand-name { font-family: "Manrope", sans-serif; font-weight: 800; font-size: 12pt; color: #0d1b2a; letter-spacing: -0.01em; }
  .pp-brand-sub { font-size: 8.5pt; color: #5b6b7d; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .pp-meta { display: flex; gap: 14pt; text-align: right; }
  .pp-meta-l { display: block; font-size: 7.5pt; color: #5b6b7d; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
  .pp-meta-v { display: block; font-size: 10pt; color: #0d1b2a; font-weight: 700; font-family: "JetBrains Mono", ui-monospace, monospace; }

  .pp-title { font-family: "Manrope", sans-serif; font-size: 20pt; font-weight: 800; color: #0d1b2a; margin: 4pt 0 2pt; letter-spacing: -0.015em; }
  .pp-subtitle { font-size: 9.5pt; color: #5b6b7d; margin-bottom: 10pt; }
  .pp-h2 { font-family: "Manrope", sans-serif; font-size: 13pt; font-weight: 800; color: #0d1b2a; margin: 14pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #d6dde6; text-transform: uppercase; letter-spacing: 0.04em; }

  .pp-facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6pt; margin-bottom: 10pt; }
  .pp-fact { border: 1px solid #d6dde6; border-left: 3px solid #1f7a3a; border-radius: 3pt; padding: 5pt 7pt; background: #f7f9fb; }
  .pp-fact-l { font-size: 7.5pt; color: #5b6b7d; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
  .pp-fact-v { font-size: 10.5pt; font-weight: 700; color: #0d1b2a; margin-top: 1pt; }
  .pp-fact-sub { font-size: 8pt; color: #5b6b7d; margin-top: 1pt; }

  .pp-section { margin: 10pt 0; }
  .pp-section-h { font-family: "Manrope", sans-serif; font-size: 9pt; font-weight: 700; color: #1f7a3a; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4pt; }
  .pp-paragraph { font-size: 10pt; color: #0d1b2a; margin: 0; }

  .pp-cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; margin: 6pt 0; }
  .pp-cols-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6pt; margin: 6pt 0; }
  .pp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 14pt; margin: 4pt 0 8pt; }

  .pp-block { border: 1px solid #d6dde6; border-radius: 3pt; background: #ffffff; padding: 6pt 8pt; page-break-inside: avoid; break-inside: avoid; }
  .pp-block-amber { border-left: 3px solid #b87800; background: #fffbf2; }
  .pp-block-green { border-left: 3px solid #1f7a3a; background: #f3faf5; }
  .pp-block-default { border-left: 3px solid #4a6075; }
  .pp-block-h { font-family: "Manrope", sans-serif; font-size: 8.5pt; font-weight: 700; color: #0d1b2a; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4pt; padding-bottom: 2pt; border-bottom: 1px solid #e6eaf0; }
  .pp-block-body { display: block; }

  .pp-line { display: flex; justify-content: space-between; gap: 8pt; padding: 1.5pt 0; border-bottom: 1px dotted #e0e5eb; font-size: 9.5pt; }
  .pp-line:last-child { border-bottom: none; }
  .pp-line-k { color: #5b6b7d; }
  .pp-line-v { color: #0d1b2a; font-weight: 600; text-align: right; }

  .pp-inline { display: flex; justify-content: space-between; align-items: center; margin: 6pt 0; padding: 5pt 8pt; border: 1px solid #d6dde6; background: #f3faf5; border-radius: 3pt; }
  .pp-inline-k { font-size: 8.5pt; color: #1f7a3a; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; }
  .pp-inline-v { font-size: 10pt; font-weight: 700; color: #0d1b2a; }

  .pp-criticals { list-style: none; padding: 0; margin: 0; }
  .pp-crit { border: 1px solid #d6dde6; border-left-width: 3px; border-radius: 3pt; padding: 5pt 8pt; margin-bottom: 4pt; page-break-inside: avoid; break-inside: avoid; }
  .pp-crit-danger { border-left-color: #c02626; background: #fdf3f3; }
  .pp-crit-warning { border-left-color: #b87800; background: #fffbf2; }
  .pp-crit-info { border-left-color: #2563a6; background: #f3f7fb; }
  .pp-crit-title { font-weight: 700; font-size: 10pt; color: #0d1b2a; }
  .pp-crit-body { font-size: 9pt; color: #4a5868; margin-top: 1pt; }

  .pp-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 2pt; }
  .pp-table th { background: #f0f3f7; color: #5b6b7d; text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; padding: 4pt 6pt; border-bottom: 1px solid #d6dde6; }
  .pp-table td { padding: 4pt 6pt; border-bottom: 1px solid #e6eaf0; color: #0d1b2a; vertical-align: top; }
  .pp-table tr:last-child td { border-bottom: none; }
  .pp-mono { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 8.5pt; }
  .pp-sub { color: #5b6b7d; font-size: 8pt; margin-top: 1pt; }
  .pp-cap { text-transform: capitalize; }
  .pp-empty { padding: 6pt 8pt; border: 1px dashed #d6dde6; color: #5b6b7d; font-size: 9pt; border-radius: 3pt; background: #fafbfc; }
  .pp-empty-row { text-align: center; color: #5b6b7d; font-style: italic; padding: 8pt; }

  .pp-checklist { list-style: none; padding: 0; margin: 0; columns: 2; column-gap: 14pt; }
  .pp-checklist li { font-size: 10pt; color: #0d1b2a; padding: 2.5pt 0; break-inside: avoid; }

  .pp-footer { display: flex; justify-content: space-between; margin-top: 12pt; padding-top: 5pt; border-top: 1px solid #d6dde6; font-size: 8pt; color: #5b6b7d; text-transform: uppercase; letter-spacing: 0.06em; }
`;

/**
 * Open the dossier in a clean popup window and trigger print there.
 * Avoids the "blijft laden" feel because the main app (sidebar, planning,
 * etc.) is no longer rendered into the print preview.
 */
export function printDossierInPopup(props: DossierPrintProps, title: string) {
  const html = renderToStaticMarkup(createElement(DossierPrint, props));

  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) {
    throw new Error("popup-blocked");
  }

  const doc = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${title.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!))}</title>
<style>${PRINT_CSS}</style>
</head>
<body>${html}
<script>
  (function () {
    function go() {
      try { window.focus(); } catch (e) {}
      try { window.print(); } catch (e) {}
    }
    if (document.readyState === "complete") {
      setTimeout(go, 80);
    } else {
      window.addEventListener("load", function () { setTimeout(go, 80); });
    }
  })();
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();
}
