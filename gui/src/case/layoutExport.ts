/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  EXPORT THE LAYOUT AS A PAGE -- one self-contained HTML file built from the
  run on screen (DEV.md 4c C81).  Pure: a layout block and its metadata in, a
  file name and an HTML string out, so the whole document is tested without
  a browser.

  WHY.  A student's case lives in their own files, so the 3D layout it
  produces has no link to share.  The button on the layout (Reports, the
  `?layout=` tab, the EduTool bench) writes this page instead: it opens in
  any browser, offline, and carries everything the app drew.

  WHAT THE FILE HOLDS.
    * The engine's `layout {}` block as the app holds it, embedded VERBATIM
      as JSON data (`<script type="application/json">`, every `<` escaped so
      no string in it can close the element; JSON.parse restores it exactly).
    * The viewer: three.js and Choupo's own drawing, compiled ONCE into one
      script (export/layoutViewer.ts, bundled by
      scripts/layoutViewerPlugin.ts) -- the SAME `layoutScene` mapping
      (case/plantLayout.ts) and the SAME `mountLayoutScene` drawing
      (ui/plotting/layoutRenderer.ts) the app runs.  Nothing is mapped or
      drawn by a second copy.
    * The tables as static HTML, from the SAME rows the app lays out
      (case/layoutTables.ts), so a reader without WebGL -- or without
      JavaScript -- still has every position, pipe and finding.
    * A footer naming the case, the run's fingerprint (the stamp the pop-out
      titles itself with), the Choupo version the app shows, the date, and
      which numbers the engine computed and which the case declared.
    * The licences of what it ships: Choupo's (GPL-3.0-or-later) and
      three.js's MIT notice, which travels with every copy by its own terms.

  THE ENGINE DECIDES, THE GUI DRAWS.  No number is computed for the export:
  the counts in the footer are the engine's own `summary`, absent when the
  run predates it, and every cell is a row the app already prints.

  A STALE RUN IS NOT EXPORTED (`layoutExportState`).  In the app a stale
  result DIMS beside the case it no longer answers and the reader can run
  again; a shared file has no parent to dim against and no Run button, and
  its footer names a fingerprint the student's case no longer has.  So the
  button stays visible and says to run the case again first, rather than
  writing a file whose only honest content would be a warning about itself.

  NO NETWORK.  The document names no URL it would load: no `src`, no `href`
  to anything, no font, no CDN.  The test holds that, and holds the only
  `http` text three.js carries to be the XHTML namespace it passes to
  createElementNS (an identifier, never fetched).
\*---------------------------------------------------------------------------*/

import type { GmpBuilding } from "../adapters/buildingPayload.js";
import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { engineVersionLabel, type EngineVersion } from "./engineVersion.js";
import { canPopOutLayout, type LayoutPopOutStash } from "./layoutPopOut.js";
import {
  FINDINGS_CAPTION, findingRows, itemRows, layoutNotes, LEGEND_PHASES, LEGEND_PIPES,
  LEGEND_SHAPES, PARTICLE_WORD, PIPE_REGISTER_CAPTION, pipeRegister, PLOT_CAPTION, plotSummary,
  ROADS_CAPTION, roadSummary, FENCE_CAPTION, fenceSummary,
} from "./layoutTables.js";
import { layoutSection, type LayoutSectionId } from "./layoutPanels.js";
import { phaseCss, PHASE_WORDS, QUALITY_TITLE } from "./plantLayout.js";
import type { RunInputs, Staleness } from "./staleness.js";
import { GMP_LEGEND } from "./gmpBuilding.js";

/** The element ids the viewer script looks for (export/layoutViewer.ts). */
export const EXPORT_IDS = {
  data: "choupo-layout-data",
  view: "choupo-layout-view",
  error: "choupo-layout-error",
  fit: "choupo-layout-fit",
  /** The name of the 3D / Plan / Elevation radio group. */
  preset: "choupo-layout-preset",
  pipes: "choupo-layout-pipes",
  flow: "choupo-layout-flow",
  zones: "choupo-layout-zones",
  zoneLabels: "choupo-layout-zone-labels",
  /** The name of the High / Fast radio group (DEV.md 4c C88). */
  quality: "choupo-layout-quality",
  /** The Full screen button and the view's lower-edge drag handle (C91). */
  full: "choupo-layout-full",
  resize: "choupo-layout-resize",
  /** The toolbar and the view together: what goes full screen. */
  stage: "choupo-layout-stage",
  /** The GMP interior (DEV.md 4c C97): its block, and the prefix of its
   *  toggles (`-rooms`, `-personnel`, `-material`, `-waste`). */
  building: "choupo-building-data",
  buildingToggle: "choupo-building",
} as const;

/** The compiled viewer, and the third-party code it carries. */
export interface LayoutViewerBundle {
  /** The script: three.js + Choupo's drawing, one IIFE. */
  script: string;
  /** three.js's version and its LICENSE file, verbatim. */
  threeVersion: string;
  threeLicence: string;
}

export interface LayoutExportInput {
  source: LayoutPopOutStash["source"];
  caseName: string;
  layout: PlantLayout;
  /** The GMP interior beside it (DEV.md 4c C97), drawn in the same view. */
  building?: GmpBuilding;
  /** The stamp of the run drawn; null when the run carries none. */
  ran: RunInputs | null;
  /** The version the app's badge shows; null when the stamp is unreadable. */
  version: EngineVersion | null;
  /** When the file was written (ISO 8601). */
  date: string;
  viewer: LayoutViewerBundle;
}

/** Whether the export button shows, whether it works, and if not why. */
export interface LayoutExportState { show: boolean; enabled: boolean; reason: string | null }

/** The button shows exactly where a layout is drawn (the condition the
 *  pop-out uses), and works unless the drawn run no longer answers the
 *  case the parent declares (see the header). */
export function layoutExportState(layout: PlantLayout | null | undefined,
                                  staleness: Staleness): LayoutExportState {
  if (!canPopOutLayout(layout))
    return { show: false, enabled: false, reason: null };
  if (staleness.stale)
    return { show: true, enabled: false, reason:
      "The case has moved since this run, so this layout no longer answers it.  Run the case"
      + " again, then export: a shared file has no Run button and no parent to dim against." };
  return { show: true, enabled: true, reason: null };
}

/** The last segment of a case name ("plant/ammonia02" reads "ammonia02"). */
function leafOf(caseName: string): string {
  const i = caseName.lastIndexOf("/");
  return i < 0 ? caseName : caseName.slice(i + 1);
}

/** `<case-leaf>-layout-<fingerprint-short>.html`; "unstamped" where the run
 *  carries no fingerprint.  Characters a file system may refuse become "_". */
export function layoutExportFileName(caseName: string, ran: RunInputs | null): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[._]+/, "") || "case";
  const fp = ran ? safe(ran.fingerprint.slice(0, 8)) : "unstamped";
  return `${safe(leafOf(caseName))}-layout-${fp}.html`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** JSON inside a <script> element: escape every `<` (and the two line
 *  separators JavaScript once disliked) so no string can close it. */
function jsonForScript(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** A script body that cannot close its element early. */
function scriptForInline(src: string): string {
  return src.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

/** The sentence a reader of the shared file needs most: whose numbers are
 *  whose. */
export const PROVENANCE_SENTENCE =
  "The engine computed the item sizes it published (every cylinder), the pipe routes and"
  + " lengths, the stream state on each pipe, and every finding; the case declared the"
  + " positions, the boxes, the sector areas, the separation distances, the wind, the"
  + " hazardous-area zones and the pipe rack -- author-set placeholder data with their own"
  + " stated sources, not a survey or a vendor's drawing.";

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f8f9fa; --panel: #ffffff; --text: #1a1b1e; --dim: #5c636a; --line: #dee2e6;
  --stripe: #f1f3f5; --accent: #1c7ed6;
  --mantine-color-text: var(--text);
  --mantine-font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1b1e; --panel: #25262b; --text: #e9ecef; --dim: #adb5bd; --line: #373a40;
    --stripe: #2c2e33; --accent: #4dabf7;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font: 14px/1.45 var(--mantine-font-family); }
main { max-width: 1280px; margin: 0 auto; padding: 12px 16px 24px; }
h1 { font-size: 1.25rem; margin: 4px 0 2px; overflow-wrap: anywhere; }
h2 { font-size: 1rem; margin: 18px 0 6px; }
.sub, .dim, caption, .note { color: var(--dim); font-size: 12px; }
code, .mono, td.num { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.legend { margin: 8px 0; font-size: 12px; color: var(--dim); }
.swatches { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0; color: var(--text); }
.swatch { display: inline-block; width: 14px; height: 6px; border-radius: 3px; margin-right: 4px;
  vertical-align: middle; }
.toolbar { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; margin: 6px 0;
  font-size: 13px; }
.toolbar button, .toolbar .seg label { font: inherit; color: var(--text); background: var(--panel);
  border: 1px solid var(--line); border-radius: 4px; padding: 2px 10px; cursor: pointer; }
.toolbar .seg { display: inline-flex; gap: 0; }
.toolbar .seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.toolbar .seg label { border-radius: 0; margin-left: -1px; }
.toolbar .seg label:first-of-type { border-radius: 4px 0 0 4px; margin-left: 0; }
.toolbar .seg label:last-of-type { border-radius: 0 4px 4px 0; }
.toolbar .seg input:checked + label { background: var(--accent); color: #fff; border-color: var(--accent); }
.toolbar .seg input:focus-visible + label, .toolbar button:focus-visible { outline: 2px solid var(--accent); }
.view { position: relative; width: 100%; height: calc(100vh - 120px);
  height: calc(100dvh - 120px); min-height: 240px;
  overflow: hidden; border: 1px solid var(--line); border-radius: 6px; background: var(--panel);
  touch-action: none; }
.stage.max { position: fixed; inset: 0; z-index: 10; background: var(--bg); padding: 6px 8px;
  display: flex; flex-direction: column; }
.stage:fullscreen { background: var(--bg); padding: 6px 8px; display: flex; flex-direction: column; }
.stage.max .view, .stage:fullscreen .view { flex: 1 1 auto; height: auto !important; }
.stage.max ~ .vresize { display: none; }
.vresize { height: 11px; margin: -5px 0 0; cursor: row-resize; position: relative; z-index: 2;
  touch-action: none; }
.vresize::after { content: ""; position: absolute; left: 40%; right: 40%; top: 4px; height: 3px;
  border-radius: 2px; background: var(--line); }
.vresize:hover::after, .vresize:focus-visible::after { background: var(--accent); }
.vresize:focus-visible { outline: none; }
details.sec { margin: 10px 0 0; }
details.sec > summary { cursor: pointer; font-weight: 600; font-size: 1rem; margin: 4px 0; }
details.sec > summary .dim { font-weight: 400; }
details.legend > summary { font-size: 13px; color: var(--dim); }
#${EXPORT_IDS.error} { color: #e03131; }
.scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 6px 0; }
table { border-collapse: collapse; width: 100%; font-size: 12px; background: var(--panel); }
caption { text-align: left; padding: 4px 0; caption-side: top; }
th, td { border: 1px solid var(--line); padding: 3px 6px; text-align: left; vertical-align: top; }
th { background: var(--stripe); }
tbody tr:nth-child(even) td { background: var(--stripe); }
td.num, th.num { text-align: right; white-space: nowrap; }
ul { margin: 4px 0 0 18px; padding: 0; }
footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px;
  color: var(--dim); }
footer dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 8px; }
footer dt { font-weight: 600; color: var(--text); }
footer dd { margin: 0; overflow-wrap: anywhere; }
footer pre { white-space: pre-wrap; font-size: 11px; background: var(--panel);
  border: 1px solid var(--line); padding: 8px; border-radius: 4px; }
@media (max-width: 600px) {
  main { padding: 8px 16px 16px; }
  .view { height: 60vh; min-height: 260px; }
  footer dl { grid-template-columns: 1fr; }
}
`;

function table(caption: string | null, head: [string, boolean][], rows: [string, boolean][][],
               minWidth: number): string {
  const th = head.map(([h, num]) => `<th${num ? ' class="num"' : ""}>${esc(h)}</th>`).join("");
  const tb = rows.map((r) => `<tr>${r.map(([c, num]) =>
    `<td${num ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("\n");
  return `<div class="scroll"><table style="min-width:${minWidth}px">`
    + (caption ? `<caption>${esc(caption)}</caption>` : "")
    + `<thead><tr>${th}</tr></thead><tbody>\n${tb}\n</tbody></table></div>`;
}

/** The whole page, and the name to save it under. */
export function buildLayoutExport(input: LayoutExportInput): { fileName: string; html: string } {
  const { layout, ran } = input;
  const leaf = leafOf(input.caseName);
  const run = ran ? `run ${ran.fingerprint}` : "run not stamped";
  const version = input.version ? engineVersionLabel(input.version)
    : "not stamped (the app could not read wasm/version.json)";
  const versionShort = input.version ? engineVersionLabel(input.version) : "version not stamped";
  const who = input.source === "bench" ? `${input.caseName} (EduTools plant-layout bench)`
    : input.caseName;
  const title = `${leaf} · plant layout · ${run}`;
  const hasPipes = (layout.pipes?.length ?? 0) > 0;
  const hasZones = layout.items.some((i) => (i.release?.zones.length ?? 0) > 0);

  //  ---- the legend and the toolbar ---------------------------------------
  const legend = [
    input.building ? `<p>${esc(GMP_LEGEND)}</p>` : "",
    `<p>Declared in <code>system/layoutDict</code>.  ${esc(LEGEND_SHAPES)}  Drag (one finger)`
    + " to orbit, right-drag (two fingers) to pan, wheel (pinch) to zoom; Fit frames the"
    + " plant again.</p>",
    hasPipes
      ? `<div class="swatches">${LEGEND_PHASES.map((ph) =>
          `<span><span class="swatch" style="background:${phaseCss(ph)}"></span>`
          + `${esc(PHASE_WORDS[ph])}: ${esc(PARTICLE_WORD[ph])}</span>`).join("")}</div>`
        + `<p>${esc(LEGEND_PIPES)}</p>`
      : "",
  ].join("");
  const check = (id: string, label: string, checked: boolean) =>
    `<label><input type="checkbox" id="${id}"${checked ? " checked" : ""}> ${esc(label)}</label>`;
  const radio = (name: string, value: string, label: string, checked: boolean) =>
    `<input type="radio" name="${name}" id="${name}-${value}"`
    + ` value="${value}"${checked ? " checked" : ""}>`
    + `<label for="${name}-${value}">${esc(label)}</label>`;
  const preset = (value: string, label: string, checked: boolean) =>
    radio(EXPORT_IDS.preset, value, label, checked);
  const toolbar = `<div class="toolbar" role="toolbar" aria-label="3D view">`
    + `<button type="button" id="${EXPORT_IDS.fit}" title="Frame the plant again">Fit</button>`
    + `<span class="seg" role="radiogroup" aria-label="View">`
    + preset("3d", "3D", true) + preset("plan", "Plan", false)
    + preset("elevation", "Elevation", false) + `</span>`
    + `<span class="seg" role="radiogroup" aria-label="Quality" title="${esc(QUALITY_TITLE)}">`
    + radio(EXPORT_IDS.quality, "high", "High", true)
    + radio(EXPORT_IDS.quality, "fast", "Fast", false) + `</span>`
    + (hasPipes ? check(EXPORT_IDS.pipes, "Pipes", true) + check(EXPORT_IDS.flow, "Flow", true) : "")
    + (hasZones ? check(EXPORT_IDS.zones, "Zones", true)
                  + check(EXPORT_IDS.zoneLabels, "Zone labels", false) : "")
    + (input.building
      ? check(`${EXPORT_IDS.buildingToggle}-rooms`, "Rooms", true)
        + (["personnel", "material", "waste"] as const)
          .filter((k) => input.building!.flows.some((f) => f.kind === k))
          .map((k) => check(`${EXPORT_IDS.buildingToggle}-${k}`,
                            k[0]!.toUpperCase() + k.slice(1), true)).join("")
      : "")
    + `<button type="button" id="${EXPORT_IDS.full}"`
    + ` title="Show the view on the whole screen (Esc returns)">Full screen</button>`
    + `</div>`;
  //  A collapsible section (C91): open or folded as the reader last left it
  //  in this browser (the viewer applies the remembered fold on load; the
  //  markup carries the default, so the page reads right without script).
  const section = (id: LayoutSectionId, body: string, extra?: string, cls = "sec") => {
    const s = layoutSection(id);
    return `<details class="${cls}" data-section="${s.id}" data-key="${esc(s.key)}"`
      + ` data-default-collapsed="${s.defaultCollapsed ? "1" : "0"}"${s.defaultCollapsed ? "" : " open"}>`
      + `<summary>${esc(s.title)}${extra ? ` <span class="dim">· ${esc(extra)}</span>` : ""}</summary>`
      + `${body}</details>`;
  };

  //  ---- the findings, the register, the items ------------------------------
  const findings = findingRows(layout);
  const findingsHtml = findings.length > 0
    ? table(FINDINGS_CAPTION, [["Finding", false], ["Measured (m)", true],
        ["Declared (m)", true], ["What the engine said", false]],
      findings.map((f) => [[`<code>${esc(f.kind)}</code>`, false], [esc(f.measured), true],
                           [esc(f.declared), true], [esc(f.message), false]]), 640)
    : `<p class="note">The engine published no finding on this layout.</p>`;

  const reg = pipeRegister(layout);
  let pipesHtml = `<p class="note">The engine routed no pipe on this run.</p>`;
  let notRoutedHtml = "";
  if (reg) {
    const rows: [string, boolean][][] = reg.rows.map((r) => [
      [esc(r.stream), false], [esc(r.ends), false],
      [`<span class="swatch" style="background:${phaseCss(r.phase)}"></span>${esc(r.phaseWord)}`, false],
      [esc(r.T), true], [esc(r.P), true], [esc(r.flow), true], [esc(r.length), true]]);
    if (reg.total)
      rows.push([[esc(reg.total.label), false], ["", false], ["", false], ["", true], ["", true],
                 ["", true], [esc(reg.total.length), true]]);
    pipesHtml = reg.rows.length > 0
      ? table(`${PIPE_REGISTER_CAPTION}${reg.rack ? ` ${reg.rack}` : ""}`,
          [["Stream", false], ["From → to", false], ["Phase", false], ["T (K)", true],
           ["P (bar)", true], ["Flow (kg/s)", true], ["Length (m)", true]], rows, 760)
      : pipesHtml;
    if (reg.notRouted.length > 0)
      notRoutedHtml = `<h3>Not routed (the engine's reasons)</h3><ul>`
        + reg.notRouted.map((n) => `<li><code>${esc(n.stream)}</code>: ${esc(n.reason)}`
          + (n.marked ? "" : " (neither end is on the plot plan, so the 3D view marks it nowhere)")
          + `</li>`).join("") + `</ul>`;
    if (reg.solids.length > 0)
      notRoutedHtml += `<p class="note">Moved as solids, not piped (in containers or by`
        + ` conveyor): ${reg.solids.map((s) => `<code>${esc(s)}</code>`).join(", ")}.</p>`;
    if (reg.indoor.length > 0)
      notRoutedHtml += `<h3>Inside the building (indoor piping is not routed)</h3><ul>`
        + reg.indoor.map((n) => `<li><code>${esc(n.stream)}</code>: ${esc(n.reason)}</li>`)
          .join("") + `</ul>`;
  }

  const items = table(null, [["Item", false], ["Kind", false], ["Sector", false], ["Shape", false],
    ["x, y, z (m)", true], ["extents (m)", true], ["Size from", false], ["Hazard", false]],
    itemRows(layout).map((r) => [[`<span class="mono">${esc(r.id)}</span>`, false],
      [esc(r.kind), false], [esc(r.sector), false], [esc(r.shape), false],
      [esc(r.position), true], [esc(r.extents), true], [esc(r.sizeFrom), false],
      [esc(r.hazard), false]]), 760);
  //  ---- the plot (C82): the same words and rows the app draws -------------
  const plot = plotSummary(layout);
  const plotHtml = plot
    ? `<p>${esc(plot.headline)}</p>`
      + [plot.margin, ...plot.notes, plot.rule].map((n) => `<p class="note">${esc(n)}</p>`).join("")
      + (plot.sectors.length > 0
        ? table(PLOT_CAPTION, [["Sector", false], ["Area from", false], ["Plot (m²)", true],
            ["Footprints (m²)", true]],
          plot.sectors.map((s) => [[esc(s.sector), false], [esc(s.from), false],
            [esc(s.plotArea), true], [esc(s.footprintArea), true]]), 520)
        : "")
    : "";

  //  ---- the fence (C93): the same words and rows the app draws, under the
  //  plot it is drawn from ------------------------------------------------------
  const fenceView = fenceSummary(layout);
  const fenceHtml = fenceView
    ? `<p>${esc(fenceView.headline)}</p>`
      + fenceView.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")
      + (fenceView.rows.length > 0
        ? table(FENCE_CAPTION, [["Stream", false], ["In / out", false], ["Side", false],
            ["x, y, z (m)", true], ["Comes from / goes to (the case's)", false],
            ["Placed by", false]],
          fenceView.rows.map((r) => [[`<code>${esc(r.stream)}</code>`, false],
            [esc(r.direction), false], [esc(r.side), false], [esc(r.position), true],
            [esc(r.label), false], [esc(r.placedBy), false]]), 760)
        : "")
    : "";

  //  ---- the roads (C90): the same words and rows the app draws -------------
  const roadView = roadSummary(layout);
  const roadsHtml = roadView
    ? `<p>${esc(roadView.headline)}</p>`
      + roadView.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")
      + table(ROADS_CAPTION, [["Road", false], ["Width (m)", true], ["Length (m)", true],
          ["A gate reaches it", false], ["Why (the case's)", false]],
        roadView.rows.map((r) => [[`<code>${esc(r.road)}</code>`, false], [esc(r.width), true],
          [esc(r.length), true], [esc(r.reached), false], [esc(r.reason), false]]), 640)
    : "";

  const notes = layoutNotes(layout);
  const notesHtml = [notes.unplaced, notes.internal, notes.sources]
    .filter((n): n is string => !!n).map((n) => `<p class="note">${esc(n)}</p>`).join("");

  //  ---- the footer -----------------------------------------------------------
  const s = layout.summary;
  const counts = s
    ? `The engine placed ${s.placed} item${s.placed === 1 ? "" : "s"}`
      + ` (${s.unplaced} sized but not placed, ${s.internal} inside another),`
      + ` routed ${s.pipes} pipe${s.pipes === 1 ? "" : "s"} (${s.pipeLength.toFixed(1)} m in all;`
      + ` ${s.notRouted} not routed) and published ${s.findings}`
      + ` finding${s.findings === 1 ? "" : "s"}.`
    : "The run carries no engine summary of its counts.";
  const footer = `<footer>
<dl>
<dt>Case</dt><dd><code>${esc(who)}</code></dd>
<dt>Run fingerprint</dt><dd>${ran ? `<code>${esc(ran.fingerprint)}</code>` : "not stamped"}</dd>
<dt>Choupo version</dt><dd>${esc(version)}</dd>
<dt>Exported</dt><dd>${esc(input.date)}</dd>
</dl>
<p>${esc(counts)}</p>
<p>${esc(PROVENANCE_SENTENCE)}</p>
<p>This file is self-contained: the layout is embedded as data, and the viewer is Choupo's
own drawing compiled with three.js ${esc(input.viewer.threeVersion)}.  It loads nothing from
the network.  Choupo is free software under the GNU GPL-3.0-or-later (choupo.org).</p>
<details><summary>three.js ${esc(input.viewer.threeVersion)} licence (MIT), bundled in this file</summary>
<pre>${esc(input.viewer.threeLicence.trim())}</pre></details>
</footer>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Choupo (${esc(versionShort)})">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
<h1>${esc(leaf)} · plant layout</h1>
<p class="sub">${esc(who)} · ${esc(run)} · ${esc(versionShort)} · exported ${esc(input.date)}</p>
</header>
<section class="legend">${section("legend", legend, undefined, "sec legend")}</section>
<div id="${EXPORT_IDS.stage}" class="stage">
${toolbar}
<div id="${EXPORT_IDS.view}" class="view" aria-label="3D plant layout"></div>
</div>
<div id="${EXPORT_IDS.resize}" class="vresize" role="separator" aria-orientation="horizontal"
  tabindex="0" aria-label="resize the 3D view"
  title="Drag to resize the 3D view (arrow keys too); double-click fills the window again"></div>
<p id="${EXPORT_IDS.error}" hidden></p>
<noscript><p class="note">The 3D view needs JavaScript; the tables below carry every
position, pipe and finding the engine published.</p></noscript>
${plotHtml ? section("plot", plotHtml + fenceHtml, layout.plot ? `${layout.plot.plotArea.toFixed(0)} m²` + (layout.fence ? `, fence ${layout.fence.length.toFixed(0)} m` : "") : undefined) : ""}
${roadsHtml ? section("roads", roadsHtml, layout.roadNetwork
  ? `${layout.roadNetwork.length.toFixed(0)} m, ${layout.roadNetwork.pavedArea.toFixed(0)} m² paved`
  : undefined) : ""}
${section("findings", findingsHtml, `${findings.length}`)}
${section("pipes", pipesHtml + notRoutedHtml, `${layout.pipes?.length ?? 0} routed`)}
${section("items", items + notesHtml, `${layout.items.length} placed`)}
${footer}
</main>
<script type="application/json" id="${EXPORT_IDS.data}">${jsonForScript(layout)}</script>
${input.building ? `<script type="application/json" id="${EXPORT_IDS.building}">${jsonForScript(input.building)}</script>\n` : ""}<script>${scriptForInline(input.viewer.script)}</script>
</body>
</html>
`;
  return { fileName: layoutExportFileName(input.caseName, ran), html };
}
