/*  HeatExchangerDatasheet — the DESIGN deliverable: a formatted, coloured
 *  TEMA-style specification sheet for a shell-and-tube heat exchanger, with a
 *  parametric SVG scheme drawn from the actual geometry (the 146 tubes, the 15
 *  baffles, the passes — all from the numbers).  Opens as a self-contained HTML
 *  page (print → PDF); the numbers also export to .ods.  Glass-box: every
 *  correlation is named, U is shown as its three-resistance split.
 *
 *  A detailed exchanger-rating tool produces exactly this (the spec sheet); we do it open, and the
 *  scheme is real (drawn from the solved geometry, not a stock clip-art).
 */
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconFileText, IconTableExport } from "@tabler/icons-react";
import { useStore } from "../state/store.js";
import type { UnitSpec } from "../case/types.js";
import type { StreamResult } from "../adapters/SolverAdapter.js";
import { findRunStream } from "./streamPopOut.js";
import { downloadOds } from "../case/odsExport.js";

type Kpis = { [k: string]: number };
interface SideStreams { inlet?: StreamResult; outlet?: StreamResult; name: string; }

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

/** A parametric SVG of the shell-and-tube, drawn from the geometry + KPIs. */
function schemeSvg(geom: { [k: string]: number }, kpis: Kpis,
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
  parts.push(t(shX + shW / 2, shY + shH / 2 - 4, `${Math.round(geom["nTubes"] ?? 0)} tubes`, ink, 13, "middle"));
  parts.push(t(shX + shW / 2, shY + shH / 2 + 14, `${nBaffles} baffles · U-tube (${Math.round(geom["passes"] ?? 1)}-pass)`, "#556", 11, "middle"));
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:620px">${parts.join("")}</svg>`;
}

function buildDatasheetHtml(unit: UnitSpec, kpis: Kpis,
  tube: SideStreams, shell: SideStreams): string {
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
  // derive nTubes from area when the dict does not carry it (design mode)
  if (!geom["nTubes"] && kpis["area"] && geom["tubeOD"] && geom["tubeLength"])
    geom["nTubes"] = kpis["area"] / (Math.PI * geom["tubeOD"] * geom["tubeLength"]);
  const scheme = schemeSvg(geom, kpis, tube, shell);
  const controlling = ["tube-side", "shell-side", "wall"][Math.round(kpis["controllingResistance"] ?? 0)] ?? "—";
  const row = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  const sec = (title: string, color: string, rows: string) =>
    `<table><thead><tr><th colspan="2" style="background:${color}">${title}</th></tr></thead><tbody>${rows}</tbody></table>`;

  const service = sec("SERVICE", "#37536e", [
    row("Unit", unit.name),
    row("Type", "Shell-and-tube (TEMA), single-phase"),
    row("Mode", "Design (sized from duty)  ·  glass-box Kern"),
    row("Duty Q", `${N((kpis["Q_kW"] ?? kpis["duty_kW"]))} kW`),
    row("LMTD", `${N(kpis["LMTD"])} K`),
  ].join(""));
  const thermal = sec("THERMAL", "#2f6d4f", [
    row("Overall U", `<b>${N(kpis["U"])}</b> W/(m²·K)`),
    row("Area (outside)", `${N(kpis["area"], 2)} m²`),
    row("Controlling resistance", controlling),
    row("R inner / wall / outer", `${(kpis["R_inner"] ?? 0).toExponential(2)} / ${(kpis["R_wall"] ?? 0).toExponential(2)} / ${(kpis["R_outer"] ?? 0).toExponential(2)} m²K/W`),
  ].join(""));
  const hydraulic = sec("HYDRAULIC (pressure drop, Kern)", "#7a5230", [
    row("ΔP tube side", `<b>${N(kpis["dP_tube_kPa"])}</b> kPa`),
    row("ΔP shell side", `<b>${N(kpis["dP_shell_kPa"])}</b> kPa`),
    row("Baffles", `${Math.round(kpis["nBaffles"] ?? 0)}`),
    row("f tube / f shell", `${N(kpis["f_tube"], 4)} / ${N(kpis["f_shell"], 4)}`),
  ].join(""));
  const tubeSide = sec("TUBE SIDE", "#37536e", [
    row("Fluid (in → out)", `${tube.name}: ${K(tube.inlet?.T)} → ${K(tube.outlet?.T)} °C`),
    row("Re / Pr / Nu", `${N(kpis["Re_tube"], 0)} / ${N(kpis["Pr_tube"], 2)} / ${N(kpis["Nu_tube"], 0)}`),
    row("h inner", `${N(kpis["h_inner"], 0)} W/(m²·K)  (Gnielinski)`),
  ].join(""));
  const shellSide = sec("SHELL SIDE", "#37536e", [
    row("Fluid (in → out)", `${shell.name}: ${K(shell.inlet?.T)} → ${K(shell.outlet?.T)} °C`),
    row("Re / Pr / Nu", `${N(kpis["Re_shell"], 0)} / ${N(kpis["Pr_shell"], 2)} / ${N(kpis["Nu_shell"], 0)}`),
    row("h outer", `${N(kpis["h_outer"], 0)} W/(m²·K)  (Kern method)`),
  ].join(""));
  const geometry = sec("GEOMETRY", "#4a4a4a", [
    row("Tubes", `${Math.round(geom["nTubes"] ?? 0)} × ⌀${N((geom["tubeOD"] ?? 0) * 1000)}/${N((geom["tubeID"] ?? 0) * 1000)} mm, L ${N(geom["tubeLength"], 2)} m`),
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
  .foot{margin-top:18px;color:#888;font-size:11px}
  @media print{body{margin:8mm} .noprint{display:none}}
</style></head><body>
  <h1>Heat Exchanger Datasheet — ${unit.name}</h1>
  <div class="sub">Choupo shell-and-tube design · glass-box (Gnielinski tube · Kern shell) · single-phase v1</div>
  <div class="scheme">${scheme}</div>
  <div class="grid">
    <div>${service}${thermal}${hydraulic}</div>
    <div>${tubeSide}${shellSide}${geometry}</div>
  </div>
  <div class="foot">Correlations: Gnielinski (Incropera &amp; DeWitt), Kern (Process Heat Transfer, 1950). U on the outside area; ΔP = friction + turnaround (tube) / f G² D (N_b+1)/(2ρD_e) (shell). RESULTS from the solved run — not a specification. Print → PDF with your browser.</div>
  <p class="noprint" style="margin-top:14px"><button onclick="window.print()">Print / Save as PDF</button></p>
</body></html>`;
}

/** The datasheet trigger, shown in the unit panel for a heat exchanger. */
export function HeatExchangerDatasheet({ unit, kpis }: { unit: UnitSpec; kpis: Kpis }) {
  const streams = useStore((s) => s.runResult?.streams);
  const sides = resolveSides(unit, streams)
    ?? { tube: { name: "tube" }, shell: { name: "shell" } };
  if (kpis["U"] === undefined) return null;   // needs a rated/designed run

  // Open the datasheet in a NEW TAB (Vitor prefers a tab).  A blob URL + a real
  // anchor click opens ONE tab and never doubles up (the old window.open with
  // "noopener" returned null even on success, which wrongly triggered a modal
  // fallback too -- the tab+popup bug).  The HTML carries its own Print button.
  const openTab = () => {
    let built: string;
    try { built = buildDatasheetHtml(unit, kpis, sides.tube, sides.shell); }
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
  const exportOds = () => {
    const rows: (string | number)[][] = [];
    const push = (k: string, v: number | undefined) => { if (v !== undefined) rows.push([k, v]); };
    for (const k of ["Q_kW", "LMTD", "U", "area", "dP_tube_kPa", "dP_shell_kPa",
      "nBaffles", "Re_tube", "Nu_tube", "h_inner", "Re_shell", "Nu_shell", "h_outer",
      "R_inner", "R_wall", "R_outer", "f_tube", "f_shell"]) push(k, kpis[k]);
    downloadOds(unit.name, ["quantity", "value"], rows, `${unit.name}_datasheet.ods`);
  };
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

/** Build the standalone datasheet HTML for a heat-exchanger unit + its KPIs
 *  (re-used by the Reports tab).  Returns null if the unit has no U yet. */
export function heatExchangerDatasheetHtml(
  unit: UnitSpec, kpis: Kpis | undefined,
  streams: StreamResult[] | undefined): string | null {
  if (!kpis || kpis["U"] === undefined) return null;
  const sides = resolveSides(unit, streams)
    ?? { tube: { name: "tube" }, shell: { name: "shell" } };
  try { return buildDatasheetHtml(unit, kpis, sides.tube, sides.shell); }
  catch { return null; }
}
