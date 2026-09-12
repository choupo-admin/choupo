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
  THE FIRST LAW AS A PICTURE -- the geometry, with no drawing in it.

  Vitor designed this figure himself (2026-09-12) and this module is its
  construction, kept apart from the Plotly component so the arithmetic can be
  tested without a canvas:

     TWO COLUMNS.  Each is a set of SIGNED terms.  The positive ones stack up
     from zero; the negative ones are then drawn DOWNWARD from the top of
     that stack, TRANSLUCENT, over it.  Where the translucent part stops is
     the column's NET -- and that transition carries a white line marking the
     level.  Left column: the enthalpy the streams gained, +SUM H(out) and
     -SUM H(in).  Right column: what crossed the boundary, Q and -W, in their
     own two colours.

     THE TWO LEVELS MUST COINCIDE, because that is the first law:

              SUM H(out) - SUM H(in)  =  Q - W

     and the visible GAP between them is the plant's first-law residual.  A
     student reads the identity, and its violation, off the picture.

  ZERO PHYSICS HERE (gui-credo guard-rail 4).  Every number comes from the
  engine's own `globalEnergyBoundary` ledger -- the ONE object the 2026-09-05
  rule put on the result precisely so the GUI would stop summing duties of its
  own.  This module adds, subtracts and sorts; it decides nothing.

  WHY THE Y WINDOW IS NOT THE BARS' OWN EXTENT.  Stream enthalpies are on the
  ELEMENTS datum, so their absolute values are set by the reference and not by
  the process -- the engine says so itself.  MEASURED across the 153 corpus
  goldens that pin this ledger: the median |dH| is 1.3 % of the larger of
  |H_in|, |H_out|, and 90 of them are under 2 %.  Drawn to the bars' own
  extent the level -- the whole point of the figure -- would be a sliver on
  most cases.  So the window is scaled to the PROCESS quantities (the levels,
  Q, W, the residual) and the enthalpy bars are allowed to run out of it.
  Nothing is lost by that: above the level a column is uniformly
  translucent-over-solid, so the clipped part carries no information the
  visible part does not -- and the terms' true values are stated as numbers
  beside the figure regardless.

  COLOUR IS NEVER THE ONLY CHANNEL.  Every term and both levels carry their
  value as text, because colour does not survive a greyscale print (the
  2026-09-07 rule) and green/red is the classic colour-vision trap.
\*---------------------------------------------------------------------------*/

import type { GlobalEnergyBoundary } from "../adapters/SolverAdapter.js";

/** One signed contribution to a column's net. */
export interface FirstLawTerm {
  /** short algebraic name, as it appears in the equation ("+Σ H(out)") */
  label: string;
  /** what the quantity IS, for the hover -- never a restatement of the number */
  detail: string;
  /** the SIGNED contribution, kW.  The column's net is the sum of these. */
  kw: number;
  color: string;
  /** drawn translucent over the stack because it SUBTRACTS from it */
  subtracts: boolean;
}

export interface FirstLawColumn {
  key: "enthalpy" | "boundary";
  /** the category label on the x axis */
  axisLabel: string;
  /** what the column's net MEANS, for the level annotation */
  levelLabel: string;
  terms: FirstLawTerm[];
  /** top of the solid (positive) stack */
  positiveTop: number;
  /** the net -- where the translucent part stops, and where the white line goes */
  level: number;
}

export interface FirstLawFigure {
  /** exactly two, in order: the enthalpy side then the boundary side */
  columns: [FirstLawColumn, FirstLawColumn];
  /** the ENGINE's published residual, drawn and never recomputed */
  residualKw: number;
  /** left level minus right level; equals -residualKw by construction */
  levelGapKw: number;
  /** true when the engine published the heat/work split (older runs did not) */
  splitPublished: boolean;
  /** [lo, hi] kW -- scaled to the process quantities, see the header */
  window: [number, number];
  /** a column whose bars run outside the window */
  clipped: boolean;
  /** the plant declares nothing crossing its boundary: the law is vacuous */
  vacuous: boolean;
  datum: string;
  H_in_kW: number;
  H_out_kW: number;
}

/** Colours.  Left column by SIGN (Vitor: "verde positivo, vermelho negativo");
 *  right column by QUANTITY ("cores diferentes para Q e W"), reusing the
 *  plot kit's own warm/accent pair so the figure sits inside the palette.
 *  All four read on the dark AND the light chrome (plotly.ts themes the
 *  chrome, never the traces). */
export const FIRST_LAW_COLORS = {
  positive: "#40c057",   // green
  negative: "#fa5252",   // red
  heat: "#ffb74d",       // PLOT_COLORS.warm  -- Q
  work: "#26c6da",       // PLOT_COLORS.accent -- W
};

/** Opacity of a SUBTRACTING term, drawn over the solid stack. */
export const SUBTRACT_OPACITY = 0.55;

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Build the figure from the engine's ledger.
 *
 * Returns null when there is nothing to draw -- which is a fact, not a
 * failure: the caller SAYS the report did not run rather than computing a
 * balance of its own (the 2026-09-05 rule that this whole ledger exists to
 * enforce).
 */
export function firstLawFigure(gb: GlobalEnergyBoundary | undefined): FirstLawFigure | null {
  if (!gb) return null;
  const hIn = gb.H_feeds_kW, hOut = gb.H_products_kW, qTotal = gb.Q_boundary_kW;
  if (!finite(hIn) || !finite(hOut) || !finite(qTotal)) return null;

  //  THE SPLIT IS THE ENGINE'S OR IT DOES NOT EXIST.  A result from before
  //  the ledger carried it draws ONE term on the right and says so; deriving
  //  Q and W here from per-unit KPIs is exactly the second home the 2026-09-05
  //  slice removed, one level down.
  const splitPublished = finite(gb.Q_heat_kW) && finite(gb.W_shaft_kW);
  const qHeat = splitPublished ? (gb.Q_heat_kW as number) : qTotal;
  const wShaft = splitPublished ? (gb.W_shaft_kW as number) : 0;

  const enthalpy: FirstLawColumn = {
    key: "enthalpy",
    axisLabel: "ΔH   the streams",
    levelLabel: "ΔH",
    terms: [
      {
        label: "+Σ H(out)",
        detail: `flow enthalpy leaving the plant, ${gb.n_products} product stream(s)`,
        kw: hOut,
        color: hOut >= 0 ? FIRST_LAW_COLORS.positive : FIRST_LAW_COLORS.negative,
        subtracts: hOut < 0,
      },
      {
        label: "−Σ H(in)",
        detail: `minus the flow enthalpy entering, ${gb.n_feeds} feed stream(s)`,
        kw: -hIn,
        color: -hIn >= 0 ? FIRST_LAW_COLORS.positive : FIRST_LAW_COLORS.negative,
        subtracts: -hIn < 0,
      },
    ],
    positiveTop: 0,
    level: 0,
  };

  const boundary: FirstLawColumn = {
    key: "boundary",
    axisLabel: "Q − W   the boundary",
    levelLabel: "Q − W",
    terms: splitPublished
      ? [
          {
            label: "Q",
            detail: "heat crossing the plant boundary into the process streams"
              + " (negative = heat removed)",
            kw: qHeat,
            color: FIRST_LAW_COLORS.heat,
            subtracts: qHeat < 0,
          },
          {
            label: "−W",
            detail: "minus the shaft work done BY the process.  Choupo signs every"
              + " energy item + when energy is ADDED to the streams, so this term IS"
              + " W_shaft_kW and a turbine's is negative: the work leaves",
            kw: wShaft,
            color: FIRST_LAW_COLORS.work,
            subtracts: wShaft < 0,
          },
        ]
      : [
          {
            label: "Q − W",
            detail: "heat AND shaft work together -- this run's engine published only"
              + " their sum, so the two cannot be drawn apart",
            kw: qTotal,
            color: FIRST_LAW_COLORS.heat,
            subtracts: qTotal < 0,
          },
        ],
    positiveTop: 0,
    level: 0,
  };

  for (const col of [enthalpy, boundary]) {
    col.positiveTop = col.terms.reduce((s, t) => s + Math.max(t.kw, 0), 0);
    col.level = col.terms.reduce((s, t) => s + t.kw, 0);
  }

  //  The window.  Candidates are the PROCESS quantities: zero, both levels,
  //  and the right column's own extent (heat and work are process-scale by
  //  nature).  The left column's extent joins them only when it is process-
  //  scale too; on the elements datum it usually is not, and including it
  //  would make the levels invisible.  See the header.
  const scale = Math.max(
    Math.abs(enthalpy.level), Math.abs(boundary.level), Math.abs(qHeat),
    Math.abs(wShaft), Math.abs(gb.residual_kW ?? 0), 1e-9,
  );
  const pts = [0, enthalpy.level, boundary.level,
               boundary.positiveTop, Math.min(0, boundary.level)];
  for (const v of [enthalpy.positiveTop, Math.min(0, enthalpy.level)]) {
    if (Math.abs(v) <= 3 * scale) pts.push(v);
  }
  let lo = Math.min(...pts), hi = Math.max(...pts);
  const span = hi - lo > 0 ? hi - lo : Math.max(scale, 1e-9);
  const pad = 0.22 * span;
  lo -= pad; hi += pad;

  const extentOf = (c: FirstLawColumn): [number, number] =>
    [Math.min(0, c.level, c.positiveTop), Math.max(0, c.level, c.positiveTop)];
  const clipped = [enthalpy, boundary].some((c) => {
    const [a, b] = extentOf(c);
    return a < lo || b > hi;
  });

  return {
    columns: [enthalpy, boundary],
    residualKw: gb.residual_kW,
    levelGapKw: enthalpy.level - boundary.level,
    splitPublished,
    window: [lo, hi],
    clipped,
    vacuous: gb.noBoundary === true,
    datum: gb.datum ?? "elements",
    H_in_kW: hIn,
    H_out_kW: hOut,
  };
}

/**
 * The stacked geometry of one column: for each term, where its bar starts and
 * how tall it is.
 *
 * Positives stack from 0 upward in order.  Negatives are laid DOWNWARD from
 * the top of the positive stack, so the last one ends exactly at the level --
 * which is why the transition is the net and why a white line there is the
 * answer rather than a decoration.
 */
export function stackedBars(col: FirstLawColumn):
  { term: FirstLawTerm; base: number; height: number }[] {
  const out: { term: FirstLawTerm; base: number; height: number }[] = [];
  let up = 0;
  for (const t of col.terms) {
    if (t.kw > 0) { out.push({ term: t, base: up, height: t.kw }); up += t.kw; }
  }
  let down = col.positiveTop;
  for (const t of col.terms) {
    if (t.kw < 0) { down += t.kw; out.push({ term: t, base: down, height: -t.kw }); }
  }
  return out;
}

/** kW, at a precision that does not hide a small closure (the EnergyBalancePlot
 *  rule: rounding kW to integers makes a balance LOOK broken). */
export function fmtKw(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(2);
}
