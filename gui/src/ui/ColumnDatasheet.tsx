/*  ColumnDatasheet — the DESIGN deliverable for a distillation column: a
 *  printable specification page for the tower and its tray stack, with a
 *  parametric schematic drawn from the numbers the run published.
 *
 *  WHY IT IS A SECOND PAGE AND NOT A BRANCH OF THE EXCHANGER ONE.  The
 *  datasheet follows the EQUIPMENT KIND, not the unit type.  That is why a
 *  column's condenser and reboiler needed nothing new — they are `shellTubeHX`
 *  items and the exchanger sheet already draws that kind.  What had no drawing
 *  at all was the column's OWN equipment: the shell and the trays.
 *
 *  EVERY NUMBER ON THE PAGE SAYS WHERE IT CAME FROM, in the same three classes
 *  the exchanger sheet established on 2026-09-07, and no fourth:
 *
 *    SIZED BY CHOUPO   read from the engine's own specification sheet at
 *                      `design/<SECTOR>/<unit>/<item>`, never recomputed.
 *                      Absent, the page SAYS the sizing pass did not run and
 *                      computes nothing in its place.
 *    RATING RESULT     what the tray-hydraulics pass published for this run —
 *                      how close the worst tray runs to flood and which tray
 *                      that is.  An answer to a different question than the
 *                      design, and labelled as one.
 *    DECLARED BY THE   the column's own `operation {}` — the stage count, the
 *    CASE              feed stage, the tray geometry.  Publishing a rating
 *                      INPUT as a design OUTPUT would be the falsest line on
 *                      the page, and a column is where that is easiest to do:
 *                      `column10_flooding` DECLARES a 1.10 m tower and has its
 *                      trays rated against it, while `column09_tray_hydraulics`
 *                      declares none and the pass DESIGNS 1.3158 m.  The engine
 *                      answers that itself with the `diameterDesigned` KPI and
 *                      this page reads it rather than guessing from the shape
 *                      of the case.
 *
 *  WHAT THIS PAGE IS NOT.  It is not a mechanical vessel data sheet: there are
 *  no nozzle sizes or ratings, no facings or gaskets, no manholes, no head type
 *  or thickness beyond the ASME wall the sizer computed, no supports, skirt,
 *  insulation or code stamp.  Choupo does not compute any of them, so the
 *  drawing shows a nozzle as a stub with a service label and never with a
 *  dimension.  A real vendor handoff MARKS those cells rather than leaving them
 *  blank; building that block is separate work with its own rulings to make.
 */
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconFileText, IconTableExport } from "@tabler/icons-react";
import { useStore } from "../state/store.js";
import type { UnitSpec } from "../case/types.js";
import { unitDesignSheets, type DesignSheet } from "../case/designSheet.js";
import {
  columnTowerSvg, fallbackBoxSvg, hasSchematic, noSchematicReason,
  PROVENANCE_INK, PROVENANCE_WORD,
} from "../case/equipmentSchematic.js";
import { downloadOds } from "../case/odsExport.js";

type Kpis = { [k: string]: number };

/** The items the tower drawing already shows, so the per-item section below it
 *  does not draw the same equipment twice under two headings. */
const DRAWN_BY_THE_TOWER = ["shell", "trays"];

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A sizing value as the SHEET wrote it: six significant digits then the
 *  sizer's own declared unit.  The unit is never supplied here — a sizer that
 *  adds a key needs no change in this file (the 2026-09-04 D4 rule). */
function sizingRow(v: { value: number; unit: string }): string {
  const n = Number(v.value.toPrecision(6)).toString();
  return v.unit === "-" || v.unit === "" ? n : `${n} ${v.unit}`;
}

const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const p = parseFloat(v); return Number.isFinite(p) ? p : undefined; }
  return undefined;
};

const N = (v: number | undefined, d = 1) => (v === undefined ? "—" : v.toFixed(d));

/** The three provenance colours, one home, shared with the schematic. */
const SIZED_INK = PROVENANCE_INK.choupo;      // SIZED BY CHOUPO
const DECLARED_INK = PROVENANCE_INK.declared; // DECLARED BY THE CASE
const RATING_INK = "#37536e";                 // RATING RESULT

export function columnDatasheetHtml(
  unit: UnitSpec,
  kpis: Kpis | undefined,
  designFiles?: { [relPath: string]: string },
): string {
  const k = kpis ?? {};
  const { sheets, unreadable } = unitDesignSheets(designFiles, unit.name);
  const byItem = (item: string): DesignSheet | null =>
    sheets.find((s) => s.item === item) ?? null;
  const shell = byItem("shell"), trays = byItem("trays");

  const row = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const wide = (b: string) => `<tr><td colspan="2">${b}</td></tr>`;
  const sec = (title: string, color: string, rows: string) =>
    `<table><thead><tr><th colspan="2" style="background:${color}">${esc(title)}`
    + `</th></tr></thead><tbody>${rows}</tbody></table>`;

  //  ---- the schematic, or an honest statement of its absence ------------
  let scheme: string, caption: string;
  if (shell && hasSchematic(trays?.equipment ?? "")) {
    const drawn = columnTowerSvg({
      shell,
      trays,
      hasCondenser: byItem("condenser") !== null,
      hasReboiler: byItem("reboiler") !== null,
      hasRefluxDrum: byItem("refluxDrum") !== null,
      kpis: k,
    });
    //  The dimension notes go BESIDE the picture, in HTML, where they wrap.
    //  Inside the SVG the longest of them ran off the viewBox and was cut in
    //  half without a word: an SVG has no reflow.
    scheme = drawn.svg
      + `<ul class="notes">` + drawn.notes.map((n) => `<li>`
        + (n.who ? `<span style="color:${PROVENANCE_INK[n.who]}">`
            + `${esc(n.text)}</span> <i>(${PROVENANCE_WORD[n.who]})</i>`
          : esc(n.text))
        + `</li>`).join("") + `</ul>`;
    caption = `The shell is drawn ${drawn.toScale
      ? "TO SCALE — its height and its diameter are the sheet's own, in one scale"
      : "NOT to scale: at this height-to-diameter ratio a true-scale tower is "
        + "unreadable, so the outline is nominal"}. `
      + (drawn.traysDrawn > 0
        ? `All ${drawn.traysDrawn} trays are drawn, at the declared spacing. `
        : (drawn.nTrays > 0
          ? `The ${drawn.nTrays} trays are too close to letter individually and `
            + `are shown as a band. ` : ""))
      + `The tray INTERNALS — weir and downcomer — are indicated schematically `
      + `and are NOT to scale; no dimension is put on them. `
      + `The vertical position of the stack within the shell is not published: `
      + `the sheet gives H and the tray spacing but not how the leftover height `
      + `splits between the disengagement space above and the sump below, so `
      + `the stack is drawn centred. `
      + `The auxiliary boxes are drawn only for items this run actually sized, `
      + `and they carry no scale at all. `
      + `Nozzles are STUBS with a service label: Choupo computes no nozzle size `
      + `or rating, so none is drawn.`;
  } else if (shell) {
    scheme = fallbackBoxSvg(shell)
      + `<p class="why">${esc(noSchematicReason(shell.equipment))}</p>`;
    caption = `The run sized this column's shell but wrote no tray sheet, so `
      + `there is no tray stack to draw and no tower is drawn in its place.`;
  } else {
    scheme = `<p style="color:#777;font-size:12px;margin:0">`
      + (unreadable > 0
        ? `The run wrote ${unreadable} specification sheet(s) that this reader `
          + `could not parse, so it cannot say whether this column was sized. `
          + `Nothing is drawn in their place.`
        : `The sizing pass did not run for this column, so Choupo designed `
          + `nothing here and nothing on this page is computed in its place. `
          + `To size it, declare it in the case's <code>system/postDict</code> `
          + `with a <code>traySpacing</code> and a <code>pressureDesign</code> `
          + `in its <code>designRules {}</code>.`)
      + `</p>`;
    caption = "";
  }

  //  ---- SERVICE ---------------------------------------------------------
  const service = sec("SERVICE", "#37536e", [
    row("Unit", esc(unit.name)),
    ...(shell && shell.sector ? [row("Sector", esc(shell.sector))] : []),
    row("Type", `Tray column${unit.model ? ` (${esc(unit.model)})` : ""}`),
    row("Material", shell ? esc(shell.material) : "—"),
    row("Items sized", sheets.length > 0
      ? sheets.map((s) => `<code>${esc(s.item || s.equipment)}</code>`).join(", ")
      : "none"),
    row("Design basis", shell ? esc(shell.basis) : "—"),
  ].join(""));

  //  ---- SIZED BY CHOUPO -------------------------------------------------
  //  WITH NO SHEETS AT ALL there is no section, because the schematic slot
  //  above has already said the sizing pass did not run and a green header
  //  over an apology reads as a section that failed rather than one that was
  //  never asked for.  With SOME sheets, a missing one IS named: a column that
  //  has a shell and no tray stack is a state worth reporting.
  const sizedSection = (s: DesignSheet | null, item: string) =>
    (s === null && sheets.length === 0) ? "" : sec(
    `SIZED BY CHOUPO  ·  design/…/${item}`, SIZED_INK,
    s ? s.sizing.map((v) => row(esc(v.key), sizingRow(v))).join("")
        + (s.assumed.length > 0
          ? wide(`<b>Assumed by the sizer</b>, not declared by the case: `
            + `<code>${esc(s.assumed.join(", "))}</code>.  Each was announced at `
            + `its site and carries its value in the run's ASSUMPTIONS AND `
            + `CAVEATS block.  Declare it in <code>designRules {}</code> to make `
            + `it yours.`)
          : "")
      : wide(`The run wrote no <code>${esc(item)}</code> sheet for this column.`));

  //  ---- RATING RESULT ---------------------------------------------------
  //  The tray-hydraulics pass's own answers.  `diameterDesigned` is the fact
  //  the whole provenance question turns on and it is stated in words, not as
  //  the 1/0 the engine writes.
  const designed = k["diameterDesigned"];
  const ratingRows = [
    row("Diameter chosen by",
      designed === undefined ? "— (the run did not state it)"
        : designed !== 0
          ? `<b style="color:${SIZED_INK}">Choupo</b> — the pass DESIGNED it: `
            + `the widest tray sets the tower`
          : `<b style="color:${DECLARED_INK}">the case</b> — the pass RATED the `
            + `trays against a tower the author declared`),
    row("Trays rated", `${Math.round(k["nTrays"] ?? 0) || "—"}`),
    row("Worst tray", k["floodApproach_max"] !== undefined
      ? `<b>${(k["floodApproach_max"] * 100).toFixed(1)} %</b> of flood`
        + (k["floodStage"] ? ` — stage ${Math.round(k["floodStage"])}` : "")
      : "—"),
    row("Downcomer backup (max)", `${N(k["downcomerBackup_max_mm"])} mm`),
    row("Downcomer-flooded trays", `${Math.round(k["downcomerFloodStages"] ?? 0)}`),
    ...(k["weepingStages"] !== undefined
      ? [row("Weeping trays", `${Math.round(k["weepingStages"])}`)]
      : [row("Weeping trays",
          "<i>not checked — the case declares no K2 weep constant</i>")]),
    row("Column ΔP", `${N(k["dP_column_kPa"], 2)} kPa`),
    row("Condenser / reboiler duty",
      `${N(k["Q_condenser_kW"])} / ${N(k["Q_reboiler_kW"])} kW`),
  ].join("");
  const rating = sec("RATING RESULT  ·  the tray-hydraulics pass", RATING_INK,
    ratingRows);

  //  ---- DECLARED BY THE CASE -------------------------------------------
  const op = (unit.operation ?? {}) as { [k: string]: unknown };
  const hyd = (op["hydraulics"] ?? {}) as { [k: string]: unknown };
  const decl = (label: string, key: string, dict: { [k: string]: unknown },
                scale = 1, suffix = "") => {
    const v = dict[key];
    if (v === undefined) return "";
    const n = num(v);
    return row(label, n === undefined
      ? `<code>${esc(String(v))}</code>`
      : `${Number((n * scale).toPrecision(6))}${suffix}`);
  };
  const declared = sec("DECLARED BY THE CASE  ·  operation {}", DECLARED_INK, [
    decl("Stages", "nStages", op),
    decl("Feed stage", "feedStage", op),
    decl("Reflux ratio", "refluxRatio", op),
    decl("Tray type", "trayType", hyd),
    decl("Tray spacing", "traySpacing", hyd, 1, " m"),
    decl("Tower diameter (RATING input)", "diameter", hyd, 1, " m"),
    decl("Weir height", "weirHeight", hyd, 1000, " mm"),
    decl("Hole diameter", "holeDiameter", hyd, 1000, " mm"),
    decl("Hole area fraction", "holeAreaFraction", hyd),
    decl("Downcomer area fraction", "downcomerAreaFraction", hyd),
    decl("Weir length fraction", "weirLengthFraction", hyd),
    decl("Orifice coefficient C_o", "orificeCoefficient", hyd),
    decl("Flood fraction target", "floodFraction", hyd),
    decl("Weep constant K2", "K2", hyd),
    hyd["diameter"] === undefined && shell
      ? wide(`<i>The case declares no <code>diameter</code>, so the hydraulics `
        + `pass DESIGNED one and everything under SIZED BY CHOUPO above is `
        + `Choupo's.</i>`)
      : (hyd["diameter"] !== undefined
        ? wide(`<i>The case DECLARES the diameter, so the pass RATED these `
          + `trays against a tower the author chose.  The section diameters on `
          + `the sheet say what each section would have needed.</i>`)
        : ""),
  ].join(""));

  //  ---- THE OTHER ITEMS -------------------------------------------------
  //  A labelled box beats a wrong picture, and here is where that is visible:
  //  a reflux drum is `vessel`, a condenser is `shellTubeHX`, and this module
  //  has a drawing for neither from a specification sheet alone.
  const others = sheets.filter((s) => !DRAWN_BY_THE_TOWER.includes(s.item));
  const otherBlocks = others.map((s) => `<div class="item">
      <h2>${esc(s.item || s.equipment)} <span>· ${esc(s.equipment)}</span></h2>
      <div class="scheme">${hasSchematic(s.equipment) ? ""
        : fallbackBoxSvg(s)
          + `<p class="why">${esc(noSchematicReason(s.equipment))}</p>`}</div>
      ${sec(`SIZED BY CHOUPO  ·  design/…/${s.item}`, SIZED_INK,
        s.sizing.map((v) => row(esc(v.key), sizingRow(v))).join("")
        + row("Design basis", esc(s.basis))
        + (s.assumed.length > 0
          ? wide(`<b>Assumed by the sizer</b>: <code>`
            + `${esc(s.assumed.join(", "))}</code>.`) : ""))}
    </div>`).join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(unit.name)} — column datasheet</title>
<style>
  body{font-family:system-ui,sans-serif;margin:24px;color:#222;background:#fff}
  h1{font-size:19px;margin:0 0 2px}
  h2{font-size:14px;margin:18px 0 6px}
  h2 span{color:#888;font-weight:400;font-size:12px}
  .sub{color:#666;font-size:12px;margin-bottom:16px}
  .scheme{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px;background:#fafbfc;text-align:center}
  .notes{list-style:none;margin:10px auto 0;padding:0;max-width:800px;text-align:left;font-size:11.5px;color:#445;column-count:2;column-gap:24px}
  .notes li{margin:0 0 3px;break-inside:avoid}
  .notes i{color:#8a8a8a;font-size:10.5px}
  .why{margin:6px auto 0;max-width:520px;text-align:left;font-size:10.5px;color:#777;line-height:1.5}
  .cap{color:#777;font-size:11px;margin:0 0 18px;line-height:1.5}
  .legend{font-size:11px;color:#555;margin:8px 0 0}
  .legend b{padding:0 4px;border-radius:3px;color:#fff}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .item{break-inside:avoid}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:0}
  th{color:#fff;text-align:left;padding:5px 9px;font-size:12px;letter-spacing:.02em}
  td{padding:4px 9px;border-bottom:1px solid #eee;vertical-align:top}
  td:first-child{color:#555;width:52%}
  code{background:#f2f4f6;padding:0 3px;border-radius:3px}
  .foot{margin-top:18px;color:#888;font-size:11px;line-height:1.55}
  @media print{body{margin:8mm} .noprint{display:none}}
</style></head><body>
  <h1>Distillation Column Datasheet — ${esc(unit.name)}</h1>
  <div class="sub">Choupo tray column · glass-box (Fair flooding · Francis weir) · the tower and its tray stack</div>
  <div class="scheme">${scheme}</div>
  <p class="legend">
    <b style="background:${SIZED_INK}">Choupo</b> — computed by the sizing pass
    and read from the sheet the run wrote. &nbsp;
    <b style="background:${DECLARED_INK}">declared</b> — the author's own input,
    echoed back. &nbsp; The word is on every dimension, so the distinction
    survives a greyscale print.
  </p>
  <p class="cap">${esc(caption)}</p>
  <div class="grid">
    <div>${service}${sizedSection(shell, "shell")}${sizedSection(trays, "trays")}</div>
    <div>${rating}${declared}</div>
  </div>
  ${others.length > 0
    ? `<h2>The other items of this unit</h2>
       <p class="cap">One flowsheet unit, several physical objects.  Each was
       sized by the same pass and has its own specification sheet; the ones
       below have no schematic Choupo can draw from a sheet alone, and a
       labelled box is what goes there instead of another kind's picture.</p>
       <div class="grid">${otherBlocks}</div>`
    : ""}
  <div class="foot">
    EVERY NUMBER SAYS WHERE IT CAME FROM.  <b>SIZED BY CHOUPO</b> is read from
    the specification sheets the run wrote at
    <code>design/&lt;SECTOR&gt;/${esc(unit.name)}/&lt;item&gt;</code>, value and
    unit as the sizer declared them; nothing there is recomputed on this page,
    and when the sizing pass did not run the page says so rather than
    substituting a number.  <b>RATING RESULT</b> is what the tray-hydraulics
    pass published for this run.  <b>DECLARED BY THE CASE</b> is the author's
    own input.  <br>
    THIS IS NOT A MECHANICAL VESSEL DATA SHEET.  It carries no nozzle sizes or
    ratings, no facings, gaskets, manholes or handholes, no head type, no
    supports or skirt, no insulation, no weights beyond the shell the sizer
    computed and no code stamp — Choupo computes none of them, so the drawing
    shows every nozzle as a stub with a service label and never with a
    dimension.  Print → PDF with your browser.
  </div>
  <p class="noprint" style="margin-top:14px"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`;
}

/** The .ods rows, carrying the SAME partition the page draws — a spreadsheet
 *  that dropped the provenance column would be the one surface where a design
 *  output and a declared input look alike again. */
export function columnDatasheetOdsRows(
  unit: UnitSpec, kpis: Kpis | undefined, sheets: DesignSheet[],
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  for (const s of sheets)
    for (const v of s.sizing)
      rows.push([`${s.item || s.equipment}.${v.key}`, v.value,
                 v.unit === "-" ? "" : v.unit, "sized by Choupo (design/)"]);
  const k = kpis ?? {};
  const rating: [string, string][] = [
    ["nTrays", "-"], ["floodApproach_max", "-"], ["floodStage", "-"],
    ["downcomerBackup_max_mm", "mm"], ["downcomerFloodStages", "-"],
    ["weepingStages", "-"], ["dP_column_kPa", "kPa"],
    ["Q_condenser_kW", "kW"], ["Q_reboiler_kW", "kW"],
    ["diameter_rectifying", "m"], ["diameter_stripping", "m"],
  ];
  for (const [key, u] of rating)
    if (k[key] !== undefined)
      rows.push([key, k[key] as number, u === "-" ? "" : u,
                 "rating result (run KPI)"]);
  const op = (unit.operation ?? {}) as { [key: string]: unknown };
  const hyd = (op["hydraulics"] ?? {}) as { [key: string]: unknown };
  for (const [key, v] of [...Object.entries(op), ...Object.entries(hyd)]) {
    const n = num(v);
    if (n !== undefined && key !== "hydraulics")
      rows.push([key, n, "", "declared by the case (operation)"]);
  }
  return rows;
}

/** The datasheet trigger, shown in the unit panel for a distillation column. */
export function ColumnDatasheet({ unit, kpis }: { unit: UnitSpec; kpis: Kpis }) {
  const designFiles = useStore((s) => s.runResult?.designFiles);
  //  SHOWN ONLY WHEN THERE IS SOMETHING TO SHOW.  A button that opens a page
  //  explaining its own emptiness is the lit-but-dead control the credo
  //  forbids: 30 corpus cases declare a column and one ships a `postDict`.
  const { sheets } = unitDesignSheets(designFiles, unit.name);
  if (sheets.length === 0) return null;

  const openTab = () => {
    let built: string;
    try { built = columnDatasheetHtml(unit, kpis, designFiles); }
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
  const exportOds = () => downloadOds(unit.name,
    ["quantity", "value", "unit", "source"],
    columnDatasheetOdsRows(unit, kpis, sheets), `${unit.name}_datasheet.ods`);

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
