# process02_with_design — the deliverable: a size and a price you can defend

`process01` with a heater between the reactor and the flash, and the two
reports a project needs most: **equipment sizing** and **Guthrie
costing**.  The chain runs from `system/postDict`; `reports { design {}
economics {} }` in the controlDict *serialise* what it produced into
`reports/design/sizing.csv` and `reports/economics/costs.csv`.

The golden (process side): heater 0.4 kW → **361.88 K**; reactor
X = 0.526; flash at 361.88 K with V/F 0.0562.  The design side, from the
run: reactor **V_R = 0.005 m³**, wall 3.15 mm, 3.7 kg of SS316; heater
**A = 0.0667 m²** of SS304; costing totals **€155,475 purchased /
€917,756 bare module / €1,082,952 total module**, CEPCI 820/397 = 2.0655,
0.92 EUR/USD.

## The lesson

1. **The rules are declared, once, in `postDict`.**  `sizing { units (
   { unitName reactor; type stirredTank; material SS316; designRules {
   L_over_D 2.5; pressureDesign 3.0; … } } … ) }` and `costing { method
   Guthrie; year 2026; cepci 820; cepci2001 397; usdToEur 0.92; }`.  Every
   number in the tables descends from those lines and the run's own
   results — nothing else.
2. **The costing table prints its own arithmetic.**  Below the totals:
   the log-quadratic correlation, K1–K3 per item, B1/B2, F_M, the CEPCI
   ratio, the currency, the 1.18 contingency — and the source (Turton
   App. A).  Recompute one line; `check_cost_provenance` does exactly that
   on every suite run and requires 0.1 %.
3. **READ THE TWO WARNINGS — they are the real lesson of this case.**
   `[validity] WARNING: stirredTank 'reactor': size V_R = 0.005 is OUTSIDE
   the correlation range [0.3, 520]` and the heater's 0.0667 m² against
   [10, 1000].  A 1 kmol/h process is laboratory scale; Turton's
   correlations were fitted to plant scale, and the engine *extrapolates
   and says so* rather than clamping.  The €1.06 M for a 0.4 kW exchanger
   is what an extrapolated correlation returns — a number to distrust
   because you were told to.
4. **A report draws, it does not recompute.**  Until 2026-09-02 this
   case carried the rules inside the report blocks (an older grammar),
   the reports failed by name on every run, and the golden — which pins
   only the process KPIs — never noticed.  The README you are reading is
   why it was found.

## What to try

Scale the feed to 100 kmol/h in `0/feed`: the reactor volume the design
rule wants lands inside the correlation window and the warning goes away.
Then open `economics01_esterification_dcf`, where the same chain continues
into OPEX, NPV and payback.
