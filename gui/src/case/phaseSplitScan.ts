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
  phaseSplitScan — the Explorer's PHASE-SPLIT lens: the case it builds, and
  the reading of the engine's answer (DEV.md 4c C118, stage 2).  Pure: no
  React, no physics.

  WHAT THE ENGINE DOES (stage 1, src/propertyOps/PhaseSplitScan.{H,cpp}).
  At ONE fixed overall composition it sweeps T at fixed P (or P at fixed T)
  and at every grid point solves the full phase split through the flash
  unit's own solver -- V, L1, L2, every crystallising solid a record
  declares, the speciation and pH where the package speciates -- and
  publishes a `phaseSplitScans` result block: per point the amount of every
  phase present (mol per mol of feed), each phase's composition, the flash's
  observables (pH among them), and a refused point BY NAME; the appearance /
  disappearance EVENTS between consecutive points; the record-level
  announcements at the first point that raised each; what is not modelled.

  WHAT THIS MODULE DOES.  Two things and nothing else:

    phaseSplitPlan()        builds the ONE choupoProps case: a propsDict with
                            one `phaseSplitScan` op and the thermophysical
                            system it runs under -- either SYNTHESISED from
                            the student's choice (an activity model, and a
                            crystallising solid for each component whose
                            record can carry one) or the OPEN CASE's own
                            `constant/` tree, verbatim, which is how a
                            speciating package (pH, precipitates) reaches the
                            lens: a case that declares the chemistry.
    the series readers      turn the result block -- typed by
                            adapters/phaseSplitPayload.ts, which the adapter
                            calls -- into what the figure draws.

  THE CONTRACT (the GUI draws, the engine decides).  No equilibrium, no
  activity, no pH and no phase boundary is computed here.  The composition
  is sent AS TYPED (moles) and the engine normalises it and says so; a
  refused point is a GAP in every series (null), never a zero and never a
  neighbour's value; a phase boundary is the engine's event, drawn as the
  INTERVAL between the two grid values it lies between, never a point the
  GUI interpolated inside it.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import { parse, toJson } from "../dict/index.js";
import { mixtureShadowedBodies, rawRecordFor } from "./catalogue.js";
import type {
  PhaseSplitAnnouncement, PhaseSplitEvent, PhaseSplitScanBlock,
} from "../adapters/phaseSplitPayload.js";

export {
  shapePhaseSplitScans, type PhaseSplitAnnouncement, type PhaseSplitEvent,
  type PhaseSplitPointResult, type PhaseSplitScanBlock,
} from "../adapters/phaseSplitPayload.js";

/** The Explorer Guide section that explains this lens (a real `\label` in
 *  docs/explorerGuide.tex; tests/phaseSplitScan.test.ts holds the two
 *  together). */
export const EXPLORER_GUIDE_PHASE_SPLIT = "sec:explorer-phase-split";

/** The CSV the op writes (its own `output { file }`). */
export const PHASE_SPLIT_OUTPUT = "phaseSplit.csv";

/** The flash unit's own phase-set words (IsothermalFlash::readOptions). */
export const PHASE_SETS = ["VL", "LL", "VLLE", "auto"] as const;
export type PhaseSetWord = (typeof PHASE_SETS)[number];

/** The activity models the lens offers on the synthesised route -- the same
 *  four the rest of the Explorer offers. */
export const PHASE_SPLIT_ACTIVITY = ["ideal", "NRTL", "Wilson", "UNIFAC"] as const;

export type PhaseSplitThermo =
  | { source: "synth"; activityModel: string; solids: string[] }
  | { source: "case" };

export interface PhaseSplitSpec {
  /** The components the feed is over (the Explorer's set, in its order). */
  components: string[];
  /** The overall composition IN MOLES, as the student typed it.  Sent as
   *  typed: the engine normalises it and says so when it did not sum to 1. */
  amounts: { [component: string]: number };
  /** The swept axis. */
  variable: "T" | "P";
  /** The held axis's value, canonical SI (Pa when T is swept, K when P is). */
  held: number;
  /** The swept range, canonical SI (K or Pa), and the number of points. */
  from: number;
  to: number;
  n: number;
  phaseSet: PhaseSetWord;
  thermo: PhaseSplitThermo;
  /** Case-local component records (constant/components/<name>.dat). */
  componentFiles?: { [relPath: string]: string };
  /** The open case's raw files; read only on the `case` route. */
  caseRaw?: { [relPath: string]: string };
}

export interface PhaseSplitPlan {
  /** The case the engine runs; absent when there is nothing to ask. */
  files?: CaseFiles;
  /** Why nothing is asked (no run is started).  Only the absences this
   *  module can see WITHOUT physics; everything else is the engine's. */
  nothingToAsk?: string;
}

/** The name the synthesised route gives a component's crystal.  One rule for
 *  every component, never a name chosen by recognising water. */
export const solidPhaseName = (component: string): string => `solid_${component}`;

const positive = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === "string") {
    const x = Number.parseFloat(v);
    return Number.isFinite(x) && x > 0 ? x : null;
  }
  return null;
};

/** What a component's record DECLARES for a crystal: the enthalpy of fusion
 *  (`sublimation { Hfus; }`) and the fusion temperature (`triplePoint { T;
 *  }`) -- the two the engine's SolidPhase requires and refuses by name
 *  without (src/thermo/phase/SolidPhase.cpp).  Read STRUCTURALLY from the
 *  record (a case-local record first, then the shared catalogue), so the lens
 *  offers a crystal only where the engine could form one; the engine still
 *  has the last word and its refusal is shown verbatim. */
export function crystalDataOf(name: string,
                              componentFiles?: { [relPath: string]: string }):
  { Hfus: number | null; tripleT: number | null; missing: string[] } {
  const raw = componentFiles?.[`constant/components/${name}.dat`] ?? rawRecordFor(name);
  let j: JsonDict | null = null;
  if (raw) { try { j = toJson(parse(raw)); } catch { j = null; } }
  const sub = j && typeof j.sublimation === "object" && j.sublimation !== null
    ? j.sublimation as JsonDict : null;
  const tp = j && typeof j.triplePoint === "object" && j.triplePoint !== null
    ? j.triplePoint as JsonDict : null;
  const Hfus = sub ? positive(sub.Hfus) : null;
  const tripleT = tp ? positive(tp.T) : null;
  const missing: string[] = [];
  if (Hfus === null) missing.push("an enthalpy of fusion (`sublimation { Hfus; }`)");
  if (tripleT === null) missing.push("a fusion temperature (`triplePoint { T; }`)");
  return { Hfus, tripleT, missing };
}

/** The component list of the open case's thermophysical system, or null when
 *  the open case declares none (or it cannot be read). */
export function caseThermoComponents(caseRaw?: { [relPath: string]: string }): string[] | null {
  const body = caseRaw?.["constant/thermoPhysPropDict"];
  if (!body) return null;
  try {
    const j = toJson(parse(body));
    return Array.isArray(j.components) ? (j.components as unknown[]).map(String) : null;
  } catch { return null; }
}

/** The `case` route applies when the open case declares a thermophysical
 *  system whose components include every selected one. */
export function caseRouteApplies(sel: string[], caseRaw?: { [relPath: string]: string }): boolean {
  const comps = caseThermoComponents(caseRaw);
  return !!comps && sel.length > 0 && sel.every((c) => comps.includes(c));
}

/** The synthesised thermophysical system.  Without a crystal: one liquid
 *  under the chosen activity model and an ideal-gas vapour (the evidence
 *  view's package).  With one or more crystals: the C3 uniform `phases ( )`
 *  declaration flash21 and the stage-1 witness run under -- one liquid and
 *  each crystallising solid, NO vapour, because the engine does not yet
 *  solve a solid beside a vapour (the named S4c gap). */
export function synthThermo(components: string[], activityModel: string,
                            solids: string[], phaseSet: PhaseSetWord = "VL"): JsonDict {
  const liquid: JsonDict = { activityModel: { model: activityModel } };
  const present = solids.filter((s) => components.includes(s));
  //  A phase set that can split the liquid needs TWO liquids declared (the
  //  flash refuses an LL flash over one, by name); both share the one model,
  //  as every two-liquid package must (the T-x-y stability probe's form).
  if (present.length === 0 && phaseSet !== "VL")
    return {
      recordType: "thermophysicalPropertySystem",
      schemaVersion: 2,
      components: [...components],
      equilibrium: {
        formulation: "gammaGamma",
        liquidPhases: [
          { name: "liquid1", activityModel: { model: activityModel } },
          { name: "liquid2", activityModel: { model: activityModel } },
        ],
        vapour: { fugacityModel: "idealGas" },
      },
    };
  if (present.length === 0)
    return {
      recordType: "thermophysicalPropertySystem",
      schemaVersion: 2,
      components: [...components],
      equilibrium: {
        formulation: "gammaPhi",
        liquid: { ...liquid, standardState: "pureLiquid" },
        vapour: { fugacityModel: "idealGas" },
      },
    };
  return {
    recordType: "thermophysicalPropertySystem",
    schemaVersion: 2,
    components: [...components],
    equilibrium: {
      formulation: "gammaGamma",
      liquid,
      phases: [
        { name: "liquid", type: "liquid" },
        ...present.map((c) => ({ name: solidPhaseName(c), type: "solid", component: c, mode: "crystallizing" })),
      ],
    },
  };
}

export function phaseSplitPlan(spec: PhaseSplitSpec): PhaseSplitPlan {
  if (spec.components.length === 0)
    return { nothingToAsk: "Pick at least one component: a phase split is a property of a feed." };
  const n = Math.max(2, Math.round(spec.n));
  const heldName = spec.variable === "T" ? "P" : "T";
  //  Every component of the set is written, zeros included: an empty block
  //  and a block of zeros are the same feed to the engine, and it refuses
  //  both by name ("empty or sums to zero").
  const composition: JsonDict = {};
  for (const c of spec.components) {
    const v = spec.amounts[c];
    composition[c] = typeof v === "number" && Number.isFinite(v) ? v : 0;
  }
  const op: JsonDict = {
    name: "phaseSplit",
    type: "phaseSplitScan",
    state: { [heldName]: spec.held, composition },
    vary: { variable: spec.variable, from: spec.from, to: spec.to, n },
    output: { file: PHASE_SPLIT_OUTPUT },
  };
  //  The phase set is the flash's own word; with a crystal declared the
  //  engine dispatches to its LIQUID+SOLID branch and the word is not sent
  //  (a default that is not asked about is not a choice the student made).
  const synthSolids = spec.thermo.source === "synth"
    ? spec.thermo.solids.filter((s) => spec.components.includes(s)) : [];
  if (synthSolids.length === 0) op.phaseSet = spec.phaseSet;

  const controlDict: JsonDict = {
    application: "choupoProps",
    description: `Property Explorer -- phase split along ${spec.variable} (ephemeral)`,
    //  verbosity 2 is LOAD-BEARING: the normalisation sentence and the
    //  per-point table are printed at >= 1 / >= 2 and reach no other surface.
    verbosity: 2,
  };

  if (spec.thermo.source === "case") {
    //  The open case's own thermophysical system, travelling exactly as a
    //  real case travels (its authored text verbatim under constant/), so a
    //  speciating package, its chemistry and its sealed records reach the
    //  scan unchanged.  The structured thermoPackage stays EMPTY so the
    //  adapter writes no second thermoPhysPropDict over the authored one.
    const extra: { [rel: string]: string } = {};
    for (const [rel, body] of Object.entries(spec.caseRaw ?? {}))
      if (rel.startsWith("constant/")) extra[rel] = body;
    if (!extra["constant/thermoPhysPropDict"])
      return { nothingToAsk: "The open case declares no constant/thermoPhysPropDict, so it has no thermophysical system to scan under." };
    return {
      files: { propsDict: { operations: [op] }, thermoPackage: {}, controlDict, extraFiles: extra },
    };
  }

  const files: CaseFiles = {
    propsDict: { operations: [op] },
    thermoPackage: synthThermo(spec.components, spec.thermo.activityModel, synthSolids, spec.phaseSet),
    controlDict,
  };
  const extra = { ...mixtureShadowedBodies(spec.components), ...(spec.componentFiles ?? {}) };
  if (Object.keys(extra).length > 0) files.extraFiles = extra;
  return { files };
}

// ---- what the figure draws ---------------------------------------------

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A phase's display name: its symbol, with the package's own name beside it
 *  where the package gives one (`L1 (liquor)`). */
export function phaseDisplayName(block: PhaseSplitScanBlock, name: string): string {
  const label = block.phaseLabels[name];
  return label && label !== name ? `${name} (${label})` : name;
}

/** The stacked-area series: per phase, its amount (mol per mol of feed) at
 *  every point -- 0 where the point solved and the phase is ABSENT (a fact:
 *  the phase is not there), null where the point was REFUSED (a gap: the
 *  engine did not answer, and nothing is drawn in its place). */
export function phaseAmountSeries(block: PhaseSplitScanBlock):
  { x: number[]; series: { name: string; y: (number | null)[] }[] } {
  const x = block.points.map((p) => p.at);
  const series = block.phaseNames.map((name) => ({
    name,
    y: block.points.map((p) => (!p.solved ? null : p.phases[name]?.amount ?? 0)),
  }));
  return { x, series };
}

/** pH at every point, or null where the engine published none (a refused
 *  point, or a package that does not speciate).  `has` is false when no
 *  point carries a pH -- the lens then draws no pH panel at all and says
 *  why, rather than an empty axis. */
export function phSeries(block: PhaseSplitScanBlock): { x: number[]; y: (number | null)[]; has: boolean } {
  const y = block.points.map((p) => (p.solved && fin(p.observables.pH) ? p.observables.pH! : null));
  return { x: block.points.map((p) => p.at), y, has: y.some((v) => v !== null) };
}

/** One phase's composition, per component: the mole fraction at every point
 *  where the phase is present, null elsewhere (absent or refused) -- a
 *  phase that is not there has no composition, and a line drawn through its
 *  absence would invent one. */
export function phaseCompositionSeries(block: PhaseSplitScanBlock, phase: string):
  { x: number[]; series: { component: string; y: (number | null)[] }[] } {
  const comps = Object.keys(block.feed);
  return {
    x: block.points.map((p) => p.at),
    series: comps.map((c) => ({
      component: c,
      y: block.points.map((p) => {
        const ph = p.solved ? p.phases[phase] : undefined;
        return ph && fin(ph.x[c]) ? ph.x[c]! : null;
      }),
    })),
  };
}

/** The phases that are present at one or more solved points (the
 *  composition selector offers only these). */
export function phasesEverPresent(block: PhaseSplitScanBlock): string[] {
  return block.phaseNames.filter((n) => block.points.some((p) => p.solved && p.phases[n] !== undefined));
}

/** The refused points, each with the engine's own reason, in sweep order. */
export function refusedPoints(block: PhaseSplitScanBlock): { at: number; reason: string }[] {
  return block.points.filter((p) => !p.solved).map((p) => ({ at: p.at, reason: p.reason ?? "(no reason published)" }));
}

/** Every record-level announcement, with the swept value of the point that
 *  first raised it, in sweep order. */
export function announcements(block: PhaseSplitScanBlock): (PhaseSplitAnnouncement & { at: number })[] {
  const out: (PhaseSplitAnnouncement & { at: number })[] = [];
  for (const p of block.points) for (const a of p.firstRaised) out.push({ ...a, at: p.at });
  return out;
}

/** The sentence an event reads as, its interval in the units the caller
 *  formats.  The words are the engine's (`appears`, `disappears`); the
 *  interval is the two grid values, never a value inside it. */
export function eventSentence(block: PhaseSplitScanBlock, e: PhaseSplitEvent,
                              fmt: (v: number) => string): string {
  const what = e.kind === "phaseSet"
    ? `the phase set changes to ${e.phase}`
    : `${phaseDisplayName(block, e.phase)} ${e.kind}`;
  return `${what} between ${block.variable} = ${fmt(e.from)} and ${fmt(e.to)}`
    + (e.acrossRefused ? " (across a refused point)" : "");
}

/** The console lines the op printed with its own tag (`[phaseSplitScan]`):
 *  the normalisation of the feed among them.  Read VERBATIM from the log --
 *  the lens shows the engine's words and writes none of its own. */
export function scanConsoleNotes(log: string): string[] {
  return log.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("[phaseSplitScan]"))
    .map((l) => l.replace(/^\[phaseSplitScan\]\s*/, ""))
    //  the per-event and first-raised lines are drawn from the block itself
    .filter((l) => !/^(phase '|phase set changed|first raised at)/.test(l));
}
