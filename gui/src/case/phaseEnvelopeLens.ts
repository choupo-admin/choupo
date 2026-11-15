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
  phaseEnvelopeLens — the Explorer's MIXTURE P-T ENVELOPE lens: the case it
  builds, and the reading of the engine's answer (2026-11-15).  Pure: no
  React, no physics.

  WHAT THE ENGINE DOES (src/propertyOps/PhaseEnvelope.{H,cpp}).  For ONE feed
  it marches pressure and, at each pressure, solves the bubble temperature
  (BubblePoint::compute) and the dew temperature (DewPoint::compute) -- the
  same routines the `bubbleT` and `dewT` units call.  It keeps a point only
  when it is continuous with its branch, and it ENDS a branch where its
  specification stops being single-valued or the solve lands on another
  root.  It writes `P_Pa,T_K,curve` and publishes, per branch, the number of
  points, the pressure at which it stopped (only when it stopped), a
  cricondentherm (only when an INTERIOR maximum brackets one), and a
  sentence on the advisory log saying where the branch stopped and why.  It
  does NOT close the nose (Michelsen's continuation is not implemented), and
  it says so on every run.

  WHAT THIS MODULE DOES.

    envelopePlan()     builds the ONE choupoProps case: a propsDict with one
                       `phaseEnvelope` op and a gamma-phi system whose vapour
                       is a cubic equation of state -- the frame of the two
                       corpus witnesses envelope01 and envelope02.  It refuses
                       to ask (no run) only for what it can see WITHOUT
                       physics: an ideal-gas vapour, a feed with fewer than two
                       components present, a range that is not a range.
    readEnvelopeCsv()  the two branches as the engine wrote them.
    envelopeReport()   per branch: how it ended -- reached the top of the
                       range, STOPPED (and at what pressure), or NEVER STARTED
                       -- decided from the published diagnostics, and the
                       engine's OWN sentence for it; the method statement; the
                       other announcements of the run.

  THE CONTRACT (the GUI draws, the engine decides).  No bubble or dew point,
  no turning point and no cricondentherm is computed here.  A stopped branch
  ends where the engine's last kept point is, and the report names the stop
  beside the figure: the figure never joins the two branches, so an open nose
  is never drawn closed.
\*---------------------------------------------------------------------------*/

import type { CaseFiles } from "./types.js";
import type { JsonDict } from "../dict/index.js";
import { mixtureShadowedBodies } from "./catalogue.js";
import type { Advisory, OperationResult } from "../adapters/SolverAdapter.js";

/** The Explorer Guide section that explains this lens (a real `\label` in
 *  docs/explorerGuide.tex; tests/phaseEnvelopeLens.test.ts holds the two
 *  together). */
export const EXPLORER_GUIDE_ENVELOPE = "sec:explorer-envelope";

/** The CSV the op writes (its own `output { file }`). */
export const ENVELOPE_OUTPUT = "envelope.csv";

/** The CSV of the liquid-stability probe (a binary feed, a non-ideal liquid). */
export const ENVELOPE_PROBE_OUTPUT = "liquidProbe.csv";

/** The liquid activity models, the same four the T-x-y lens offers (EX-02). */
export const ENVELOPE_ACTIVITY = ["ideal", "NRTL", "Wilson", "UNIFAC"] as const;

/** What the figure may say about a second liquid (EX-02):
 *   - `idealCannotSplit`: an ideal solution has gamma = 1 and cannot split;
 *   - `probed`: a binary on a non-ideal model, so the T-x-y's own
 *     `liquid_stable` probe runs at every pressure, at the feed's bubble
 *     temperature, and a split is FLAGGED;
 *   - `notProbed`: three or more components on a non-ideal model -- the probe
 *     the engine has is binary-only (PropertyEvaluator.cpp `liquid_stable`),
 *     so one liquid is assumed and NOT checked, and the figure says so. */
export type LiquidCheck = "idealCannotSplit" | "probed" | "notProbed";

/** The vapour models the lens offers: the Explorer's own EoS words.  An
 *  ideal-gas vapour is offered too, and refused with its reason, so the
 *  student SEES why it cannot make the diagram rather than missing an
 *  option. */
export const ENVELOPE_EOS = ["PR", "SRK", "idealGas"] as const;
export type EnvelopeEos = (typeof ENVELOPE_EOS)[number];

/** Why a vapour model cannot make this diagram, or null when it can. */
export function envelopeModelWhy(eos: string): string | null {
  if (eos === "PR" || eos === "SRK") return null;
  return "An ideal-gas vapour has no non-ideality at pressure: the dew curve it draws keeps "
    + "rising with P and the cricondentherm and the retrograde region -- the features this "
    + "diagram is drawn to find -- never form.  Pick a cubic equation of state (PR or SRK) "
    + "for the vapour.";
}

export interface EnvelopeSpec {
  /** The components of the feed (the Explorer's set, in its order). */
  components: string[];
  /** The feed IN MOLES, as typed.  Sent as typed: the engine normalises it
   *  and says so when it does not sum to 1. */
  amounts: { [component: string]: number };
  /** The vapour model (ENVELOPE_EOS). */
  eos: string;
  /** The liquid activity model (ENVELOPE_ACTIVITY).  NRTL and Wilson resolve
   *  curated pairs by name, as on the T-x-y; UNIFAC reads the groups from the
   *  component records.  Absent = ideal. */
  activity?: string;
  /** The marched pressure range, canonical SI (Pa), and the number of
   *  pressures. */
  Pfrom: number;
  Pto: number;
  n: number;
  /** Case-local component records (constant/components/<name>.dat). */
  componentFiles?: { [relPath: string]: string };
}

export interface EnvelopePlan {
  files?: CaseFiles;
  /** What the figure may say about a second liquid (when files exist). */
  liquidCheck?: LiquidCheck;
  /** Why nothing is asked (no run is started). */
  nothingToAsk?: string;
}

export function envelopePlan(spec: EnvelopeSpec): EnvelopePlan {
  const modelWhy = envelopeModelWhy(spec.eos);
  if (modelWhy) return { nothingToAsk: modelWhy };
  const present = spec.components.filter((c) => (spec.amounts[c] ?? 0) > 0);
  if (present.length < 2)
    return { nothingToAsk: "An envelope belongs to a MIXTURE: give at least two components a "
      + "positive amount.  One compound alone has a coexistence LINE, which the pure phase "
      + "diagram (P-T) lens draws." };
  if (!(spec.Pto > spec.Pfrom) || !(spec.Pfrom > 0) || !(spec.n >= 2))
    return { nothingToAsk: "The pressure range must run upwards from a positive pressure, with at "
      + "least two points." };

  //  The feed: only the components present, as typed (the engine reads
  //  `composition {}` by name and normalises).  The thermophysical system
  //  still carries every selected component, so a zero is a zero.
  const composition: JsonDict = {};
  for (const c of present) composition[c] = spec.amounts[c]!;
  const activity = spec.activity ?? "ideal";
  const nP = Math.max(2, Math.round(spec.n));
  const liquidCheck: LiquidCheck = activity === "ideal" ? "idealCannotSplit"
    : present.length === 2 ? "probed" : "notProbed";
  const operations: JsonDict[] = [{
    name: "envelope",
    type: "phaseEnvelope",
    composition,
    // raw scalars = canonical SI (Pa), like every synthesized value
    pressure: { from: spec.Pfrom, to: spec.Pto, n: nP },
    output: { file: ENVELOPE_OUTPUT },
  }];
  if (liquidCheck === "probed") {
    //  THE T-x-y's OWN PROBE, on the envelope's pressure grid: `liquid_stable`
    //  solves the feed's bubble temperature at each P and runs the LL flash
    //  there (1 = one liquid, 0 = two).  The evaluator takes the state's mole
    //  fractions as given, so the feed is scaled to sum to one here -- a
    //  rescaling of the typed moles, no physics.  The state T is unused by
    //  the probe (it solves its own bubble temperature).
    const tot = present.reduce((a, c) => a + spec.amounts[c]!, 0);
    const x: JsonDict = {};
    for (const c of present) x[c] = spec.amounts[c]! / tot;
    operations.push({
      name: "liquidProbe",
      type: "propertyScan1D",
      vary: { variable: "P", from: spec.Pfrom, to: spec.Pto, n: nP },
      state: { T: 300, composition: x },
      properties: ["liquid_stable"],
      output: { file: ENVELOPE_PROBE_OUTPUT },
    });
  }
  const propsDict: JsonDict = { operations };
  //  The frame of the corpus witnesses (tutorials/props/molecular/envelope01,
  //  envelope02): an ideal liquid on the pure-liquid reference and a CUBIC
  //  vapour.  The liquid reference carries phi_sat and Poynting (DEV.md 4c
  //  C235) and is held continuous above 0.99 Tc (C239) -- the engine
  //  announces both where they bite.
  //  With a non-ideal liquid on a BINARY the package carries two liquid
  //  phases (the T-x-y's own two-liquid package, with the cubic vapour), so
  //  the probe's LL flash can fire; the envelope op's bubble and dew solves
  //  read the same single-liquid K either way (measured 2026-11-15:
  //  water + benzene on UNIFAC + PR, the two packages write a byte-identical
  //  envelope.csv), so the two-liquid package changes no point drawn.
  const thermoPackage: JsonDict = liquidCheck === "probed"
    ? {
        recordType: "thermophysicalPropertySystem",
        schemaVersion: 2,
        components: [...spec.components],
        equilibrium: {
          formulation: "gammaGamma",
          liquidPhases: [
            { name: "liquid1", activityModel: { model: activity } },
            { name: "liquid2", activityModel: { model: activity } },
          ],
          vapour: { fugacityModel: spec.eos },
        },
      }
    : {
        recordType: "thermophysicalPropertySystem",
        schemaVersion: 2,
        components: [...spec.components],
        equilibrium: {
          formulation: "gammaPhi",
          liquid: { activityModel: { model: activity }, standardState: "pureLiquid" },
          vapour: { fugacityModel: spec.eos },
        },
      };
  const controlDict: JsonDict = {
    application: "choupoProps",
    description: "Property Explorer -- mixture P-T phase envelope (ephemeral)",
    verbosity: 2,
  };
  const files: CaseFiles = { propsDict, thermoPackage, controlDict };
  const extra = { ...mixtureShadowedBodies(spec.components), ...(spec.componentFiles ?? {}) };
  if (Object.keys(extra).length > 0) files.extraFiles = extra;
  return { files, liquidCheck };
}

/** The warning the T-x-y lens gives when the chosen model cannot be the
 *  real system (EX-02: "the same pair resolution and the same ideal-mixing
 *  warning"), generalised to every pair of the feed.  `hasPair` and
 *  `hasGroups` are the catalogue's answers, passed in so this stays pure. */
export function activityWarning(activity: string, components: string[],
  hasPair: (model: string, a: string, b: string) => boolean,
  hasGroups: (c: string) => boolean): string | null {
  if (activity === "NRTL" || activity === "Wilson") {
    const missing: string[] = [];
    for (let i = 0; i < components.length; ++i)
      for (let j = i + 1; j < components.length; ++j)
        if (!hasPair(activity, components[i]!, components[j]!)) missing.push(`${components[i]}–${components[j]}`);
    return missing.length === 0 ? null
      : `No curated ${activity} pair covers ${missing.join(", ")}, so ${missing.length === 1 ? "that pair mixes" : "those pairs mix"} `
        + "IDEALLY — it cannot show an azeotrope or a liquid-liquid split.  Switch to UNIFAC (predictive, "
        + `from the components' groups), or curate a ${activity} pair for this system.`;
  }
  if (activity === "UNIFAC") {
    const missing = components.filter((c) => !hasGroups(c));
    return missing.length === 0 ? null
      : `UNIFAC groups missing for ${missing.join(", ")}: treated as ideal there.`;
  }
  return null;
}

/** The probe's rows as the engine wrote them (`P,liquid_stable`): stable is
 *  true for one liquid, false for a split, null where the engine answered
 *  nothing. */
export function readProbeCsv(csv: string): { P: number; stable: boolean | null }[] {
  const lines = csv.trim().split(/\r?\n/);
  const head = (lines[0] ?? "").split(",").map((h) => h.trim());
  const iS = head.indexOf("liquid_stable");
  if (iS < 0) return [];
  return lines.slice(1).filter((l) => l.trim()).map((l) => {
    const c = l.split(",");
    const v = Number(c[iS]);
    return { P: Number(c[0]), stable: Number.isFinite(v) ? v !== 0 : null };
  });
}

/** The pressures [Pa] at which the probe found the feed SPLITTING at its
 *  bubble point. */
export function splitPressures(probe: { P: number; stable: boolean | null }[]): number[] {
  return probe.filter((r) => r.stable === false).map((r) => r.P);
}

/** The sentence the FIGURE carries about a second liquid (EX-02: "the
 *  one-liquid assumption is stated on the figure"). */
export function liquidStatement(check: LiquidCheck, split: number, probed: number): string {
  if (check === "idealCannotSplit")
    return "One liquid: an ideal solution (gamma = 1) cannot split into two.";
  if (check === "notProbed")
    return "One liquid ASSUMED, not checked: the engine's liquid-stability probe is binary-only, "
      + "so a second liquid would be drawn through.";
  return split > 0
    ? `Two liquids at the bubble point at ${split} of ${probed} pressures (the T-x-y's own probe): `
      + "the single-liquid bubble curve is NOT drawn there (hollow x marks it as a phantom); "
      + "the dew curve is not probed."
    : `One liquid at the bubble point at all ${probed} pressures probed (the T-x-y's own probe); `
      + "the dew curve is not probed.";
}

/** A trace of the envelope figure (plain data, so a test can read it). */
export interface EnvelopeTrace { [k: string]: unknown;
  name: string; x: (number | null)[]; y: (number | null)[]; role: string }

/** THE FIGURE, as data (EX-03): built here and not inside the component, so a
 *  test holds its two promises -- the branches are NEVER joined (no trace
 *  carries points of both), and a star appears ONLY where the engine
 *  reported a cricondentherm.  `tx`/`px` convert to display units; colours
 *  are the caller's. */
export function envelopeTraces(args: {
  csv: string;
  report: EnvelopeReport;
  splitAt?: number[];
  tx: (K: number) => number;
  px: (Pa: number) => number;
  colours: { bubble: string; dew: string; text: string; phantom: string };
  tUnit: string; pUnit: string;
}): EnvelopeTrace[] {
  const { csv, report, tx, px, colours, tUnit, pUnit } = args;
  const { bubble, dew } = readEnvelopeCsv(csv);
  const near = (P: number, list: number[]) => list.some((q) => Math.abs(q - P) <= 1e-6 * Math.max(1, Math.abs(P)));
  const split = args.splitAt ?? [];
  const traces: EnvelopeTrace[] = [];
  //  The bubble curve, with a GAP (null) wherever the probe found two liquids:
  //  a single-liquid bubble point there is a phantom and is not joined to its
  //  neighbours.
  if (bubble.length) {
    const xs: (number | null)[] = [], ys: (number | null)[] = [];
    for (const p of bubble) {
      if (near(p.P, split)) { xs.push(null); ys.push(null); }
      else { xs.push(tx(p.T)); ys.push(px(p.P)); }
    }
    traces.push({ role: "bubble", type: "scatter", mode: "lines+markers", name: "bubble curve (V/F → 0)",
      x: xs, y: ys, connectgaps: false,
      line: { color: colours.bubble, width: 2.4 }, marker: { size: 4, color: colours.bubble },
      hovertemplate: `T = %{x:.2f} ${tUnit}<br>P = %{y:.4g} ${pUnit}<extra>bubble</extra>` });
    const ph = bubble.filter((p) => near(p.P, split));
    if (ph.length) traces.push({ role: "phantom", type: "scatter", mode: "markers",
      name: "single-liquid bubble point where the feed splits (phantom)",
      x: ph.map((p) => tx(p.T)), y: ph.map((p) => px(p.P)),
      marker: { symbol: "x-thin-open", size: 9, line: { width: 2 }, color: colours.phantom },
      hovertemplate: `two liquids at the bubble point here: this single-liquid point is a phantom<extra></extra>` });
  }
  if (dew.length) traces.push({ role: "dew", type: "scatter", mode: "lines+markers", name: "dew curve (V/F → 1)",
    x: dew.map((p) => tx(p.T)), y: dew.map((p) => px(p.P)),
    line: { color: colours.dew, width: 2.4 }, marker: { size: 4, color: colours.dew },
    hovertemplate: `T = %{x:.2f} ${tUnit}<br>P = %{y:.4g} ${pUnit}<extra>dew</extra>` });
  //  WHERE A BRANCH STOPPED: its last kept point, hollow, on its own.
  for (const b of report.branches) {
    if (b.end !== "stopped") continue;
    const last = (b.branch === "bubble" ? bubble : dew).at(-1);
    if (!last) continue;
    traces.push({ role: "stop", type: "scatter", mode: "markers+text", name: `${b.branch} branch stopped`,
      x: [tx(last.T)], y: [px(last.P)], text: [`${b.branch} stopped`], textposition: "middle left",
      marker: { symbol: "circle-open", size: 13, line: { width: 2 },
                color: b.branch === "bubble" ? colours.bubble : colours.dew },
      hovertemplate: `${b.branch} branch STOPPED at ${b.stoppedBar?.toFixed(3)} bar<br>last kept point; `
        + `a stopping point of the method, not an extremum<extra></extra>` });
  }
  //  A CRICONDENTHERM ONLY WHERE THE ENGINE REPORTED ONE, at the kept point
  //  of that temperature.  No cricondenbar is ever marked.
  for (const b of report.branches) {
    if (b.cricondenthermK === undefined) continue;
    const pts = b.branch === "bubble" ? bubble : dew;
    const at = pts.reduce<EnvelopePoint | null>((best, p) =>
      (!best || Math.abs(p.T - b.cricondenthermK!) < Math.abs(best.T - b.cricondenthermK!) ? p : best), null);
    if (!at) continue;
    traces.push({ role: "cricondentherm", type: "scatter", mode: "markers",
      name: "cricondentherm (bracketed, as reported)",
      x: [tx(b.cricondenthermK)], y: [px(at.P)],
      marker: { symbol: "star", size: 14, color: colours.text },
      hovertemplate: `cricondentherm on the ${b.branch} branch, as the engine reported it (bracketed, not refined)<extra></extra>` });
  }
  return traces;
}

export interface EnvelopePoint { P: number; T: number }

/** The two branches as the engine wrote them (`P_Pa,T_K,curve`), in the
 *  engine's order (rising pressure).  Nothing is sorted, joined or filled. */
export function readEnvelopeCsv(csv: string): { bubble: EnvelopePoint[]; dew: EnvelopePoint[] } {
  const out = { bubble: [] as EnvelopePoint[], dew: [] as EnvelopePoint[] };
  const lines = csv.trim().split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const P = Number(c[0]), T = Number(c[1]), curve = (c[2] ?? "").trim();
    if (!Number.isFinite(P) || !Number.isFinite(T)) continue;
    if (curve === "bubble") out.bubble.push({ P, T });
    else if (curve === "dew") out.dew.push({ P, T });
  }
  return out;
}

export type BranchEnd = "ranOut" | "stopped" | "neverStarted";

export interface BranchReport {
  branch: "bubble" | "dew";
  points: number;
  /** How the branch ended -- from the DIAGNOSTICS, never from the words. */
  end: BranchEnd;
  /** The first pressure that failed [bar] (the engine's `*_stopped_bar`),
   *  when the branch stopped. */
  stoppedBar?: number;
  /** A LATE START (EX-01): the pressure [bar] at which the branch first
   *  converged, and how many pressures below it were tried and failed --
   *  only when the engine published `*_first_bar`. */
  startedBar?: number;
  failedBefore?: number;
  /** The engine's own sentence about the late start. */
  startSentence: string | null;
  /** A cricondentherm [K] on this branch, ONLY when the engine published one
   *  (an interior maximum it bracketed). */
  cricondenthermK?: number;
  /** The engine's own sentence about how this branch ended. */
  sentence: string | null;
  /** The engine's own sentence about the cricondentherm, when it gave one. */
  cricondenthermSentence: string | null;
}

export interface EnvelopeReport {
  branches: BranchReport[];
  /** The method statement the op prints on EVERY run ("This trace does NOT
   *  close the nose..."). */
  method: string | null;
  /** Every other announcement of the run, in the engine's words (the kij
   *  default, the held liquid reference, a cubic pseudo-root, a normalised
   *  feed), deduplicated.  A solver-path ("trial") advisory is left out: it
   *  describes how a state was reached, never a number on the figure. */
  notes: string[];
}

/** One paragraph of the op's console report: the line that starts with
 *  `start` (after its indentation) and the indented lines that continue it,
 *  joined.  Reads the engine's words; adds none. */
export function logParagraph(log: string, start: string | RegExp): string | null {
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; ++i) {
    const t = lines[i]!.trim();
    const hit = typeof start === "string" ? t.startsWith(start) : start.test(t);
    if (!hit) continue;
    const parts = [t];
    for (let j = i + 1; j < lines.length; ++j) {
      const u = lines[j]!;
      if (u.trim() === "" || !/^\s{4,}/.test(u)) break;
      parts.push(u.trim());
    }
    return parts.join(" ");
  }
  return null;
}

export function envelopeReport(
  op: OperationResult | undefined,
  advisories: (Advisory & { status?: string })[] | undefined,
  log: string,
): EnvelopeReport {
  const d = op?.diagnostics ?? {};
  const adv = advisories ?? [];
  const branches: BranchReport[] = (["bubble", "dew"] as const).map((b) => {
    const points = Math.round(d[`${b}_points`] ?? 0);
    const stopped = d[`${b}_stopped_bar`];
    const end: BranchEnd = points === 0 ? "neverStarted"
      : stopped !== undefined ? "stopped" : "ranOut";
    const own = adv.find((a) => a.locus === `phaseEnvelope ${b}`)?.message ?? null;
    const sentence = end === "ranOut"
      ? logParagraph(log, `The ${b} branch reached the top of`)
      : own;
    const ct = d[`${b}_cricondentherm_K`];
    const first = d[`${b}_first_bar`];
    const failed = d[`${b}_failed_before`];
    return {
      branch: b, points, end,
      ...(first !== undefined && points > 0 ? { startedBar: first, failedBefore: Math.round(failed ?? 0) } : {}),
      startSentence: first !== undefined
        ? adv.find((a) => a.locus === `phaseEnvelope ${b} start`)?.message ?? null : null,
      ...(stopped !== undefined && points > 0 ? { stoppedBar: stopped } : {}),
      ...(ct !== undefined ? { cricondenthermK: ct } : {}),
      sentence,
      cricondenthermSentence: ct !== undefined
        ? logParagraph(log, `CRICONDENTHERM on the ${b} branch`) : null,
    };
  });
  const notes: string[] = [];
  //  one line in the engine's log, never continued
  const normalised = log.split("\n").map((l) => l.trim())
    .find((l) => l.startsWith("[envelope] the feed sums to"));
  if (normalised) notes.push(normalised);
  for (const a of adv) {
    if (a.locus.startsWith("phaseEnvelope")) continue;
    if (a.status === "trial") continue;
    const s = `${a.locus}: ${a.message}`;
    if (!notes.includes(s)) notes.push(s);
  }
  return { branches, method: logParagraph(log, "This trace does NOT close the nose."), notes };
}

/** The badge a branch's end gets on screen -- the three ends are three
 *  different findings, and none of them is called a failure. */
export function branchEndLabel(r: BranchReport): string {
  if (r.end === "neverStarted") return `${r.branch}: never started in this range (no pressure converged)`;
  const start = r.startedBar !== undefined
    ? `started late at ${r.startedBar.toFixed(3)} bar (${r.failedBefore} lower pressures tried, no point); ` : "";
  if (r.end === "ranOut") return `${r.branch}: ${start}reached the top of the range (${r.points} points)`;
  return `${r.branch}: ${start}stopped at ${r.stoppedBar?.toFixed(3)} bar (${r.points} points kept)`;
}
