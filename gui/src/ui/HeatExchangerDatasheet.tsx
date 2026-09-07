/*  HeatExchangerDatasheet — the DESIGN deliverable: a formatted, coloured
 *  TEMA-style specification sheet for a shell-and-tube heat exchanger, with a
 *  parametric SVG scheme drawn from the actual geometry (the tubes, the
 *  baffles, the passes — all from the numbers).  Opens as a self-contained HTML
 *  page (print → PDF); the numbers also export to .ods.  Glass-box: every
 *  correlation is named, U is shown as its three-resistance split.
 *
 *  A detailed exchanger-rating tool produces exactly this (the spec sheet); we do it open, and the
 *  scheme is real (drawn from the solved geometry, not a stock clip-art).
 *
 *  EVERY NUMBER ON THE PAGE SAYS WHERE IT CAME FROM (2026-09-07).  Until now
 *  this sheet built its DESIGN numbers out of the rating unit's KPIs and the
 *  case's authored `geometry {}`, while `SizingPass` published a specification
 *  sheet of its own for the SAME physical item at
 *  `design/<SECTOR>/<unit>/shellTubeHX`.  Two sheets for one exchanger, on two
 *  input paths, and nothing read both -- and they disagree by construction,
 *  because the rating's area is the author's `operation.area` while the
 *  sizer's `A` is Q/(U*LMTD) with a DIFFERENT author-set U and LMTD from
 *  `postDict`.  So the page is now partitioned by PROVENANCE, three classes
 *  and no fourth:
 *
 *    SIZED BY CHOUPO   read from the engine's own sheet, never recomputed.
 *                      Absent, it SAYS the sizing pass did not run and names
 *                      the remedy -- a fallback computation would be the
 *                      second home under another name (the 2026-09-05 rule
 *                      that the GUI draws the first law and computes none).
 *    RATING RESULT     what the unit itself published for the run.  These are
 *                      answers to a different question and are labelled as
 *                      such, never presented as a design.
 *    DECLARED BY THE   the rating geometry the AUTHOR wrote.  Publishing a
 *    CASE              rating INPUT as a design OUTPUT would be the falsest
 *                      line on the sheet.
 */
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconFileText, IconTableExport } from "@tabler/icons-react";
import { useStore } from "../state/store.js";
import type { UnitSpec } from "../case/types.js";
import type { StreamResult } from "../adapters/SolverAdapter.js";
import { lookupDesignSheet, type DesignSheet, type DesignSheetLookup }
  from "../case/designSheet.js";
import { findRunStream } from "./streamPopOut.js";
import { downloadOds } from "../case/odsExport.js";

type Kpis = { [k: string]: number };
interface SideStreams { inlet?: StreamResult; outlet?: StreamResult; name: string; }

/** The equipment word this sheet draws.  One sheet, one equipment kind: a
 *  generalisation to the other sizers is separate work and needs the SVG
 *  dispatched on this word rather than assumed. */
const EQUIPMENT = "shellTubeHX";

/** Resolve the tube-side and shell-side (inlet+outlet) streams for the HX. */
function resolveSides(unit: UnitSpec, streams: StreamResult[] | undefined):
  { tube: SideStreams; shell: SideStreams } | null {
  const ins = (unit.inputs ?? (unit.in ? [unit.in] : [])) as string[];
  const outs = (unit.outputs ?? []) as string[];
  if (ins.length < 2 || outs.length < 2) return null;
  const tubeName = (unit.operation?.["tubeStream"] as string | undefined) ?? ins[0]!;
  const tubeIdx = ins[0] === tubeName ? 0 : 1;
  const shellIdx = 1 - tubeIdx;
  const look = (n: string | undefined) => n ? findRunStream(streams, n) : undefined;
  return {
    tube: { name: ins[tubeIdx]!, inlet: look(ins[tubeIdx]), outlet: look(outs[tubeIdx]) },
    shell: { name: ins[shellIdx]!, inlet: look(ins[shellIdx]), outlet: look(outs[shellIdx]) },
  };
}

const K = (t: number | undefined) => (t === undefined ? "—" : (t - 273.15).toFixed(1));
const N = (v: number | undefined, d = 1) => (v === undefined ? "—" : v.toFixed(d));

/** A sizing value as the SHEET wrote it: six significant digits, then its own
 *  declared unit.  The unit is never supplied here -- `EquipmentSizing::set`
 *  is the one door that records it and the sheet carries it, so a sizer that
 *  adds a key needs no change in this file (the 2026-09-04 D4 rule: an object
 *  declares its own dimensions and adding one touches no reader). */
function sizingRow(v: { value: number; unit: string }): string {
  const n = Number(v.value.toPrecision(6)).toString();
  return v.unit === "-" || v.unit === "" ? n : `${n} ${v.unit}`;
}

/** A parametric SVG of the shell-and-tube, drawn from the geometry + KPIs. */
function schemeSvg(geom: { [k: string]: number }, nTubesDerived: boolean, kpis: Kpis,
  tube: SideStreams, shell: SideStreams): string {
  const nBaffles = Math.max(0, Math.round(kpis["nBaffles"] ?? 0));
  const W = 620, H = 260;
  const shX = 70, shY = 70, shW = 470, shH = 110;   // shell body
  const cool = "#4a90d9", warm = "#e0785a", steel = "#c2ccd6", tubeC = "#8a97a6",
        baf = "#5a6675", ink = "#2b2b2b";
  const parts: string[] = [];
  // shell body
  parts.push(`<rect x="${shX}" y="${shY}" width="${shW}" height="${shH}" rx="14" fill="${steel}" stroke="${ink}" stroke-width="1.5"/>`);
  // LEFT channel head (both tube nozzles live here -- U-tube layout); the RIGHT
  // end is a bonnet cover (no tubesheet: the tubes U-turn inside).
  parts.push(`<path d="M${shX} ${shY} h-34 a20 20 0 0 0 -20 20 v${shH - 40} a20 20 0 0 0 20 20 h34 z" fill="#d7dde4" stroke="${ink}" stroke-width="1.5"/>`);
  parts.push(`<path d="M${shX + shW} ${shY} h12 a10 10 0 0 1 10 10 v${shH - 20} a10 10 0 0 1 -10 10 h-12 z" fill="#e2e7ec" stroke="${ink}" stroke-width="1.2"/>`);
  // U-TUBE bundle: nested U's -- each tube runs to the far end and BENDS back
  // (the general shell-and-tube; count + passes labelled, not literal).
  const nU = 5, xL = shX + 6, xTurn = shX + shW - 14;
  for (let i = 0; i < nU; i++) {
    const gap = ((shH - 20) / 2) * (i / nU);
    const yT = shY + 10 + gap, yB = shY + shH - 10 - gap, r = (yB - yT) / 2;
    parts.push(`<path d="M${xL} ${yT} H${xTurn} A${r} ${r} 0 0 1 ${xTurn} ${yB} H${xL}" `
      + `fill="none" stroke="${tubeC}" stroke-width="1.4"/>`);
  }
  // the single (left) tubesheet the U-tubes are rolled into
  parts.push(`<line x1="${shX + 3}" y1="${shY + 3}" x2="${shX + 3}" y2="${shY + shH - 3}" stroke="${ink}" stroke-width="3"/>`);
  // segmental baffles, alternating cut (top / bottom)
  for (let b = 0; b < nBaffles; b++) {
    const x = shX + ((b + 1) * shW) / (nBaffles + 1);
    const topCut = b % 2 === 0;
    const y0 = topCut ? shY + 26 : shY + 2;
    const y1 = topCut ? shY + shH - 2 : shY + shH - 26;
    parts.push(`<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${baf}" stroke-width="2.2"/>`);
  }
  // nozzles: shell in (top-left, hot) + shell out (bottom-right)
  const shHot = (shell.inlet?.T ?? 0) >= (tube.inlet?.T ?? 0);
  const shC = shHot ? warm : cool, tuC = shHot ? cool : warm;
  parts.push(`<rect x="${shX + 40}" y="${shY - 26}" width="26" height="26" fill="${shC}" stroke="${ink}"/>`);
  parts.push(`<rect x="${shX + shW - 66}" y="${shY + shH}" width="26" height="26" fill="${shC}" stroke="${ink}"/>`);
  // tube nozzles on the left head (in + out)
  parts.push(`<rect x="${shX - 74}" y="${shY + 6}" width="24" height="22" fill="${tuC}" stroke="${ink}"/>`);
  parts.push(`<rect x="${shX - 74}" y="${shY + shH - 28}" width="24" height="22" fill="${tuC}" stroke="${ink}"/>`);
  // labels
  const t = (x: number, y: number, s: string, c = ink, size = 12, anchor = "start") =>
    `<text x="${x}" y="${y}" fill="${c}" font-size="${size}" font-family="sans-serif" text-anchor="${anchor}">${s}</text>`;
  parts.push(t(shX + 44, shY - 32, `shell in  ${K(shell.inlet?.T)} °C`, shC, 11));
  parts.push(t(shX + shW - 40, shY + shH + 42, `shell out  ${K(shell.outlet?.T)} °C`, shC, 11, "end"));
  parts.push(t(shX - 76, shY - 2, `tube in ${K(tube.inlet?.T)}`, tuC, 11));
  parts.push(t(shX - 76, shY + shH + 18, `tube out ${K(tube.outlet?.T)}`, tuC, 11));
  //  THE TUBE COUNT SAYS WHETHER ANYBODY CHOSE IT.  When the case declares no
  //  `nTubes`, the scheme has always back-figured one from the rated area --
  //  a drawing aid, not a design.  Labelling it as a plain count asserted a
  //  number no sizer and no author ever wrote down, which is the same false
  //  claim this whole sheet was partitioned to end.
  const nT = Math.round(geom["nTubes"] ?? 0);
  parts.push(t(shX + shW / 2, shY + shH / 2 - 4,
    nT > 0 ? (nTubesDerived ? `~${nT} tubes (from area)` : `${nT} tubes`)
           : "tube count not declared", ink, 13, "middle"));
  parts.push(t(shX + shW / 2, shY + shH / 2 + 14, `${nBaffles} baffles · U-tube (${Math.round(geom["passes"] ?? 1)}-pass)`, "#556", 11, "middle"));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:620px">${parts.join("")}</svg>`;
}

/** WHY THERE IS NO SIZED SECTION, and the two reasons are not the same fact.
 *  A sheet the reader could not PARSE is a run that DID size this unit, and
 *  reporting it as "the sizing pass did not run" would be the comfortable
 *  reading of a broken one. */
function sizingAbsentRow(unitName: string, unreadable: number,
                        ambiguous = 0): string {
  //  A THIRD REASON, and it is not "no sheet" either (2026-09-07).  A unit
  //  that realises SEVERAL items of the same equipment kind -- a distillation
  //  column has two shell-and-tube exchangers -- has more than one sheet
  //  matching (unit, equipment), and the reader refuses rather than drawing
  //  whichever came first under the other one name.
  if (ambiguous > 0)
    return `The run wrote ${ambiguous} specification sheets for this unit that `
      + `are all <code>${EQUIPMENT}</code>, so this page cannot say which one `
      + `it is drawing.  A unit that realises several items of one kind -- a `
      + `distillation column has a condenser AND a reboiler -- needs the item `
      + `named, and nothing is drawn until it is.  The sheets themselves are `
      + `under <code>design/</code> in the Case tab.`;
  if (unreadable > 0)
    return `The run wrote ${unreadable} equipment specification sheet(s) that `
      + `this reader could not parse, so it cannot say whether this unit was `
      + `sized.  Nothing is drawn in their place.  A sheet must be a Choupo `
      + `dictionary: every sizing value names its unit as the dict grammar `
      + `names it, and a unit word the tokenizer cannot deliver -- anything `
      + `with <code>(</code>, <code>)</code> or <code>^</code> in it -- makes `
      + `the whole file unreadable.  Report it: the sizer, not the case, `
      + `chose that word.`;
  return `The sizing pass did not run for this unit, so Choupo designed nothing `
    + `here and nothing on this page is computed in its place.  To size it, `
    + `declare it in the case's <code>system/postDict</code>:`
    + `<pre style="margin:6px 0 0;white-space:pre-wrap;font-size:11px">sizing\n{\n`
    + `    units\n    (\n        { unitName ${unitName};  type ${EQUIPMENT};  material SS304;\n`
    + `          designRules { U 600.0;  LMTD 10.0;  pressureDesign 2.0; } }\n    );\n}</pre>`;
}

function buildDatasheetHtml(unit: UnitSpec, kpis: Kpis,
  tube: SideStreams, shell: SideStreams, found: DesignSheetLookup): string {
  const sheet = found.sheet;
  // The dict stores unit-bearing scalars as STRINGS ("4.88 m", "0.016 m"), not
  // numbers -- coerce each geometry value to its leading number so the number
  // formatters don't call .toFixed on a string (the datasheet-build crash).
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number") return v;
    if (typeof v === "string") { const p = parseFloat(v); return Number.isFinite(p) ? p : undefined; }
    return undefined;
  };
  const gRaw = (unit.operation?.["geometry"] ?? {}) as { [k: string]: unknown };
  const geom: { [k: string]: number } = {};
  for (const [k, v] of Object.entries(gRaw)) { const n = num(v); if (n !== undefined) geom[k] = n; }
  // back-figure nTubes from the rated area when the dict does not carry it --
  // a DRAWING aid for the scheme, flagged as derived wherever it is shown.
  let nTubesDerived = false;
  if (!geom["nTubes"] && kpis["area"] && geom["tubeOD"] && geom["tubeLength"]) {
    geom["nTubes"] = kpis["area"] / (Math.PI * geom["tubeOD"] * geom["tubeLength"]);
    nTubesDerived = true;
  }
  const scheme = schemeSvg(geom, nTubesDerived, kpis, tube, shell);
  const controlling = ["tube-side", "shell-side", "wall"][Math.round(kpis["controllingResistance"] ?? 0)] ?? "—";
  const row = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const wide = (b: string) => `<tr><td colspan="2">${b}</td></tr>`;
  const sec = (title: string, color: string, rows: string) =>
    `<table><thead><tr><th colspan="2" style="background:${color}">${title}</th></tr></thead><tbody>${rows}</tbody></table>`;

  const service = sec("SERVICE", "#37536e", [
    row("Unit", unit.name),
    ...(sheet && sheet.sector ? [row("Sector", sheet.sector)] : []),
    row("Type", "Shell-and-tube (TEMA), single-phase"),
    row("Material", sheet ? sheet.material : "—"),
    row("Design basis", sheet ? sheet.basis : "—"),
  ].join(""));

  //  ---- SIZED BY CHOUPO: the engine's own sheet, read, never recomputed ----
  const sized = sec("SIZED BY CHOUPO  ·  design/…/" + EQUIPMENT, "#2f6d4f",
    sheet
      ? sheet.sizing.map((v) => row(v.key, sizingRow(v))).join("")
        + (sheet.assumed.length > 0
          ? wide(`<b>Assumed by the sizer</b>, not declared by the case: `
              + `<code>${sheet.assumed.join(", ")}</code>.  Each was announced `
              + `at its site and carries its value in the run's ASSUMPTIONS AND `
              + `CAVEATS block.  Declare it in <code>designRules {}</code> to `
              + `make it yours.`)
          : "")
      : wide(sizingAbsentRow(unit.name, found.unreadable, found.ambiguous)));

  //  ---- RATING RESULT: what the unit published, a different question -------
  const thermal = sec("RATING RESULT  ·  the solved run", "#37536e", [
    row("Duty Q", `${N((kpis["Q_kW"] ?? kpis["duty_kW"]))} kW`),
    row("LMTD", `${N(kpis["LMTD"])} K`),
    row("Overall U", `<b>${N(kpis["U"])}</b> W/(m²·K)`),
    row("Area (outside)", `${N(kpis["area"], 2)} m²`),
    row("Controlling resistance", controlling),
    row("R inner / wall / outer", `${(kpis["R_inner"] ?? 0).toExponential(2)} / ${(kpis["R_wall"] ?? 0).toExponential(2)} / ${(kpis["R_outer"] ?? 0).toExponential(2)} m²K/W`),
  ].join(""));
  const hydraulic = sec("HYDRAULIC (rating, Kern)", "#7a5230", [
    row("ΔP tube side", `<b>${N(kpis["dP_tube_kPa"])}</b> kPa`),
    row("ΔP shell side", `<b>${N(kpis["dP_shell_kPa"])}</b> kPa`),
    row("Baffles", `${Math.round(kpis["nBaffles"] ?? 0)}`),
    row("f tube / f shell", `${N(kpis["f_tube"], 4)} / ${N(kpis["f_shell"], 4)}`),
  ].join(""));
  const tubeSide = sec("TUBE SIDE (rating)", "#37536e", [
    row("Fluid (in → out)", `${tube.name}: ${K(tube.inlet?.T)} → ${K(tube.outlet?.T)} °C`),
    row("Re / Pr / Nu", `${N(kpis["Re_tube"], 0)} / ${N(kpis["Pr_tube"], 2)} / ${N(kpis["Nu_tube"], 0)}`),
    row("h inner", `${N(kpis["h_inner"], 0)} W/(m²·K)  (Gnielinski)`),
  ].join(""));
  const shellSide = sec("SHELL SIDE (rating)", "#37536e", [
    row("Fluid (in → out)", `${shell.name}: ${K(shell.inlet?.T)} → ${K(shell.outlet?.T)} °C`),
    row("Re / Pr / Nu", `${N(kpis["Re_shell"], 0)} / ${N(kpis["Pr_shell"], 2)} / ${N(kpis["Nu_shell"], 0)}`),
    row("h outer", `${N(kpis["h_outer"], 0)} W/(m²·K)  (Kern method)`),
  ].join(""));

  //  ---- DECLARED BY THE CASE: rating INPUTS, never a Choupo output --------
  const geometry = sec("DECLARED BY THE CASE  ·  operation.geometry", "#4a4a4a", [
    row("Tubes", `${nTubesDerived ? "~" : ""}${Math.round(geom["nTubes"] ?? 0)} × ⌀${N((geom["tubeOD"] ?? 0) * 1000)}/${N((geom["tubeID"] ?? 0) * 1000)} mm, L ${N(geom["tubeLength"], 2)} m`
      + (nTubesDerived ? ` <i>(count back-figured from the rated area — not declared, not designed)</i>` : "")),
    row("Passes", `${Math.round(geom["passes"] ?? 1)}`),
    row("Pitch", `${N((geom["tubePitch"] ?? 0) * 1000)} mm`),
    row("Shell ID", `${N((geom["shellID"] ?? 0) * 1000)} mm`),
    row("Baffle spacing", `${N((geom["baffleSpacing"] ?? 0) * 1000)} mm`),
  ].join(""));

  return `<!doctype html><html><head><meta charset="utf-8"><title>${unit.name} — HX datasheet</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;color:#222;background:#fff}
  h1{font-size:19px;margin:0 0 2px}
  .sub{color:#666;font-size:12px;margin-bottom:16px}
  .scheme{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:18px;background:#fafbfc;text-align:center}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:0}
  th{color:#fff;text-align:left;padding:5px 9px;font-size:12px;letter-spacing:.02em}
  td{padding:4px 9px;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{color:#555;width:46%}
  code{background:#f2f4f6;padding:0 3px;border-radius:3px}
  .foot{margin-top:18px;color:#888;font-size:11px}
  @media print{body{margin:8mm} .noprint{display:none}}
</style></head><body>
  <h1>Heat Exchanger Datasheet — ${unit.name}</h1>
  <div class="sub">Choupo shell-and-tube · glass-box (Gnielinski tube · Kern shell) · single-phase v1</div>
  <div class="scheme">${scheme}</div>
  <div class="grid">
    <div>${service}${sized}${hydraulic}</div>
    <div>${thermal}${tubeSide}${shellSide}${geometry}</div>
  </div>
  <div class="foot">
    EVERY NUMBER SAYS WHERE IT CAME FROM.  <b>SIZED BY CHOUPO</b> is read from
    the specification sheet the run wrote at
    <code>design/&lt;SECTOR&gt;/&lt;unit&gt;/${EQUIPMENT}</code>, value and unit as the
    sizer declared them; nothing there is recomputed on this page, and when the
    sizing pass did not run the section says so rather than substituting a
    number.  <b>RATING RESULT</b> is what the unit itself published for this
    run — an answer to a different question than the design, and not a
    specification.  <b>DECLARED BY THE CASE</b> is the author's own rating
    geometry, an INPUT.  Correlations: Gnielinski (Incropera &amp; DeWitt), Kern
    (Process Heat Transfer, 1950).  U on the outside area; ΔP = friction +
    turnaround (tube) / f G² D (N_b+1)/(2ρD_e) (shell).  Print → PDF with your
    browser.
  </div>
  <p class="noprint" style="margin-top:14px"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`;
}

/** The datasheet trigger, shown in the unit panel for a heat exchanger. */
export function HeatExchangerDatasheet({ unit, kpis }: { unit: UnitSpec; kpis: Kpis }) {
  const streams = useStore((s) => s.runResult?.streams);
  const designFiles = useStore((s) => s.runResult?.designFiles);
  const sides = resolveSides(unit, streams)
    ?? { tube: { name: "tube" }, shell: { name: "shell" } };
  if (kpis["U"] === undefined) return null;   // needs a rated/designed run
  const found = lookupDesignSheet(designFiles, unit.name, EQUIPMENT);

  // Open the datasheet in a NEW TAB (Vitor prefers a tab).  A blob URL + a real
  // anchor click opens ONE tab and never doubles up (the old window.open with
  // "noopener" returned null even on success, which wrongly triggered a modal
  // fallback too -- the tab+popup bug).  The HTML carries its own Print button.
  const openTab = () => {
    let built: string;
    try { built = buildDatasheetHtml(unit, kpis, sides.tube, sides.shell, found); }
    catch (e) {
      built = `<pre style="padding:16px;color:#900;font-family:monospace">`
        + `Datasheet build failed:\n${String(e instanceof Error ? e.stack : e)}</pre>`;
    }
    const url = URL.createObjectURL(new Blob([built], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const exportOds = () => downloadOds(unit.name, ["quantity", "value", "unit", "source"],
    datasheetOdsRows(kpis, found.sheet), `${unit.name}_datasheet.ods`);
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Datasheet</Text>
      <Group gap="xs">
        <Button size="compact-sm" variant="light" leftSection={<IconFileText size={14} />}
          onClick={openTab}>Open datasheet</Button>
        <Button size="compact-sm" variant="subtle" leftSection={<IconTableExport size={14} />}
          onClick={exportOds}>Numbers (.ods)</Button>
      </Group>
    </Stack>
  );
}

/** The .ods rows, carrying the SAME partition the page draws: a spreadsheet
 *  that dropped the provenance column would be the one surface where a design
 *  output and a rating result look alike again. */
export function datasheetOdsRows(kpis: Kpis, sheet: DesignSheet | null):
  (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const v of sheet?.sizing ?? [])
    rows.push([v.key, v.value, v.unit === "-" ? "" : v.unit, "sized by Choupo (design/)"]);
  const rating: [string, string][] = [
    ["Q_kW", "kW"], ["LMTD", "K"], ["U", "W/(m2.K)"], ["area", "m2"],
    ["dP_tube_kPa", "kPa"], ["dP_shell_kPa", "kPa"], ["nBaffles", "-"],
    ["Re_tube", "-"], ["Nu_tube", "-"], ["h_inner", "W/(m2.K)"],
    ["Re_shell", "-"], ["Nu_shell", "-"], ["h_outer", "W/(m2.K)"],
    ["R_inner", "m2.K/W"], ["R_wall", "m2.K/W"], ["R_outer", "m2.K/W"],
    ["f_tube", "-"], ["f_shell", "-"],
  ];
  for (const [k, u] of rating)
    if (kpis[k] !== undefined) rows.push([k, kpis[k]!, u === "-" ? "" : u, "rating result (run KPI)"]);
  return rows;
}

/** Build the standalone datasheet HTML for a heat-exchanger unit + its KPIs
 *  (re-used by the Reports tab).  Returns null if the unit has no U yet. */
export function heatExchangerDatasheetHtml(
  unit: UnitSpec, kpis: Kpis | undefined,
  streams: StreamResult[] | undefined,
  designFiles?: { [relPath: string]: string }): string | null {
  if (!kpis || kpis["U"] === undefined) return null;
  const sides = resolveSides(unit, streams)
    ?? { tube: { name: "tube" }, shell: { name: "shell" } };
  try {
    return buildDatasheetHtml(unit, kpis, sides.tube, sides.shell,
      lookupDesignSheet(designFiles, unit.name, EQUIPMENT));
  } catch { return null; }
}
