# economics01 — esterification plant, full DCF appraisal

A fixed (designed) ethyl-acetate plant taken all the way from equipment
sizing to a discounted-cash-flow economic appraisal:

```
feed → reactor (CSTR) → heater → separator (flash) → product
```

## What it demonstrates

The `system/postDict` chain runs three passes in order:

1. **sizing** — `StirredTank` for the CSTR, `ShellTubeHX` for the heater,
   sized from each unit's KPIs.
2. **costing** — Guthrie/Turton purchased + bare-module + total-module cost,
   CEPCI-updated to the target year, in EUR.
3. **economics** — the new `EconomicsPass`: it builds the CAPEX ladder
   (FCI, working capital, TCI), the Turton cost-of-manufacture `COM_d`,
   revenue, a straight-line-depreciation cash-flow timeline, then NPV, IRR
   (bisection bracket + Newton polish), and discounted + simple payback.

Every cost factor and DCF assumption is **dict-owned and printed** — read
the appraisal block and you can re-derive every number by hand.

## Method (all Turton 5th ed., Ch. 7-8 + §10)

```
FCI   = 1.18·ΣC_BM + 0.50·ΣC_BM°                       (Eq. 7.5)
COM_d = 0.180·FCI + 2.73·C_OL + 1.23·(C_RM + C_UT + C_WT)   (Eq. 8.1)
CF_t  = (R − COM_d − d)·(1−τ) + d        depreciation added back (non-cash)
NPV(i) = Σ CF_t/(1+i)^t ;   IRR = root of NPV(i)=0
```

Depreciation enters the DCF exactly once (it is *not* in `COM_d`) — the
classic textbook double-count is avoided. Working capital is an outflow at
startup and is recovered untaxed at end-of-life.

## The price tier (`constant/economics`)

Market/time-specific data — product and feed prices, labour rate, FX —
lives **only** in `constant/economics`, each value dated and primary-cited
(an index/bulletin/agency named in a `provenance{}` block). The
`EconomicsPass` **refuses to run** if a required price is absent, with a
remedy message; set `economics.refuseOnMissingPrice 0;` in the postDict to
switch to defaulted-but-loud. No price ever defaults to a literal in code.

## Run

```bash
runCase tutorials/steady/economics/economics01_esterification_dcf
```

The economics pass also publishes its headline scalars into
`result.kpis["economics"]` (`IRR`, `NPV`, `paybackYears`, `FCI`, `TCI`,
`COM_d`), which is what lets a sweep or optimisation read economics as an
ordinary response — see `economics02_irr_sweep`.

> AACE Class-4 estimate — accuracy −30% / +50%. The prices are
> representative teaching figures; refresh them (and their `costYear`) from
> the cited primary index before any live appraisal.
