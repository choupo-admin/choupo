# A first law the GUI computed for itself

> **STATUS: FINDING + RULE, executed 2026-09-05.**  Level 3 (deep reference
> under the verification architecture and the GUI credo); the governing
> documents are
> [`../architecture/verification-and-validation.md`](../architecture/verification-and-validation.md)
> and [`../ai/gui-credo.md`](../ai/gui-credo.md) (*a runner and visualiser,
> not an editor* — and, it turns out, not a calculator either).

---

## 1. What Vítor saw

The flagship plant, on the live site, Reports panel, "Global energy balance":

```
Stream enthalpy IN       -20869.2 kW
Net heat into process        74.8 kW
Stream enthalpy OUT      -21166.9 kW
First-law residual          372.501 kW      Imbalance 1.7914 %
```

His words: *"a violação à primeira lei parece-me exagerada"*.  It was, and it
was not the engine's.

## 2. What the engine says about the same run

`postProcessing/energyBalance/0/globalEnergyBoundary.csv`, written by the
`energyBalance` report that runs by default on every converged steady case:

```
H_feeds        -20869.153820
Q_boundary       -263.296354
H_products     -21166.862821
residual           34.412646      residual_pct  0.1626
```

Same feeds, same products, a different boundary heat — and the difference is
exact: 372.5 − 34.4 = 74.8 + 263.3.  The GUI had its own `Q`.

## 3. Where the GUI's Q came from

`gui/src/case/balances.ts` carried `energyBalance()` and `unitEnergy()`: the
first summed the boundary streams' `F·H`, the second summed the duties the
engine had **allocated to a utility** (`utilityAllocation`) plus `W_shaft`
KPIs.  The plant's crystalliser removes 132.3 kW and its fermentor 205.8 kW,
and neither duty is served by a declared cold utility — so neither reached the
allocation, so neither reached the GUI's sum.  The one duty it saw was the
flash's +74.8 kW.  The GUI then reported the 338 kW it had failed to count as
a violation of the first law, in yellow.

This is a **second home** for a balance the doctrine says is engine-owned
(*"Balance diagnostics, three levels … engine-owned, GUI only draws"*,
2026-07-19).  The engine's report knows which duties are boundary heat, which
are internal exchanges, which are already inside Σ H(feeds) because the
utility medium is itself a feed stream (the evaporator chest steam), and
which shaft work leaves the fluid.  A GUI-side sum knows none of that; it
knew what a different report had chosen to allocate, which is a different
question.

## 4. The rule, and the fix

**The plant-boundary first law travels on the result, and the GUI draws it.**

* `SimulationResult::globalEnergyBoundary` — one small struct (the three
  terms, the residual and its percentage, the feed/product/gap counts, the
  closed-loop flag), stamped by `EnergyBalanceReport` at the one place its
  arithmetic is decided, emitted by `ResultEmitter` as ONE object on ONE line.
* The three GUI surfaces that drew a first law — the Reports table, the
  Streams summary line, the energy-balance plot — read that block.  When it is
  absent they say *the energyBalance report did not run (or refused)*; none
  computes a replacement.  `energyBalance()` and `unitEnergy()` are deleted
  with their tests, and `balances.ts` states why nothing may grow back there.
* The `boundary` golden kind reads the block (`boundary global <field>`), the
  generators emit it, `--record-append` added the rows corpus-wide (adds
  only — no existing row was re-pinned), and `check_energy_boundary_pinned`
  holds both directions.

## 5. What the residual pins, and what it must not

The residual is the DIFFERENCE of two ~21 MW terms.  On a case that closes
to round-off it is 1e-13 kW, and a golden row pinning that at 1e-4
**relative** pins cancellation noise — the column13 nanowatt lesson
(2026-08-09).  So the generator pins the three TERMS always and the residual
only when |residual| ≥ 1 W; the threshold has one home (the generator) and
the gate requires the terms and only checks any residual row it finds.  On
the flagship the residual (34.4 kW) is pinned; on `flash01` (−2e-13 kW) it is
not, and the three terms pin it indirectly to 1e-4 of 1.3 MW.

## 6. Found on the way, and not hidden

* **The flagship's golden was never in the full suite.**  `bin/runTests`
  gathered `plant/` cases only when flat: a top `flowsheetDict` carrying
  `children` was skipped, on the comment *"its curate-vs-simulate sector
  dispatch is still an open call"*.  That call was settled 2026-06-08
  (`flattenNode`: one flat solver problem) and the exclusion outlived it by
  three months — so the equipment rows, the crystalliser fix and every other
  pin on `ChemicalPlantTutorial` were verified only by gates that run the
  case themselves, never by the golden compare.  Vítor's note the same day
  (*"e neste caso plant/ChemicalPlantTutorial"*) pointed at it.  A fractal
  plant case that ships `expected` is in the walk now; the comment records
  why the exclusion existed and when it stopped being true.
* **Three units do not close, and the engine says so.**  Evap1 98.45 %,
  Cryst 110.66 %, Fermentor 82.02 % — residuals of −10.4, −14.1 and
  +37.0 kW the report *"cannot attribute"* (no model boundary declared, every
  inlet phase possible in the report's world).  These are the engine's own
  numbers and the engine's own honesty; they are NOT what Vítor saw (34 kW
  in total against 372), and they are left as a finding, not a fix — each
  needs its own reading (the fermentor's heat of reaction on the elements
  datum against an imposed T is the first suspect).
* `EnergyBalanceReport.cpp` carried the sentence *"This is the single number
  the GUI shows green"*.  It was not.  Corrected to what is now true.

## 7. Rejected

* **Keeping the GUI computation as a fallback** when the block is absent.
  A fallback is the second home under another name, and it is exactly the
  path that showed 372.5 kW: the GUI would keep disagreeing whenever the
  report did not run, which is when a reader most needs to be told so.
* **Splitting the engine's Q into "heating" and "cooling" bars** for the
  plot from the utility allocation.  That split is the sum this slice
  deleted; the plot now draws the ledger's one net boundary Q on the side
  its sign puts it.

## 8. Not done, named

* The per-unit ledger (`energyBalance_byUnit.csv`: dH, declared items,
  remaining) does not travel on the result yet; the waterfall view that
  would teach *enthalpy is a property of streams, heat and work are
  transfers at units* needs it (task #87, awaiting Vítor).
* Kinetic and potential energy are neglected by the engine's ledger and the
  GUI now says nothing about them either; the Sankey proposal states it in
  its legend.
