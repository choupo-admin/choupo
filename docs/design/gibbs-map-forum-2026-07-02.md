# Gibbs equilibrium maps — forum-ratified design (2026-07-02)

**Status: DESIGN RATIFIED, NOT BUILT.** Forum: 3 professors (equilibrium
thermodynamics, reaction engineering, computational pedagogy) + 3 users
(MCFT undergrad, methanol-synthesis PhD/Aspen power user, thermodynamics TA).
Verdict: **6/6 on the architecture**; amendments below are binding.

## What ships in v1

1. **Explorer view "Equilibrium map (Gibbs)"** + **`gibbsMap` choupoProps op**
   (the golden-locked twin; homework deliverable = the op's CSV/KPIs, not the
   screenshot).
2. **Metrics**: mole fraction of a chosen product as the DEFAULT (zero
   definitional overhead — labelled *composition*, never "yield"); element
   yield (atoms of key element E in product / E fed) as the second-click
   primary-correct metric, formula verbatim in the tooltip and on the
   colorbar. **Banned as metrics**: species "conversion" where the species is
   also produced (H2O/CO in reforming — negative conversions); anything
   stoichiometry-based (extent of reaction is undefined in element space);
   selectivity with a →0 denominator (mask, don't plot). **CUT from v1: the
   selectivity metric** (3 votes — arrives with the reforming pilot).
3. **temperatureApproach ΔT** — global, both signs, dict key on the op/unit:
   - Convention (chair-stated, exact): equilibrium composition n(T+ΔT);
     outlet is a legitimate NON-equilibrium state (T,P,n) with
     H_out = Σ n_i(T+ΔT)·h_i(T_phys) — enthalpy ALWAYS at the physical T.
     At ΔT≠0 the outlet affinity is nonzero: that is the point, not a bug.
   - **VLE/phase split stays at the physical T; ONLY reaction equilibrium
     takes T+ΔT** (the chair's pitfall: otherwise Psat/condensation get
     de-rated — harmless for ammonia, wrong when reforming water condenses).
   - **Announce at the POINT OF CONSUMPTION**, not only the run banner
     (the ΔT=50 accident): streams table + KPI epilogue carry
     `[equilibrium at T+ΔT K — temperatureApproach]`; the gibbsMap CSV
     carries deltaT as a COLUMN; golden KPI names embed it
     (`yield_NH3_dT25`), so a changed ΔT breaks goldens loudly.
   - The announce also DECLARES the global-only limitation verbatim:
     "single global ΔT — cannot resolve per-reaction approaches (e.g. WGS
     ~0 K vs methanol ~20-30 K on Cu/ZnO)"; and at high P, that ΔT will
     soak up missing fugacity corrections (ideal-gas kernel) — students must
     not calibrate nonideality and call it kinetics.
   - Doc: ΔT is CALIBRATED, never predicted; positive-ΔT-as-shortfall is the
     datasheet reading only for exothermic reactions (industry magnitudes:
     ammonia beds ~10-20 C, methanol ~10-30 C, reformer exit ~5-25 C).
   - UI: **advanced-only** (undergrads drag sliders before reading);
     **snap, never animate**; ΔT=0 contours ghosted under the shifted ones;
     UI clamp ±100 K (dict overrides).
4. **Plot conventions** (pedagogy chair + TA, convergent): T on x, log-P on
   y; **7-10 LABELLED iso-lines, no filled heatmap** (faint underlay at
   most); feed/operating point marker ("you are here"); industrial-window
   rectangle WITH citation (Haber: 400-500 C, 150-300 bar); kinetic band =
   USER-DECLARED shading, requires a label+source in the dict, watermarked
   "DECLARED, NOT COMPUTED" on the plot; **auto-caption stamped into the
   figure** (feed/basis/metric/ΔT/grid) — screenshots outlive context.
5. **Non-convergence is visible**: unconverged grid cells render hatched/
   blank — NEVER interpolated over (Plotly smooths holes silently; the #1
   grading hazard).
6. **THE interaction (3 independent votes): click-a-point drill-down** —
   click anywhere on the map → run that single (T,P) solve, show the full
   equilibrium composition + log, and EMIT the corresponding gibbsReactor
   case dict snippet. The map becomes ~900 inspectable glass-box solves and
   a case generator.
7. **The opening panel** (the undergrad's real confusion is BEFORE the map):
   one sentence — "Gibbs needs no reactions: it finds the composition of
   minimum G given the atoms you fed" — plus the LIVE element balance shown
   as species are picked.
8. **Pilot & validation**: ammonia (N2+3H2). Pins: Larson & Dodge, JACS 45
   (1923) 2918 (10-100 atm) + Larson, JACS 46 (1924) 367; smooth reference
   Gillespie & Beattie, Phys. Rev. 36 (1930) 743. **Pin only 10-50 atm /
   350-500 C** (ideal-gas kernel validity). Gradeable problem-set shape
   (TA): "at P=200 bar, ΔT=0, find T where NH3 yield = 30%" — monotone in T
   at fixed P, unique answer, anchor KPIs are the key.
9. **v2 (deferred, declared)**: steam-reforming pilot (brings selectivity +
   the condensing-water VLE/ΔT separation test + coke as solid); methanol
   pilot #2 (exercises the global-ΔT limitation didactically); the adiabatic
   converter trajectory overlay (the classic quench diagram — the
   equilibrium chair's ADD); per-reaction restricted equilibrium ONLY if a
   real case demands it (reaction-eng chair: global-ΔT on multi-reaction
   pools shifts reactions in physically inconsistent directions — the doc
   says "meaningful for one dominant reaction" verbatim).

## Top pitfalls (ranked, from the forum)
1. ΔT de-rating VLE/condensation (chair) — split the T's.
2. Interpolated contours over unconverged cells cited in reports (TA+pedagogy).
3. ΔT surviving unnoticed in copied dicts (power user) — point-of-consumption announces.
4. Global ΔT "calibrating" a reformer with one knob → wrong industrial convention learned (reaction eng).
5. High-P maps: ΔT absorbing fugacity nonideality (chair) — announce the confounding.
