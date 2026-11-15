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
  const propsDict: JsonDict = {
    operations: [{
      name: "envelope",
      type: "phaseEnvelope",
      composition,
      // raw scalars = canonical SI (Pa), like every synthesized value
      pressure: { from: spec.Pfrom, to: spec.Pto, n: Math.max(2, Math.round(spec.n)) },
      output: { file: ENVELOPE_OUTPUT },
    }],
  };
  //  The frame of the corpus witnesses (tutorials/props/molecular/envelope01,
  //  envelope02): an ideal liquid on the pure-liquid reference and a CUBIC
  //  vapour.  The liquid reference carries phi_sat and Poynting (DEV.md 4c
  //  C235) and is held continuous above 0.99 Tc (C239) -- the engine
  //  announces both where they bite.
  const thermoPackage: JsonDict = {
    recordType: "thermophysicalPropertySystem",
    schemaVersion: 2,
    components: [...spec.components],
    equilibrium: {
      formulation: "gammaPhi",
      liquid: { activityModel: { model: "ideal" }, standardState: "pureLiquid" },
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
  return { files };
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
    return {
      branch: b, points, end,
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
  if (r.end === "neverStarted") return `${r.branch}: never started in this range`;
  if (r.end === "ranOut") return `${r.branch}: reached the top of the range (${r.points} points)`;
  return `${r.branch}: stopped at ${r.stoppedBar?.toFixed(3)} bar (${r.points} points kept)`;
}
