/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  operatorPanels -- the case the `operator-panels` EduTool hands the engine,
  and the few readers it needs of the answer.

  THE CASE IS THE SHIPPED WITNESS.  The page clones
  tutorials/batch/electrodialysis/edbatch01_constant_current from the bundled
  corpus, changes AT MOST one declared scalar of it for a disturbance (the
  rectifier current, the current efficiency, or the diluate the batch starts
  from -- the three variants the design record's tutorial names), and writes
  its own `system/panelDict` in place of the shipped one.  choupoBatch runs
  it; the engine reads the panel after the time loop and reports FACTS about
  it in the result's `panel` block (adapters/panelPayload).

  WHAT THIS FILE DOES NOT DO.  It derives no panel fact: no "violated", no
  "never approached", no interval, no count of active alarms.  Those are the
  engine's (src/postProcessing/panel/PanelPass.cpp) and the page reads them.
  The only arithmetic here is the page's own and is named as such: counting
  the alarm ONSETS the engine's intervals contain inside a time window, for
  the alarm-rate comparison of step 5, which is labelled a page computation
  on an ADJUSTABLE ASSUMPTION of the page.

  It is NOT a panel renderer and NOT a panel editor (slices S2-S4 of
  docs/design/operator-panel-in-the-case.md): it writes the handful of
  lesson panels below and nothing else.
\*---------------------------------------------------------------------------*/

import { applyDictOverride, type DictOverride } from "./methodRun.js";
import type { PanelReport } from "../adapters/panelPayload.js";

/** The witness the page runs, by its corpus key. */
export const PANEL_WITNESS = "batch/electrodialysis/edbatch01_constant_current";
/** The name of the case the page hands the engine. */
export const PANEL_CASE_NAME = "operatorPanelRig";
/** The one unit of the witness. */
export const RIG = "rig";

// ---- the disturbances ----------------------------------------------------------

export type PanelVariantId = "base" | "highCurrent" | "lowEfficiency" | "richDiluate";

export interface PanelVariant {
  id: PanelVariantId;
  label: string;
  /** What changed, in the words an operator would use. */
  story: string;
  /** What the run shows, for the reveal under step 1 -- written from the
   *  engine's own runs of these four cases (the design note, section 3). */
  answer: string;
  overrides: DictOverride[];
  /** The values the trajectory's first written instant must carry for an
   *  answer to belong to this variant (the stale-answer guard). */
  expect: { I_A: number; xi_eff: number; n_Na: number };
}

const FS = "system/flowsheetDict";
const IS = "0/internalStates/rig";

/** The richer diluate: the same 5 L of water carrying 0.2 mol/kg of NaCl
 *  instead of 0.1 (0.2775418672 kmol of water, 1.0e-3 kmol of each ion). */
const RICH = (() => {
  const water = 0.2775418672, ion = 0.001, tot = water + 2 * ion;
  return { tot, xw: water / tot, xi: ion / tot };
})();

export const PANEL_VARIANTS: readonly PanelVariant[] = [
  {
    id: "base", label: "As designed",
    story: "The rig as the case declares it: 3.5 A on the rectifier, a current efficiency of 0.9, a 0.1 mol/kg diluate.",
    answer: "The batch runs normally until about 1600 s, when the current passes the limiting current: from then on the extra current splits water instead of moving salt, and the demineralisation parts from Faraday's straight line.",
    overrides: [],
    expect: { I_A: 3.5, xi_eff: 0.9, n_Na: 5e-4 },
  },
  {
    id: "highCurrent", label: "Rectifier set too high",
    story: "Someone set the rectifier to 4.5 A: 225 A/m2 on one cell pair, past the 200 A/m2 rating the stack record declares.",
    answer: "Two things are wrong, and they are different: the stack runs past its rating from the first second, and the limiting current is reached earlier, at about 1150 s.  The voltage leaves its scale near the end.",
    overrides: [{ file: FS, key: "current", value: 4.5, unit: "" }],
    expect: { I_A: 4.5, xi_eff: 0.9, n_Na: 5e-4 },
  },
  {
    id: "lowEfficiency", label: "Current efficiency lower",
    story: "The current efficiency is 0.6 instead of 0.9 -- what an operator sees when the membranes pass less salt per coulomb than they should.",
    answer: "Nothing alarms.  The batch is simply slower: the diluate conductivity falls less, the limiting current is never reached in 2000 s, and the batch ends short of the product.  The ideal line on the demineralisation trend is computed with the same efficiency, so it moves WITH the fault and does not show it.",
    overrides: [{ file: FS, key: "xi", value: 0.6, unit: "" }],
    expect: { I_A: 3.5, xi_eff: 0.6, n_Na: 5e-4 },
  },
  {
    id: "richDiluate", label: "Richer diluate",
    story: "The tank was filled with a 0.2 mol/kg diluate instead of 0.1: twice the salt to remove at the same current.",
    answer: "Nothing alarms, and the voltage is lower (a more conductive diluate).  The diluate conductivity starts off the top of its scale and ends far above where the designed batch ends: at 3.5 A for 2000 s the batch removes the same salt and leaves half of it behind.",
    overrides: [
      { file: IS, key: "totalMoles", value: RICH.tot, occurrence: 1 },
      { file: IS, key: "water", value: RICH.xw, occurrence: 1 },
      { file: IS, key: "Na", value: RICH.xi, occurrence: 1 },
      { file: IS, key: "Cl", value: RICH.xi, occurrence: 1 },
    ],
    expect: { I_A: 3.5, xi_eff: 0.9, n_Na: 1e-3 },
  },
];

export const variantById = (id: PanelVariantId): PanelVariant =>
  PANEL_VARIANTS.find((v) => v.id === id)!;

// ---- the panel grammar the page writes -----------------------------------------

export type PanelKind = "number" | "bar" | "trend" | "lamp";

export interface PanelElementSpec {
  name: string;
  title: string;
  kind: PanelKind;
  /** The published key of `rig` the element reads (`U_V`). */
  cv: string;
  ref?: string;
  /** Scalars written as the dict writes them: `0`, `273.15 K`. */
  range?: { min: string; max: string };
  limit?: { low?: string; high?: string; source: string; reason: string };
  alarm?: { on: "high" | "low" | "outside"; delay?: string; action: string };
  words?: { normal?: string; low?: string; high?: string };
  place: { column: number; row: number; width: number; height: number };
  reason: string;
  /** A comment written beside the range (the unit of a raw number). */
  unitNote?: string;
  /** The column's unit the case DECLARES (`measurement { cvUnit "..."; }`),
   *  which the engine publishes as `unit` with `unitFrom declared`. */
  cvUnit?: string;
}

export interface PanelMessageSpec {
  name: string; from?: string; on: "high" | "low" | "outside" | "end"; text: string;
}

export interface PanelSpec {
  /** What this panel is, in one line (written as the file's header). */
  title: string;
  rows: number;
  elements: PanelElementSpec[];
  messages: PanelMessageSpec[];
}

const q = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;

/** Write a panelDict in the grammar of docs/design/operator-panel-in-the-case.md
 *  section 3 (the shape the shipped edbatch01 panelDict uses).  Every element
 *  is `authored edited` -- a person shaped it; there is no draft tool yet. */
export function panelDictText(p: PanelSpec): string {
  const L: string[] = [
    "/*---------------------------------------------------------------------------*\\",
    `  panelDict -- ${p.title}`,
    "  Written by the operator-panels EduTool page.  The engine reads it after",
    "  the time loop and reports facts about it; nothing in it changes a number.",
    "\\*---------------------------------------------------------------------------*/",
    "",
    `grid  { columns 12;  rows ${p.rows}; }`,
    "",
    "elements",
    "(",
  ];
  for (const e of p.elements) {
    L.push("    {");
    L.push(`        name        ${e.name};`);
    L.push(`        title       ${q(e.title)};`);
    L.push(`        kind        ${e.kind};`);
    L.push(`        measurement { unit ${RIG};  cv ${e.cv};${e.cvUnit ? `  cvUnit ${q(e.cvUnit)};` : ""} }`);
    if (e.ref) L.push(`        reference   { unit ${RIG};  cv ${e.ref}; }`);
    if (e.range)
      L.push(`        range       { min ${e.range.min};  max ${e.range.max}; }${e.unitNote ? `   // ${e.unitNote}` : ""}`);
    if (e.limit) {
      const ends = [e.limit.low !== undefined ? `low ${e.limit.low};` : "", e.limit.high !== undefined ? `high ${e.limit.high};` : ""]
        .filter(Boolean).join("  ");
      L.push(`        limit       { ${ends}`);
      L.push(`                      source  ${q(e.limit.source)};`);
      L.push(`                      reason  ${q(e.limit.reason)}; }`);
    }
    if (e.alarm)
      L.push(`        alarm       { on ${e.alarm.on};${e.alarm.delay ? `  delay ${e.alarm.delay};` : ""}  action ${q(e.alarm.action)}; }`);
    if (e.words) {
      const w = (["normal", "low", "high"] as const).filter((k) => e.words![k] !== undefined)
        .map((k) => `${k} ${q(e.words![k]!)};`).join("  ");
      L.push(`        words       { ${w} }`);
    }
    L.push(`        place       { column ${e.place.column};  row ${e.place.row};  width ${e.place.width};  height ${e.place.height}; }`);
    L.push(`        reason      ${q(e.reason)};`);
    L.push("        authored    edited;");
    L.push("    }");
  }
  L.push(");");
  if (p.messages.length > 0) {
    L.push("", "messages", "(");
    for (const m of p.messages)
      L.push(`    { name ${m.name};${m.from ? `  from ${m.from};` : ""}  on ${m.on};  text ${q(m.text)}; }`);
    L.push(");");
  }
  L.push("");
  return L.join("\n");
}

// ---- the lesson's panels -----------------------------------------------------------

const RATING_SOURCE = "the stack record's limits { i_max }, an estimate (see the record's provenance)";
const TMAX_SOURCE = "the stack record's limits { T_max }, an estimate (see the record's provenance)";
const OVERLIMIT_ACTION = "lower the current, or stop the batch: past the limiting current the extra current removes no salt";

const E_DILUATE: PanelElementSpec = {
  name: "diluate", title: "Diluate conductivity", kind: "trend", cv: "kappa_dil_S_per_m",
  range: { min: "0", max: "1.4" }, unitNote: "S/m", cvUnit: "S/m",
  place: { column: 1, row: 1, width: 8, height: 4 },
  reason: "the diluate is the product; its conductivity says how far the batch has got",
};
const E_DEMIN: PanelElementSpec = {
  name: "demineralisation", title: "Demineralisation, actual against ideal at I(0)", kind: "trend",
  cv: "deminActual", ref: "deminIdeal", range: { min: "0", max: "1" }, unitNote: "fraction", cvUnit: "-",
  place: { column: 1, row: 5, width: 8, height: 4 },
  reason: "the unit publishes the straight line beside the run; their parting is the over-limiting regime",
};
const E_VOLTAGE: PanelElementSpec = {
  name: "voltage", title: "Stack voltage", kind: "trend", cv: "U_V",
  range: { min: "0", max: "10" }, unitNote: "V", cvUnit: "V",
  place: { column: 9, row: 1, width: 4, height: 2 },
  reason: "at constant current the voltage is the free electrical variable; it rises as the diluate loses conductivity",
};
/** The over-limiting lamp, with its high limit as a parameter (step 5). */
export function overLimitingElement(high = 1): PanelElementSpec {
  return {
    name: "overLimiting", title: "Limiting current", kind: "lamp", cv: "i_over_ilim",
    range: { min: "0", max: "2.5" }, unitNote: "-", cvUnit: "-",
    limit: { high: numText(high), source: "the limiting current of the unit's own film model",
      reason: "above 1 the extra current splits water instead of moving salt" },
    alarm: { on: "high", delay: "0 s", action: OVERLIMIT_ACTION },
    words: { normal: "BELOW LIMITING", high: "OVER LIMITING" },
    place: { column: 9, row: 3, width: 4, height: 2 },
    reason: "the unit reports this regime boundary itself; crossing it is the event that ends efficient operation",
  };
}
const E_CURRENT: PanelElementSpec = {
  name: "currentDensity", title: "Current density against the stack rating", kind: "bar", cv: "i_A_per_m2",
  range: { min: "0", max: "250" }, unitNote: "A/m2", cvUnit: "A/m2",
  limit: { high: "200", source: RATING_SOURCE, reason: "the rating the unit checks the run against" },
  alarm: { on: "high", action: "lower the current set on the rectifier" },
  place: { column: 9, row: 5, width: 4, height: 2 },
  reason: "the stack record declares this limit",
};
const E_TEMPERATURE: PanelElementSpec = {
  name: "temperature", title: "Rig temperature", kind: "number", cv: "T",
  range: { min: "273.15 K", max: "333.15 K" },
  limit: { high: "313.15 K", source: TMAX_SOURCE, reason: "the membranes' temperature ceiling" },
  alarm: { on: "high", action: "cool the tanks or stop" },
  place: { column: 9, row: 7, width: 4, height: 2 },
  reason: "the stack record declares this limit",
};
const M_OVERLIMIT: PanelMessageSpec = {
  name: "overLimiting", from: "overLimiting", on: "high",
  text: "Limiting current reached: the batch has stopped removing salt efficiently",
};
const M_END: PanelMessageSpec = { name: "batchEnd", on: "end", text: "Batch finished" };

/** A number as the dict should carry it (no exponent noise for the lesson's values). */
export function numText(x: number): string {
  return String(Number(x.toPrecision(6)));
}

/** THE PANEL OF THE WORKED CASE: the shipped edbatch01 panel, element for
 *  element (the test holds the two to one parse). */
export function basePanel(overLimitHigh = 1): PanelSpec {
  return {
    title: "the operator panel of the constant-current batch rig (as shipped)",
    rows: 8,
    elements: [E_DILUATE, E_DEMIN, E_VOLTAGE, overLimitingElement(overLimitHigh), E_CURRENT, E_TEMPERATURE],
    messages: [M_OVERLIMIT, M_END],
  };
}

/** A NAIVE PANEL for step 5: an alarm on everything that moves, each on a
 *  limit that sounds reasonable on its own.  The flood is what they do
 *  together.  Every limit here is the page's own, written as such. */
export function naivePanel(): PanelSpec {
  const own = "the page's own choice, for the flood demonstration";
  const mk = (name: string, title: string, cv: string, lim: { low?: string; high?: string },
    on: "high" | "low", range: { min: string; max: string }, row: number, unitNote: string): PanelElementSpec => ({
    name, title, kind: "bar", cv, range, unitNote,
    limit: { ...lim, source: own, reason: "a value that looked unusual when the panel was written" },
    alarm: { on, action: "check the rig" },
    place: { column: 1 + ((row - 1) % 2) * 6, row: 1 + Math.floor((row - 1) / 2) * 2, width: 6, height: 2 },
    reason: "it is published, so it was put on the panel",
  });
  return {
    title: "a naive panel: an alarm on everything that moves (step 5)",
    rows: 8,
    elements: [
      mk("voltageHigh", "Stack voltage high", "U_V", { high: "8" }, "high", { min: "0", max: "20" }, 1, "V"),
      mk("powerHigh", "Electric power high", "P_electric_kW", { high: "0.03" }, "high", { min: "0", max: "0.08" }, 2, "kW"),
      mk("resistanceHigh", "Cell-pair resistance high", "R_pair_ohm", { high: "1" }, "high", { min: "0", max: "4" }, 3, "ohm"),
      mk("ilimLow", "Limiting current low", "i_lim_A_per_m2", { low: "200" }, "low", { min: "0", max: "700" }, 4, "A/m2"),
      mk("efficiencyLow", "Effective current efficiency low", "xi_eff", { low: "0.85" }, "low", { min: "0", max: "1" }, 5, "-"),
      mk("diluateLow", "Diluate conductivity low", "kappa_dil_S_per_m", { low: "0.4" }, "low", { min: "0", max: "1.4" }, 6, "S/m"),
      mk("ratioHigh", "i over i_lim high", "i_over_ilim", { high: "1" }, "high", { min: "0", max: "5" }, 7, "-"),
      mk("currentHigh", "Current density high", "i_A_per_m2", { high: "200" }, "high", { min: "0", max: "250" }, 8, "A/m2"),
    ],
    messages: [],
  };
}

/** THE PANEL AS A SYSTEM THAT GROWS (step 6): three stages, each adding only
 *  what a run showed was missed. */
export interface GrowthStage { id: string; label: string; why: string; panel: PanelSpec }

export function growthStages(): GrowthStage[] {
  const p = (title: string, els: PanelElementSpec[], msgs: PanelMessageSpec[]): PanelSpec =>
    ({ title, rows: 8, elements: els, messages: msgs });
  return [
    {
      id: "g1", label: "1 · the product only",
      why: "Start with the one question every batch asks: how far has it got?  One trend of the diluate conductivity.",
      panel: p("growth stage 1: the product only", [E_DILUATE], [M_END]),
    },
    {
      id: "g2", label: "2 · + the regime boundary",
      why: "Run the rectifier-set-too-high variant on stage 1: the batch passes the limiting current at about 1150 s and the only sign is a conductivity that falls a little slower.  So the regime boundary the unit reports goes on, with the one alarm it earns.",
      panel: p("growth stage 2: + the over-limiting lamp", [E_DILUATE, overLimitingElement(1)], [M_OVERLIMIT, M_END]),
    },
    {
      id: "g3", label: "3 · + the stack rating",
      why: "The same run still shows nothing about the stack running past its 200 A/m2 rating from the first second.  The rating is a limit the record declares and an action exists for it (lower the current), so it earns a bar and an alarm.",
      panel: p("growth stage 3: + the stack rating", [E_DILUATE, overLimitingElement(1), E_CURRENT], [M_OVERLIMIT, M_END]),
    },
  ];
}

/** THE EXERCISE (step 7): the worked panel with five planted defects.  The
 *  key is in DEFECTS; which of them the engine reports is a FACT of the run,
 *  read from the panel block, never asserted by the page. */
export function defectPanel(): PanelSpec {
  return {
    title: "the exercise: a panel with planted defects (step 7)",
    rows: 10,
    elements: [
      E_DILUATE,
      overLimitingElement(1),
      {
        name: "ratioBar", title: "i over i_lim", kind: "bar", cv: "i_over_ilim",
        range: { min: "0", max: "2.5" }, unitNote: "-",
        limit: { high: "1", source: "the limiting current of the unit's own film model", reason: "the over-limiting boundary" },
        alarm: { on: "high", action: OVERLIMIT_ACTION },
        place: { column: 9, row: 5, width: 4, height: 2 },
        reason: "a second view of the limiting current",
      },
      {
        name: "voltage", title: "Stack voltage", kind: "trend", cv: "U_V",
        range: { min: "0", max: "10" }, unitNote: "V",
        limit: { high: "9.5", source: "the page's own choice", reason: "a voltage near the top of the scale" },
        alarm: { on: "high", action: "the voltage is high" },
        place: { column: 9, row: 1, width: 4, height: 2 },
        reason: "at constant current the voltage is the free electrical variable",
      },
      {
        name: "temperature", title: "Rig temperature", kind: "number", cv: "T",
        range: { min: "273.15 K", max: "333.15 K" },
        limit: { high: "330 K", source: "the page's own choice", reason: "a temperature ceiling" },
        alarm: { on: "high", action: "cool the tanks or stop" },
        place: { column: 9, row: 7, width: 4, height: 2 },
        reason: "a temperature belongs on every panel",
      },
      {
        name: "diluatePH", title: "Diluate pH", kind: "number", cv: "pH_dil",
        range: { min: "0", max: "14" }, unitNote: "-",
        place: { column: 1, row: 5, width: 8, height: 2 },
        reason: "water splitting past the limiting current shifts the pH",
      },
      {
        name: "rectifierCurrent", title: "Rectifier current", kind: "bar", cv: "I_A",
        range: { min: "0", max: "5" }, unitNote: "A",
        limit: { high: "4", source: RATING_SOURCE + ", times the cell-pair area 0.02 m2", reason: "the stack rating, as a current" },
        alarm: { on: "high", action: "lower the current set on the rectifier" },
        place: { column: 1, row: 9, width: 6, height: 2 },
        reason: "the operator sets the rectifier in amperes",
      },
      { ...E_CURRENT, place: { column: 7, row: 9, width: 6, height: 2 } },
    ],
    messages: [M_OVERLIMIT, M_END],
  };
}

export interface PlantedDefect {
  id: string;
  title: string;
  where: string;
  /** Which engine fact reveals it, or null when only a person can judge. */
  fact: string | null;
  explanation: string;
}

export const DEFECTS: readonly PlantedDefect[] = [
  { id: "noAction", title: "An alarm that asks for no action", where: "voltage",
    fact: null,
    explanation: "Its action reads \"the voltage is high\": a description of the alarm, not something to do.  The engine refuses an alarm with NO action, but it cannot tell an action from a sentence -- only a person can." },
  { id: "neverApproached", title: "A limit the run never approaches", where: "temperature",
    fact: "neverApproached",
    explanation: "330 K on a rig held at 298.15 K: the limit sits in the far half of its own scale from every written value.  The engine also reports the element as constant." },
  { id: "notPublished", title: "A quantity nobody publishes", where: "diluatePH",
    fact: "notPublished",
    explanation: "The unit publishes no pH.  The engine reports notPublished; a panel that drew a zero here would show a neutral-looking number nobody measured." },
  { id: "sameColumn", title: "Two alarms on one quantity", where: "overLimiting + ratioBar",
    fact: "sameQuantityAlarms",
    explanation: "Both read rig.i_over_ilim with the same limit: one cause, two alarms, every time.  The engine sees this because the column is the same." },
  { id: "sameCause", title: "Two alarms on one cause, through two quantities", where: "rectifierCurrent + currentDensity",
    fact: null,
    explanation: "I_A and i_A_per_m2 are the same quantity divided by the cell-pair area: the two alarms always sound together.  The engine compares columns, not physics, and says in its own gate that it does not detect this -- a person must." },
];

// ---- readers of the answer --------------------------------------------------------

/** True when an engine answer belongs to this request: every element the
 *  page asked for is in the panel block with the column and limit it was
 *  written with, and the run's first written instant carries the variant's
 *  current, efficiency and diluate.  A run that finished after a control
 *  moved answers another question and is not drawn as this one. */
export function answerMatches(
  report: PanelReport | undefined | null,
  traj: { t: number[]; vars: { [k: string]: number[] } } | undefined,
  panel: PanelSpec, variant: PanelVariant,
): boolean {
  if (!report || !traj) return false;
  if (report.elements.length !== panel.elements.length) return false;
  for (const e of panel.elements) {
    const r = report.elements.find((x) => x.name === e.name);
    if (!r || r.column !== `${RIG}.${e.cv}`) return false;
    const high = e.limit?.high !== undefined ? siOf(e.limit.high) : undefined;
    if (high !== undefined && !(r.limitHigh !== undefined && close(r.limitHigh, high))) return false;
  }
  const at0 = (k: string): number | undefined => traj.vars[`${RIG}.${k}`]?.[0];
  const I = at0("I_A"), xi = at0("xi_eff"), nNa = at0("n_Na");
  return I !== undefined && close(I, variant.expect.I_A)
    && xi !== undefined && close(xi, variant.expect.xi_eff)
    && nNa !== undefined && close(nNa, variant.expect.n_Na);
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
}

/** The SI value of a scalar the page wrote (`330 K`, `200`): only the two
 *  forms this page writes, a bare number or a number followed by K or s. */
export function siOf(s: string): number {
  const m = /^\s*(-?[0-9.eE+-]+)\s*(K|s)?\s*$/.exec(s);
  if (!m) throw new Error(`operatorPanels: cannot read the scalar '${s}'`);
  return Number(m[1]);
}

/** The page's own arithmetic on the engine's intervals (labelled `page`
 *  where drawn): the alarm ONSETS -- the start of every interval of every
 *  element -- and the largest number of them inside any window of `window`
 *  seconds.  An onset at t = 0 counts: an alarm active from the first
 *  instant is an alarm the operator meets on arrival. */
export function alarmOnsets(report: PanelReport): { name: string; t: number }[] {
  const out: { name: string; t: number }[] = [];
  for (const e of report.elements) for (const [t0] of e.intervals ?? []) out.push({ name: e.name, t: t0 });
  return out.sort((a, b) => a.t - b.t);
}

export function maxOnsetsInWindow(onsets: readonly { t: number }[], window: number): number {
  let best = 0;
  for (let i = 0; i < onsets.length; i++) {
    let k = 0;
    for (let j = i; j < onsets.length && onsets[j]!.t - onsets[i]!.t < window; j++) k++;
    best = Math.max(best, k);
  }
  return best;
}

/** Is the element in alarm at time t, by the ENGINE's intervals (closed on
 *  the write grid)?  Undefined when the element declares no alarm. */
export function inAlarmAt(e: { intervals?: [number, number][] }, t: number): boolean | undefined {
  if (!e.intervals) return undefined;
  return e.intervals.some(([a, b]) => t >= a - 1e-9 && t <= b + 1e-9);
}

/** The case files the engine is handed: the witness's own files with the
 *  variant's overrides applied and the page's panelDict in place of the
 *  shipped one.  `raw` is the witness's bundled file map. */
export function panelCaseFiles(
  raw: { [rel: string]: string }, variant: PanelVariant, panel: PanelSpec,
): { [rel: string]: string } {
  const out: { [rel: string]: string } = {};
  for (const [rel, body] of Object.entries(raw)) {
    if (rel.endsWith(".cho")) continue;
    if (rel === "expected" || rel.startsWith("log.")) continue;
    out[rel] = body;
  }
  out[`${PANEL_CASE_NAME}.cho`] = "";
  for (const o of variant.overrides) {
    const text = out[o.file];
    if (text === undefined) throw new Error(`operatorPanels: the witness has no ${o.file}`);
    out[o.file] = applyDictOverride(text, o);
  }
  out["system/panelDict"] = panelDictText(panel);
  return out;
}
