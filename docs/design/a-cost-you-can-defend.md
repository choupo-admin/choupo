# A cost you can defend

*Record of leg 4 of the student walkthrough, 2026-08-27.*

> **On the numbers quoted below.**  The worked example is a styrene
> dehydrogenation case built for the walkthrough in a scratch directory; it is
> NOT in `tutorials/`, so a reader cannot re-run it from this repository.  It
> is quoted because it is where the defect was found.  The REPRODUCIBLE
> version of every claim here is `bin/curate/check_cost_provenance.py`, which
> builds its probe from `tutorials/steady/flash/flash01_benzene_toluene` and
> recomputes the total from the printed numbers on every suite run.

## 1. The test

The walkthrough asks what a final-year project student needs from Choupo, and
leg 4 is the one that decides whether they pass: sizing, costing, and the
defence — whether they can say where each number came from when the jury asks.

So: take a number off the costing table and try to trace it.

```
  Method:  Guthrie    Year:  2026.0    CEPCI: 820.0

  unit          equipment       F_M     F_P     C_purchased   C_bare_mod    C_total_mod
  knockout      vessel          3.05    1.00    18104         141231        166653
```

**"Where does €166,653 come from?"**

From the source, it comes from here, and every step is right:

```
  log10(Cp_2001) = 3.4974 + 0.4485 log10(7.6882) + 0.1074 (log10 7.6882)^2
  Cp_2001        = 9527.3 USD
  Cp             = 9527.3 x (820/397) x 0.92          = 18104 EUR
  C_BM           = 18104 x (2.25 + 1.82 x 3.05 x 1.00) = 141231 EUR
  C_TM           = 1.18 x 141231                       = 166652 EUR
```

**From the OUTPUT, it comes from nowhere.**  Between `F_M 3.05` and
`C_TM 166653` stand the correlation and its three coefficients, the size
driver and its value, the base year, the price index and its 2001 reference,
the currency rate, two bare-module factors and the 1.18 — eleven numbers and
five decisions, all of them already computed inside the pass, none of them
said.  The student can defend the total only by reading `Guthrie.cpp`.

## 2. What was built

`CostBreakdown` already carried `F_M`, `F_P`, `B1`, `B2`, `Cp_2001`, `cepci`
and `usdToEur`.  It gained the four that were missing — the size `S` used, the
coefficients (`K1..K3`, or `Cp_ref/S_ref/n` for the power-law items), the
`cepci2001` reference, and the size key / correlation family / material as
names — and the costing pass prints the chain under the table:

```
  ---- how each number above was reached ----
  C_p(2001 USD) = 10^( K1 + K2 log10 S + K3 (log10 S)^2 )     [log-quadratic]
                = Cp_ref (S/S_ref)^n                          [power-law, where declared]
  C_p           = C_p(2001) x CEPCI/CEPCI_2001 x EUR/USD
  C_BM          = C_p x ( B1 + B2 F_M F_P )
  C_TM          = 1.18 x C_BM      (contingency + fee)
  index: CEPCI 820.0 / 397.0 = 2.0655     currency: 0.9200 EUR/USD     basis: 2001 USD

  unit          correlation     size driver S       coefficients              B1, B2      F_M (material)
  knockout      log-quadratic   V_R = 7.6882        3.4974, 0.4485, 0.1074    2.25, 1.82  3.05 (SS316)

  K1-K3, B1, B2 and the 1.18: Turton et al., "Analysis, Synthesis and Design of
  Chemical Processes", Appendix A (2001 USD basis).  F_M is cited in its own
  material record (data/standards/assets/<material>.dat).
```

`F_M` is deliberately NOT cited in this block: it is a per-material datum and
its own record carries its citation, which is the one home it should have.

## 3. The defect this block found in itself, on its first run

The first version printed `B1, B2 = 2.2, 1.8` and `F_M = 3`.

`std::setprecision` on a fresh stream is SIGNIFICANT digits, not decimals.  A
reader doing the arithmetic from those gets `2.2 + 1.8 x 3 = 7.6` against the
`7.801` that produced the total, lands 2.6 % out, and concludes **they** made
the mistake.

**A provenance line too coarse to reproduce is worse than none: it invites a
failed reproduction and blames the reader.**  The block is `std::fixed` with
enough decimals to redo the arithmetic exactly — which is the only standard a
"show your work" line can be held to.

Worth noting how it was caught: only by *printing* the numbers.  Had they
stayed inside the source, nothing would have looked wrong.

## 4. The same question one step earlier: where did 7.6882 m3 come from?

The costing chain starts from a size, so the defence does too — and the sizing
table had the identical defect:

```
  unit          equipment       material    size      value       wall (mm) weight (kg)
  knockout      vessel          SS316       V_R [m3]  7.6882      4.61      765.4
```

`V_R = 7.6882` is the same table entry whether it came from a residence time,
a space velocity, or the author typing the number in — and those are three
different design arguments, only one of which the student can be asked to
justify.

**`VesselSize` computed exactly that distinction and threw it away.**  Three
branches each set a `basis` string — `"drum V = Q*tau"`, `"catalyst V = Q/SV"`,
`"volume (author-set)"` — and the function ended with:

```cpp
    (void)basis;
```

A cast to silence an unused-variable warning, on the decision that determines
the vessel volume.  `EquipmentSizing` gained a `basis` field and the pass
prints it.

**And a second thing, which the printing made visible.**  The volumetric flow
driving every residence-time and space-velocity size is

```cpp
    const scalar Q_m3s = N_mol_s * constant::R * T / P;     // ideal-gas m^3/s
```

— computed that way **regardless of the thermo package the case declared**.
At a knockout drum's 1 bar that is exact enough.  At 50 bar a real Z of 0.8
undersizes the vessel by a fifth, and the only place that said so was a
trailing comment in the source.

It is ANNOUNCED now, beside the basis, with its value:

```
        basis: drum V = Q*tau   (Q = N R T / P, IDEAL GAS, <value> m3/s -- not the case's thermo package)
```

Announced, never judged — the same posture as the extrapolated Antoine and the
effectiveness factor taken as 1.  A design correlation is entitled to its own
approximations; it is not entitled to keep them quiet.

## 5. Reserved, not fixed: the model is named after the wrong author

The costing model is registered as **`Guthrie`** and every coefficient in the
file is **Turton's** — `K1/K2/K3` from Appendix A, `B1 = 2.25, B2 = 1.82` from
the bare-module table, 2001 USD, CEPCI-scaled, the 1.18 from the contingency
and fee.  Nothing in the file is Guthrie's 1969 correlation.

The header is already honest ("Guthrie (1969) / Turton (4th ed., Appendix
A)"), and the new block above cites Turton by name.  The printed *method*
still says `Guthrie` alone.

Guthrie is the ancestor of the method — he invented the module-factor approach
— and Turton is where every number comes from.  Both readings are defensible
and no value moves whichever is chosen, so this is an **attribution ruling and
a corpus-wide rename**, and it is Vitor's.  Recorded here rather than decided.
