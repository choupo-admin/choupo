# flash21 — freeze concentration: ice from a water/ethanol liquor (SLE flash)

**What this witnesses (migration S4b, 2026-08-09):** the flash's
LIQUID+SOLID branch.  A C3 uniform `phases ( … )` declaration — one liquid,
one crystallizing solid (`component water;`), no vapour — dispatches to the
SLE solve, where the ice phase becomes a `SolidCandidate` on THE ONE
solid-equilibrium mechanism (`solidEq::equilibrate`, ruling R1's active-set +
simultaneous damped Newton).  The candidate's `lnSI` is
`ln(x_w · fEff_liq / fEff_solid)` and its `remove` pulls water from the
liquid inventory — the one ledger.

**The acceptance is a closed form, not a golden alone.**  At equilibrium the
K = 1 condition collapses to the freezing-point-depression identity

    gamma_w · x_w = exp(−dG_fus / (R T)),   dG_fus = dHfus · (1 − T/Tfus)

with every quantity from the record's own data (`water.dat` Hfus 6008 J/mol,
triple point 273.16 K).  At 258.15 K the right side is 0.857434120855; the
run publishes the liquor's activity as KPI `a_water` = 0.857434120931 —
agreement to 9e-11.  `check_solid_service` arm A10 recomputes the closed
form independently in Python on every suite run.

**The numbers:** feed 90/10 water/ethanol (mol) at −15 °C, 1 atm.  Ice
forms at `solidFraction` 0.476 mol per mol of feed; the liquor concentrates
to x_ethanol ≈ 0.19, exactly where the NRTL water activity meets the
saturation value.  The liquor and crystal leave through ONE outlet
(`liquor`): its overall material equals the feed and the `phases {}` block
decomposes it; `vent` is the structurally-required second outlet and
carries F = 0 (no vapour phase is declared).

**Honest gaps, stated:**
* The DUTY is withheld as a named gap — pricing the crystal needs the solid
  formation rung (`h_formation` has no gas-natural → solid leg), and a
  fluid-only Q would silently omit the heat of fusion, which is the whole
  duty of a freezer.  One decision with the flash19 inlet-pricing finding.
* Both Antoine fits are extrapolated below 273 K (announced); the
  extrapolation CANCELS in the SLE identity (both phases share the same
  Psat call), so the equilibrium is exact in the model even where Psat is
  not.
* dG_fus omits the liquid/solid heat-capacity term (announced with
  |T − Tfus| = 15 K); the NRTL pair (DECHEMA, validity 298–373 K) is used
  below its fitted window (announced).  No number in this case is anchored
  to a measured freezing-point datum — it is a STRUCTURAL witness; a
  published-curve anchor would be a separate validation act.
