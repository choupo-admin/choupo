# A TBP curve cut into pseudo-components: `petroleumCuts`

*2026-11-05, DEV.md 4c C228 items 1-2.  A slice record.  Source: Riazi,
"Characterization and Properties of Petroleum Fractions" (ASTM MNL50, 2005);
equation and page numbers are the PRINTED book's.*

## 1. What existed and what was missing

`RiaziDaubert` (a registered `ConstantEstimator`) already turned ONE (Tb, SG)
pair into MW, Tc, Pc, Vc, omega and a Kesler-Lee Cp, and `estimateComponent`
wrote the lump as an ESTIMATE record.  Missing: a distillation CURVE cut into
several lumps, and API gravity / Watson K as published numbers.

## 2. The decision

A props operation `petroleumCuts` (curation time, never in the solver hot
path).  It reuses `RiaziDaubert` unchanged and writes one ESTIMATE record per
cut into the CASE (never `data/standards/`, the engine refuses), marked lumped
and "NOT a real species" as `estimateComponent` marks one.

* Curve: TBP only, basis (volume | mass) declared, never defaulted.
  ASTM D86 / D1160 / D2887 / EFV REFUSE by name.  Riazi Eq. 3.14 with Table
  3.2 (p. 102) give D86 -> TBP and are legible, but are not carried: a
  conversion nobody gated is a conversion nobody should trust.
* Cut Tb: the TBP temperature at the MID-POINT of the cut's distilled interval
  (table of recommended methods, footnote a, p. 83), piecewise linear; a
  mid-point outside the curve refuses, nothing is extrapolated.
* Cut SG: ONE declared method.  `constantWatsonK`: SG_i = (1.8 Tb_i)^(1/3)/Kw,
  Eq. 2.13 (p. 35) rearranged, with one Kw for the feed, taken at the feed SG
  and the feed's MeABP (Eqs. 3.3-3.5, pp. 100-101) by fixed point (the mole
  fractions in MABP depend on Kw).  THIS IS AN ASSUMPTION OF THE OP, not a
  recommendation of the book.  `declared`: SG per cut.
* Feed SG: declared, or Eq. 3.17 (p. 102, TBP row of Table 3.4, p. 103).
* Closure: the cuts re-blended by Eq. 3.45 / 3.46 (p. 119) must reproduce the
  feed SG within a DECLARED tolerance (required).  A miss is announced and
  published (`closure.ok = 0`), never adjusted.
* API (Eq. 2.4, p. 32), SG and Watson K are published per cut and for the
  blend, in the op's diagnostics and in each record's header.

## 3. Rejected

* Silently adjusting Kw to force the density closure: it would make the
  closure a tautology and hide the discretisation error the student should see.
* A default closure tolerance, a default curve basis: the author's to state.
* Taking API / Watson K to the stream report: that moves every case's golden
  (a path every case goes through); a later decision, not made here.

## 4. Not established

Nothing is validated against a unit.  Riazi prints a TBP curve (Table 3.6, p.
103) but no cut Tb, SG, MW or Tc for it; the only printed numbers reproduced
are arithmetic ones (Eq. 3.17's 0.7862 in Example 3.2, p. 102; Example 2.11's
Kw 11.08 and API 12.23, p. 73).  Constant Watson K across the cuts is not a
finding.  The Kesler-Lee Cp is reused as shipped and not compared to Eq. 6.72.
The existing `RiaziDaubert.cpp` header cites its constants to "Table 2.4";
in the book that table is the paraffin/aromatic comparison, and the constants
are Eqs. 2.50, 2.63, 2.64, 2.98 -- the header should be corrected by whoever
next edits that file.

Gate: `check_petroleum_cuts`.  Witness:
`tutorials/props/estimate/petroleumCuts01_riazi_table36_tbp`.
