#!/usr/bin/env python3
"""Gate: an UNPINNED TP inlet is its own equilibrium; a PIN is priced and said.

    bin/curate/check_inlet_resolution.py

WHY THIS EXISTS.  The ratified semantics of
docs/design/tp-stream-energy-coherence.md (R-E1/R-E2, 2026-08-09) are two
claims a reader cannot check by inspection, so they are pinned here:

  R-E1  REFLASH IDEMPOTENCY.  A flash operating at its feed's OWN (T, P) is
        the identity operation and must cost NOTHING.  Before the slice,
        flash19 charged +13.34 kW to "vaporise" a liquid nobody declared --
        the duty read the struct's `vf = 0.0` default as an undeclared
        `phase liquid;`, which is precisely the decorative pin the
        stream-state constitution bans from files.
  R-E2  A PIN IS A CONSTRAINT WITH A PRICE.  `phase liquid;` on a feed says
        the boundary delivers a constrained (possibly metastable) single
        phase.  That may legitimately cost energy at unchanged (T, P) -- and
        it must be ANNOUNCED, never silently folded into a number.

  R-E5  ONE CONVENTION.  The unit duty and the balance report must obtain H
        the same way, so flash19's unit Q and its report dH agree and the
        closure sits at 100 %.

WHAT THIS CHECKS, all from fresh runs of corpus cases:
  (a) flash19 (reactive + organic + precipitate, feed at the drum's own
      T and P): |Q_kW| < 0.5 -- the identity costs nothing;
  (b) flash19's energy_closure_pct within 100 +- 0.5 -- unit and report
      agree (R-E5), which is the arithmetic half of (a);
  (c) flash09_nh3_water_reactive and flash20_ethanol_water_pcsaft: also
      |Q_kW| < 0.5, so the claim is not a single case's accident;
  (d) THE PIN IS HONOURED AND ANNOUNCED: a COPY of flash19 whose authored
      0/feed gains `phase liquid;` runs, prices the declared phase (its Q
      leaves the near-zero band), and says so in the log;
  (f) THE PHASE PASS IS NOT GATED ON THE CONSUMER, and it does not accuse a
      SUPERCRITICAL vapour.  Two halves, and the second replaced the first
      arm's witness the same day it was written.

      (f1) SOURCE: the pass must not be enclosed in a condition on
           `r.declares`.  It was, and ammonia02 disarms that condition twice
           over -- its converter is ADIABATIC (declares no energy item) and
           its feed-effluent exchanger's closure reads a perfect 100 %
           because its own declared duty was computed FROM the enthalpy in
           question.  22 376 kW went unreported at exit 0.  A source arm is
           weaker than an output arm and is used here because the corpus
           witness this arm HAD turned out to be the defect below.

      (f2) OUTPUT: ammonia02 must NOT accuse `hotEffluent`.  That stream was
           this arm's original witness -- and Vitor read the accusation and
           rejected it: at 839.6 K the highest pure critical temperature
           present is ammonia's 405.5 K, so the mixture is 434 K above any
           dew point and the label VAPOUR is the only one it can hold.  The
           `g(V=1) = -0.46` behind the accusation is built from a Psat
           extrapolated far above Tc, where the saturation curve does not
           exist.  The check was accusing the innocent, which is the thing a
           check must never do, and the run's own [psat] line said so three
           screens earlier.  So this arm now pins the SILENCE, plus the
           run still closing its first law.
  (g) IT DOES NOT ACCUSE A CONVERGED FLASH OUTLET.  `unreactedGas` and
      `recycle` leave ammonia02's separator ON their dew point, g = -2.07e-06,
      and the pass named both the moment it was allowed to run everywhere.
      This arm requires them ABSENT: a check that accuses the innocent
      teaches the reader to ignore it (2026-09-04).
  (h) THE UNIT DISCARDS THE SAME ROOT THE REPORT DISCARDS (2026-09-26).
      `IsothermalFlash`'s duty re-resolves its feed through `solveCore`
      directly (R-E1, with the unit's own phase set) and, until this arm,
      ACCEPTED a two-phase root at a temperature above every present
      component's Tc -- blending a liquid that cannot exist into H_in --
      while the balance report, resolving the SAME feed through
      `flashState::equilibriumAt`, discarded it and said so.  Two readers of
      one state, two answers: ammoniaReactor04_kineticSizing's separator, fed at
      844.86 K and 200 bar (N2/H2/NH3/Ar, highest Tc present 405.4 K), closed
      at 90.32 % and carried the WHOLE plant residual, -22 274.7 kW (5.918 %).
      Four parts, read from a fresh run of that case:
        (h1) ARITY, source: `flashState::supercriticalSplitDiscarded` is
             DEFINED once, and BOTH `equilibriumAt` and the flash duty CALL
             it (comments stripped -- prose is not a call).
        (h2) SITE: the `[duty]` line says the feed's root was DISCARDED and
             names the Tc it was measured against.
        (h3) ANNOUNCED: the finding reaches the result JSON under the
             `feed '<stream>' of an isothermalFlash` locus EXACTLY ONCE --
             the unit is re-solved on every recycle pass, and the first build
             put 18 copies of it in the caveat block (each with its trial T),
             which is the wall of text the block exists to prevent.
        (h4) OUTPUT: the separator's energy closure, read from the engine's
             own report, is 100 +- 0.5 %, and the report's own discard line
             for `reacted` is STILL there -- the two readers agree by saying
             the same thing, not by one of them falling silent.
  (i) AN AUTHORED INLET IS READ AS WHAT IT MEANS, DURING THE SOLVE
      (2026-10-04, DEV.md C33 + C34).  A domain inlet that declares no phase
      carries the stream record's default `vf = 0` until something resolves
      it; the flowsheet's surface pass does so only AFTER the solve, so every
      unit that reads its inlet's phase must resolve it itself.
        (i1) SOURCE: each unit in INLET_READERS calls
             `flashState::resolvedInletVaporFraction` and keeps no bare
             `lookupScalarOrDefault("vf"` beside it (comments stripped; the
             two named non-inlet reads in BARE_VF_ALLOWED excepted).  The
             distillation column joined on 2026-10-05 (DEV.md §4d D1, decided
             by Vitor in C35), BOTH branches -- its single-feed `feed {}` and
             its `feeds ( ... )` streams go through one resolver that ends in
             this call.  The readers deliberately LEFT -- the electrodialysis
             stack, the isothermal flash's own feed re-flash -- are the table
             in DEV.md C33.
        (i2) OUTPUT: `inletState01_undeclared_vapour` feeds three undeclared
             superheated vapours to a valve, a mixer and a splitter.  The
             valve's T_out must equal its T_in within 0.5 K (an ideal-gas
             vapour has no Joule-Thomson effect) with vf = 1, the mixer's vf
             must be 1, both splitter branches must carry vf = 1, and the
             plant's first law must close within 1e-2 kW (the mixer's own Newton
             tolerance leaves ~1e-3 kW on 250 kmol/h; a misread inlet costs
             hundreds).
  (j) AN OUTLET SEARCH DISCARDS THE SAME ROOT (2026-10-04, C34).  The
      valve's and the adiabatic flash's outlet searches, the pipe's
      inlet-regime test and the isothermal flash's own OPERATING resolution
      called `solveCore` bare and accepted a two-phase root above every
      present component's Tc (DEV.md §5, 2026-09-26, named there).
        (j1) SOURCE: each unit in OUTLET_SEARCHERS searches through
             `flashState::flashDiscardingSupercriticalSplit` and calls no
             bare `IsothermalFlash::solveCore`; IsothermalFlash.cpp calls
             `flashState::takeSupercriticalAsSinglePhase` on its operating
             answer.
        (j2) OUTPUT: a one-drum fixture built from (h)'s own converged
             `reacted` (844.86 K, 200 bar) and operated at the feed's T and P
             publishes NO liquid, says so at its site and once on the result
             JSON under `isothermalFlash operating state`.  NOT reached by any
             output arm: the valve's and the adiabatic flash's outlet
             searches (their bracket stops at 700 K, and no corpus state
             below it resolves a supercritical root) and the pipe -- those
             ride (j1) alone.
  (k) A PINNED PURE TWO-PHASE INLET IS READ AT ITS PIN, BY EVERY UNIT
      (2026-10-05, DEV.md C37 item 1).  On a pure component's saturation
      curve (T, P) are ONE condition; a stream that declares `vaporFraction
      q;` there carries its state in the pin, and a flash at (T, P, z) hands
      back one side of the curve chosen by the last digits of T.  Until C37
      only heatExchanger, heater and phaseChanger asked
      `flashState::pinnedPureQuality` before resolving; every other unit
      reading its inlet through `resolvedInletVaporFraction` lost the pin.
        (k1) SOURCE: `pinnedPureQuality` is CALLED inside the one home
             (StreamEquilibrium.H: `resolvedInletVaporFraction` and
             `resolveStreamThermalState`, so exactly two calls, comments
             stripped), and none of the three units overrides the resolved
             vf with the pin any more (`s.vf = *q`, `qInPinned ? *qInPinned`
             -- a second home for the rule beside the one home).
        (k2) OUTPUT: a fixture -- heatExchanger03's own water record and its
             published wetFeed (pure water, 515.579742 K, 40 bar, pinned
             `vaporFraction 0.09917968728`) declared as an AUTHORED inlet to
             a splitter, a unit with no pre-check of its own -- must publish
             BOTH branches at that vapour fraction, and the plant must close
             its first law to 1e-6 kW.
  (l) A DECLARED PURE-FLUID METHOD OWNS ITS COMPONENT'S SATURATION CURVE
      (2026-10-06, DEV.md 4c C39).  A case declaring `pureFluids { water {
      method IF97; } }` priced pure water's enthalpy on IF97 while every
      saturation pressure the package handed out read the record's Antoine,
      so at 1 bar the flash boiled water at 372.09 K and the enthalpy
      surface at 372.76 K: a stream between them was a vapour to one reader
      and a liquid to the other.
        (l1) SOURCE: `saturationPressure` (thermo/pureFluid/SaturationCurve)
             is DEFINED once; `ThermoPackage::Psat` and both phases
             (LiquidPhase, SolidPhase) call it; ThermoPackage.cpp reads no
             record `vp()` at all; and a record saturation read
             (`vp().Psat_Pa` / `vp.Psat_Pa`) appears in src/ only in the
             files of SAT_READ_ALLOWED, each of which holds no package with
             a declared method (the reasons are beside the list and in
             docs/design/a-saturation-curve-with-two-homes.md).  A new unit
             reading `comp(i).vp()` past a declared method fails here.
        (l2) OUTPUT: condenser01's own IF97 package and two AUTHORED pure
             water inlets at 1 bar that declare no phase, each split in two:
             `low` at 372.40 K (above the Antoine boiling point, BELOW
             IF97's) must leave both branches as LIQUID, and `high` at
             372.95 K (above both) as VAPOUR -- the control that the fixture
             is not liquid by construction.  The plant's first law must
             close to 1e-6 kW.
  (m) A CONVERSION REACTOR'S OUTLET MEANS ITS OWN EQUILIBRIUM (2026-10-17,
      DEV.md 4c C72).  The unit used to COPY its inlet's vf onto an outlet at
      another T and composition (the 2026-08-24 posture), so a liquid water
      feed split into H2 + O2 published the gas at vf = 0 and priced it on
      the liquid rung (C68 finding iii: ammoniaRoutes01_screening runs at
      0.02 bar partly for that reason).
        (m1) SOURCE: the rule has ONE home since C73,
             `reactor/ReactorOutlet.cpp`, which resolves through
             `flashState::equilibriumAt` exactly once; ConversionReactor.cpp
             reaches it through `reactorOutlet::outletState` exactly once
             (its wrapper), calls `equilibriumAt` itself NOWHERE (a second
             home), publishes the result on BOTH paths (`.vf = outSt.vf`),
             and never writes the inlet's vf on an outlet stream
             (`s.vf = vf_in` / `out.vf = vf_in`).
        (m2) OUTPUT: a fixture on the routes screen's ideal package at
             298.15 K and 1.01325 bar: liquid water (no phase declared) split
             to H2 + 1/2 O2 must publish vf = 1; H2 + 1/2 O2 burnt to water
             must publish vf = 0; the same with the inlet DECLARED `phase
             gas;` must publish vf = 0 too (a pin describes the inlet), with
             the two authored inlets' own readings as controls.
        (m3) ANNOUNCED: the departure from the declared inlet phase is said
             at its site (stderr) and reaches the result JSON exactly once,
             and is NOT said for the two unpinned inlets.
        (m4) The fixture's first law closes to 1e-6 kW: the duty is priced
             on the state the outlet publishes.
  (n) THE CSTR'S AND THE PFR'S OUTLETS MEAN THEIR OWN EQUILIBRIUM TOO
      (2026-10-17, DEV.md 4c C73).  Both used to publish their inlet's vf
      under "a reactor is not a phase-change device" (`out.vf = vf_in`, two
      sites each), so a liquid feed whose product boils left labelled
      liquid; the `pfr`'s single-reaction duty was `xi * dHrxn` on the
      feed's phase rung and paid no latent heat when the product left part
      vapour.
        (n1) SOURCE: CSTR.cpp and PFR.cpp each call
             `reactorOutlet::outletState` exactly twice (single- and
             multi-reaction), publish `.vf = outSt.vf` exactly twice, never
             write `.vf = vf_in` on an outlet, never call `equilibriumAt`
             themselves, and PFR.cpp never assigns a `Q_kW` from `dHrxn`.
        (n2) OUTPUT: a fixture on the routes screen's ideal package at
             298.15 K and 1 atm, every one of the FOUR sites: liquid water
             (no phase declared) split by a cstr and by a pfr, single- and
             multi-reaction, must publish vf = 1; H2 + O2 DECLARED `phase
             gas;` burnt by a cstr and by a pfr must publish vf = 0.
        (n3) ANNOUNCED: those two departures reach the result JSON exactly
             once each and are said at their sites; none is said for an
             unpinned inlet.
        (n4) The fixture's first law closes to 1e-6 kW: every duty is
             priced on the state its outlet publishes (the pfr's
             single-reaction path included).
        (n5) THE ENERGY SOLVES ON THE PUBLISHED SURFACE (2026-10-17, DEV.md
             4c C77; it replaced C73's "what is left is SAID").  The cstr's
             and the pfr's adiabatic / heatExchange balances used to find
             T_out on the FEED's phase rung: cstr04_adiabatic at 1 atm landed
             at 454.15 K, published the product as a vapour (vf = 1) and an
             "adiabatic" duty of +9.3569 kW -- the latent heat its balance
             never saw -- and could only announce the mismatch.  Now the
             enthalpy each solve balances is the outlet's own equilibrium,
             priced by the report's rule (`reactorOutlet::pricedOutlet` /
             `temperatureOfEnthalpy`).  SOURCE: CSTR.cpp reaches
             `reactorOutlet::pricedOutlet`, PFR.cpp
             `reactorOutlet::temperatureOfEnthalpy`, neither prices an
             enthalpy on the inlet's rung (`H_stream_formation(..., vf_in,
             ...)`), and `announceEnergyRungMismatch` exists nowhere in
             src/.  OUTPUT, three copies at 1 atm of corpus cases whose
             product boils there: cstr04_adiabatic and pfr04_adiabatic must
             publish |Q_kW| <= 1e-6 kW with a TWO-PHASE outlet (0 < vf < 1:
             the boiling inside the balance is what holds T down), and
             cstr06_jacketed must publish Q_kW = UA (T_coolant - T_out) to
             1e-6 kW, also two-phase; none may announce an unmatched
             enthalpy or a rung mismatch, and each plant's first law closes
             to 1e-6 kW.  A fourth copy, cstr05_multiplicity at 1 atm, must
             ALSO find its three steady states: the scan's ceiling (the
             complete-conversion temperature) is a Newton on the same
             surface, the boiling puts a kink in it, and the first C77 cut
             stalled there at the feed's T -- the ceiling sat below the
             ignited branch and the run reported ONE steady state at exit 0.
  (e) flash13_acetic_ethanol_vacuum_flash keeps a LARGE duty -- the
      negative control.  Its feed is at 1 atm and it operates at 0.65 atm,
      so its 669 kW is genuine pressure-drop work; a gate that drove every
      flash duty to zero would be measuring its own wish.  This arm exists
      because the first blast-radius sweep DID predict flash13 would move
      (it compared temperature and forgot pressure).

SABOTAGE-VERIFIED 2026-09-08 for (f)/(g), by hand, on the engine source.
Three sabotages, and TWO of them survived their arm's first version -- both
because a presence test was satisfied by something other than its subject:

  S1  restore the `if (r.declares)` gate around the phase pass.  Arm (f)
      fails, naming the adiabatic converter.  SURVIVED FIRST: the arm asked
      only whether the string "hotEffluent" appeared in the log, and it
      appears in every stream table; tightened to the `[phase] stream '...'`
      line.
  S2  drop the incipient band back to the old absolute 1e-6.  Arm (g) fails
      on BOTH saturated separator outlets.
  S3  delete the `AdvisoryLog` call, keep the stderr line.  Arm (f)'s JSON
      half fails.  SURVIVED TWICE, for two different reasons, and the second
      is the one worth carrying forward:
        - the report ALREADY announces under the locus `stream '<name>'`
          from `flashState::equilibriumAt`, so keying on the locus alone
          matched an advisory that predates this pass entirely.  The arm now
          requires the locus AND this finding's own words on ONE line.
        - the second attempt "survived" because the sabotage NEVER LANDED:
          it was applied by string replacement against source that had been
          re-indented since the pattern was written, and `str.replace` with
          no match is a silent no-op.  A SABOTAGE THAT DOES NOT LAND PROVES
          THE GATE IS FINE, which is the opposite of what it was run to
          find out.  Assert the edit applied before believing its verdict.

SABOTAGE-VERIFIED 2026-10-04 for (i)/(j), by hand on the engine source,
each restored by git and rebuilt:
  S1  `resolvedInletVaporFraction` returns the carried value (the one home
      bypassed).  (i2) fails five ways: the valve lets the 450 K vapour down
      to 384.5 K at vf = 0.315, the mixer and both splitter branches publish
      vf = 0, and the plant's first law misses by 1659.5 kW.
  S2  the flash's operating discard disarmed (`if (false && ...)`, the call
      left in place).  (j1) PASSES -- it reads the call -- and (j2) fails
      three ways: the drum publishes 7.685 kmol/s of liquid, no site line,
      no advisory.  The output arm is the one that can see a disarmed call.
  S3  the valve's outlet search back to a bare `IsothermalFlash::solveCore`.
      (j1) fails twice (no one-home call; a bare solveCore).
  S4  the mixer stops asking the one home (`vf = vfCarried`).  SURVIVED its
      first version's mixer-vf sub-check: the valve's PRODUCED vapour
      outvoted the authored feedB, so the outlet stayed vapour either way and
      only (i1) and the closure (258.9 kW) caught it.  feedB is now the larger
      inlet, and S4 is caught three ways: (i1), M1 vf = 0, 1306.8 kW.
  S5  `takeSupercriticalAsSinglePhase` hollowed (returns before it
      discards; every caller intact).  (j2) fails three ways.

SABOTAGE-VERIFIED 2026-10-05 for (k), by hand on the engine source,
restored by git and rebuilt:
  S1  `resolvedInletVaporFraction` stops asking `pinnedPureQuality` (the
      line removed), the binary rebuilt, the source then restored WITHOUT a
      rebuild so the run read the sabotaged engine against the intact
      source.  (k1) PASSES -- it reads the restored source -- and (k2) fails
      three ways: both splitter branches publish vf = 0 for an inlet pinned
      at 0.09917968728, and the fixture's first law misses by 98.2787 kW
      (the unboiled fraction's latent heat, priced on one side of the
      curve).  The output arm is the one that sees the engine.

SABOTAGE-VERIFIED 2026-10-06 for (l), by hand on the engine source, each
restored from a copy and the tree rebuilt with `make all` at the end:
  S1  `ThermoPackage::Psat` reads the record (`return
      components_.at(i).vp().Psat_Pa(T_K);`), rebuilt -- the one home
      bypassed at the package door.  (l1) fails three ways (no
      `saturationPressure` call, a `vp()` read, a record saturation read in
      a file not allowed) and (l2) fails twice: `lowA`/`lowB` leave at
      vf = 1.  Then the SOURCE restored without a rebuild: (l1) PASSES -- it
      reads the restored source -- and (l2) still fails on both branches.
      The output arm is the one that sees the engine.
  S2  `LiquidPhase::fEffective` back to `(*components_)[i].vp().Psat_Pa(T)`
      (source only).  (l1) fails twice, naming LiquidPhase.cpp.  No output
      arm reaches it: an IF97 package carries no second liquid or solid, so
      no corpus flash asks `Kvec_phases` there -- a SOURCE arm by necessity.
  S3  `psychrometry::Ysat` back to `thermo.comp(iMoist).vp().Psat_Pa(T)`
      (source only).  (l1) fails, naming Psychrometry.H -- the shape of a
      future unit reading the record past a declared method.
  S4  `saturationPressure`'s window disarmed (`if (false && ...)`, the call
      sites intact), rebuilt.  (l1) PASSES -- every call is in place -- and
      (l2) fails on both `low` branches.

SABOTAGE-VERIFIED 2026-10-17 for (m), by hand on the engine source, each
applied by asserted string replacement (a sabotage that does not land proves
nothing), rebuilt, and restored from a copy and rebuilt:
  S1  both outlet sites back to `s.vf = vf_in` / `out.vf = vf_in` (the
      resolution still computed).  (m1) fails twice, (m2) three times
      (splitGas 0, burnt 1, burntPinned 1) and (m4) at -2476.42 kW: the duty
      priced the resolved state while the stream carried the inlet's.
  S2  the departure test disarmed (`if (false && declaredSingle ...)`).
      (m3) fails twice (no JSON entry, no site line).
  S3  the duty priced on the inlet's vf (`false, vf_in`), the outlet still
      resolved.  Only (m4) sees it: +2476.42 kW.
  S4  the AdvisoryLog call removed, the stderr line kept.  (m3) fails on the
      JSON half alone -- the site line is the slightly-louder form of
      silence.

SABOTAGE-VERIFIED 2026-10-17 for (n) and the moved (m1), by hand on the
engine source, each applied by asserted string replacement, rebuilt, the
gate run, then restored by `git checkout` and rebuilt:
  S1  the cstr's single-reaction site back to `out.vf = vf_in`.  (n1) fails
      twice and (n2) twice (cSplit vf 0, cBurnP vf 1).  (n4) PASSES: the
      duty prices `produced_`, so it agrees with the wrong state it
      publishes -- closure cannot see a carried label, only (n2) can.
  S2  the pfr's multi-reaction site back to `out.vf = vf_in`.  (n1) twice,
      (n2) once (pSplitM vf 0).
  S3  the pfr's single-reaction duty back to `xi * dHrxn` on the feed's
      rung.  (n1) once and (n4) at 12.3821 kW -- the latent heat of 1 kmol/h
      of water the old duty never paid.  Only those two arms see it.
  S4  the one home's declared-phase departure disarmed (`if (false &&
      ...)`).  (m3) twice and (n3) four times: one home, three reactors.
  S5  `announceEnergyRungMismatch` hollowed (`if (true) return;`).  (n5)
      twice (JSON and site); nothing else moves -- the published state and
      duty are untouched, only the explanation goes silent.  (RETIRED with
      the function by C77: the gap it announced is closed; see S7-S10.)

SABOTAGE-VERIFIED 2026-10-17 for the C77 (n5), by hand on the engine
source, each applied with Edit, rebuilt, the gate run, restored by `git
checkout` of the file and rebuilt once at the end:
  S7  the cstr's phi back on the inlet's rung (`Ftot *
      H_stream_formation(Tk, P, vf_in, zz)`).  (n5) source once; cstr04 and
      cstr06 at 1 atm do not run at all (the scan, bracketed on the
      published surface, holds no root of the inlet-rung balance: "no
      steady state found", exit 2); cstr05 reports vf = 0 and 2 steady
      states.
  S8  the inversion kept on ONE rung and never confirmed (the fast path
      returns `T1` at `vfR` always -- the pre-C77 march).  Only the pfr
      sees it, and only by OUTPUT: pfr04 at 1 atm back to vf = 1 and Q_kW =
      9.35824911683, the base number to the last digit.  NOTE: the weaker
      form (accept the fast path but still record the RESOLVED vf) SURVIVED
      -- the march self-corrects one point later, because the next call
      sees the split and brackets -- which is why the arm was not
      weakened to a source pattern over ReactorOutlet.cpp.
  S9  the published surface's split priced as a QUALITY BLEND (`hOfState`
      skipped).  Every fixture's duty parts from the report's: cstr04
      +0.0037, pfr04 -0.0714, cstr05 -0.0062 kW and cstr06 off its jacket
      by 0.0016 kW -- and the cstr's `announceUnmatchedEnthalpy` FIRED on
      the three cstr fixtures, the one live firing of that announcement
      anywhere (it is otherwise reached by no fixture).
  S10 the scan ceiling's bracket fallback disabled (`if (false && ...)`).
      Only the multiplicity copy sees it: cstr05 at 1 atm finds ONE steady
      state (the low branch, vf = 0) instead of three, at exit 0.
  S6  a SECOND HOME: the cstr's multi-reaction site resolving its own
      `flashState::equilibriumAt` instead of reading `outSt`.  (n1) twice;
      every OUTPUT arm PASSES, because the second copy gives the same number
      today.  The arity rule is a source rule: the output cannot see a copy
      that has not yet drifted.

SABOTAGE-VERIFIED 2026-08-09: reverting the R-E1 gate (unpinned feeds no
longer re-flashed -- the pre-slice behaviour) reproduced the original
defect and this gate named every instance: flash19 Q = 13.4913 kW with its
closure collapsing to 0.00 %, flash09 196.1403 kW, flash20 587.4659 and
733.0349 kW.  Restoring returns all four to zero.

WHAT THIS DOES NOT CHECK, said plainly:
  * Whether a non-zero duty is RIGHT.  The identity case is checkable
    because its answer is zero; a real duty's correctness is its own
    case's golden and, where one exists, its published anchor.
  * The multi-condition cases (cavett01, ammonia02, ...).  Their feeds are
    multiphase at their own states, so the correct duty is not zero and
    there is no closed form to assert -- they ride their goldens.  Arms (f)
    and (g) read ammonia02 for its PHASE LABELS only, never for a duty.
  * Whether the incipient band of 1e-3 is the right number.  It is a stated
    choice, not a derived tolerance, and a stream genuinely between 1e-6 and
    1e-3 off saturation is reported by nothing.
  * Whether a non-isothermal `cstr`'s or `pfr`'s T_out is RIGHT beyond its
    own energy balance: (n5) checks the balance closes on the published
    surface (Q = 0, Q = UA (T_c - T_out)), not that the liquid-basis
    kinetics mean anything in a boiling mixture.  A `pfr` heatExchange
    march crossing a phase boundary has no fixture (source only), and a
    PURE product on its saturation jump -- announced by both reactors
    (`announceUnmatchedEnthalpy`) -- is reached by no fixture at all.
  * Any package with NO vapour phase: the test is vapour-liquid and skips
    those by `hasEos()`.  That skip exists because asking anyway segfaulted
    (`ThermoPackage::Kvec` dereferenced a null EoS handle); the refusal that
    replaced the crash is not fired by this gate.
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
IDENTITY = [
    "tutorials/steady/flash/flash19_organic_and_precipitate",
    "tutorials/steady/flash/flash09_nh3_water_reactive",
    "tutorials/steady/flash/flash20_ethanol_water_pcsaft",
]
CONTROL = "tutorials/steady/flash/flash13_acetic_ethanol_vacuum_flash"
BAND_KW = 0.5
#  (h) the supercritical-feed witness: the first corpus case to put a stream
#  above every component's Tc through an isothermalFlash on the duty path.
SUPERCRITICAL = "tutorials/plant/ammoniaReactor04_kineticSizing"
SUPERCRITICAL_UNIT = "separator"
SUPERCRITICAL_FEED = "reacted"
ONE_HOME = ROOT / "src/unitOperations/flash/StreamEquilibrium.H"
FLASH_SRC = ROOT / "src/unitOperations/flash/IsothermalFlash.cpp"
#  (i) the units that read an inlet's vapour fraction DURING the solve, each
#  through the one home (DEV.md C33 + C34).  The readers deliberately LEFT,
#  each with its reason, are the table in DEV.md C33 -- they are not here.
UNITS = ROOT / "src/unitOperations"
INLET_READERS = [
    "valve/Valve.cpp",
    "flash/AdiabaticFlash.cpp",
    "heatTransfer/HeatExchanger.cpp",
    "storage/StorageTank.cpp",
    "mixer/Mixer.cpp",
    "mixer/Splitter.cpp",
    "reactor/CSTR.cpp",
    "reactor/PFR.cpp",
    "reactor/ConversionReactor.cpp",
    "distillation/ShortcutColumn.cpp",
    "distillation/DistillationColumn.cpp",
    "heatTransfer/SprayDryer.cpp",
    "heatTransfer/SolidDryer.cpp",
    "heatTransfer/ConvectiveDryer.cpp",
    "heatTransfer/Heater.cpp",
    "heatTransfer/PhaseChanger.cpp",
    "heatTransfer/MultiStreamHX.cpp",
]
#  The two bare `vf` reads that are not the inlet's reading: multiStreamHX's
#  DECLARED outlet phase in `operation.outlet.<stream>` (`od`), whose default
#  is the resolved inlet; and the mixer's CARRIED value, kept -- announced --
#  for a two-phase authored inlet its one-phase balance cannot carry (the
#  stated default of C34, cavett01).
BARE_VF_ALLOWED = {
    "heatTransfer/MultiStreamHX.cpp": r"\bod->lookupScalarOrDefault",
    "mixer/Mixer.cpp": r"\bvfCarried\s*=\s*sd->lookupScalarOrDefault",
}
WITNESS = "tutorials/steady/flowsheets/inletState01_undeclared_vapour"
#  (k) the pinned pure two-phase inlet: heatExchanger03's water and its own
#  published wet feedwater, re-declared as an AUTHORED inlet to a splitter.
PURE_PIN_SRC = "tutorials/steady/heat/heatExchanger03_pure_water_plateau"
PURE_PIN_STREAM = "wetFeed"
#  The override each of the three units carried before C37 (a second home).
PURE_PIN_UNITS = {
    "heatTransfer/HeatExchanger.cpp": r"\bs\.vf\s*=\s*\*q\b",
    "heatTransfer/Heater.cpp": r"qInPinned\s*\?\s*\*qInPinned\s*:\s*"
                               r"flashState::resolvedInletVaporFraction",
    "heatTransfer/PhaseChanger.cpp": r"qInPinned\s*\?\s*\*qInPinned\s*"
                                     r":\s*flashState::"
                                     r"resolvedInletVaporFraction",
}
#  (l) the declared pure-fluid method owns the saturation curve (C39).  The
#  IF97 package is condenser01's own; the record saturation reads that stay
#  in src/, each in a file that holds no package with a declared method:
SAT_HOME = ROOT / "src/thermo/pureFluid/SaturationCurve.cpp"
SAT_PKG = ROOT / "src/thermo/ThermoPackage.cpp"
SAT_PHASES = [ROOT / "src/thermo/phase/LiquidPhase.cpp",
              ROOT / "src/thermo/phase/SolidPhase.cpp"]
SAT_READ_ALLOWED = {
    #  the one home itself: the record answers where no method is declared
    #  and outside a declared method's window (announced).
    "src/thermo/pureFluid/SaturationCurve.cpp",
    #  the component's own formation-entropy leg at 298.15 K: the record's
    #  own datum, below the package.
    "src/thermo/Component.cpp",
    #  the reactive electrolyte builder: its formulation refuses a
    #  `pureFluids {}` block (ThermoPackageBuilder: "transport/pureFluids on
    #  formulation ... is not wired natively").
    "src/thermo/ThermoPackageBuilder.cpp",
    #  props ops on a BARE record (no package): the speciate op's solvent
    #  leg and the freezing-point op's own ice phase.
    "src/propertyOps/Speciate.cpp",
    "src/propertyOps/FreezingPoint.cpp",
    #  the heater's and the phase changer's dome bisection for a dominant
    #  component that is NOT effectively pure; a flagged component there
    #  takes `pureFluid(dom).T_sat` when pure, and a mixed flagged phase is
    #  refused by the enthalpy route before this line is reached.
    "src/unitOperations/heatTransfer/Heater.cpp",
    "src/unitOperations/heatTransfer/PhaseChanger.cpp",
}
SAT_SRC = "tutorials/steady/heat/condenser01_film_nusselt"
SAT_LOW_K, SAT_HIGH_K = 372.40, 372.95

#  (m) the conversion reactor's outlet is its own equilibrium (C72); the
#  fixture borrows the routes screen's ideal-gas/Raoult package (water, H2,
#  O2 on the formation datum).
CONV_REACTOR = "reactor/ConversionReactor.cpp"
CONV_SRC = "tutorials/plant/ammoniaRoutes01_screening"
#  (n) the ONE home of the rule since C73, and the two kinetic reactors
OUTLET_HOME = "reactor/ReactorOutlet.cpp"
KINETIC_REACTORS = ["reactor/CSTR.cpp", "reactor/PFR.cpp"]
ADIABATIC_SRC = "tutorials/steady/reactors/cstr04_adiabatic"
#  (n5) the energy solves on the published surface (C77): the adiabatic pfr
#  and the jacketed cstr, copied to 1 atm beside cstr04
ADIABATIC_PFR_SRC = "tutorials/steady/reactors/pfr04_adiabatic"
JACKETED_SRC = "tutorials/steady/reactors/cstr06_jacketed"
MULTIPLICITY_SRC = "tutorials/steady/reactors/cstr05_multiplicity"

#  (j) the units that search their own OUTLET (or regime) with a flash
OUTLET_SEARCHERS = [
    "valve/Valve.cpp",
    "flash/AdiabaticFlash.cpp",
    "hydraulics/Pipe.cpp",
    "heatTransfer/PhaseChanger.cpp",
]


def run(case: pathlib.Path):
    for junk in case.glob("log.*"):
        junk.unlink()
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    log = case / "log.choupoSolve"
    return r.returncode, (log.read_text() if log.is_file() else "") + r.stdout + r.stderr


def duties(log: str):
    return [float(m) for m in re.findall(r'"Q_kW":\s*([-0-9.eE+]+)', log)]


def closure(case: pathlib.Path):
    f = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 6:
            try:
                return float(p[5])
            except ValueError:
                return None
    return None


def closure_of(case: pathlib.Path, unit: str):
    f = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 6 and p[0] == unit:
            try:
                return float(p[5])
            except ValueError:
                return None
    return None


def strip_comments(text: str) -> str:
    """Drop // and /* */ comments so a symbol named in prose is not a call
    (check_sector_hierarchy arm (g) paid for that)."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def main() -> int:
    fail = []
    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)

        # (a) + (c) the identity claim, on three cases
        for rel in IDENTITY:
            case = tmp / pathlib.Path(rel).name
            shutil.copytree(ROOT / rel, case)
            rc, log = run(case)
            if rc != 0:
                fail.append(f"{rel}: run failed (rc={rc})")
                continue
            qs = duties(log)
            if not qs:
                fail.append(f"{rel}: published no Q_kW -- the identity claim "
                            "cannot be read")
            for q in qs:
                if abs(q) > BAND_KW:
                    fail.append(f"{rel}: Q = {q:.4f} kW at the feed's own "
                                "(T, P) -- a flash that changes nothing must "
                                "cost nothing (R-E1)")
            # (b) unit and report agree, on the flagship
            if rel.endswith("flash19_organic_and_precipitate"):
                c = closure(case)
                if c is None:
                    fail.append("flash19: no energy closure row")
                elif abs(c - 100.0) > 0.5:
                    fail.append(f"flash19: energy closure {c:.2f} % -- the "
                                "unit duty and the balance report are not "
                                "obtaining H the same way (R-E5)")

        # (d) the pin is honoured AND announced
        pinned = tmp / "flash19_pinned"
        shutil.copytree(ROOT / "tutorials/steady/flash/flash19_organic_and_precipitate",
                        pinned)
        feed = pinned / "0" / "feed"
        feed.write_text(feed.read_text().rstrip() + "\nphase           liquid;\n")
        man = pinned / "constant" / "propertyManifest"
        if man.exists():
            man.write_text(re.sub(r"sealed\s+true;", "sealed false;",
                                  man.read_text()))
        rc, log = run(pinned)
        if rc != 0:
            fail.append(f"the pinned copy did not run (rc={rc}) -- `phase "
                        "liquid;` is legal grammar and must be honoured")
        else:
            qs = duties(log)
            if qs and all(abs(q) <= BAND_KW for q in qs):
                fail.append("a feed pinned `phase liquid;` priced the SAME as "
                            "an unpinned one -- the declaration was ignored "
                            "(R-E2: absence of a pin is never a pin, and a pin "
                            "is never absence)")
            if "PINNED" not in log:
                fail.append("the pinned feed's duty was not ANNOUNCED -- a "
                            "declared constraint that costs energy may not be "
                            "silent (R-E2)")

        # (f1) SOURCE: the pass is not gated on the consumer.
        src = (ROOT / "src/reporting/EnergyBalanceReport.cpp").read_text()
        m = re.search(r"\n(\s*)\{\n\s*std::string found;", src)
        if not m:
            fail.append("(f1) the phase pass's opening block moved -- "
                        "resynthesize this arm against the new shape")
        else:
            before = src[max(0, m.start() - 400):m.start()]
            if re.search(r"if\s*\([^)]*\br\.declares\b", before):
                fail.append(
                    "(f1) the phase pass is enclosed in a condition on "
                    "`r.declares` again.  A unit that declares no energy item "
                    "-- an ADIABATIC reactor -- can then never be reached, and "
                    "that is precisely how 22 376 kW went unreported on "
                    "ammonia02 at exit 0.")

        # (f2) + (g) the phase pass, on the case that proved it disarmed.
        am = tmp / "ammonia02"
        shutil.copytree(
            ROOT / "tutorials/plant/ammonia02_full_plant", am)
        rc, log = run(am)
        if rc != 0:
            fail.append("ammonia02 did not run -- arms (f)/(g) cannot judge")
        else:
            #  (f) the ADIABATIC unit's outlet is named, and it is ANNOUNCED
            #  (the result JSON), not merely printed.
            #  (f2) THE SILENCE IS THE CLAIM NOW.  `hotEffluent` at 839.6 K
            #  is 434 K above the highest pure Tc present, so no statement
            #  about its dew point is available and the pass must say
            #  nothing about it.
            if re.search(r"\[phase\] stream 'hotEffluent'", log):
                fail.append(
                    "(f2) ammonia02's `hotEffluent` was ACCUSED of an "
                    "impossible phase at 839.6 K, where the highest pure "
                    "critical temperature among the components present is "
                    "ammonia's 405.5 K.  There is no dew point 434 K above "
                    "every Tc, so there is no statement to make: the g(V=1) "
                    "behind the accusation comes from a Psat extrapolated "
                    "above Tc, where the saturation curve does not exist.  A "
                    "check that accuses the innocent teaches the reader to "
                    "ignore it.")
            elif False:
                #  BOTH, on ONE line.  The locus alone is not evidence: the
                #  balance report ALREADY announces under `stream '<name>'`
                #  when it re-resolves a state (`flashState::equilibriumAt`
                #  is handed exactly that locus in BalanceMath.H), so an
                #  arm keyed on the locus is satisfied by an advisory that
                #  predates this pass entirely.  Measured, not supposed:
                #  sabotage S3 -- delete the AdvisoryLog call, keep the
                #  stderr line -- SURVIVED this arm's first version for
                #  precisely that reason.
                fail.append(
                    "(f) `hotEffluent` was PRINTED but its impossible-phase "
                    "finding did not reach the result JSON -- it no longer "
                    "rides AdvisoryLog, so it reaches neither the end-of-run "
                    "caveat block, the JSON, nor the GUI; a line on stderr "
                    "at log line 108 of 1200 is the slightly-louder form of "
                    "silence this project has a caveat block to end")
            #  (g) the separator's own saturated outlets are NOT accused.
            for innocent in ("unreactedGas", "recycle"):
                if re.search(r"\[phase\] stream '" + innocent + r"'", log):
                    fail.append(
                        f"(g) `{innocent}` was accused of an impossible "
                        "phase.  It LEAVES an equilibrium flash, so it sits "
                        "on its dew point by construction (g = -2.07e-06) -- "
                        "the incipient band has collapsed back onto solver "
                        "round-off and the pass is now crying wolf at every "
                        "converged flash outlet in the corpus.")

        # (h1) ARITY, source: one definition, two callers, comments stripped.
        home = strip_comments(ONE_HOME.read_text())
        flash = strip_comments(FLASH_SRC.read_text())
        n_def = len(re.findall(r"\bsupercriticalSplitDiscarded\s*\(", home))
        #  the definition, the call inside equilibriumAt, and the call inside
        #  takeSupercriticalAsSinglePhase (the outlet-search form, arm (j))
        if n_def != 3:
            fail.append(
                f"(h1) `supercriticalSplitDiscarded` appears {n_def} time(s) "
                "in StreamEquilibrium.H outside comments; expected exactly 3 "
                "-- its ONE definition, the call from `equilibriumAt` and the "
                "call from `takeSupercriticalAsSinglePhase`.  The discard has "
                "a second home, or one of its two readers lost it.")
        if not re.search(r"flashState::supercriticalSplitDiscarded\s*\(", flash):
            fail.append(
                "(h1) IsothermalFlash.cpp does not CALL "
                "`flashState::supercriticalSplitDiscarded` -- the duty is "
                "back to accepting a two-phase root above every Tc that the "
                "balance report discards (ammoniaReactor04: -22 274.7 kW on "
                "one separator).")
        if re.search(r"aboveEveryCriticalT\s*\(", flash):
            fail.append(
                "(h1) IsothermalFlash.cpp calls `aboveEveryCriticalT` "
                "directly -- a second copy of the two-phase test around the "
                "one-home criterion.  Call `supercriticalSplitDiscarded`, "
                "which holds the test AND the sentence.")

        # (h2)-(h4) the supercritical witness, run fresh
        sc = tmp / "ammoniaReactor04"
        shutil.copytree(ROOT / SUPERCRITICAL, sc)
        rc, log = run(sc)
        if rc != 0:
            fail.append("(h) ammoniaReactor04_kineticSizing did not run -- the "
                        "supercritical-feed arm cannot judge")
        else:
            #  (h2) the site line
            if not re.search(r"\[duty\] the feed at T = [0-9.]+ K resolved "
                             r"TWO-PHASE .*DISCARDED", log):
                fail.append(
                    "(h2) the separator's duty printed no `[duty] ... "
                    "DISCARDED` line for its 844.86 K feed: the two-phase "
                    "root above every Tc was either accepted or discarded in "
                    "silence.  Silence at the site is the crutch.")
            #  (h3) announced, ONCE, under the stream-named locus
            locus = f'"locus": "feed \'{SUPERCRITICAL_FEED}\' of an isothermalFlash"'
            n_adv = len(re.findall(re.escape(locus) + r'.*?TWO-PHASE', log))
            if n_adv != 1:
                fail.append(
                    f"(h3) the discard reached the result JSON {n_adv} "
                    f"time(s) under {locus}; expected exactly 1.  Zero means "
                    "it no longer rides AdvisoryLog (the site line is the "
                    "slightly-louder form of silence); more than one means the "
                    "trial T is back in the message and every recycle pass "
                    "files a new caveat -- 18 on the first build.")
            #  (h4) the unit and the report agree, each saying so
            c = closure_of(sc, SUPERCRITICAL_UNIT)
            if c is None:
                fail.append("(h4) no energy closure row for the separator")
            elif abs(c - 100.0) > 0.5:
                fail.append(
                    f"(h4) ammoniaReactor04's separator closes at {c:.2f} % -- "
                    "its duty and the balance report are pricing the 844.86 K "
                    "feed on different phase sets (R-E5).  Before 2026-09-26 "
                    "this read 90.32 %, and it was the whole plant residual.")
            if not re.search(r"stream '" + SUPERCRITICAL_FEED
                             + r"': resolved TWO-PHASE at T = [0-9.]+ K.*DISCARDED",
                             log):
                fail.append(
                    "(h4) the balance report no longer says it discarded "
                    f"`{SUPERCRITICAL_FEED}`'s supercritical root -- the two "
                    "readers must agree by both saying so, not by one going "
                    "silent.")

            # (j2) THE DRUM OPERATED ABOVE EVERY Tc, built from this run's own
            #  converged `reacted` (844.86 K, 200 bar): one isothermalFlash
            #  that inherits the feed's T and P.  Its operating resolution
            #  must discard the same root its duty and the report discard,
            #  and publish NO liquid.
            conv = sc / "converged" / SUPERCRITICAL_FEED
            if not conv.is_file():
                fail.append("(j2) ammoniaReactor04 wrote no converged/"
                            f"{SUPERCRITICAL_FEED} -- the drum fixture "
                            "cannot be built")
            else:
                drum = tmp / "drumAboveEveryTc"
                (drum / "system").mkdir(parents=True)
                (drum / "0").mkdir()
                shutil.copytree(sc / "constant", drum / "constant")
                shutil.copy(sc / "system" / "controlDict",
                            drum / "system" / "controlDict")
                for nm in ("reacted", "liq", "vap"):
                    shutil.copy(conv, drum / "0" / nm)
                (drum / "system" / "flowsheetDict").write_text(
                    "units\n(\n    {\n        name drum;\n"
                    "        type isothermalFlash;\n        in reacted;\n"
                    "        outputs ( liq vap );\n        operation { }\n"
                    "    }\n);\n")
                rc, dlog = run(drum)
                m = re.search(r'"liq":\s*\{\s*"F":\s*([-0-9.eE+]+)', dlog)
                if rc != 0 or not m:
                    fail.append(f"(j2) the drum fixture did not run (rc={rc})"
                                " or published no `liq` stream")
                else:
                    if abs(float(m.group(1))) > 1e-12:
                        fail.append(
                            "(j2) a drum operated at 844.86 K and 200 bar, "
                            "above every present component's Tc (405.4 K), "
                            f"published a LIQUID product of {m.group(1)} "
                            "kmol/s: its operating resolution accepted the "
                            "two-phase root its own duty and the report "
                            "discard (DEV.md §5, 2026-09-26).")
                    if not re.search(r"\[flash\] resolved TWO-PHASE .*"
                                     r"DISCARDED", dlog):
                        fail.append("(j2) the drum's operating discard printed "
                                    "no `[flash] ... DISCARDED` line at its "
                                    "site")
                    loc = '"locus": "isothermalFlash operating state"'
                    n = len(re.findall(re.escape(loc) + r".*?TWO-PHASE", dlog))
                    if n != 1:
                        fail.append(
                            "(j2) the operating discard reached the result "
                            f"JSON {n} time(s) under {loc}; expected exactly 1")

        # (i1) SOURCE: every inlet-vf reader goes through the one home, and
        #  none keeps a bare `vf` read beside it.
        for rel in INLET_READERS:
            src = strip_comments((UNITS / rel).read_text())
            if not re.search(r"\bresolvedInletVaporFraction\s*\(", src):
                fail.append(
                    f"(i1) {rel} no longer reads its inlet through "
                    "`flashState::resolvedInletVaporFraction` -- an unpinned "
                    "authored vapour reaches it as the struct default, a "
                    "liquid (DEV.md C33/C34)")
            allowed = BARE_VF_ALLOWED.get(rel)
            for line in src.splitlines():
                if re.search(r'lookupScalarOrDefault\(\s*"vf"', line) and not (
                        allowed and re.search(allowed, line)):
                    fail.append(f"(i1) {rel} reads a bare `vf` again: "
                                f"{line.strip()[:110]}")

        # (i2) OUTPUT: the witness, whose three undeclared superheated feeds
        #  must reach the valve, the mixer and the splitter as vapours.
        w = tmp / "inletState01"
        shutil.copytree(ROOT / WITNESS, w)
        rc, wlog = run(w)
        if rc != 0:
            fail.append(f"(i2) {WITNESS} did not run (rc={rc})")
        else:
            def unit_kpis(name):
                tail = wlog.split('"kpis"')[-1] if '"kpis"' in wlog else ""
                m = re.search(r'"' + name + r'":\s*\{([^}]*)\}', tail)
                if not m:
                    return {}
                return {k: float(v) for k, v in re.findall(
                    r'"([A-Za-z_]+)":\s*([-0-9.eE+]+)', m.group(1))}
            v1, m1 = unit_kpis("V1"), unit_kpis("M1")
            if (v1.get("vf") != 1.0
                    or abs(v1.get("T_out", 0.0) - v1.get("T_in", -1.0)) > 0.5):
                fail.append(
                    f"(i2) V1 (valve) let an undeclared 450 K vapour down to "
                    f"T_out = {v1.get('T_out')} K, vf = {v1.get('vf')}: an "
                    "ideal-gas vapour has no Joule-Thomson effect, so this "
                    "valve read its inlet as the struct's default LIQUID")
            if m1.get("vf") != 1.0:
                fail.append("(i2) M1 (mixer) labelled two undeclared vapours' "
                            f"outlet vf = {m1.get('vf')}")
            for side in ("sideA", "sideB"):
                m = re.search(r'"' + side + r'":\s*\{[^}]*"vf":\s*([-0-9.eE+]+)',
                              wlog)
                if not m or float(m.group(1)) != 1.0:
                    fail.append(f"(i2) S1 (splitter) published `{side}` with "
                                f"vf = {m.group(1) if m else None}: a branch of "
                                "an undeclared vapour is a vapour")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":\s*'
                          r'([-0-9.eE+]+)', wlog)
            if not m or abs(float(m.group(1))) > 1e-2:
                fail.append("(i2) the witness's plant first law does not close "
                            f"(residual {m.group(1) if m else None} kW): the "
                            "units and the report read different inlet states")

        # (j1) SOURCE: every outlet search reads the one-home discard, and none
        #  calls the flash bare beside it.
        for rel in OUTLET_SEARCHERS:
            src = strip_comments((UNITS / rel).read_text())
            if not re.search(r"\bflashDiscardingSupercriticalSplit\s*\(", src):
                fail.append(f"(j1) {rel} does not search through "
                            "`flashState::flashDiscardingSupercriticalSplit`")
            if re.search(r"IsothermalFlash::solveCore\s*\(", src):
                fail.append(f"(j1) {rel} calls `IsothermalFlash::solveCore` "
                            "bare -- a two-phase root above every Tc is "
                            "accepted there again")
        if not re.search(r"\btakeSupercriticalAsSinglePhase\s*\(", flash):
            fail.append("(j1) IsothermalFlash.cpp's operating resolution does "
                        "not call `flashState::takeSupercriticalAsSinglePhase`")

        # (k1) SOURCE: the pin is read in the one home, and only there.
        n_pp = len(re.findall(r"\bpinnedPureQuality\s*\(", home))
        if n_pp != 2:
            fail.append(
                f"(k1) `pinnedPureQuality` is called {n_pp} time(s) in "
                "StreamEquilibrium.H outside comments; expected exactly 2 -- "
                "`resolvedInletVaporFraction` and `resolveStreamThermalState` "
                "must read a pure two-phase inlet's pin before resolving it "
                "(DEV.md C37 item 1), or every unit but three gets one side "
                "of the saturation curve")
        for rel, pat in PURE_PIN_UNITS.items():
            src = strip_comments((UNITS / rel).read_text())
            if re.search(pat, src):
                fail.append(
                    f"(k1) {rel} overrides its resolved inlet vf with the pin "
                    "again -- the rule has a second home beside "
                    "`resolvedInletVaporFraction`")

        # (k2) OUTPUT: an authored pinned pure two-phase inlet to a splitter.
        pp_src = ROOT / PURE_PIN_SRC
        pin_txt = (pp_src / "0" / PURE_PIN_STREAM).read_text()
        mq = re.search(r"^\s*vaporFraction\s+([0-9.eE+-]+)\s*;", pin_txt,
                       re.M)
        pp = tmp / "purePinSplitter"
        (pp / "system").mkdir(parents=True)
        (pp / "0").mkdir()
        shutil.copytree(pp_src / "constant", pp / "constant")
        shutil.copy(pp_src / "system" / "controlDict",
                    pp / "system" / "controlDict")
        for nm in ("wet", "a", "b"):
            (pp / "0" / nm).write_text(pin_txt)
        (pp / "system" / "flowsheetDict").write_text(
            "units\n(\n    {\n        name S1;\n        type splitter;\n"
            "        inputs ( wet );\n        outputs ( a b );\n"
            "        operation { fractions ( 0.5 0.5 ); }\n    }\n);\n")
        rc, plog = run(pp)
        if not mq:
            fail.append(f"(k2) {PURE_PIN_SRC}/0/{PURE_PIN_STREAM} no longer "
                        "declares a vaporFraction -- the fixture has no pin")
        elif rc != 0:
            fail.append("(k2) the pure-pin splitter fixture did not run "
                        f"(rc={rc})")
        else:
            q = float(mq.group(1))
            for side in ("a", "b"):
                m = re.search(r'"' + side + r'":\s*\{[^}]*"vf":\s*'
                              r'([-0-9.eE+]+)', plog)
                if not m or abs(float(m.group(1)) - q) > 1e-9:
                    fail.append(
                        f"(k2) the splitter published `{side}` at vf = "
                        f"{m.group(1) if m else None} from an authored PURE "
                        f"water inlet pinned at vaporFraction {q} on its "
                        "saturation curve: the pin was resolved away into one "
                        "side of the curve (DEV.md C37 item 1)")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":'
                          r'\s*([-0-9.eE+]+)', plog)
            if not m or abs(float(m.group(1))) > 1e-6:
                fail.append("(k2) the pure-pin fixture's first law does not "
                            f"close (residual {m.group(1) if m else None} kW)")

        # (l1) SOURCE: one home for a component's saturation curve.
        home_src = strip_comments(SAT_HOME.read_text())
        n_def = len(re.findall(r"^scalar\s+saturationPressure\s*\(",
                               home_src, re.M))
        if n_def != 1:
            fail.append(f"(l1) `saturationPressure` is defined {n_def} time(s) "
                        "in SaturationCurve.cpp; expected exactly 1")
        pkg_src = strip_comments(SAT_PKG.read_text())
        if not re.search(r"\bsaturationPressure\s*\(", pkg_src):
            fail.append("(l1) ThermoPackage.cpp does not call "
                        "`saturationPressure` -- `ThermoPackage::Psat` is not "
                        "the declared method's door")
        if re.search(r"\bvp\s*\(\s*\)", pkg_src):
            fail.append("(l1) ThermoPackage.cpp reads a record `vp()` again: "
                        "a K-value there would read the record's curve past a "
                        "declared pure-fluid method (ask `Psat(i, T)`)")
        for ph in SAT_PHASES:
            if not re.search(r"\bsaturationPressure\s*\(",
                             strip_comments(ph.read_text())):
                fail.append(f"(l1) {ph.relative_to(ROOT)} does not read its "
                            "reference saturation pressure through "
                            "`saturationPressure`")
        sat_pat = re.compile(r"\bvp\s*\(\s*\)\s*\.\s*Psat_Pa|\bvp\s*\.\s*Psat_Pa")
        for f in sorted((ROOT / "src").rglob("*")):
            if f.suffix not in (".cpp", ".H") or not f.is_file():
                continue
            rel = str(f.relative_to(ROOT))
            if rel in SAT_READ_ALLOWED:
                continue
            if sat_pat.search(strip_comments(f.read_text())):
                fail.append(f"(l1) {rel} reads a component record's "
                            "saturation curve (`vp().Psat_Pa`) -- past a "
                            "declared pure-fluid method; ask the package "
                            "(`thermo.Psat(i, T)`), or add the file to "
                            "SAT_READ_ALLOWED with the reason it holds no "
                            "package with a declared method")

        # (l2) OUTPUT: two authored pure-water inlets between and above the
        #  two curves, under condenser01's own IF97 package.
        sat_src = ROOT / SAT_SRC
        sp = tmp / "if97Dome"
        (sp / "system").mkdir(parents=True)
        (sp / "0").mkdir()
        shutil.copytree(sat_src / "constant", sp / "constant")
        shutil.copy(sat_src / "system" / "controlDict",
                    sp / "system" / "controlDict")
        for nm, T in (("low", SAT_LOW_K), ("high", SAT_HIGH_K)):
            txt = ("componentMolarFlows\n{\n    water    100 kmol/h;\n}\n\n"
                   f"T               {T} K;\nP               100000 Pa;\n")
            for out in (nm, nm + "A", nm + "B"):
                (sp / "0" / out).write_text(txt)
        (sp / "system" / "flowsheetDict").write_text(
            "units\n(\n"
            "    {\n        name SL;\n        type splitter;\n"
            "        inputs ( low );\n        outputs ( lowA lowB );\n"
            "        operation { fractions ( 0.5 0.5 ); }\n    }\n"
            "    {\n        name SH;\n        type splitter;\n"
            "        inputs ( high );\n        outputs ( highA highB );\n"
            "        operation { fractions ( 0.5 0.5 ); }\n    }\n"
            ");\n")
        rc, slog = run(sp)
        if not re.search(r"^\s*pureFluids\b", (sat_src / "constant" /
                         "thermoPhysPropDict").read_text(), re.M):
            fail.append(f"(l2) {SAT_SRC} no longer declares `pureFluids` -- "
                        "the fixture has no declared method")
        elif rc != 0:
            fail.append(f"(l2) the IF97 dome fixture did not run (rc={rc})")
        else:
            for side, want, why in (
                    ("lowA", 0.0, f"{SAT_LOW_K} K is below IF97's boiling "
                     "point at 1 bar (372.76 K) and above the record "
                     "Antoine's (372.09 K): the K-value read the record's "
                     "curve past the declared method"),
                    ("lowB", 0.0, "as lowA"),
                    ("highA", 1.0, f"{SAT_HIGH_K} K is above both boiling "
                     "points -- the control"),
                    ("highB", 1.0, "as highA")):
                m = re.search(r'"' + side + r'":\s*\{[^}]*"vf":\s*'
                              r'([-0-9.eE+]+)', slog)
                if not m or abs(float(m.group(1)) - want) > 1e-9:
                    fail.append(f"(l2) the splitter published `{side}` at vf "
                                f"= {m.group(1) if m else None}, expected "
                                f"{want}: {why}")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":'
                          r'\s*([-0-9.eE+]+)', slog)
            if not m or abs(float(m.group(1))) > 1e-6:
                fail.append("(l2) the IF97 dome fixture's first law does not "
                            f"close (residual {m.group(1) if m else None} kW)")

        # (m) a conversionReactor's OUTLET is its own equilibrium (C72).
        cr_src = strip_comments((UNITS / CONV_REACTOR).read_text())
        if re.search(r"\b(?:s|out)\.vf\s*=\s*vf_in\b", cr_src):
            fail.append(f"(m1) {CONV_REACTOR} copies the inlet's vf onto its "
                        "outlet stream (`s.vf = vf_in` / `out.vf = vf_in`) -- "
                        "the outlet means its own "
                        "equilibrium at (T, P, z_out) (DEV.md 4c C72)")
        home_src = strip_comments((UNITS / OUTLET_HOME).read_text())
        if len(re.findall(r"\bflashState::equilibriumAt\s*\(", home_src)) != 1:
            fail.append(f"(m1) {OUTLET_HOME} does not resolve the outlet "
                        "through `flashState::equilibriumAt` exactly once "
                        "(the one equilibrium home)")
        if re.search(r"\bequilibriumAt\s*\(", cr_src):
            fail.append(f"(m1) {CONV_REACTOR} resolves an equilibrium itself "
                        f"-- the outlet rule's one home is {OUTLET_HOME} "
                        "(C73); a second copy is the arity sin")
        if len(re.findall(r"\breactorOutlet::outletState\s*\(", cr_src)) != 1:
            fail.append(f"(m1) {CONV_REACTOR} does not reach the one home "
                        "(`reactorOutlet::outletState`) exactly once")
        if len(re.findall(r"\.vf\s*=\s*outSt\.vf\b", cr_src)) != 2:
            fail.append(f"(m1) {CONV_REACTOR}: both reaction paths must "
                        "publish the resolved outlet state (`.vf = outSt.vf`, "
                        "single- and multi-reaction)")
        cr = ROOT / CONV_SRC
        mx = tmp / "conversionOutlet"
        (mx / "system").mkdir(parents=True)
        (mx / "0").mkdir()
        shutil.copytree(cr / "constant", mx / "constant")
        shutil.copy(cr / "system" / "controlDict", mx / "system" / "controlDict")
        (mx / "constant" / "reactions").write_text(
            "waterSplitting\n{\n    limitingReactant water;\n"
            "    stoichiometry\n    (\n        { component water; nu -1; }\n"
            "        { component H2; nu 1; }\n        { component O2; nu 0.5; }\n"
            "    );\n}\n\n"
            "hydrogenCombustion\n{\n    limitingReactant H2;\n"
            "    stoichiometry\n    (\n        { component H2; nu -1; }\n"
            "        { component O2; nu -0.5; }\n"
            "        { component water; nu 1; }\n    );\n}\n")
        state = "T               298.15 K;\nP               1.01325 bar;\n"
        water = "componentMolarFlows\n{\n    water  100 kmol/h;\n}\n" + state
        knall = ("componentMolarFlows\n{\n    H2  100 kmol/h;\n"
                 "    O2  50 kmol/h;\n}\n" + state)
        for nm, txt in (("liqWater", water), ("splitGas", water),
                        ("gasMix", knall), ("burnt", knall),
                        ("gasMixPinned", knall + "phase           gas;\n"),
                        ("burntPinned", knall)):
            (mx / "0" / nm).write_text(txt)
        units = ""
        for un, rxn, inp, out in (("split", "waterSplitting", "liqWater",
                                   "splitGas"),
                                  ("burn", "hydrogenCombustion", "gasMix",
                                   "burnt"),
                                  ("burnPinned", "hydrogenCombustion",
                                   "gasMixPinned", "burntPinned")):
            units += ("    {\n        name " + un + ";\n"
                      "        type conversionReactor;\n"
                      "        in " + inp + ";\n"
                      "        outputs ( " + out + " );\n"
                      "        reaction " + rxn + ";\n"
                      "        operation { conversion 1.0; }\n    }\n")
        (mx / "system" / "flowsheetDict").write_text(
            "units\n(\n" + units + ");\n")
        rc, mlog = run(mx)
        if rc != 0:
            fail.append(f"(m2) the conversion-outlet fixture did not run "
                        f"(rc={rc})")
        else:
            for side, want, why in (
                    ("liqWater", 0.0, "the control: water at 298.15 K and "
                     "1 atm, declaring no phase, is a liquid"),
                    ("splitGas", 1.0, "H2 + 1/2 O2 at 298.15 K is a gas; the "
                     "LIQUID inlet's vf was carried onto it"),
                    ("gasMix", 1.0, "the control: H2 + O2 is a gas"),
                    ("burnt", 0.0, "pure water at 298.15 K and 1 atm is a "
                     "liquid; the VAPOUR inlet's vf was carried onto it"),
                    ("burntPinned", 0.0, "a `phase gas;` on the inlet is a "
                     "declaration about the INLET, not carried to a product "
                     "of another composition")):
                m = re.search(r'"' + side + r'":\s*\{[^}]*"vf":\s*'
                              r'([-0-9.eE+]+)', mlog)
                if not m or abs(float(m.group(1)) - want) > 1e-9:
                    fail.append(f"(m2) `{side}` published at vf = "
                                f"{m.group(1) if m else None}, expected "
                                f"{want}: {why}")
            n_said = len(re.findall(
                r'"locus":\s*"conversionReactor \'burnPinned\' outlet",\s*'
                r'"message":\s*"the inlet DECLARES `phase gas;`', mlog))
            if n_said != 1:
                fail.append(f"(m3) the departure from burnPinned's declared "
                            f"inlet phase reached the result JSON {n_said} "
                            "time(s), expected exactly once")
            if not re.search(r"\[conversionReactor\] conversionReactor "
                             r"'burnPinned' outlet: the inlet DECLARES", mlog):
                fail.append("(m3) the departure from burnPinned's declared "
                            "inlet phase was not said at its site (stderr)")
            if re.search(r"conversionReactor '(split|burn)' outlet: the inlet "
                         r"DECLARES", mlog):
                fail.append("(m3) a departure was announced for an UNPINNED "
                            "inlet -- only a declared phase is departed from")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":'
                          r'\s*([-0-9.eE+]+)', mlog)
            if not m or abs(float(m.group(1))) > 1e-6:
                fail.append("(m4) the conversion-outlet fixture's first law "
                            "does not close (residual "
                            f"{m.group(1) if m else None} kW): the duty is "
                            "not priced on the state the outlet publishes")

        # (n) the cstr's and the pfr's OUTLETS are their own equilibrium (C73).
        for rel in KINETIC_REACTORS:
            src = strip_comments((UNITS / rel).read_text())
            if re.search(r"\.vf\s*=\s*vf_in\b", src):
                fail.append(f"(n1) {rel} copies the inlet's vf onto an outlet "
                            "stream (`.vf = vf_in`) -- the outlet means its "
                            "own equilibrium at (T, P, z_out) (DEV.md 4c C73)")
            k = len(re.findall(r"\breactorOutlet::outletState\s*\(", src))
            if k != 2:
                fail.append(f"(n1) {rel} reaches the one outlet home "
                            f"(`reactorOutlet::outletState`) {k} time(s); "
                            "expected 2 (single- and multi-reaction paths)")
            k = len(re.findall(r"\.vf\s*=\s*outSt\.vf\b", src))
            if k != 2:
                fail.append(f"(n1) {rel} publishes the resolved outlet state "
                            f"(`.vf = outSt.vf`) {k} time(s); expected 2")
            if re.search(r"\bequilibriumAt\s*\(", src):
                fail.append(f"(n1) {rel} resolves an equilibrium itself -- "
                            f"the outlet rule's one home is {OUTLET_HOME}")
        pfr_src = strip_comments((UNITS / "reactor/PFR.cpp").read_text())
        if re.search(r'"Q_kW"\]\s*=\s*[^;]*\bdHrxn\b', pfr_src):
            fail.append("(n1) PFR.cpp assigns a Q_kW from `dHrxn` -- the duty "
                        "on the feed's phase rung, which pays no latent heat "
                        "when the product leaves in another phase (C73)")

        nx = tmp / "kineticOutlet"
        (nx / "system").mkdir(parents=True)
        (nx / "0").mkdir()
        shutil.copytree(cr / "constant", nx / "constant")
        shutil.copy(cr / "system" / "controlDict", nx / "system" / "controlDict")
        (nx / "constant" / "reactions").write_text(
            "waterSplittingK\n{\n    limitingReactant water;\n"
            "    stoichiometry\n    (\n"
            "        { component water; nu -1; order 1; }\n"
            "        { component H2; nu 1; order 0; }\n"
            "        { component O2; nu 0.5; order 0; }\n    );\n"
            #  Da = k tau = 50 on the liquid basis: X = 0.98, the 1.4 % water
            #  left is below its 3.1 % saturation in H2 + O2 at 298.15 K, and
            #  the multi-reaction Newton's absolute tolerance is met (at
            #  Da ~ 2000 its round-off is not).
            "    kinetics { type Arrhenius; A 2.5e-4; Ea 0; }\n}\n\n"
            "hydrogenCombustionK\n{\n    limitingReactant H2;\n"
            "    stoichiometry\n    (\n"
            "        { component H2; nu -1; order 1; }\n"
            "        { component O2; nu -0.5; order 0; }\n"
            "        { component water; nu 1; order 0; }\n    );\n"
            "    kinetics { type Arrhenius; A 0.1; Ea 0; }\n}\n")
        #  Small flows: the multi-reaction Newtons judge an absolute residual
        #  in mol/s, and 1 kmol/h keeps the fixture well inside it.
        kwater = "componentMolarFlows\n{\n    water  1 kmol/h;\n}\n" + state
        kknall = ("componentMolarFlows\n{\n    H2  1 kmol/h;\n"
                  "    O2  0.5 kmol/h;\n}\n" + state)
        # (unit, type, path, reaction, inlet, outlet, inlet text, pinned)
        kin_units = (
            ("cSplit",  "cstr", "single", "waterSplittingK", "w1", "g1", kwater, False),
            ("cSplitM", "cstr", "multi",  "waterSplittingK", "w2", "g2", kwater, False),
            ("pSplit",  "pfr",  "single", "waterSplittingK", "w3", "g3", kwater, False),
            ("pSplitM", "pfr",  "multi",  "waterSplittingK", "w4", "g4", kwater, False),
            ("cBurnP",  "cstr", "single", "hydrogenCombustionK", "k5", "b5",
             kknall + "phase           gas;\n", True),
            ("pBurnP",  "pfr",  "single", "hydrogenCombustionK", "k6", "b6",
             kknall + "phase           gas;\n", True),
        )
        units = ""
        for un, ty, path, rxn, inp, out, txt, _ in kin_units:
            (nx / "0" / inp).write_text(txt)
            (nx / "0" / out).write_text(kknall if pinned else kwater)
            sel = (f"reactions ( {rxn} );" if path == "multi"
                   else f"reaction {rxn};")
            oper = "V_R 1; nSteps 50;" if ty == "pfr" else "V_R 1;"
            units += ("    {\n        name " + un + ";\n"
                      "        type " + ty + ";\n"
                      "        in " + inp + ";\n"
                      "        outputs ( " + out + " );\n"
                      "        operation { " + oper + " }\n"
                      "        " + sel + "\n    }\n")
        (nx / "system" / "flowsheetDict").write_text(
            "units\n(\n" + units + ");\n")
        rc, nlog = run(nx)
        if rc != 0:
            fail.append(f"(n2) the kinetic-outlet fixture did not run "
                        f"(rc={rc})")
        else:
            for un, ty, path, rxn, inp, out, txt, pinned in kin_units:
                want = 0.0 if pinned else 1.0
                m = re.search(r'"' + out + r'":\s*\{[^}]*"vf":\s*'
                              r'([-0-9.eE+]+)', nlog)
                if not m or abs(float(m.group(1)) - want) > 1e-9:
                    fail.append(
                        f"(n2) {ty} `{un}` ({path}-reaction) published "
                        f"`{out}` at vf = {m.group(1) if m else None}, "
                        f"expected {want}: " + (
                            "a `phase gas;` on the inlet is a declaration "
                            "about the INLET; its product, water at 298.15 K "
                            "and 1 atm, is a liquid" if pinned else
                            "H2 + 1/2 O2 at 298.15 K is a gas; the LIQUID "
                            "inlet's vf was carried onto it"))
                said_json = len(re.findall(
                    r'"locus":\s*"' + ty + r" '" + un + r"' outlet\",\s*"
                    r'"message":\s*"the inlet DECLARES `phase gas;`', nlog))
                said_site = re.search(
                    r"\[" + ty + r"\] " + ty + r" '" + un + r"' outlet: "
                    r"the inlet DECLARES", nlog)
                if pinned:
                    if said_json != 1:
                        fail.append(f"(n3) `{un}`'s departure from its "
                                    "declared inlet phase reached the result "
                                    f"JSON {said_json} time(s), expected once")
                    if not said_site:
                        fail.append(f"(n3) `{un}`'s departure from its "
                                    "declared inlet phase was not said at "
                                    "its site (stderr)")
                elif said_json or said_site:
                    fail.append(f"(n3) a departure was announced for `{un}`, "
                                "whose inlet is UNPINNED -- only a declared "
                                "phase is departed from")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":'
                          r'\s*([-0-9.eE+]+)', nlog)
            if not m or abs(float(m.group(1))) > 1e-6:
                fail.append("(n4) the kinetic-outlet fixture's first law does "
                            "not close (residual "
                            f"{m.group(1) if m else None} kW): a duty is not "
                            "priced on the state its outlet publishes")

        # (n5) the energy solves on the published surface (C77).
        cstr_src = strip_comments((UNITS / "reactor/CSTR.cpp").read_text())
        if not re.search(r"\breactorOutlet::pricedOutlet\s*\(", cstr_src):
            fail.append("(n5) CSTR.cpp does not price its T-solve's outlet "
                        "through `reactorOutlet::pricedOutlet` -- the "
                        "surface it is published on (C77)")
        if not re.search(r"\breactorOutlet::temperatureOfEnthalpy\s*\(",
                         pfr_src):
            fail.append("(n5) PFR.cpp does not recover its marched T through "
                        "`reactorOutlet::temperatureOfEnthalpy` -- the "
                        "surface its outlet is published on (C77)")
        for rel in KINETIC_REACTORS:
            src = strip_comments((UNITS / rel).read_text())
            if re.search(r"\bH_stream_formation\s*\([^;]*\bvf_in\b", src):
                fail.append(f"(n5) {rel} prices an enthalpy on the INLET's "
                            "phase rung (`H_stream_formation(..., vf_in, "
                            "...)`) -- a T-solve on a surface its outlet is "
                            "not published on (C77)")
        for p in sorted((ROOT / "src").rglob("*")):
            if p.suffix in (".cpp", ".H") and re.search(
                    r"\bannounceEnergyRungMismatch\b",
                    strip_comments(p.read_text(errors="replace"))):
                fail.append(f"(n5) {p.relative_to(ROOT)} still carries "
                            "`announceEnergyRungMismatch` -- the gap it "
                            "announced is closed (C77)")
        # (fixture, case, want "adiabatic" or "jacketed")
        for tag, src_case, kind in (
                ("cstr04_1atm", ADIABATIC_SRC, "adiabatic"),
                ("pfr04_1atm", ADIABATIC_PFR_SRC, "adiabatic"),
                ("cstr05_1atm", MULTIPLICITY_SRC, "adiabatic"),
                ("cstr06_1atm", JACKETED_SRC, "jacketed")):
            ad = tmp / tag
            shutil.copytree(ROOT / src_case, ad,
                            ignore=shutil.ignore_patterns("converged", "reports",
                                                          "design", "log.*"))
            for f in (ad / "0").iterdir():
                if f.is_file():
                    f.write_text(re.sub(r"(?m)^P\s+[^;]*;", "P               "
                                        "101325 Pa;", f.read_text()))
            rc, alog = run(ad)
            if rc != 0:
                fail.append(f"(n5) the 1 atm copy of {src_case} did not run "
                            f"(rc={rc})")
                continue
            m = re.search(r'"reactorOut":\s*\{[^}]*"vf":\s*([-0-9.eE+]+)', alog)
            vf = float(m.group(1)) if m else None
            if vf is None or not (1e-6 < vf < 1.0 - 1e-6):
                fail.append(f"(n5) {tag} published its product at vf = {vf}, "
                            "expected a two-phase outlet: at 1 atm the "
                            "product boils, and a balance that sees the "
                            "latent heat stops inside the boiling range")
            kq = re.search(r'"reactor":\s*\{[^}]*"Q_kW":\s*([-0-9.eE+]+)', alog)
            kt = re.search(r'"reactor":\s*\{[^}]*"T_out":\s*([-0-9.eE+]+)', alog)
            q = float(kq.group(1)) if kq else None
            if kind == "adiabatic":
                want = 0.0
            else:
                ua = re.search(r"(?m)^\s*UA\s+([-0-9.eE+]+)\s*;",
                               (ad / "system" / "flowsheetDict").read_text())
                tc = re.search(r"(?m)^\s*T_coolant\s+([-0-9.eE+]+)\s*;",
                               (ad / "system" / "flowsheetDict").read_text())
                want = (float(ua.group(1)) * (float(tc.group(1))
                        - float(kt.group(1))) / 1000.0
                        if ua and tc and kt else None)
            if q is None or want is None or abs(q - want) > 1e-6:
                fail.append(f"(n5) {tag} published Q_kW = {q}, expected "
                            f"{want} ({'adiabatic: zero' if kind == 'adiabatic' else 'the jacket: UA (T_coolant - T_out)'}"
                            ") to 1e-6 kW -- its energy balance is not solved "
                            "on the surface its outlet is published on")
            if tag == "cstr05_1atm":
                ks = re.search(r'"reactor":\s*\{[^}]*"steadyStates":\s*'
                               r'([-0-9.eE+]+)', alog)
                if not ks or float(ks.group(1)) != 3.0:
                    fail.append("(n5) cstr05 at 1 atm found "
                                f"{ks.group(1) if ks else None} steady "
                                "state(s), expected 3 -- the scan's ceiling "
                                "must clear the boiling plateau, or the "
                                "ignited branch falls outside the scan")
            if re.search(r"energy balance that set T_out|found no outlet "
                         r"temperature at which", alog):
                fail.append(f"(n5) {tag} announced a rung mismatch or an "
                            "unmatched enthalpy -- a mixture's balance closes "
                            "on the published surface")
            m = re.search(r'"globalEnergyBoundary":\s*\{[^}]*"residual_kW":'
                          r'\s*([-0-9.eE+]+)', alog)
            if not m or abs(float(m.group(1))) > 1e-6:
                fail.append(f"(n5) {tag}'s first law does not close "
                            f"(residual {m.group(1) if m else None} kW)")

        # (e) the negative control: a real pressure-drop duty survives
        ctrl = tmp / "flash13"
        shutil.copytree(ROOT / CONTROL, ctrl)
        rc, log = run(ctrl)
        qs = duties(log)
        if rc != 0 or not qs:
            fail.append("flash13 (the negative control) did not run")
        elif max(abs(q) for q in qs) < 100.0:
            fail.append(f"flash13's duty collapsed to {qs} kW -- its feed is "
                        "at 1 atm and it operates at 0.65 atm, so a LARGE "
                        "duty is the right answer; a gate that drove every "
                        "flash to zero would be measuring its own wish")

    if fail:
        print("check_inlet_resolution: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_inlet_resolution: OK -- a flash at its feed's own (T, P) "
          f"costs nothing on {len(IDENTITY)} case(s) (|Q| < {BAND_KW} kW, "
          "R-E1), flash19's unit duty and balance report agree at 100 +- 0.5 % "
          "(R-E5), a feed pinned `phase liquid;` is priced as declared AND "
          "announced (R-E2), and the vacuum-flash control keeps its genuine "
          "pressure-drop duty.  THE PHASE PASS IS NOT GATED ON THE CONSUMER "
          "(source) and DOES NOT ACCUSE a supercritical vapour: ammonia02's "
          "converter outlet at 839.6 K -- 434 K above the highest pure Tc "
          "present -- draws no accusation, and neither do the two saturated "
          "separator outlets.  THE FLASH DUTY DISCARDS THE "
          "SAME SUPERCRITICAL ROOT THE REPORT DISCARDS, through ONE home "
          "(`flashState::supercriticalSplitDiscarded`, source-checked): "
          "ammoniaReactor04's separator, fed at 844.86 K, announces the "
          "discard at its site and ONCE on AdvisoryLog and closes at 100 +- "
          "0.5 % beside the report's own discard line.  AN AUTHORED INLET "
          f"IS READ AS WHAT IT MEANS DURING THE SOLVE: {len(INLET_READERS)} "
          "units read it through `resolvedInletVaporFraction` (source), and "
          "the witness's undeclared superheated vapours leave the valve at "
          "their own T, the mixer and the splitter as vapours, with the "
          "plant's first law closed.  EVERY OUTLET SEARCH DISCARDS THE SAME "
          f"ROOT: {len(OUTLET_SEARCHERS)} searchers through "
          "`flashDiscardingSupercriticalSplit` (source), and a drum operated "
          "at 844.86 K publishes no liquid.  A PINNED PURE TWO-PHASE INLET "
          "IS READ AT ITS PIN BY EVERY UNIT: the one home asks "
          "`pinnedPureQuality` (source, no second home in the three units "
          "that used to), and an authored wet-steam inlet split in two "
          "leaves on both branches at its declared quality.  A DECLARED "
          "PURE-FLUID METHOD OWNS ITS COMPONENT'S SATURATION CURVE: "
          "`saturationPressure` is the one home (source; the package and "
          f"both phases call it, and {len(SAT_READ_ALLOWED)} named files "
          "alone read a record's curve), and under condenser01's IF97 "
          f"package pure water at 1 bar is a liquid at {SAT_LOW_K} K and a "
          f"vapour at {SAT_HIGH_K} K, first law closed.  A CONVERSION "
          "REACTOR'S OUTLET IS ITS OWN EQUILIBRIUM: resolved through ONE home "
          "(`reactor/ReactorOutlet.cpp`, one `equilibriumAt`; no reactor "
          "resolves its own) and published on both paths of the conversion "
          "reactor, the cstr and the pfr (source); liquid water split to "
          "H2 + O2 leaves as a gas from all three and from both kinetic "
          "paths, H2 + O2 burnt to water leaves as a liquid, a `phase gas;` "
          "inlet is not carried to its liquid product and the departure is "
          "said once, first law closed on both fixtures.  THE CSTR'S AND THE "
          "PFR'S ENERGY SOLVES ARE ON THE PUBLISHED SURFACE (C77): an "
          "adiabatic cstr and pfr whose product boils at 1 atm publish a "
          "two-phase outlet and |Q_kW| <= 1e-6 kW, a jacketed cstr exactly "
          "its jacket's UA (T_c - T_out), the 1 atm multiplicity case keeps "
          "its three steady states, with no inlet-rung enthalpy left in "
          "either source.  NOT "
          "CHECKED: whether a NON-zero duty is right (only the identity has a "
          "closed form); the multi-condition cases' duties, which ride their "
          "goldens; whether the 1e-3 incipient band is the right number (it "
          "is a stated choice); the valve's, the adiabatic flash's and the "
          "pipe's discard by OUTPUT (no corpus state reaches them -- source "
          "only); any vapourless package, which the test "
          "skips by hasEos(); and the IF97 saturation curve OUTSIDE its "
          "window (273.15 .. 647.096 K), where the record answers announced "
          "-- no output arm reaches it; a pfr's heatExchange march by output "
          "(source only); and a PURE product on its own saturation jump, "
          "which the reactors announce and no fixture reaches.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
