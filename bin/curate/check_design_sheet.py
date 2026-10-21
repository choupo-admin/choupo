#!/usr/bin/env python3
"""Gate: the equipment SPECIFICATION SHEET a run writes says what the run
computed -- and a case with no hierarchy grows no hierarchy.

    bin/curate/check_design_sheet.py

WHY THIS EXISTS.  A student hands in a final-year project and somebody has to
audit it, per unit operation: what goes in, what comes out, what was sized,
what it costs.  Until 2026-09-04 those three answers lived in three unrelated
places -- the inlets and outlets ONLY inside `iterations/` (numerical history,
opt-in, off by default), the sizing only in two flat CSVs and on the screen,
the cost only beside it.  `design/` was a directory NAME ratified in
`docs/architecture/stream-state-architecture.md` two months earlier that
nothing wrote.

The sheets are written by `src/io/DesignSheetWriter.cpp` to
`design/<SECTOR>/<unit>/<equipmentTag>`, one dictionary per physical item,
regenerated whole on every run exactly as `converged/` is.

WHAT THIS CHECKS:

  (a) EVERY SIZED UNIT HAS A SHEET, AT THE RIGHT ADDRESS.  For the sectored
      witness, one file per row of `sizing.csv`, under that row's OWN sector
      directory, named by that row's equipment type.  The expected path is
      built from the CSV -- never by splitting the unit name -- so a writer
      that recovered the sector from the name would still have to agree with
      the column that was stamped.

  (b) THE SHEET REPRODUCES THE SIZING, VALUE AND UNIT.  Every `sizing {}`
      entry matches `sizing.csv`'s cell for the same key, and every entry
      carries a unit word (or is dimensionless).  This is the arm that fires
      the day a sizer writes `d.values[...]` past the one door.

  (c) THE SHEET REPRODUCES THE COST.  `purchased`, `bareModule` and
      `totalModule` match `costs.csv` for the same unit.  Two projections of
      one computed record must not disagree.

  (d) THE PORTS CLOSE, AGAINST A REPORT THIS WRITER DOES NOT PRODUCE.  The
      sheet's inlet mass flows sum to its outlet mass flows, and both equal
      the unit's row in `massBalance_byUnit.csv`.  This is the strongest arm
      and it is why it exists: the first draft of the writer computed the
      port mass as `F * Sigma z_i MW_i` and printed it as `mdot`, which on a
      crystalliser slurry silently omits the crystals -- 437 kg/h short on
      this very case while the unit's own balance closed at 100.0000 %.  That
      is the flash21 defect Vitor reported on 2026-08-09, reappearing in a
      new surface; `StreamMass::F_massTotal` exists to stop it and its header
      says balance and stream-table surfaces call the total.  An arm that
      only read the sheet could never have seen it.

  (e) THE REFUSAL EXISTS, checked at its SOURCE.  `DesignSheetWriter.cpp`
      must throw on an empty declared unit, naming the key and the remedy.
      This is a source arm, not a built one, and the reason is a rule this
      project paid for on 2026-08-18: a gate that patches sources and rebuilds
      the engine is the shape that poisoned the tree, because `finally` does
      not run against the SIGKILL `gate_manifest.py` uses to time gates out.
      `check_gate_selftest` is the ONE gate allowed to do that, and only under
      `destructive_session.py`'s disk journal.  The first draft of THIS gate
      did exactly the forbidden thing -- patched `StirredTank.cpp`, ran `make`,
      and rebuilt again in a `finally` -- and it is written down here rather
      than quietly deleted.

      The refusal was verified BY HAND instead, once, under the journal:
      `d.set("V_R", V_R, "m3")` in `StirredTank.cpp` was replaced by
      `d.values["V_R"] = V_R;`, the tree rebuilt, and
      `process02_with_design` run.  It printed

          WARNING: the equipment specification sheets were not written:
            design sheet: unit 'reactor' declares a sizing value 'V_R' with
            NO UNIT. ...  d.set("V_R", value, "m3");   // or kW, bar, kg, -

      and wrote no sheet for that unit.  Restored, rebuilt, gate re-run to
      exit 0.  A source arm cannot prove the message fires; it can prove the
      guard was not deleted, which is what regresses.

      THAT SABOTAGE FOUND A SECOND DEFECT, which is why it was worth doing by
      hand rather than trusting the guard's existence.  The refusal was a
      `throw` from inside the per-unit loop, so it aborted the whole walk: on
      this two-unit case `heater`'s sheet was already on disk, `reactor`'s was
      refused, and the run left a PARTIAL `design/` tree with one line on
      stderr -- a directory that lies by omission, which a reader opens and
      reads as complete.  That is the failure the report chain was fixed for
      on 2026-08-27.  A refused unit is now skipped BY NAME, writes no sheet
      at all (a sheet missing a value it should carry is worse than an absent
      one, because a reader cannot tell), every other unit still gets its
      page, and the refusals are printed together and ALWAYS -- not only when
      the run was asked to speak.  Re-fired after the fix: `[design] wrote 1
      specification sheet (1 refused, above)`, with `heater/shellTubeHX`
      present and `reactor/` absent.

  (f) FLAT STAYS FLAT.  The flat witness's sheets sit at `design/<unit>/`
      with NO sector level -- not a directory called `root`, not an empty
      one.  Empty is not a sector.

  (g) THE TREE CANNOT BE COMMITTED.  `git check-ignore` must reject a path
      under a tutorial's `design/`, AND must NOT reject a new file under
      `docs/design/`.  Both directions, because the obvious rule (`**/design/`)
      silently swallows this project's design RECORDS: the 135 already tracked
      would survive and every new one would be ignored without a word.  The
      first direction matters because the GUI bundle is a Vite glob over
      `tutorials/*/*/**/*` that inlines every match as a raw string -- a
      committable run output is a run output baked into the shipped site.

  (h) THE SHEET IS A DICTIONARY, structurally.  Balanced braces, every
      non-comment statement terminated, `recordType designSheet;` present.

  (k) EVERY SIZING UNIT WORD IS ONE THE PARSER CAN READ -- it survives
      `Dictionary.cpp::isWordChar` and `core/Units.cpp` registers it.  Both
      sets are READ from those sources, never listed here.

      THIS ARM CLOSES THE BLIND SPOT THIS GATE DECLARED FOR ITSELF, and it
      fired the moment it was written.  The old text said: "a writer whose
      output the reader refuses is a bug in BOTH, and nothing here would catch
      a grammar the C++ parser rejects ... the day anything READS a sheet back,
      that reader is the check".  A reader was built on 2026-09-07 -- the GUI's
      printable exchanger datasheet -- and the FIRST sheet it opened would not
      parse.  Three unit words were unreadable: `W/(m2.K)` (`ShellTubeHX`;
      `(` is not a word character, so the tokenizer hands the parser `W/` and
      stops) and `um` + `rpm` (`SprayDryerSize`; `core/Units.cpp` has no name
      for either).  Every exchanger and every spray-dryer sheet the engine had
      ever written was a file its own `Dictionary` refuses, under a header
      reading "It is a Choupo dictionary: every value carries the unit it is
      in, named as the dict grammar names it".

      Verified BY HAND against the engine rather than deduced from the
      tokenizer -- a case dict carrying `U 600.0 W/(m2.K);` gives
      `ERROR: system/postDict:45:41: unknown unit suffix 'W/' after scalar
      value of 'U'` -- and NOT by patching a source and rebuilding, which is
      the 2026-08-18 shape only `check_gate_selftest` may take.

      `W/(m2.K)` is fixed to `W/m2/K`: the same unit at the same factor 1.0 in
      the same table, so NO number moved, and `docs/ai/dict-syntax.md` already
      called it "the one parseable spelling".  `um` and `rpm` are NOT fixed,
      because the remedy converts a VALUE and the 2026-09-04 slice reserved
      that class in its own words; they are pinned in
      `SHEET_UNIT_WORDS_UNPARSEABLE` with remedy and blocker, and
      the stale-pin half fails if either stops appearing.

  (n) A CATALYST BED IS SIZED FROM ITS OWN KINETIC VOLUME, AND ITS CHARGE
      IS PRICED ONLY FROM WHAT THE CASE DECLARES (2026-09-26).  On
      `ammoniaReactor04_kineticSizing` -- a `pfr` whose `V_R` a designSpec SOLVES,
      the first case where the post-processing chain runs on an outer
      driver's representative pass -- the converter's `shell` sheet carries
      the SAME `V_R` the unit's own KPI publishes in the result JSON (to the
      sheet's own printed precision); its `catalystCharge` sheet's mass is
      RECOMPUTED here as V_R x the `catalystBulkDensity` read from the case
      postDict; its purchased cost is RECOMPUTED as that mass x the declared
      `catalystPrice`, and equals its bare-module and total-module costs (no
      index, no F_BM), while the shell's total-module cost EXCEEDS its
      purchased cost -- the two cost SHAPES told apart on the numbers, and
      the provenance row names `declared-unit-price`.  Then two copies of
      the case are run from a temp directory: one WITHOUT `catalystPrice`,
      which must REFUSE the charge by name (`catalystPrice` in the FAILED
      line), keep the shell costed, and print `TOTALS (EUR) -- INCOMPLETE`
      naming `converter/catalystCharge` (the INCOMPLETE home the trays
      shared); one
      WITHOUT `catalystBulkDensity`, whose charge sheet must publish NO mass,
      state `mass not derivable` in its basis, and refuse at cost time
      naming the density.  Sabotage-verified BY HAND, restored with `cp`;
      the five sabotages and their observed lines are in the arm's own
      docstring (`check_catalyst_bed`).
      NOT CHECKED: whether 2500 kg/m3 or 15 EUR/kg are sensible -- they are
      the case's declared assumptions (its header says so in those words)
      and this arm only proves they reached the arithmetic unchanged.

  (o) A SPACE VELOCITY CARRIES ITS DECLARED GAS-VOLUME BASIS (2026-10-05).
      `VesselSize` used to divide the ACTUAL gas flow at the unit's own
      (T, P) by whatever `spaceVelocity` was typed, while every published
      GHSV is on NORMAL gas volume -- a factor of 77 at an ammonia
      converter's 700 K / 200 bar, taken at exit 0.  On
      `ammoniaReactor03_equilibriumApproach` (the one corpus case that sizes by space
      velocity) the converter sheet's `V_R` is RECOMPUTED here from the
      run's own `N_in_mol_s` KPI and the postDict's declared `spaceVelocity`
      as N R T_n / P_n x 3600 / SV (T_n 273.15 K, P_n 101325 Pa), at the
      sheet's printed precision, and the basis must say NORMAL.  Three
      copies then run from a temp directory: one with the
      `spaceVelocityBasis` statement deleted, which must refuse the
      converter BY NAME (`spaceVelocityBasis` on the FAILED line) and quote
      the normal/actual ratio at the unit's own conditions; one declaring
      `standard`, which must refuse naming both accepted words; and one
      declaring `actual` at 259.665 1/h, whose `V_R` is recomputed as
      N R T / P x 3600 / SV from the KPI T and P -- so both branches are
      held to arithmetic, not only the shipped one.
      SABOTAGES, by hand, 2026-10-05: four, all caught; recorded with the
      line each produced in `check_space_velocity_basis`.
      NOT CHECKED: whether 20000 Nm3/(m3 h) is a sensible GHSV -- it is the
      case's declared assumption; and any vessel sized by residence time,
      which is on actual volume by its own physics and was never ambiguous.

  (p) AN EXCHANGER'S LMTD IS NOT TYPED WHERE THE RUN KNOWS IT (2026-10-07,
      DEV.md 4c C44).  `ShellTubeHX` has three routes: `U` + `LMTD` (both
      author-set, the original), `U` + `utility <name>` (the LMTD computed
      counter-current from the unit's own `T_in`/`T_out` KPIs and the
      utility record's `T_in`/`T_out`), and neither (a RATED unit's own
      `area` passed through).  On `greenAmmoniaPEQ_baseCase` every cooler
      declaring a `utility` has its sheet's `LMTD` and `A` RECOMPUTED here
      from the run's KPI line, the postDict's `U` and the utility record
      read from `data/standards/utilities/`, at the sheet's printed
      precision; the rated FEHE's sheet `A` must equal the area its own
      flowsheetDict declares, and its `U`/`LMTD` the unit's own KPIs.  Three
      copies then run: one adding `LMTD` beside a `utility` (refused BY
      NAME, the run still exit 0), one with the Chiller's utility switched
      to `coolingWater` (a temperature cross, refused BY NAME), and one with
      a cooler's `U` and `utility` deleted (it publishes no area, so it is
      refused naming the two declarations that would size it).
      SABOTAGES, by hand, 2026-10-07, on ShellTubeHX.cpp, restored with
      `cp` and the engine rebuilt: recorded with the line each produced in
      `check_exchanger_routes`.
      NOT CHECKED: whether the declared U values are sensible, and the
      terminal-temperature LMTD on a cooler where something condenses is an
      approximation the basis states rather than a number this arm can
      improve.
      SINCE 2026-10-07 (DEV.md 4c C48) THE SHIPPED CASE DESIGNS ITS
      EXCHANGERS (arm (s)), so this arm runs an ESTIMATE TWIN: a copy whose
      `design {}` blocks are taken out, each cooler given back the U it
      declared before (`ESTIMATE_U`, transcribed) and the FEHE sent back to
      its rated area.  Routes 2 and 3 are otherwise exercised by no corpus
      case.  Re-sabotaged on the twin the same day: the LMTD helper made an
      arithmetic mean -> FAILED on all five coolers (LMTD and A).

  (s) A DESIGNED EXCHANGER IS RECOMPUTED FROM ITS OWN SHEET (2026-10-07,
      DEV.md 4c C48).  A `design { method Kern; ... }` block makes U a
      RESULT: the run finds the smallest tube count delivering the duty and
      writes the bundle, both films, five resistances, F, the area required
      and installed, the utility flow and both pressure drops.  On
      `greenAmmoniaPEQ_baseCase` (all six exchangers) every sheet is held to
      arithmetic written out again here: the declarations reach the sheet
      (tube sizes, passes, shells, both foulings, the wall conductivity of
      the material RECORD); nTubes = tubesPerPass x passes; A = n_shells pi
      d_o L N; the shell ID from Sinnott's table (transcribed here too) plus
      12 mm; each film resistance from its h, the wall from ln(d_o/d_i); U
      and U_clean from the sum; F from Bowman-Mueller-Nagle's 1-2 formula
      (written out again) on the run's terminal temperatures; the LMTD; the
      utility flow from the utility record's dutyPerKg; the FEHE's A_rated /
      U_rated from its own flowsheetDict; A >= A_required; the cost's size S
      is the installed A; a condensing outlet's basis says gas film and
      OVER-SIZES; every basis says DILUTE-gas.  Copies then refuse BY NAME:
      no `fouling {}`, `U` beside `design {}`, two tube passes on the
      crossing FEHE, no `utilitySideFilm` on the boiling Chiller.
      SABOTAGES, by hand, 2026-10-07, restored with `cp` and rebuilt:
        S1 inside fouling not referred to the outside area -> FAILED, U on
           all six; S2 the 1-2 F square-rooted -> FAILED, F and A_required
           on the four 2-pass coolers (R and S swapped instead made all four
           infeasible -> FAILED, four sheets missing); S3 the record given
           A_required for A -> FAILED, A on all six; S4 a sheet's nTubes
           edited BETWEEN the run and the check -> FAILED, nTubes, A, shell
           ID and baffles; S5 the condensing sentence dropped -> FAILED on
           the WaterCooler and the Chiller.
      NOT CHECKED: that N is the SMALLEST count (the arm would have to
      re-price the films at N - 1; it holds only A >= A_required), the film
      coefficients themselves (they need the properties, which a gate cannot
      recompute without a second thermo package), and the pressure drops.

  (q) A STORAGE TANK IS SIZED FROM ITS STREAM AND PRICED ON THE ROW THE
      PROGRAM CARRIES (2026-10-07, DEV.md 4c C44 slice 2).  On
      `greenAmmoniaPEQ_baseCase` the store attached to `ProductNH3` has its
      density RECOMPUTED from the case's component records, its volumes and
      tank count from the postDict's declarations and the stream's own
      `F_mass`, and each tank's three costs from the CAPCOST 2017
      fixed-roof row transcribed in this gate; the LOWER BOUND of a
      refrigerated store priced as an atmospheric tank must be said per
      tank; copies refuse a unitless storage time and a vapour stream BY
      NAME, and a larger tank ceiling makes ONE tank.  Sabotages in
      `check_storage`.

  (u) A TANK A FLOWSHEET UNIT HOLDS IS SIZED ON THE UNIT'S OWN HOLD TIME
      (2026-10-18, DEV.md 4c C87).  On `aceticAcid02_plant`, whose two
      `storage` entries LINK their `storageTank` units (`unit <name>;`),
      each tank's storage time, fill fraction, mass flow and stream are the
      unit's own and its volumes are recomputed from them; a flowsheet-only
      change of one unit's residence time and fill fraction moves its tank
      and not the other; on copies of `economics03_startup_years`, a hold
      time, fill fraction, stream or name declared beside `unit`, an
      unlinked entry carrying the unit's name, and a link to a compressor
      each refuse BY NAME.  Sabotages in `check_storage_link`.

  (r) WHAT EACH ITEM HOLDS IS V x FRACTION x RHO x COMPOSITION (2026-10-07,
      DEV.md 4c C44 slice 3).  On `greenAmmoniaPEQ_baseCase` every item
      publishing an `inventory` has each held phase's density RECOMPUTED from
      the case's records (anchored Rackett for a liquid, the SRK vapour root
      for a gas), its mass and per-component split recomputed, its sheet's
      total held to it, the two product tanks held to storageTime of
      production, and the items without one listed as NOT DECLARED; copies
      refuse a declared volume beside a sized V_R, a two-phase stream and
      fractions above 1 BY NAME while the item keeps its size.  Sabotages in
      `check_inventory`.

  (t) A MATERIAL'S maxT IS COMPARED AND ANNOUNCED, ONCE PER ITEM (2026-10-17,
      DEV.md 4c C85).  `maxT` was read by the loader and compared by
      nothing, so aluminium (record maxT 500 K) on the 700 K converter of
      `ammoniaReactor03_equilibriumApproach` sized and priced in silence.
      `sizing/MaterialLimits` is now the ONE home of both record limits
      (maxP was written out four times), and the sizing pass compares maxT
      with each item's HOTTEST PORT.  Run on a COPY: the converter in
      aluminium must print exactly ONE `[rating]` site line naming the
      service temperature, the record and its maxT, at the converter's own
      hottest-port T (recomputed here from the run's `converged/` streams),
      and the end-of-run caveat block must replay it; the SHIPPED case
      (SS316, maxT 925 K) must say nothing about a service temperature, and
      neither may any other vessel in the copy.  A source half requires that
      no sizer compares `material.maxP` or `material.maxT` itself.

      SABOTAGES, by hand, 2026-10-17 (rebuilt, gate run, restored, rebuilt):
        S1  `MaterialLimits.cpp`: the maxT comparison's `>` made `<` (the
            limit compared the wrong way)  -> caught twice: the aluminium copy
            prints no service-temperature line, and the shipped SS316 run
            announces one (700 K "exceeding" 925 K).
        S2  `SizingPass.cpp`: the call guarded by `false &&`  -> caught: no
            site line.
        S3  `MaterialLimits.cpp`: the `AdvisoryLog` add commented out (the
            console line kept)  -> caught by the caveat-replay half, and the
            SOURCE half SURVIVED it on first contact: it searched for the call
            as text, and a commented-out call still contains the text.  It
            strips comments now (prose is not a call), and on the re-run both
            halves caught it.
        S4  an inline `if (pressureDesign > material.maxP)` restored in
            `VesselSize.cpp` beside the call  -> caught by the source half.

      EVERY PUBLISHED DESIGN PRESSURE MEETS THE RATING (2026-10-18, DEV.md 4c
      C86).  C85 routed four sizers through `MaterialLimits` and left seven
      publishing a `pressureDesign` that no rating met: the column's shell
      and reflux drum, every shell-and-tube record (so the column's condenser
      and reboiler), the multitubular bed, and the evaporator, crystalliser,
      spray dryer, cyclone and compressor pass-throughs.  Each now calls
      `materialLimits::pressure` beside the `set("pressureDesign", ...)` that
      publishes it.  Two halves: a COPY of `column09_tray_hydraulics` in
      aluminium (record maxP 50 bar) with all four `pressureDesign` lines at
      60 bar must print exactly ONE design-pressure line for each of
      `vessel '<col>/shell'`, `vessel '<col>/refluxDrum'`,
      `shellTubeHX '<col>/condenser'` and `shellTubeHX '<col>/reboiler'`,
      quoting 60.0 bar, `aluminium` and 50.0 bar, each replayed in the caveat
      block and nothing else announced, while the shipped column is silent;
      and a SOURCE COUNT per sizer -- at least as many
      `materialLimits::pressure(` calls as `set("pressureDesign"` sites
      (comments stripped), and no `.maxP`/`.maxT` outside MaterialLimits.cpp
      under any variable name.  maxT already reached every one of these items:
      `SizingPass` compares it per item whose `material` is a record, and
      each of them stamps one.

      SABOTAGES, by hand, 2026-10-18 (rebuilt, gate run, restored, rebuilt):
        S5  `ColumnSize.cpp`: the shell's call deleted  -> caught twice: the
            copy prints no `vessel 'column09/shell'` line and no replay, and
            the source count reads 1 of 2.
        S6  `ShellTubeHX.cpp`: the call in `exchangerRecord` deleted  ->
            caught: no condenser or reboiler line in the copy, and the count
            reads 0 of 1.
        S7  `CatalystBedSize.cpp`: the multitubular bundle's call deleted
            (the vessel branch's kept)  -> caught by the COUNT alone (1 of
            2); a presence test passes it, which is why it counts.
        S8  `SprayDryerSize.cpp`: `if (P_des > m.maxP)` written inline with
            `const Material& m = material;` and the call removed  -> caught
            twice by the source half (the widened `.maxP` pattern and the
            count); the old `material\\.maxP` pattern would have missed the
            first.

  (v) A GAS BUFFER IS SIZED FROM THE GAS IT GIVES BACK (2026-10-18, DEV.md
      4c C89).  On `greenAmmoniaPEQ_baseCase` the H2 buffer attached to
      `H2Feed` (`gasStorage ( ... )`) has its two SRK densities RECOMPUTED
      from the case's records, its working gas, vessel count, volume,
      diameter, wall and weight from the postDict's declarations, each
      vessel's cost as its steel weight x the declared installed `steelPrice`
      (Vitor's ruling: by steel mass), the Turton vessel cost RECOMPUTED as a
      printed, announced comparison that enters no total, its inventory and
      the raw-material stock it adds to the working capital, its sheets, its
      standing placement at its own D and H, and the charging compressor's
      NOT-INCLUDED caveat; four copies refuse the store BY NAME and two (no
      price, no price reason) refuse its COST while it keeps its size.
      Sabotages in `check_gas_store`.

  (w) THE PRESSURE STORES A FLOWSHEET UNIT HOLDS, AND THE PRESSURISED LIQUID
      STORE (2026-10-18, DEV.md 4c C92, C93).  A gas store on a copy of
      `economics03_startup_years` (a probe: ammonia02 no longer stores its
      syngas) and `ammonia02_full_plant`'s pressurised liquid store are LINKED
      to their storageTank units (`unit <name>;`, the C87 rule) and RECOMPUTED
      from the units' KPIs, the case's records and the postDict: the SRK
      swing and the anchored-Rackett liquid density, volumes (T201's equal to
      the unit's own vesselVolume_m3), counts, diameters, walls, weights and
      steel-mass costs, the liquid inventory, the bubble pressure (the
      let-down drum's own P, read off the flowsheetDict), the placements
      (lying); a flowsheet-only change doubles both stores; eight
      copies refuse by name.  Sabotages in `check_pressure_store_link`.

  (x) THE COLUMN'S CONDENSER AND REBOILER, DESIGNED (2026-10-20, DEV.md 4c
      C124).  `column17_exchanger_design` puts both exchangers on route 4 with
      a PHASE-CHANGE process film (Nusselt condensation on a horizontal tier,
      Rohsenow boiling in a kettle under the Zuber critical heat flux).  Every
      number of both sheets is RECOMPUTED with the correlations written out
      again here: the process temperatures held to the run's own T_top KPI
      and distillate/bottoms stream temperatures (never to the sheet), the
      LMTD and F, the film from its published inputs, THE ROOT (the film's
      flux = U F LMTD), U from its resistances, A >= A_required, the shell,
      both flows, h_fg against the column's V_rect x the distillate's molar
      mass (at 3 %: the column prices its condenser on the Watson latent,
      1.96 % off -- a measured finding, the record's section 5), and the
      `exchanger {}` provenance.  Five probe copies refuse the ITEM by name
      and keep the shell's sheet.

      SABOTAGES, by hand, 2026-10-20 (landed on the sheet BETWEEN the run and
      the check, `run_case` wrapped for the duration; S8 on the probe's
      output), all CAUGHT:
        S1  condenser h_shell +1 %  -> the Nusselt recomputation and R_film.
        S2  condenser dT_film +2 %, h kept  -> Nusselt, Re_film, q_flux.
        S3  reboiler q_CHF +3 %  -> the Zuber recomputation.
        S4  condenser T_process_in = T_process_out (the column's T_top not
            read)  -> the T_top hold, T_sat, the LMTD.
        S5  the tier correction dropped (h_shell = h_1)  -> Nusselt, R_film.
        S6  the reboiler's root broken CONSISTENTLY (dT_excess +5 % with the
            flux, h, R_film, U_clean, U and T_wall all recomputed from it)
            -> ONLY the root and A_required, which is why the root arm exists.
        S7  `fromUnit` dropped from the condenser's `exchanger {}`  -> caught.
        S8  the CHF probe's `[not sized]` line suppressed  -> the probe arm.

  (l) THE GUI FIXTURE IS STILL THE ENGINE'S OWN OUTPUT.  The readers' unit
      tests run on a TRANSCRIPTION of a sheet, because arm (g) keeps `design/`
      gitignored and no committed file can be read from a test.  This arm runs
      the writer and holds the header words, every `sizing {}` triple and every
      port line in `gui/tests/designSheet.test.ts` and
      `gui/tests/columnDatasheet.test.ts` to what was just written -- the
      `check_estimate_visible` precedent, for the same reason.  Which TEST FILE
      holds a fixture is part of the entry: a single hard-coded path would have
      reported the column fixtures as checked while holding them to nothing.

      SABOTAGES, by hand, 2026-09-07 (the arm regenerates `design/`, so each
      lands on the FIXTURE between the run and the check):
        S1  one port temperature drifts in ONE of three identical column
            fixtures  -> SURVIVED the first version of this arm, which searched
            the WHOLE test file for each line and found the drifted line in a
            SIBLING fixture carrying the same port block.  Caught after the
            match was made per template literal.
        S2  a `sizing {}` value drifts (`swageGap`)  -> caught.
        S3  the whole column fixture file is removed  -> caught by name.

WHAT THIS DOES NOT CHECK, said plainly:

  * THAT THE ENGINE'S OWN PARSER ACCEPTS IT, IN FULL.  Arm (k) is still not a
    round trip through `Dictionary::fromFile`: it checks the unit words, which
    is where every failure found so far lived, and arm (h) checks the
    structure.  A grammar the C++ parser rejects for a subtler reason -- a key
    spelling, a nesting depth -- would still pass both.  The GUI's reader does
    parse a whole sheet with a real dict parser, but it is the TypeScript one;
    the two grammars are kept in step by hand.
  * WHETHER ANY NUMBER IS RIGHT.  A wrong area reproduces into a sheet as
    faithfully as a right one.  Arms (b) and (c) check AGREEMENT between
    surfaces; arm (d) checks a conservation law, which is the only arm here
    that could notice a wrong number at all, and only for mass.
  * NESTING DEEPER THAN ONE LEVEL.  No corpus case nests sectors inside
    sectors (measured: 2 of 423 cases use sector folders at all, both one
    level), so the `<SECTOR>` component is never a dotted chain here.
  * THE GUI.  The case file tree groups by the FIRST path segment and draws
    the rest as one row, so `design/` reaches the browser as a flat list.
    Making it a real tree is separate work and needs its own arm.
  * EVERY CASE.  Two witnesses, one sectored and one flat, chosen because
    between them they exercise both address shapes.  Only 9 of 233 steady
    tutorials declare a `sizing {}` block at all.  Arm (k) therefore sees only
    the unit words THOSE two write; a sizer no witness exercises can still
    declare an unreadable one.
"""
import csv
import os
import math
import re
import shutil
import subprocess
import tempfile
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
#  THE WAIVERS LIVE IN ONE PLACE -- see `debt_registry.py`.
from debt_registry import SHEET_UNIT_WORDS_UNPARSEABLE   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

SECTORED = "tutorials/plant/ChemicalPlantTutorial"
FLAT    = "tutorials/steady/flowsheets/process02_with_design"
#  THE MULTI-ITEM WITNESS (2026-09-07).  The first case in the corpus where a
#  single flowsheet unit is sized as SEVERAL physical objects: a distillation
#  column is a shell, a tray stack, a condenser, a reboiler and a reflux drum.
#  The other two witnesses cannot exercise the 1:N address at all -- every unit
#  they carry realises exactly one item -- so without this one the sibling
#  sheets would be written and checked by nothing.
COLUMN  = "tutorials/steady/distillation/column09_tray_hydraulics"
#  THE KINETIC-BED WITNESS (2026-09-26).  A `pfr` sized as a shell and a
#  catalyst charge, from a volume a `designSpec` solved -- the first case in
#  the corpus where the post-processing chain runs on an outer driver's
#  representative pass at all, and the only one whose second item is priced
#  from a DECLARED unit price rather than a Turton correlation.
KINETIC = "tutorials/plant/ammoniaReactor04_kineticSizing"

#  THE SPACE-VELOCITY WITNESS (2026-10-05).  The one corpus case that sizes a
#  catalyst vessel from a declared `spaceVelocity`, and so the one whose
#  `spaceVelocityBasis` declaration reaches the arithmetic.
SPACEV  = "tutorials/plant/ammoniaReactor03_equilibriumApproach"

#  THE EXCHANGER-ROUTES WITNESS (2026-10-07).  The one corpus case whose
#  coolers declare a `utility` instead of an LMTD, and whose rated
#  interchanger is sized on its own area.
HXROUTE = "tutorials/plant/greenAmmoniaPEQ_baseCase"

TOL = 1.0e-6      # relative, between two projections of the same number


def run_case(rel: str):
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(ROOT / rel)],
                          capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def find_csv(rel: str, report: str, name: str):
    for p in (ROOT / rel / "reports" / report / name,
              ROOT / rel / "postProcessing" / report / "0" / name):
        if p.is_file():
            return p
    return None


def csv_rows(path):
    """A REAL CSV reader, because the `basis` column is a SENTENCE.

    This split on "," until 2026-09-07, and the column sizer's own basis --
    "straight tower at the wider section; D from the tray hydraulics, H = ..."
    -- shifted every numeric column after it by one.  `DesignReport` now quotes
    a field carrying a comma (RFC 4180, and ONLY when needed, so every CSV
    already written is byte-for-byte what it was); this reads the quoting back
    rather than a second hand-rolled splitter."""
    if path is None or not path.is_file():
        return None, []
    with path.open(newline="", errors="replace") as fh:
        rows = [r for r in csv.reader(fh) if r and any(c.strip() for c in r)]
    if not rows:
        return None, []
    return rows[0], rows[1:]


def parse_sheet(text: str):
    """The sheet, as a reader sees it.  Deliberately a SMALL reader: it pulls
    the header words, the `sizing {}` entries with their units, the `cost {}`
    scalars and each port's mdot.  It is not a dict parser and does not
    pretend to be one -- see the blind spot in the docstring."""
    #  Strip block comments and line comments before anything else.
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    t = re.sub(r'//[^\n]*', '', t)

    out = {"header": {}, "sizing": {}, "cost": {}, "inlets": [], "outlets": []}

    for k in ("recordType", "unit", "sector", "equipment", "item", "material"):
        m = re.search(r'^\s*%s\s+"?([^";\n]+)"?\s*;' % k, t, re.M)
        if m:
            out["header"][k] = m.group(1).strip()

    def block(name):
        m = re.search(r'^%s\s*\n\{' % name, t, re.M)
        if not m:
            return ""
        i = t.index("{", m.start())
        depth, j = 0, i
        while j < len(t):
            if t[j] == "{":
                depth += 1
            elif t[j] == "}":
                depth -= 1
                if depth == 0:
                    return t[i + 1:j]
            j += 1
        return ""

    #  sizing:  `key   value unit;`   (unit absent for a dimensionless value)
    for line in block("sizing").splitlines():
        #  A dimensionless value is `key [0 0 0 0 0] value;` -- the grammar's
        #  bracket form.  It is READ here as a declared unit ("-"), because a
        #  declared absence of dimension is not the same fact as a missing
        #  declaration, and the whole point of the format is that the file
        #  says which.
        m = re.match(r'\s*([A-Za-z_][\w]*)\s+\[([-\d ]+)\]\s+([-\d.eE+]+)\s*;', line)
        if m:
            out["sizing"][m.group(1)] = (float(m.group(3)), "-")
            continue
        m = re.match(r'\s*([A-Za-z_][\w]*)\s+([-\d.eE+]+)\s*([A-Za-z0-9/().*_]*)\s*;',
                     line)
        if m:
            out["sizing"][m.group(1)] = (float(m.group(2)), m.group(3))

    for line in block("cost").splitlines():
        m = re.match(r'\s*(purchased|bareModule|totalModule)\s+([-\d.eE+]+)\s*;', line)
        if m:
            out["cost"][m.group(1)] = float(m.group(2))

    for side in ("inlets", "outlets"):
        b = block(side)
        for m in re.finditer(r'mdot\s+([-\d.eE+]+)\s*kg/s\s*;', b):
            out[side].append(float(m.group(1)))

    return out


def close(a, b, tol=TOL):
    d = max(abs(a), abs(b), 1.0e-30)
    return abs(a - b) / d <= tol


def check_case(rel, expect_sector, problems, notes, all_units):
    rc, _, err = run_case(rel)
    if rc != 0:
        problems.append("%s: the run failed (rc=%d) -- nothing to check.\n    %s"
                        % (rel, rc, err.strip()[:300]))
        return 0

    head, rows = csv_rows(find_csv(rel, "design", "sizing.csv"))
    if head is None:
        problems.append("%s: no sizing.csv -- this case is supposed to size." % rel)
        return 0
    iu = head.index("unit")
    ity = head.index("equipmentType")
    isec = head.index("sector") if "sector" in head else None
    #  THE SHEET IS NAMED BY THE ITEM where a unit realises more than one.
    #  The column appears only on a case that has items to tell apart, so the
    #  address rule below is the one it always was for every other case.
    itag = head.index("equipmentTag") if "equipmentTag" in head else None

    chead, crows = csv_rows(find_csv(rel, "economics", "costs.csv"))
    costs = {}
    if chead and "unit" in chead:
        cu = chead.index("unit")
        for r in crows:
            if r[cu] in ("TOTAL",) or r[cu].startswith("SUBTOTAL"):
                continue
            costs[r[cu]] = {k: float(r[chead.index(k)])
                            for k in ("C_purchased", "C_bare_module", "C_total_module")
                            if k in chead and chead.index(k) < len(r)}

    sheets = []   # (equipmentType, V_magma) for arm (j)
    #  The per-unit mass balance, written by a DIFFERENT pass than the sheet.
    mb = find_csv(rel, "massBalance", "massBalance_byUnit.csv")
    mhead, mrows = csv_rows(mb)
    balance = {}
    if mhead and "unit" in mhead:
        mu = mhead.index("unit")
        for r in mrows:
            try:
                balance[r[mu]] = (float(r[mhead.index("in_kg_per_h")]),
                                  float(r[mhead.index("out_kg_per_h")]))
            except (ValueError, IndexError):
                pass

    checked = 0
    for r in rows:
        unit, etype = r[iu], r[ity]
        tag = r[itag] if itag is not None and r[itag].strip() else ""
        #  The ROW's own identity, and the name every message below uses: on a
        #  multi-item unit `column09` alone names five different sheets.
        ident = unit if not tag else unit + "/" + tag
        sector = r[isec] if isec is not None else ""
        if sector in ("(no sector)",):
            sector = ""

        # ------------------------------------------------------------ (a)(f)
        leaf = unit
        d = ROOT / rel / "design"
        if sector:
            d = d / sector
            if leaf.startswith(sector + "."):
                leaf = leaf[len(sector) + 1:]
        path = d / leaf / (tag if tag else etype)
        if not path.is_file():
            problems.append(
                "%s: item '%s' is in sizing.csv and has NO specification sheet "
                "at design/%s -- published as sized, absent where a reader "
                "audits."
                % (rel, ident, path.relative_to(ROOT / rel / 'design')))
            continue

        if not expect_sector:
            #  A flat case must grow no sector level at all: the sheet's
            #  parent's parent is `design/` itself.
            if path.parent.parent != ROOT / rel / "design":
                problems.append(
                    "%s: flat case grew a directory level under design/ (%s). "
                    "Empty is not a sector called 'root'."
                    % (rel, path.relative_to(ROOT / rel)))

        sheet = parse_sheet(path.read_text(errors="replace"))
        #  ---- (k) every unit word this sheet declares, for the readability
        #  arm.  Taken from the SHEET, not from sizing.csv's columns: a key the
        #  CSV does not carry is still a line the parser has to survive.
        for szKey, (_v, szUnit) in sheet["sizing"].items():
            if szUnit not in ("", "-"):
                all_units.append((rel, unit, szKey, szUnit))

        if "V_magma" in sheet["sizing"]:
            #  `equipment`, NOT `equipmentType`: that is the key the SHEET
            #  writes, and this line asked for the CSV column's name instead.
            #  So every tuple carried a None type, `check_crystalliser_volume`
            #  filtered on `ty == "crystalliser"`, found nothing and returned
            #  in silence -- arm (j), the load-bearing arm of the 2026-09-05
            #  slice and the only one here that can see a WRONG number, had
            #  never fired since the day it was written (found 2026-09-07).
            #  A gate arm that cannot fire pins nothing, which is the
            #  `check_true_ions` shape this project retired a gate over.
            sheets.append((sheet["header"].get("equipment"), sheet["sizing"]["V_magma"][0]))
        checked += 1

        # ---------------------------------------------------------------- (h)
        if sheet["header"].get("recordType") != "designSheet":
            problems.append("%s: %s carries no `recordType designSheet;`."
                            % (rel, unit))
        if sheet["header"].get("unit") != unit:
            problems.append("%s: %s's sheet names unit '%s'."
                            % (rel, unit, sheet["header"].get("unit")))
        raw = path.read_text(errors="replace")
        body = re.sub(r'/\*.*?\*/', '', raw, flags=re.S)
        body = re.sub(r'//[^\n]*', '', body)
        if body.count("{") != body.count("}"):
            problems.append("%s: %s's sheet has unbalanced braces (%d vs %d)."
                            % (rel, unit, body.count("{"), body.count("}")))

        # ---------------------------------------------------------------- (b)
        for k in head:
            if k in ("unit", "sector", "equipmentTag", "equipmentType",
                     "material", "basis"):
                continue
            cell = r[head.index(k)] if head.index(k) < len(r) else ""
            if not cell.strip():
                continue          # this unit does not carry that key
            if k not in sheet["sizing"]:
                problems.append(
                    "%s: %s's sheet omits sizing key '%s', which sizing.csv "
                    "carries (%s)." % (rel, unit, k, cell))
                continue
            val, unitword = sheet["sizing"][k]
            if not close(val, float(cell), 1.0e-4):
                problems.append(
                    "%s: %s's sheet says %s = %g, sizing.csv says %s -- two "
                    "projections of one record disagreeing."
                    % (rel, unit, k, val, cell))
            if unitword == "":
                problems.append(
                    "%s: %s's sizing value '%s' carries NO UNIT.  Every value "
                    "must declare it where it is computed "
                    "(`d.set(\"%s\", v, \"m3\")`); writing `d.values[...]` "
                    "bypasses the one door that records it."
                    % (rel, unit, k, k))

        # ---------------------------------------------------------------- (c)
        if ident in costs and sheet["cost"]:
            for sheetKey, csvKey in (("purchased", "C_purchased"),
                                     ("bareModule", "C_bare_module"),
                                     ("totalModule", "C_total_module")):
                if sheetKey in sheet["cost"] and csvKey in costs[ident]:
                    if not close(sheet["cost"][sheetKey], costs[ident][csvKey], 1.0e-4):
                        problems.append(
                            "%s: %s's sheet says %s = %g, costs.csv says %g."
                            % (rel, ident, sheetKey, sheet["cost"][sheetKey],
                               costs[ident][csvKey]))

        # ---------------------------------------------------------------- (d)
        if unit in balance and sheet["inlets"] and sheet["outlets"]:
            sin  = sum(sheet["inlets"])  * 3600.0
            sout = sum(sheet["outlets"]) * 3600.0
            bin_, bout = balance[unit]
            if not close(sin, bin_, 1.0e-3):
                problems.append(
                    "%s: %s's sheet inlet mass sums to %.4f kg/h; "
                    "massBalance_byUnit.csv says %.4f.  A port mass that is "
                    "not `StreamMass::F_massTotal` drops the crystals."
                    % (rel, unit, sin, bin_))
            if not close(sout, bout, 1.0e-3):
                problems.append(
                    "%s: %s's sheet outlet mass sums to %.4f kg/h; "
                    "massBalance_byUnit.csv says %.4f."
                    % (rel, unit, sout, bout))
            notes.append("%s in=%.1f out=%.1f kg/h" % (unit, sin, sout))

    check_crystalliser_volume(rel, sheets, problems, notes)
    return checked


# ---------------------------------------------------------------------------
#  (k) A SHEET IS A DICTIONARY CHOUPO CAN ACTUALLY READ
# ---------------------------------------------------------------------------

def tokenizer_word_chars():
    """The dict tokenizer's own word-character set, READ from
    `core/Dictionary.cpp::isWordChar` rather than written down here.  A second
    copy of the grammar in a gate would be the arity sin in the machinery built
    to prevent it -- and it would go quietly false the day the tokenizer moves,
    which is the failure mode this arm exists to catch in the first place."""
    src = (ROOT / "src/core/Dictionary.cpp").read_text(errors="replace")
    i = src.index("bool isWordChar")
    body = src[i:src.index("}", i)]
    return set(re.findall(r"c == '(.)'", body))


def known_unit_names():
    """Every unit name `core/Units.cpp` registers.  Also read, never listed."""
    src = (ROOT / "src/core/Units.cpp").read_text(errors="replace")
    return set(re.findall(r'\{\s*"([^"]+)"\s*,\s*UnitSpec', src))


def known_gui_unit_names():
    """Every unit name the GUI's dict parser accepts (`gui/src/dict/units.ts`,
    the mirror of core/Units.cpp).  READ, never listed: the two tables are a
    known second home, and the day a sizer writes a word the C++ table has and
    the GUI table lacks, the GUI refuses the WHOLE sheet -- which is what C48's
    `m2.K/W` and `W/m/K` did to every designed exchanger (found 2026-10-07,
    DEV.md 4c C51)."""
    src = (ROOT / "gui/src/dict/units.ts").read_text(errors="replace")
    i = src.index("const TABLE")
    body = src[i:src.index("\n};", i)]
    return set(re.findall(r'^\s*"?([^"\s:]+)"?\s*:\s*\{\s*factor', body, re.M))


def declared_sizer_units():
    """Every unit word a sizer DECLARES at its `d.set` site, over ALL sizers.

    Read from the source, not from the sheets two witnesses happen to write:
    only 9 of 233 steady tutorials size anything and the gate runs two of them,
    so a sheet sweep alone would leave most sizers unexamined -- which is
    exactly how `um` and `rpm` survived (`SprayDryerSize` is exercised by
    `sprayDryer07_design`, a case this gate does not run)."""
    out = []
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*.cpp")):
        src = f.read_text(errors="replace")
        for m in re.finditer(r'\bset\(\s*"([A-Za-z_0-9]+)"\s*,.*?,\s*"([^"]*)"\s*\)',
                             src, re.S):
            out.append((f.relative_to(ROOT), m.group(1), m.group(2)))
    return out


def check_unit_words_readable(all_units, problems, notes):
    """(k) EVERY SIZING UNIT WORD SURVIVES THE TOKENIZER AND IS A NAME THE
    ENGINE KNOWS -- otherwise the sheet is a file Choupo's own `Dictionary`
    REFUSES, under a header that calls it a Choupo dictionary.

    This is the arm the docstring's own blind-spot list predicted: "a writer
    whose output the reader refuses is a bug in BOTH, and nothing here would
    catch a grammar the C++ parser rejects".  It was written the day the first
    reader of a sheet was built (the GUI's printable exchanger datasheet), and
    it fired immediately on THREE unit words.

    VERIFIED BY HAND against the engine, not deduced from the tokenizer: a
    case dict carrying `U 600.0 W/(m2.K);` under
    `process02_with_design/system/postDict` produced

        ERROR: system/postDict:45:41: unknown unit suffix 'W/' after scalar
        value of 'U'.  Known units listed in core/Units.H.

    and `ShellTubeHX.cpp` had been writing exactly that into every exchanger
    sheet since the sheets shipped.  Fixed to `W/m2/K` -- the SAME unit at the
    SAME factor in `core/Units.cpp`, so no number moved.

    The other two (`um`, `rpm`, both `SprayDryerSize`) are NOT fixed here and
    must not be: `core/Units.cpp` has no name for either, so the remedy
    converts a VALUE, and the 2026-09-04 slice reserved that class in its own
    words ("Nothing was converted: rebasing on SI moves numbers in every golden
    that pins them").  They are in `SHEET_UNIT_WORDS_UNPARSEABLE`
    with their remedy and blocker, and the STALE-PIN half below fails if one
    stops being declared -- a waiver that outlives its violation silently
    grants permission.

    TWO SWEEPS, because neither alone is the claim.  The SOURCE sweep is
    complete over the sizers and is what the pin is held against.  The SHEET
    sweep re-checks the words that actually reached a written file, which is
    the only half that could catch a unit arriving by some route other than
    `d.set`."""
    wordchars = tokenizer_word_chars()
    known = known_unit_names()
    guiKnown = known_gui_unit_names()
    declared = declared_sizer_units()
    if not wordchars or not known or not guiKnown or not declared:
        problems.append(
            "check_design_sheet(k): could not read the tokenizer's word-char "
            "set, the unit table, or any `d.set` unit word out of src/ -- this "
            "arm CANNOT RUN, and a check that cannot run must not pass.")
        return

    def deliverable(word):
        return all(c.isalnum() or c in wordchars for c in word)

    def judge(where, key, word, problems):
        if word in ("", "-") or word in SHEET_UNIT_WORDS_UNPARSEABLE:
            return
        if not deliverable(word):
            problems.append(
                "%s: sizing value '%s' declares the unit '%s', which the dict "
                "tokenizer CANNOT DELIVER -- it stops at the first character "
                "outside `Dictionary.cpp::isWordChar`, so Choupo's own parser "
                "refuses the WHOLE sheet.  Use a spelling made of word "
                "characters (core/Units.cpp usually registers one at the same "
                "factor: `W/m2/K` for `W/(m2.K)`), at the `d.set` site."
                % (where, key, word))
        elif word not in known:
            problems.append(
                "%s: sizing value '%s' declares the unit '%s', which "
                "core/Units.cpp does not register -- the tokenizer delivers "
                "the word and the parser then refuses the whole sheet with "
                "`unknown unit suffix`.  Either register it or convert the "
                "value at the `d.set` site (converting MOVES a number: see "
                "SHEET_UNIT_WORDS_UNPARSEABLE)."
                % (where, key, word))
        elif word not in guiKnown:
            problems.append(
                "%s: sizing value '%s' declares the unit '%s', which "
                "core/Units.cpp registers and the GUI's mirror "
                "(gui/src/dict/units.ts) does NOT -- the engine reads the "
                "sheet and the GUI refuses the whole of it, so every datasheet "
                "drawn from it says the sheet is unreadable.  Add the word to "
                "the GUI table at the same factor."
                % (where, key, word))

    for f, key, word in declared:
        judge(str(f), key, word, problems)
    for rel, unit, key, word in all_units:
        judge("%s: %s's written sheet" % (rel, unit), key, word, problems)

    #  STALE-PIN: a waiver whose violation has healed must go.
    declaredWords = {w for (_f, _k, w) in declared}
    for word in sorted(SHEET_UNIT_WORDS_UNPARSEABLE):
        if word not in declaredWords:
            problems.append(
                "check_design_sheet(k): debt_registry pins the unreadable unit "
                "word '%s' and no sizer declares it any more.  Either it was "
                "fixed -- remove the pin -- or the `d.set` that carried it "
                "went away, which is a different and worse thing." % word)
    notes.append("%d `d.set` unit word(s) over %d sizer file(s), %d pinned "
                 "unreadable" % (len(declaredWords),
                                 len({f for (f, _k, _w) in declared}),
                                 len(SHEET_UNIT_WORDS_UNPARSEABLE)))


# ---------------------------------------------------------------------------
#  (l) THE GUI FIXTURE IS STILL THE ENGINE'S OWN OUTPUT
# ---------------------------------------------------------------------------

#  (case, sheet path under design/, the test file that transcribes it).
#  THE TEST FILE IS PART OF THE ENTRY (2026-09-07): the column schematic's
#  fixtures live in their own test beside the reader they exercise, and a
#  single hard-coded `GUI_TEST` would have held them to nothing while
#  reporting that it had checked them.
GUI_FIXTURES = (
    (FLAT,    "heater/shellTubeHX",                 "gui/tests/designSheet.test.ts"),
    (SECTORED, "FERMENTATION/Fermentor/stirredTank", "gui/tests/designSheet.test.ts"),
    (COLUMN,  "column09/shell",                     "gui/tests/columnDatasheet.test.ts"),
    (COLUMN,  "column09/trays",                     "gui/tests/columnDatasheet.test.ts"),
    (COLUMN,  "column09/refluxDrum",                "gui/tests/columnDatasheet.test.ts"),
)


def check_gui_fixture(problems, notes):
    """(l) The GUI's printable datasheet READS a specification sheet back, and
    its unit tests run on a TRANSCRIPTION of one -- because `design/` is a run
    output and arm (g) keeps it gitignored, so no committed file can be read
    from a test.  A transcription drifts from its original in silence.  This
    arm runs the writer and holds the fixture to what it wrote, which is the
    `check_estimate_visible` precedent for the same reason.

    It compares the HEADER words, every `sizing {}` triple (key, value, unit)
    and -- since 2026-09-07 -- every line of the `inlets {}` and `outlets {}`
    blocks, whitespace-normalised.  The ports were deliberately NOT held here
    until that day, on the stated ground that the GUI reader did not read them
    and a fixture held to more than its reader uses is a golden nobody asked
    for.  The column schematic READS them: it colours each nozzle by the
    temperature the run wrote.  So the reason expired the moment the reader
    arrived, which is the rule about burying an absence you have just filled.
    The cost block and the `exchanger {}` block are NOT held here, and the
    reason changed on 2026-10-07 (DEV.md 4c C51): the exchanger datasheet
    now READS both, but its tests read the ENGINE's own sheets through the
    GUI witness setup (`gui/tests/witnessOutputs.ts` runs the green-ammonia
    plant with this tree's binary), not a transcription -- so there is no
    copy here for the two to drift between.  None of the five fixtures
    below carries either block's reader."""
    norm = lambda s: " ".join(s.split())
    #  EACH FIXTURE IS ITS OWN TEMPLATE LITERAL, and the wanted lines must all
    #  land in ONE of them (2026-09-07).  This arm used to search the WHOLE
    #  test file for each line, which was exact while a file held one fixture
    #  and became blind the day one held three: the column's shell, trays and
    #  reflux-drum sheets carry the SAME three port blocks, so a drifted
    #  temperature in one was still found -- in a sibling.  Verified by hand:
    #  the sabotage that edits one fixture's `T 370 K` SURVIVED the first
    #  version of this arm and fails this one.
    fixtures = {}
    for _, _, test_rel in GUI_FIXTURES:
        if test_rel in fixtures:
            continue
        f = ROOT / test_rel
        if not f.is_file():
            problems.append("check_design_sheet(l): %s is gone -- the reader "
                            "that replaced this gate's structural arm has no "
                            "tests." % test_rel)
            continue
        #  Split on UNESCAPED backticks only.  A sheet's own header comment
        #  contains backticks (it names `system/postDict` and `sizing {}`), so
        #  a faithful transcription escapes them -- and splitting on those cut
        #  every fixture in half, which made this arm accuse the correct
        #  fixture of missing its own first line.
        fixtures[test_rel] = [norm(c) for c in
                              re.split(r"(?<!\\)`", f.read_text(errors="replace"))]
    for rel, tail, test_rel in GUI_FIXTURES:
        chunks = fixtures.get(test_rel)
        if chunks is None:
            continue
        p = ROOT / rel / "design" / tail
        if not p.is_file():
            problems.append("check_design_sheet(l): the run wrote no %s, so "
                            "the GUI fixture is held to nothing." % tail)
            continue
        text = re.sub(r'/\*.*?\*/', '', p.read_text(errors="replace"), flags=re.S)
        want = []
        for k in ("recordType", "unit", "sector", "equipment", "item",
                  "material", "basis"):
            m = re.search(r'^\s*%s\s+.*;' % k, text, re.M)
            if m:
                want.append(m.group(0))
        for block in ("sizing", "inlets", "outlets"):
            m = re.search(r'^%s\s*\n\{(.*?)\n\}' % block, text, re.S | re.M)
            if m:
                want += [l for l in m.group(1).splitlines() if l.strip()]
        want = [norm(w) for w in want]
        #  The best-matching chunk decides, so the message names what is
        #  missing from the fixture that is CLOSEST to this sheet rather than
        #  from an unrelated one.
        best, missing = None, want
        for c in chunks:
            gap = [w for w in want if w not in c]
            if best is None or len(gap) < len(missing):
                best, missing = c, gap
        if missing:
            problems.append(
                "check_design_sheet(l): the GUI fixture in %s no longer "
                "matches design/%s, which the run just wrote.  Absent from the "
                "fixture: %s.  The GUI's reader tests are written on that "
                "transcription, so a drift makes them pass against a sheet the "
                "engine does not produce."
                % (test_rel, tail, "; ".join(missing[:4])))
        else:
            notes.append("GUI fixture matches design/%s" % tail)


def check_refusal(problems):
    """(e) The guard is still there, read at its source.  NOT built and NOT
    run: a gate that patches a source and rebuilds the engine is the 2026-08-18
    shape, and `check_gate_selftest` is the only gate permitted it."""
    src = (ROOT / "src/io/DesignSheetWriter.cpp").read_text(errors="replace")
    if 'u.empty()' not in src or 'NO UNIT' not in src:
        problems.append(
            "check_design_sheet(e): DesignSheetWriter no longer refuses a "
            "sizing value with no declared unit.  Without it a sheet ships a "
            "number whose unit nobody knows, and a plausible default would be "
            "the hand-written unit table this slice deleted, one indirection "
            "further away.")
    if 'd.set(' not in src:
        problems.append(
            "check_design_sheet(e): the refusal no longer names `set()` as the "
            "remedy.  A refusal that does not say what to do instead is advice "
            "the reader cannot act on.")
    #  And the one door is still the only door.
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*.cpp")):
        if "values[" in f.read_text(errors="replace"):
            problems.append(
                "%s writes `values[...]` directly, past `set()` -- the one "
                "call that records the unit beside the value."
                % f.relative_to(ROOT))


def check_basis_stated(problems):
    """(i) SOURCE -- every sizer assigns `d.basis`.  Structural on purpose: a
    list of the expected strings would be a second home for the sizers' own
    vocabulary, and a sizer that forgets shows `(not stated)` on every surface
    at once, which is the visible form this arm keeps visible.  It cannot
    check that a basis is TRUE of its sizer; only a reader can (2026-09-05:
    the first one read found a kmol holdup labelled m3)."""
    for f in sorted((ROOT / "src/postProcessing/sizing").glob("*Size.cpp")) + \
             [ROOT / "src/postProcessing/sizing/ShellTubeHX.cpp",
              ROOT / "src/postProcessing/sizing/StirredTank.cpp"]:
        if f.name == "EquipmentSize.cpp":
            continue
        src = f.read_text(errors="replace")
        if "::size(" in src and not re.search(r"\b(d\.basis|basis)\s*=", src):
            problems.append(
                "%s states no design basis (`d.basis = ...`).  A size whose "
                "rule is invisible cannot be defended, only reported -- and the "
                "GUI header promises a basis for every item."
                % f.relative_to(ROOT))


def declared_crystalliser_volumes(rel):
    """Every `type crystalliser` block's `volume` under the case, read from
    the CASE DICTS -- never from the run."""
    vols = []
    for fd in sorted((ROOT / rel).rglob("flowsheetDict")):
        txt = fd.read_text(errors="replace")
        for m in re.finditer(r"type\s+crystalliser\s*;", txt):
            tail = txt[m.end():m.end() + 4000]
            v = re.search(r"\bvolume\s+([0-9.eE+-]+)\s*(\S*?)\s*;", tail)
            if not v:
                continue
            val, unit = float(v.group(1)), v.group(2)
            if unit in ("m3", "m^3", ""):
                vols.append(val)
            elif unit == "L":
                vols.append(val * 1.0e-3)
            else:
                vols.append(None)      # a unit this arm does not convert: say so
    return vols


def check_crystalliser_volume(rel, sheets, problems, notes):
    """(j) INDEPENDENT -- a crystalliser sheet's V_magma IS the unit's declared
    `operation.volume`.  This is the arm that would have fired for the whole
    life of the kmol-as-m3 defect: the golden pinned what the run PRINTED, and
    only a recomputation from the declaration can see a size that is wrong."""
    got = sorted(v for (ty, v) in sheets if ty == "crystalliser")
    if not got:
        return
    want = declared_crystalliser_volumes(rel)
    if any(w is None for w in want):
        problems.append("%s: a crystalliser declares its volume in a unit this "
                        "arm does not convert -- extend the arm, do not skip it."
                        % rel)
        return
    want = sorted(want)
    if len(got) != len(want) or any(not close(a, b, 1.0e-6) for a, b in zip(got, want)):
        problems.append(
            "%s: crystalliser sheet(s) size V_magma = %s m3 but the case "
            "declares operation.volume = %s m3.  The MSMPR is a rating model: "
            "its volume is the INPUT, and a sizer that computes something else "
            "is sizing a different vessel (2026-09-05: liquorFlow[kmol/s] * tau "
            "gave 18.46 'm3' on a 1.0 m3 vessel)."
            % (rel, got, want))
    else:
        notes.append("crystalliser V_magma %s m3 = declared volume" % got)


def check_ignored(problems):
    """(g) Both directions of the .gitignore rule."""
    case_file = ROOT / SECTORED / "design" / "X" / "Y" / "z"
    case_file.parent.mkdir(parents=True, exist_ok=True)
    case_file.write_text("")
    rec = ROOT / "docs" / "design" / "__gate_probe.md"
    rec.write_text("")
    try:
        r1 = subprocess.run(["git", "check-ignore", "-q", str(case_file)],
                            cwd=ROOT, capture_output=True)
        if r1.returncode != 0:
            problems.append(
                "check_design_sheet(g): a tutorial's design/ output is NOT "
                "gitignored.  The GUI bundle is a Vite glob over "
                "tutorials/*/*/**/* that inlines every match as a raw string, "
                "so a committable run output is one machine's stale sizing "
                "baked into the shipped site.")
        r2 = subprocess.run(["git", "check-ignore", "-q", str(rec)],
                            cwd=ROOT, capture_output=True)
        if r2.returncode == 0:
            problems.append(
                "check_design_sheet(g): a NEW file under docs/design/ is "
                "ignored.  The 135 already tracked survive (git never ignores "
                "a tracked file) and every new design RECORD would vanish in "
                "silence, in a tree whose own rule is to write the record "
                "before promoting.")
    finally:
        shutil.rmtree(ROOT / SECTORED / "design" / "X", ignore_errors=True)
        rec.unlink(missing_ok=True)

    #  The second lock: the glob exclusion, so the rule survives a .gitignore edit.
    tl = (ROOT / "gui/src/cases/tutorials.ts").read_text(errors="replace")
    if 'tutorials/**/design/**' not in tl:
        problems.append(
            "check_design_sheet(g): gui/src/cases/tutorials.ts does not "
            "exclude design/ from the case glob.  The .gitignore is one edit "
            "away from being gone and this is the second lock.")


# ---------------------------------------------------------------------------
#  (m) ONE UNIT, FIVE ITEMS -- AND THREE OF THE NUMBERS RECOMPUTED
# ---------------------------------------------------------------------------

COLUMN_ITEMS = ("shell", "trays", "condenser", "reboiler", "refluxDrum")


def check_column_items(problems, notes):
    """(m) A unit that realises SEVERAL physical items writes one sheet per
    item, each naming itself; the two exchanger areas and the tower height are
    RECOMPUTED from the case's own declaration; and the tray stack's cost is
    recomputed by hand from its printed size (since 2026-10-05).

    WHY EACH HALF IS HERE.

      * THE ADDRESS.  Arm (a) already holds every sizing.csv row to a sheet,
        but on the other two witnesses every unit realises ONE item, so the
        sibling address `design/<unit>/<tag>` is exercised by nothing there.
        This names the five it expects, so a sizer that silently stopped
        emitting one would be caught rather than merely producing a shorter
        table.

      * THE RECOMPUTATION, and it is arm (j)'s precedent.  A golden pins what
        a run PRINTS, so a wrong area pins as happily as a right one; only a
        recomputation from the DECLARATION can see a number that is wrong.
        U and LMTD are read from the case postDict and Q from the run's own
        KPI line, and A = |Q|/(U*LMTD) is redone here.  The tower height is
        redone the same way from the tray count the hydraulics rated, the
        author-declared spacing and the two end allowances -- which is what
        caught this sizer computing `nStages - 2` trays where the hydraulics
        rates 14, half a tray spacing short.

      * THE SWAGE TEST.  The tower is built STRAIGHT at the larger section, so
        `D` must equal max(D_rectifying, D_stripping) and `swageGap` must be
        their relative difference.  A shell quietly sized on the NARROWER
        section would flood, and no other arm anywhere could see it.

      * THE TRAYS ARE COSTED BY THE TRAY (since 2026-10-05; until then
        they were refused by name, Choupo having no tray set).  The cost is
        RECOMPUTED from the sheet's A and nTrays with a reference set this
        gate transcribes itself, which is tied to the source program's own
        worked tower; and the refusal is kept alive on a probe copy that
        declares no material class.  See `check_tray_stack`.

    SABOTAGE-VERIFIED, seven of them, BY HAND and never by patching a source
    and rebuilding.  The first attempt proved NOTHING and is worth writing
    down: this arm runs the case itself and `design/` is regenerated whole, so
    every sheet edited beforehand was destroyed before it was read and all six
    sabotages "survived" while the gate was working perfectly.  That is the
    2026-09-05 trap in `check_internal_states`, met again one gate over -- the
    sabotage has to land BETWEEN the run and the check, which was done by
    wrapping `run_case` for the duration.  Fired then: (1) an item stops being
    written; (2) a wrong exchanger area; (3) the shell built on the NARROWER
    section; (4) the tray count back to `nStages - 2`; (5) the trays gain an
    invented cost block; (6) a sheet stops naming its item; (7) `swageGap` is
    not the difference of the two sections the sheet itself publishes.
    (Sabotage (5) guarded the tray REFUSAL, which was the decision then; the
    tray cost has its own four in `check_tray_stack` since 2026-10-05.)

    NOT CHECKED HERE: whether U, LMTD or the residence time are sensible --
    they are the author's declaration and this arm only proves they reached the
    arithmetic.  Nor whether the DIAMETER is right: that is the tray
    hydraulics' answer and `check_block_tridiagonal` is not its gate either;
    this arm holds the sizer to the hydraulics, not the hydraulics to physics.
    """
    rc, out, err = run_case(COLUMN)
    if rc != 0:
        problems.append("check_design_sheet(m): %s failed (rc=%d).\n    %s"
                        % (COLUMN, rc, err.strip()[:300]))
        return

    base = ROOT / COLUMN / "design" / "column09"
    got = sorted(p.name for p in base.iterdir()) if base.is_dir() else []
    if got != sorted(COLUMN_ITEMS):
        problems.append(
            "check_design_sheet(m): %s writes %s under design/column09/, not "
            "the five items a distillation column realises (%s).  The 1:N "
            "shape the sheet writer was built on has exactly one case in the "
            "corpus and this is it."
            % (COLUMN, got or "nothing", ", ".join(sorted(COLUMN_ITEMS))))
        return

    sheets = {}
    for name in COLUMN_ITEMS:
        s = parse_sheet((base / name).read_text(errors="replace"))
        sheets[name] = s
        if s["header"].get("item") != name:
            problems.append(
                "check_design_sheet(m): design/column09/%s declares `item %s;` "
                "-- a sheet of a multi-item unit must name which item it is, "
                "or five sheets under one unit are told apart only by their "
                "filename." % (name, s["header"].get("item")))

    #  ---- the two exchanger areas, from the CASE and the RUN ---------------
    post = (ROOT / COLUMN / "system" / "postDict").read_text(errors="replace")
    kpiLine = ""
    for line in out.splitlines():
        if '"column09": {' in line:
            kpiLine = line
            break
    if not kpiLine:
        problems.append("check_design_sheet(m): the run emits no KPI object "
                        "for column09, so no area can be recomputed.")
        return

    def kpi(name):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % name, kpiLine)
        return float(m.group(1)) if m else None

    for item, block, qkey in (("condenser", "condenser", "Q_condenser_kW"),
                              ("reboiler",  "reboiler",  "Q_reboiler_kW")):
        m = re.search(r'\b%s\s*\{(.*?)\}' % block, post, re.S)
        if not m:
            problems.append("check_design_sheet(m): the case declares no `%s "
                            "{}` block, so this arm cannot recompute its area."
                            % block)
            continue
        U = float(re.search(r'\bU\s+([0-9.eE+-]+)', m.group(1)).group(1))
        LM = float(re.search(r'\bLMTD\s+([0-9.eE+-]+)', m.group(1)).group(1))
        Q = kpi(qkey)
        if Q is None:
            problems.append("check_design_sheet(m): the run publishes no %s "
                            "KPI." % qkey)
            continue
        want = abs(Q) * 1000.0 / (U * LM)
        got_A = sheets[item]["sizing"].get("A", (None, ""))[0]
        if got_A is None or not close(got_A, want, 1.0e-6):
            problems.append(
                "check_design_sheet(m): the %s sheet says A = %s m2, but "
                "|%s|/(U*LMTD) with the case's own U = %g and LMTD = %g is "
                "%.6f m2.  A golden pins what the run PRINTS; only this "
                "recomputation can see an area that is wrong."
                % (item, got_A, qkey, U, LM, want))
        else:
            notes.append("%s A = %.4f m2 recomputed from the declaration"
                         % (item, want))

    #  ---- the tower height, from the tray count the HYDRAULICS rated -------
    nT = kpi("nTrays")
    sh = sheets["shell"]["sizing"]
    spacing = sh.get("traySpacing", (None, ""))[0]
    if nT is None or spacing is None:
        problems.append("check_design_sheet(m): no nTrays KPI or no declared "
                        "traySpacing -- the height cannot be recomputed.")
    else:
        if not close(sh.get("nTrays", (0.0, ""))[0], nT, 1.0e-9):
            problems.append(
                "check_design_sheet(m): the shell sheet says nTrays = %s while "
                "the hydraulics pass rated %g.  The stage count is NOT the tray "
                "count -- this solver stage list carries the reboiler and not "
                "the condenser, and `nStages - 2` was short by one."
                % (sh.get("nTrays"), nT))
        #  The two end allowances: whatever the case declares, else the engine
        #  default READ FROM `DesignDefaults.cpp` -- never a literal here.
        defs = (ROOT / "src/postProcessing/sizing/DesignDefaults.cpp"
                ).read_text(errors="replace")
        ends = 0.0
        for key in ("disengagementHeight", "sumpHeight"):
            m = re.search(r'^\s*%s\s+([0-9.eE+-]+)\s*;' % key, post, re.M)
            if m:
                ends += float(m.group(1))
                continue
            d = re.search(r'"%s",\s*([0-9.eE+-]+)\s*,' % key, defs)
            if not d:
                problems.append("check_design_sheet(m): neither the case nor "
                                "DesignDefaults.cpp names %s -- this arm "
                                "CANNOT RUN, and it must not pass." % key)
                ends = None
                break
            ends += float(d.group(1))
        if ends is not None:
            want = (nT - 1.0) * spacing + ends
            if not close(sh.get("H", (None, ""))[0], want, 1.0e-9):
                problems.append(
                    "check_design_sheet(m): the shell sheet says H = %s m; "
                    "(nTrays-1)*traySpacing + the two end allowances is "
                    "%.6f m."
                    % (sh.get("H"), want))
            else:
                notes.append("tower H = %.3f m recomputed from %g trays" % (want, nT))

    #  ---- the straight tower is the WIDER section --------------------------
    dr = sh.get("D_rectifying", (None, ""))[0]
    ds = sh.get("D_stripping", (None, ""))[0]
    if dr is None or ds is None:
        problems.append("check_design_sheet(m): the shell sheet publishes no "
                        "per-section diameters, so the swage decision is on "
                        "no surface a reader can audit.")
    else:
        big, sml = max(dr, ds), min(dr, ds)
        #  ONLY IN DESIGN MODE.  With `diameter` declared the pass RATES the
        #  trays against the author tower, which may be narrower than a
        #  section needs -- `column10_flooding` declares 1.1 m and floods at
        #  114 %.  The witness is a DESIGN case, so this arm holds; a rating
        #  case would legitimately fail it, and the sizer says which it is in
        #  its basis rather than leaving this arm to guess.
        designed = kpi("diameterDesigned")
        if designed is not None and designed == 0.0:
            notes.append("column RATED at a declared diameter; the "
                         "wider-section arm does not apply")
        elif not close(sh.get("D", (None, ""))[0], big, 1.0e-12):
            problems.append(
                "check_design_sheet(m): the shell is sized at D = %s m while "
                "its wider section needs %.6f m.  A tower built on the "
                "NARROWER section floods, and nothing else here could see it."
                % (sh.get("D"), big))
        #  1e-5, not the 1e-12 the two diameters are compared at: the gap is
        #  a DIFFERENCE of two nearly equal numbers, and both sides here are
        #  8-significant-digit renderings off the sheet, so the subtraction
        #  costs about four of those digits.  Tightening it would fail on
        #  correct arithmetic.
        if not close(sh.get("swageGap", (None, ""))[0], (big - sml) / big, 1.0e-5):
            problems.append(
                "check_design_sheet(m): the shell sheet swageGap is %s, not "
                "the relative difference %.6f of the two sections it "
                "publishes." % (sh.get("swageGap"), (big - sml) / big))
        else:
            notes.append("sections %.3f / %.3f m, gap %.1f %%, straight tower"
                         % (dr, ds, 100.0 * (big - sml) / big))

    #  ---- the trays are COSTED BY THE TRAY, and the cost recomputes --------
    check_tray_stack(sheets, out, problems, notes)


#  THE REFERENCE TRAY SET, transcribed HERE independently of the engine and
#  from the same source (2026-10-05, DEV.md 4c C38 item 1): CAPCOST 2017
#  (`capcost_2017_rev2.xlsm`, the program distributed with Turton,
#  Shaeiwitz, Bhattacharyya & Whiting, 5th ed., downloaded from Richard
#  Turton's WVU faculty page), sheet "Equipment Cost Data":
#    Tower Trays / Sieve, C257:G257 -> K1, K2, K3, Amin, Amax
#    FBM / Sieve, D262 (CS), D263 (SS), D265 (Ni-alloy)
#    B267 -> the F_q formula; macro `calculateTrayCosts` -> F_q = 1 for N >= 20
#  The book's printed table and page were NOT read; see Turton.cpp.
TRAY_SIEVE = (2.9949, 0.4465, 0.3961)
TRAY_AREA_RANGE = (0.07, 12.3)
TRAY_FBM = {"carbonSteel": 1.00, "stainlessSteel": 1.83, "nickelAlloy": 5.58}
#  The program's own worked tower, "T-101": 32 sieve trays, D 2.1 m, H 23 m,
#  carbon-steel shell.  Its "Base Equipment Cost" and "Base Bare Module Cost"
#  cells are formulas `ROUND(<k> * CEPCI, ...)`, and these are the two k's --
#  the cost per unit of CEPCI of the shell plus the trays at the carbon-steel
#  base (F_BM 1, F_P 1).  The program computes areas with pi = 3.14.
CAPCOST_T101 = {"D": 2.1, "H": 23.0, "N": 32,
                "baseEquipment_perCEPCI": 318.664206642066,
                "baseBareModule_perCEPCI": 741.819188191882}
#  The vertical-vessel set the engine's `vesselCoeffs` carries, which the same
#  program sheet carries identically (B239:F239, B1/B2 C244:D244).
VESSEL_VERTICAL = (3.4974, 0.4485, 0.1074, 2.25, 1.82)


def tray_quantity_factor(n):
    if n >= 20:
        return 1.0
    l = math.log10(n)
    return 10.0 ** (0.4771 + 0.08516 * l - 0.3473 * l * l)


def tray_cp0_2001(area):
    k1, k2, k3 = TRAY_SIEVE
    l = math.log10(area)
    return 10.0 ** (k1 + k2 * l + k3 * l * l)


def _cost_factors(text):
    """The `factors {}` scalars of a sheet's `cost {}` block, and its words."""
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    m = re.search(r'^cost\s*\n\{(.*?)^\}', t, re.S | re.M)
    if not m:
        return {}, {}
    body = m.group(1)
    f = {}
    fm = re.search(r'factors\s*\{(.*?)\}', body, re.S)
    if fm:
        for line in fm.group(1).splitlines():
            mm = re.match(r'\s*(\w+)\s+([-\d.eE+]+)\s*;', line)
            if mm:
                f[mm.group(1)] = float(mm.group(2))
    words = dict(re.findall(r'^\s*(correlation|sizeKey|pricedAs)\s+"?([^";\n]+)"?\s*;',
                            body, re.M))
    return f, words


def check_tray_stack(sheets, out, problems, notes):
    """(m, trays) THE TRAY STACK IS COSTED BY THE TRAY, AND THE COST IS
    RECOMPUTED HERE FROM THE SHEET'S OWN SIZE (2026-10-05, DEV.md 4c C38
    item 1).  Four claims, each a different way the cost could be wrong:

      * THE ANCHOR.  The reference set above reproduces the source program's
        OWN worked tower (CAPCOST's T-101) to 1e-5 on the CEPCI-397 basis --
        so the gate's transcription is tied to a number the source computed,
        not only to the engine's transcription of the same cells.
      * THE COEFFICIENTS.  The K1..K3 and F_BM the sheet publishes are the
        reference values for the class the case declared.
      * THE ARITHMETIC.  From the sheet's `A` and `nTrays` alone, with the
        reference set and the sheet's own index factors:
            C_p  = N x 10^(K1 + K2 log A + K3 log^2 A) x CEPCI/CEPCI_2001 x fx
            C_BM = C_p x F_BM x F_q(N);   C_TM = 1.18 C_BM
        must land on the sheet's three costs to 1e-6.  The case has 14 trays,
        so F_q != 1 and its N < 20 branch is exercised.
      * THE TOTAL IS COMPLETE, and the refusal still works when the class is
        not declared (a probe copy with the `trayMaterial` line removed: the
        trays refuse BY NAME, the total says INCOMPLETE naming them, and the
        other four items are still costed).  An unknown class word refuses
        through the one refusal home.

    SABOTAGE-VERIFIED 2026-10-05, by hand, each restored with `cp` and the
    engine rebuilt; every line below was OBSERVED:
      T1  Turton.cpp: K3 0.3961 -> 0.3916 (a transposed digit).  The
          coefficient check fires, and so does the arithmetic -- on a cost
          that moved only 0.005 %, because log10 A is small at A = 1.17 m2;
          the coefficient check is what names the cause.
      T2  Turton.cpp: F_q dropped from C_BM.  bareModule and totalModule
          fire (37252 recomputed against 28358 printed); purchased does not,
          correctly -- F_q is not in C_p.
      T3  Turton.cpp: an absent `trayMaterial` silently priced as carbon
          steel.  The no-class probe fires four times (no refusal, no
          remedy, no INCOMPLETE, a cost block written).
      T4  this gate's TRAY_SIEVE K1 2.9949 -> 2.9494 (the GATE's
          transcription drifting).  Only the anchor fires: the CAPCOST
          T-101 reproduction lands at 300.68 against 318.66 per CEPCI.
    NOT CHECKED: the stainless and nickel-alloy F_BM values beyond their
    transcription (the T-101 anchor is a carbon-steel base cost, so only
    F_BM(CS) = 1 is tied to a computed number), the valve-tray and demister
    rows (not transcribed: no unit sizes them), and the tray AREA's
    definition (pi D^2 / 4 at the tower diameter, the sizer's -- Turton's
    program uses the same cross-section with pi = 3.14)."""
    #  -- the anchor, pure arithmetic --------------------------------------
    k1, k2, k3, b1, b2 = VESSEL_VERTICAL
    pi = 3.14
    d, h, n = CAPCOST_T101["D"], CAPCOST_T101["H"], CAPCOST_T101["N"]
    v = pi * (d / 2) ** 2 * h
    a = pi * (d / 2) ** 2
    lv = math.log10(v)
    cv = 10.0 ** (k1 + k2 * lv + k3 * lv * lv)
    ct = n * tray_cp0_2001(a) * tray_quantity_factor(n)
    base_eq = (cv + n * tray_cp0_2001(a)) / 397.0
    base_bm = (cv * (b1 + b2) + ct * TRAY_FBM["carbonSteel"]) / 397.0
    if not (close(base_eq, CAPCOST_T101["baseEquipment_perCEPCI"], 1e-5)
            and close(base_bm, CAPCOST_T101["baseBareModule_perCEPCI"], 1e-5)):
        problems.append(
            "check_design_sheet(m): the reference tray set no longer "
            "reproduces CAPCOST's own worked tower T-101 (base equipment "
            "%.6f vs %.6f, base bare module %.6f vs %.6f per unit CEPCI) -- "
            "the transcription in this gate has drifted from its source."
            % (base_eq, CAPCOST_T101["baseEquipment_perCEPCI"], base_bm,
               CAPCOST_T101["baseBareModule_perCEPCI"]))
        return
    notes.append("reference tray set reproduces CAPCOST T-101 (%.4f, %.4f "
                 "per CEPCI)" % (base_eq, base_bm))

    #  -- the shipped case --------------------------------------------------
    trays = sheets["trays"]
    text = (ROOT / COLUMN / "design" / "column09" / "trays").read_text(
        errors="replace")
    fac, words = _cost_factors(text)
    if not trays["cost"] or not fac:
        problems.append(
            "check_design_sheet(m): the trays sheet carries no `cost {}` "
            "block -- the tray stack is not costed although the case declares "
            "its material class.")
        return
    post = (ROOT / COLUMN / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', post)
    mw = re.search(r'^\s*trayMaterial\s+(\w+)\s*;', post_nc, re.M)
    if not mw or mw.group(1) not in TRAY_FBM:
        problems.append("check_design_sheet(m): %s declares no recognised "
                        "`trayMaterial`, so the witness cannot price its "
                        "trays." % COLUMN)
        return
    cls = mw.group(1)
    if words.get("correlation") != "tray-stack":
        problems.append("check_design_sheet(m): the trays cost names "
                        "correlation %r, not `tray-stack`."
                        % words.get("correlation"))
    for key, want in (("K1", TRAY_SIEVE[0]), ("K2", TRAY_SIEVE[1]),
                      ("K3", TRAY_SIEVE[2]), ("F_BM", TRAY_FBM[cls])):
        if not close(fac.get(key), want, 1e-9):
            problems.append(
                "check_design_sheet(m): the trays sheet publishes %s = %s; "
                "the sieve-tray reference (CAPCOST 2017) for class %s is %s."
                % (key, fac.get(key), cls, want))
    area = trays["sizing"].get("A", (None, ""))[0]
    ntr = trays["sizing"].get("nTrays", (None, ""))[0]
    if not area or not ntr:
        problems.append("check_design_sheet(m): the trays sheet has no A or "
                        "nTrays to recompute the cost from.")
        return
    if not (TRAY_AREA_RANGE[0] <= area <= TRAY_AREA_RANGE[1]):
        notes.append("tray area %.4f m2 is outside the set's range -- the "
                     "witness exercises an extrapolation" % area)
    idx = fac.get("cepci", 0.0) / fac.get("cepci2001", 1.0) * fac.get("usdToEur", 0.0)
    fq = tray_quantity_factor(ntr)
    cp = ntr * tray_cp0_2001(area) * idx
    cbm = cp * TRAY_FBM[cls] * fq
    ctm = 1.18 * cbm
    got = trays["cost"]
    for key, want in (("purchased", cp), ("bareModule", cbm), ("totalModule", ctm)):
        if not close(got.get(key), want, 1e-6):
            problems.append(
                "check_design_sheet(m): the trays %s cost is %s; recomputed "
                "from the sheet's A = %.6g m2 and N = %g with the reference "
                "sieve set, F_BM(%s) and F_q(N) = %.6f it is %.6f."
                % (key, got.get(key), area, ntr, cls, fq, want))
    if not close(fac.get("F_q"), fq, 1e-6):
        problems.append("check_design_sheet(m): the trays sheet publishes "
                        "F_q = %s; F_q(%g) = %.7f." % (fac.get("F_q"), ntr, fq))
    if "INCOMPLETE" in out:
        problems.append("check_design_sheet(m): the column's costing total "
                        "still reads INCOMPLETE although every item, the "
                        "trays included, is priceable.")
    notes.append("trays costed by the tray: A %.4f m2, N %g, F_q %.4f, C_TM "
                 "%.0f recomputed" % (area, ntr, fq, ctm))

    #  -- the refusal, on a probe copy ------------------------------------
    def drop_class(t):
        return "\n".join(l for l in t.splitlines()
                         if not re.match(r'\s*trayMaterial\s', l)) + "\n"

    def bad_class(t):
        return re.sub(r'(trayMaterial\s+)\w+', r'\1stainless', t)

    for label, edit, need in (
            ("no trayMaterial", drop_class,
             ("is not costed: its material class is not declared",
              "trayMaterial <carbonSteel | stainlessSteel | nickelAlloy>")),
            ("unknown trayMaterial", bad_class,
             ("unknown tray material class 'stainless'",
              "Accepted: carbonSteel stainlessSteel nickelAlloy"))):
        dst, rc2, out2, err2 = _run_copy(ROOT / COLUMN, edit)
        try:
            both = out2 + err2
            if rc2 != 0:
                problems.append("check_design_sheet(m): the %s probe failed "
                                "to run (rc=%d)." % (label, rc2))
                continue
            for phrase in need:
                if phrase not in both:
                    problems.append(
                        "check_design_sheet(m): the %s probe does not refuse "
                        "the trays by name (missing: %r)." % (label, phrase))
            if "TOTALS (EUR) -- INCOMPLETE" not in both or \
               "OMITS 1 unit(s) that could not be costed: column09/trays" not in both:
                problems.append(
                    "check_design_sheet(m): the %s probe does not mark the "
                    "total INCOMPLETE naming exactly column09/trays." % label)
            if (dst / "design" / "column09" / "trays").is_file():
                ff, _ = _cost_factors((dst / "design" / "column09" / "trays")
                                      .read_text(errors="replace"))
                if ff:
                    problems.append(
                        "check_design_sheet(m): the %s probe still wrote a "
                        "cost block on the trays sheet." % label)
        finally:
            shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("trays refused by name with no / an unknown material class; "
                 "total INCOMPLETE naming them")


def _sig_digits(tok: str) -> int:
    """Significant digits of a printed decimal token, so a comparison can be
    made at the coarser surface's OWN precision instead of a tolerance
    somebody typed."""
    m = tok.lower().split("e")[0].lstrip("-+").replace(".", "").lstrip("0")
    return max(len(m), 1)


def _run_copy(src: Path, edit, keep_layout=True):
    """Run a COPY of a case whose postDict `edit` rewrites, from a temp
    directory the arm owns.  The copy is the probe surface: the shipped case
    stays exactly as shipped, and `design/` is regenerated whole by the run,
    so the probe is the DECLARATION and never a sheet edited beforehand.

    The copy KEEPS the case's `system/layoutDict` (since DEV.md 4c C79).
    Between C76 and C79 it was left behind: a probe here makes ONE item's
    sizer refuse, and a plot plan that placed that item then refused the
    RUN, as "an item naming no sized item".  Since C79 such an item is
    ANNOUNCED (`sizingRefused`) and left unplaced, and the run goes on
    (`postProcessing/layout/PlantLayout`, held by `check_plant_layout` arm
    (g)) -- so the probes run the case as shipped, plot plan included, and
    what they assert (the SIZING pass refuses the item and not the run) is
    now asserted with the layout present.

    `keep_layout=False` is for the two probes that change WHICH items exist
    or what SHAPE their sizer publishes rather than making a sizer refuse:
    (p)'s estimate twin, whose exchangers then publish an area where the
    plot plan placed a published shell, and (q)'s `maxTankVolume` copy,
    which changes how many tanks the store is.  A plot plan of the shipped
    items rightly refuses those copies (an item naming no sized item, a
    box the sizer no longer gives), and that is a second subject.

    A copy that leaves the plot plan behind also leaves the LAND behind
    (DEV.md 4c C82): a witness that prices its plot area as land has no area
    to price without its layout, and the economics rightly REFUSES that by
    name (`check_economic_sensitivity` arm (k)) -- a third subject, so the
    `land { ... }` block goes with the layoutDict."""
    tmp = Path(tempfile.mkdtemp(prefix="design_sheet_n_"))
    dst = tmp / src.name
    ignore = ["design", "reports", "converged", "postProcessing"]
    if not keep_layout:
        ignore.append("layoutDict")
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(*ignore))
    pd = dst / "system" / "postDict"
    text = pd.read_text(errors="replace")
    if not keep_layout:
        text = re.sub(r"\n[ \t]*land\s*\n[ \t]*\{[^{}]*\}", "\n", text)
    pd.write_text(edit(text))
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(dst)],
                          capture_output=True, text=True)
    return dst, proc.returncode, proc.stdout, proc.stderr


def check_catalyst_bed(problems, notes):
    """(n) -- see the module docstring.  The RECOMPUTATIONS are the point: a
    golden pins what the run PRINTS, and only a recomputation from the
    DECLARATION (the postDict's density and price) and from the unit's OWN
    KPI can see a shell sized on a volume that is not the bed's, or a charge
    priced through an index the case never asked for.

    SABOTAGES, BY HAND, each restored with `cp` and the engine rebuilt:
      S1  CatalystBedSize.cpp: the shell's V_R set to 1.01 x the KPI.
      (Guthrie.cpp is named Turton.cpp since 2026-10-05, DEV.md 4c C38.)
      S2  Guthrie.cpp: the missing-price refusal replaced by price = 0.
      S3  Guthrie.cpp: Cp multiplied by cepci_/cepci2001_ for the charge.
      S4  Guthrie.cpp: C_BM = Cp x (2.25 + 1.82) and C_TM = 1.18 C_BM for
          the charge (the vessel factors applied to a catalyst).
      S5  CatalystBedSize.cpp: m_catalyst = V_R x rho / 1000.
    OBSERVED, each with the shipped case and both probe copies re-run:
      S1  FAILED -- "the shell sheet says V_R = 7.0597241 m3 while the
          unit's own KPI is 6.98982587075 m3".
      S2  FAILED, three lines -- the charge is not refused BY NAME, the
          total is not marked INCOMPLETE, and the charge sheet still carries
          a `cost {}` block (costed at 0: a zero is a claim).
      S3  FAILED -- "costed at 541403.39, not price x mass = 15 x 17474.565
          = 262118.47".
      S4  FAILED -- "bareModule / totalModule (1066822.2 / 1258850.2)
          differ from its purchased cost 262118.47".
      S5  FAILED -- "m_catalyst_kg = 17.474565, but V_R x the case's own
          catalystBulkDensity (6.98982587075 x 2500) is 17474.564677 kg".
    All five restored with `cp` (md5 verified) and the engine rebuilt; the
    gate then returned OK.  Also paid for: the FIRST version of the price
    probe deleted the whole `catalystPrice` LINE, which carried the entry's
    closing braces, so the copy refused the RUN with a parse error and the
    arm reported the engine broken -- the probe removes the STATEMENT now.
    """
    rc, out, err = run_case(KINETIC)
    if rc != 0:
        problems.append("check_design_sheet(n): %s failed (rc=%d).\n    %s"
                        % (KINETIC, rc, err.strip()[:300]))
        return

    base = ROOT / KINETIC / "design" / "converter"
    got = sorted(p.name for p in base.iterdir()) if base.is_dir() else []
    if got != ["catalystCharge", "shell"]:
        problems.append(
            "check_design_sheet(n): %s writes %s under design/converter/, not "
            "the two items a catalyst bed realises (catalystCharge, shell)."
            % (KINETIC, got or "nothing"))
        return
    shell_txt  = (base / "shell").read_text(errors="replace")
    charge_txt = (base / "catalystCharge").read_text(errors="replace")
    shell, charge = parse_sheet(shell_txt), parse_sheet(charge_txt)

    #  ---- the unit's OWN V_R, off the result JSON, as a printed token -----
    kpiLine = ""
    for line in out.splitlines():
        if '"converter": {' in line:
            kpiLine = line
            break
    m = re.search(r'"V_R": *(-?[0-9][0-9.eE+-]*)', kpiLine)
    if not m:
        problems.append("check_design_sheet(n): the run publishes no V_R KPI "
                        "for `converter`, so the bed volume cannot be held to "
                        "anything.")
        return
    V_kpi = float(m.group(1))
    sheet_tok = re.search(r'^\s*V_R\s+([-\d.eE+]+)', shell_txt, re.M)
    sv = shell["sizing"].get("V_R", (None, ""))
    if sv[0] is None or sheet_tok is None:
        problems.append("check_design_sheet(n): the shell sheet publishes no V_R.")
        return
    #  Compared at the SHEET's own printed precision (8 significant digits
    #  today; read off the token, never assumed), the coarser of the two.
    tol = 10.0 ** (-(_sig_digits(sheet_tok.group(1)) - 1))
    if not close(sv[0], V_kpi, tol) or sv[1] != "m3":
        problems.append(
            "check_design_sheet(n): the shell sheet says V_R = %s %s while the "
            "unit's own KPI is %.12g m3 -- the sizer must READ the bed volume "
            "the unit integrated (here: the designSpec's answer), never "
            "rebuild or rescale it." % (sv[0], sv[1], V_kpi))
    if "read from the unit" not in shell_txt:
        problems.append("check_design_sheet(n): the shell's basis does not say "
                        "the volume was READ FROM THE UNIT -- a pass-through "
                        "that does not say it is one reads as a derivation.")

    #  ---- the charge: mass and price RECOMPUTED from the DECLARATION ------
    post = (ROOT / KINETIC / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    dens = re.search(r'\bcatalystBulkDensity\s+([0-9.eE+-]+)', post_nc)
    price = re.search(r'\bcatalystPrice\s+([0-9.eE+-]+)', post_nc)
    if not dens or not price:
        problems.append("check_design_sheet(n): the witness postDict declares "
                        "no catalystBulkDensity / catalystPrice, so nothing "
                        "here can be recomputed -- this arm CANNOT RUN and "
                        "must not pass.")
        return
    rho, pr = float(dens.group(1)), float(price.group(1))
    m_sheet = charge["sizing"].get("m_catalyst_kg", (None, ""))
    if m_sheet[0] is None or m_sheet[1] != "kg":
        problems.append("check_design_sheet(n): the charge sheet publishes no "
                        "m_catalyst_kg in kg.")
        return
    if not close(m_sheet[0], V_kpi * rho, 1.0e-6):
        problems.append(
            "check_design_sheet(n): the charge sheet says m_catalyst_kg = %s, "
            "but V_R x the case's own catalystBulkDensity (%.12g x %g) is "
            "%.6f kg." % (m_sheet[0], V_kpi, rho, V_kpi * rho))
    c = charge["cost"]
    if not c:
        problems.append("check_design_sheet(n): the charge sheet carries no "
                        "`cost {}` block although the case declares a price.")
    else:
        want = pr * m_sheet[0]
        if not close(c.get("purchased", 0.0), want, 1.0e-6):
            problems.append(
                "check_design_sheet(n): the charge is costed at %s, not "
                "price x mass = %g x %s = %.2f.  A declared unit price is the "
                "case's money and no index or factor may touch it."
                % (c.get("purchased"), pr, m_sheet[0], want))
        if not (close(c.get("bareModule", -1.0), c.get("purchased", 0.0), 1e-12)
                and close(c.get("totalModule", -1.0), c.get("purchased", 0.0), 1e-12)):
            problems.append(
                "check_design_sheet(n): the charge's bareModule / totalModule "
                "(%s / %s) differ from its purchased cost %s -- a module factor "
                "or the 1.18 was applied to a catalyst charge."
                % (c.get("bareModule"), c.get("totalModule"), c.get("purchased")))
    sc = shell["cost"]
    if not sc or not sc.get("totalModule", 0.0) > sc.get("purchased", 0.0):
        problems.append("check_design_sheet(n): the shell's total-module cost "
                        "does not exceed its purchased cost -- the vessel shape "
                        "(F_BM, 1.18) is what tells it from the charge, and it "
                        "is not there.")
    if not re.search(r'converter/catalystCharge\s+declared-unit-price\b', out):
        problems.append("check_design_sheet(n): the costing provenance table "
                        "does not name the charge's shape `declared-unit-price` "
                        "-- a reader cannot tell the declared price from a "
                        "Turton correlation on the printed line.")
    if not re.search(r'converter/catalystCharge[^\n]*DECLARED', out):
        problems.append("check_design_sheet(n): the charge's provenance row "
                        "does not say the price was DECLARED.")
    notes.append("catalyst bed: V_R %.4f m3 read from the unit, %.1f kg x %g "
                 "EUR/kg recomputed" % (V_kpi, m_sheet[0], pr))

    #  ---- WITHOUT a price: refused by name, total INCOMPLETE --------------
    #  The probe deletes the STATEMENT and nothing else: the first cut took
    #  the whole line, and with it the entry's closing braces, so the copy
    #  refused the RUN with a parse error -- the probe broken, not the engine.
    src = ROOT / KINETIC
    dst, rc2, out2, err2 = _run_copy(
        src, lambda t: re.sub(r'\bcatalystPrice\s+[^;]*;', '', t))
    if rc2 != 0:
        problems.append("check_design_sheet(n): the copy without catalystPrice "
                        "failed (rc=%d) -- a missing price must refuse the "
                        "ITEM, never the run.\n    %s" % (rc2, err2.strip()[:300]))
    else:
        both = out2 + err2
        if not re.search(r'converter/catalystCharge\s+FAILED:[^\n]*catalystPrice', both):
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "charge is not refused BY NAME (no FAILED line "
                            "naming `catalystPrice`).")
        if "TOTALS (EUR) -- INCOMPLETE" not in out2 or \
           not re.search(r'could not be costed:[^\n]*converter/catalystCharge', out2):
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "costing total is not marked INCOMPLETE naming "
                            "`converter/catalystCharge` -- a total that omits "
                            "the charge and does not say so reads as complete.")
        sh2 = dst / "design" / "converter" / "shell"
        if not sh2.is_file() or not parse_sheet(sh2.read_text(errors="replace"))["cost"]:
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "SHELL lost its cost too -- one refused item must "
                            "not cost the other.")
        ch2 = dst / "design" / "converter" / "catalystCharge"
        if ch2.is_file() and parse_sheet(ch2.read_text(errors="replace"))["cost"]:
            problems.append("check_design_sheet(n): without catalystPrice the "
                            "charge sheet still carries a `cost {}` block.")
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- WITHOUT a density: no mass, said in the basis, refused at cost --
    dst, rc3, out3, err3 = _run_copy(
        src, lambda t: re.sub(r'\bcatalystBulkDensity\s+[^;]*;', '', t))
    if rc3 != 0:
        problems.append("check_design_sheet(n): the copy without "
                        "catalystBulkDensity failed (rc=%d).\n    %s"
                        % (rc3, err3.strip()[:300]))
    else:
        ch3 = dst / "design" / "converter" / "catalystCharge"
        t3 = ch3.read_text(errors="replace") if ch3.is_file() else None
        if t3 is None:
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "no charge sheet is written -- the item exists, "
                            "its mass does not, and the sheet must say which.")
        else:
            s3 = parse_sheet(t3)
            if "m_catalyst_kg" in s3["sizing"]:
                problems.append("check_design_sheet(n): without a density the "
                                "charge still publishes a mass -- from what?")
            if "mass not derivable" not in t3:
                problems.append("check_design_sheet(n): without a density the "
                                "charge's basis does not say `mass not "
                                "derivable`.")
            if s3["cost"]:
                problems.append("check_design_sheet(n): without a density the "
                                "charge is costed anyway.")
        if not re.search(r'converter/catalystCharge\s+FAILED:[^\n]*catalystBulkDensity',
                         out3 + err3):
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "the charge is not refused at cost time naming the "
                            "density.")
        if "TOTALS (EUR) -- INCOMPLETE" not in out3:
            problems.append("check_design_sheet(n): without catalystBulkDensity "
                            "the total is not marked INCOMPLETE.")
    shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("charge refused by name without a price and without a "
                 "density; total INCOMPLETE both times")


def check_space_velocity_basis(problems, notes):
    """(o) -- see the module docstring.  The RECOMPUTATION is the point: a
    golden pins what the run PRINTS, and a bed sized on the wrong gas basis
    prints a plausible volume; only arithmetic from the DECLARATION and the
    unit's own KPIs can tell the two bases apart.

    SABOTAGES, BY HAND, 2026-10-05, each on VesselSize.cpp, restored with
    `cp` (md5 verified) and the engine rebuilt; the gate then returned OK:
      S1  the NORMAL branch divides Q_actual (the old behaviour: the basis
          word read and ignored)  -> FAILED: "the converter sheet says V_R =
          0.24186478 m3, but N_in R T_n/P_n x 3600 / SV (...) is 18.628985
          m3".
      S2  the missing-basis refusal disabled and an absent basis read as
          `actual`  -> FAILED: "without spaceVelocityBasis the converter is
          not refused BY NAME".
      S3  the unknown-word refusal disabled  -> FAILED: "`spaceVelocityBasis
          standard` is not refused naming the accepted words (normal,
          actual) (rc=0)".
      S4  both branches divide Q_normal  -> FAILED: "on `actual` the sheet
          says V_R = 1434.8476 m3, but N_in R T/P x 3600 / SV is 18.628986
          m3" -- the arm that holds the branch no shipped case uses.
    """
    R, T_N, P_N = 8.314462618, 273.15, 101325.0

    def kpis_of(out):
        for line in out.splitlines():
            if '"converter": {' in line and '"N_in_mol_s"' in line:
                vals = {}
                for key in ("N_in_mol_s", "T", "P"):
                    m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, line)
                    if not m:
                        break
                    vals[key] = float(m.group(1))
                if len(vals) == 3:
                    return vals
        return None

    def sheet_V(case_dir):
        f = case_dir / "design" / "converter" / "vessel"
        if not f.is_file():
            return None, None, ""
        txt = f.read_text(errors="replace")
        tok = re.search(r'^\s*V_R\s+([-\d.eE+]+)', txt, re.M)
        return (float(tok.group(1)) if tok else None,
                tok.group(1) if tok else None, txt)

    rc, out, err = run_case(SPACEV)
    if rc != 0:
        problems.append("check_design_sheet(o): %s failed (rc=%d).\n    %s"
                        % (SPACEV, rc, err.strip()[:300]))
        return
    k = kpis_of(out)
    post = (ROOT / SPACEV / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    sv = re.search(r'\bspaceVelocity\s+([0-9.eE+-]+)\s*;', post_nc)
    bw = re.search(r'\bspaceVelocityBasis\s+(\w+)\s*;', post_nc)
    if k is None or not sv or not bw or bw.group(1) != "normal":
        problems.append("check_design_sheet(o): the witness publishes no "
                        "converter N_in_mol_s/T/P KPI, or its postDict "
                        "declares no `spaceVelocity` with `spaceVelocityBasis "
                        "normal;` -- this arm CANNOT RUN and must not pass.")
        return
    SV = float(sv.group(1))
    V, tok, txt = sheet_V(ROOT / SPACEV)
    if V is None:
        problems.append("check_design_sheet(o): no V_R on the converter sheet.")
        return
    want = k["N_in_mol_s"] * R * T_N / P_N * 3600.0 / SV
    tol = 10.0 ** (-(_sig_digits(tok) - 1))
    if not close(V, want, tol):
        problems.append(
            "check_design_sheet(o): the converter sheet says V_R = %s m3, but "
            "N_in R T_n/P_n x 3600 / SV (%.12g x %.10g x %g / %g x 3600 / %g) "
            "is %.6f m3 -- the NORMAL basis the case declares did not reach "
            "the arithmetic." % (tok, k["N_in_mol_s"], R, T_N, P_N, SV, want))
    if "NORMAL gas volume" not in txt:
        problems.append("check_design_sheet(o): the converter sheet's basis "
                        "does not say NORMAL gas volume.")

    src = ROOT / SPACEV
    #  ---- no basis declared: refused by name, with the ratio -------------
    #  The probe deletes the STATEMENT, never the line (arm (n)'s lesson).
    dst, rc2, out2, err2 = _run_copy(
        src, lambda t: re.sub(r'\bspaceVelocityBasis\s+[^;]*;', '', t))
    both = out2 + err2
    ratio = k["P"] * T_N / (P_N * k["T"])
    if rc2 != 0:
        problems.append("check_design_sheet(o): the copy without "
                        "spaceVelocityBasis failed (rc=%d) -- a missing basis "
                        "must refuse the ITEM, never the run." % rc2)
    elif not re.search(r'converter\s+FAILED:[^\n]*spaceVelocityBasis', both):
        problems.append("check_design_sheet(o): without spaceVelocityBasis the "
                        "converter is not refused BY NAME (no FAILED line "
                        "naming `spaceVelocityBasis`).")
    elif ("%.2f" % ratio) not in both:
        problems.append("check_design_sheet(o): the missing-basis refusal does "
                        "not quote the normal/actual ratio %.2f at the unit's "
                        "own conditions." % ratio)
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- `standard`: refused naming the accepted words ------------------
    dst, rc3, out3, err3 = _run_copy(
        src, lambda t: re.sub(r'\bspaceVelocityBasis\s+normal\s*;',
                              'spaceVelocityBasis standard;', t))
    both = out3 + err3
    if rc3 != 0 or not re.search(
            r'converter\s+FAILED:[^\n]*space-velocity basis[^\n]*standard', both) \
            or not re.search(r'Accepted[^\n]*normal[^\n]*actual', both):
        problems.append("check_design_sheet(o): `spaceVelocityBasis standard` "
                        "is not refused naming the accepted words (normal, "
                        "actual) (rc=%d)." % rc3)
    shutil.rmtree(dst.parent, ignore_errors=True)

    #  ---- `actual`: the other branch, held to its own arithmetic ---------
    SV_act = 259.665

    def to_actual(t):
        t = re.sub(r'\bspaceVelocity\s+[0-9.eE+-]+\s*;',
                   'spaceVelocity %g;' % SV_act, t)
        return re.sub(r'\bspaceVelocityBasis\s+normal\s*;',
                      'spaceVelocityBasis actual;', t)
    dst, rc4, out4, err4 = _run_copy(src, to_actual)
    if rc4 != 0:
        problems.append("check_design_sheet(o): the `actual` copy failed "
                        "(rc=%d).\n    %s" % (rc4, err4.strip()[:300]))
    else:
        k4 = kpis_of(out4)
        V4, tok4, txt4 = sheet_V(dst)
        if k4 is None or V4 is None or "ACTUAL gas volume" not in txt4:
            problems.append("check_design_sheet(o): the `actual` copy wrote no "
                            "converter sheet on the ACTUAL basis -- the probe "
                            "did not land.")
        else:
            want4 = k4["N_in_mol_s"] * R * k4["T"] / k4["P"] * 3600.0 / SV_act
            if not close(V4, want4, 10.0 ** (-(_sig_digits(tok4) - 1))):
                problems.append(
                    "check_design_sheet(o): on `actual` the sheet says V_R = "
                    "%s m3, but N_in R T/P x 3600 / SV is %.6f m3."
                    % (tok4, want4))
    shutil.rmtree(dst.parent, ignore_errors=True)
    notes.append("space velocity: V_R %.4f m3 on NORMAL gas recomputed; no "
                 "basis and `standard` refused by name; `actual` recomputed"
                 % V)


#  THE ESTIMATE TWIN OF THE EXCHANGER WITNESS (2026-10-07, DEV.md 4c C48).
#  The shipped case DESIGNS its six exchangers (route 4, arm (s)); routes 2
#  and 3 -- a declared U against a utility, and a rated unit's own area --
#  are still the engine's and are exercised by NO shipped case any more.  So
#  arm (p) runs a COPY whose `design {}` blocks are taken out: each cooler
#  gets back the U it declared before C48 (the values below are that
#  postDict's, transcribed), and the FEHE goes back to its rated area.
ESTIMATE_U = {"N2Cooler": 300.0, "Intercooler": 450.0, "Aftercooler": 500.0,
              "WaterCooler": 500.0, "Chiller": 500.0}


def _drop_block(text, name):
    """Remove every `<name> { ... }` (balanced braces) from `text`."""
    out, i = [], 0
    pat = re.compile(r'\b%s\s*\{' % re.escape(name))
    while True:
        m = pat.search(text, i)
        if not m:
            out.append(text[i:])
            return "".join(out)
        out.append(text[i:m.start()])
        depth, j = 0, m.end() - 1
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        i = j + 1


def estimate_twin(text):
    """The postDict with the exchanger designs taken out (see ESTIMATE_U)."""
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    text = re.sub(r'//[^\n]*', '', text)
    text = _drop_block(text, "design")
    for unit, U in ESTIMATE_U.items():
        text = re.sub(r'(\{\s*unitName\s+%s\s*;[^{]*designRules\s*\{)' % unit,
                      lambda m: m.group(1) + " U %g; " % U, text, count=1)
    return text


def check_exchanger_routes(problems, notes):
    """(p) -- see the module docstring.  The RECOMPUTATION is the point: a
    golden pins what the run PRINTS, and an LMTD computed from the wrong end
    of a utility, or a rated area replaced by a computed one, prints a
    plausible area; only arithmetic from the run's KPIs, the declared U and
    the utility RECORD can see it.

    SABOTAGES, BY HAND, 2026-10-07, each on ShellTubeHX.cpp, restored with
    `cp` and the engine rebuilt; the gate then returned OK:
      S1  co-current terminal differences (T_in - t_in, T_out - t_out)
          -> FAILED on all four cooling-water coolers, e.g. "N2Cooler's
          sheet says LMTD = 47.941815, but the counter-current LMTD of
          process 473.769 -> 313.15 K against coolingWater 298.15 -> 308.15
          K is 62.715109 K".  The CHILLER did not fire, and cannot: its
          utility boils at one temperature (T_in = T_out), so co-current
          and counter-current are the same arithmetic there.
      S2  the `utility` + `LMTD` refusal disabled  -> FAILED: "a copy with
          LMTD beside utility on N2Cooler is not refused BY NAME".
      S3  route 3 computing A = |Q|/(U*LMTD) from the unit's own U and
          LMTD instead of passing its area through  -> FAILED: "rated
          FEHE's sheet says A = 1562.7184 m2, but its own flowsheetDict
          declares area 2000 m2" -- the two differ because the exchanger's
          published U*A*LMTD does not reproduce its duty (the case's
          postDict header says why).
    """
    #  THE TWIN (C48): the shipped case designs; routes 2 and 3 are held on a
    #  copy with the designs taken out.  `case` is that copy from here on.
    twin, rc, out, err = _run_copy(ROOT / HXROUTE, estimate_twin,
                                   keep_layout=False)
    case = twin
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    entries = re.findall(
        r'\{\s*unitName\s+(\w+)\s*;\s*type\s+shellTubeHX\s*;[^{]*'
        r'designRules\s*\{([^}]*)\}', post_nc)
    routed = []        # (unit, U, utility)
    rated = []         # unit
    for unit, rules in entries:
        u = re.search(r'\bU\s+([0-9.eE+-]+)\s*;', rules)
        ut = re.search(r'\butility\s+(\w+)\s*;', rules)
        if ut and u:
            routed.append((unit, float(u.group(1)), ut.group(1)))
        elif not u and not ut and not re.search(r'\bLMTD\b', rules):
            rated.append(unit)
    if not routed or not rated:
        problems.append("check_design_sheet(p): the estimate twin of %s "
                        "declares %d cooler(s) on a `utility` and %d rated "
                        "exchanger(s) -- this arm needs at least one of each "
                        "and CANNOT RUN; it must not pass."
                        % (HXROUTE, len(routed), len(rated)))
        shutil.rmtree(twin.parent, ignore_errors=True)
        return

    if rc != 0:
        problems.append("check_design_sheet(p): the estimate twin of %s failed"
                        " (rc=%d).\n    %s" % (HXROUTE, rc, err.strip()[:300]))
        shutil.rmtree(twin.parent, ignore_errors=True)
        return

    def kpi_line(unit):
        for line in out.splitlines():
            if ('"%s": {' % unit) in line and '"Q_kW"' in line:
                return line
        return ""

    def kpi(line, key):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, line)
        return float(m.group(1)) if m else None

    def sheet_tok(unit, key):
        f = case / "design" / unit / "shellTubeHX"
        if not f.is_file():
            return None, None
        m = re.search(r'^\s*%s\s+([-\d.eE+]+)' % key,
                      f.read_text(errors="replace"), re.M)
        return (float(m.group(1)), m.group(1)) if m else (None, None)

    def utility_T(name):
        f = ROOT / "data" / "standards" / "utilities" / (name + ".dat")
        if not f.is_file():
            return None
        t = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '',
                   f.read_text(errors="replace"), flags=re.S))
        a = re.search(r'^\s*T_in\s+([0-9.eE+-]+)\s+K\s*;', t, re.M)
        b = re.search(r'^\s*T_out\s+([0-9.eE+-]+)\s+K\s*;', t, re.M)
        return (float(a.group(1)), float(b.group(1))) if a and b else None

    checked = 0
    for unit, U, uname in routed:
        line = kpi_line(unit)
        Q, Ti, To = kpi(line, "Q_kW"), kpi(line, "T_in"), kpi(line, "T_out")
        uT = utility_T(uname)
        if None in (Q, Ti, To) or uT is None:
            problems.append("check_design_sheet(p): %s publishes no Q_kW/T_in/"
                            "T_out KPI, or utility record '%s' declares no "
                            "T_in/T_out in K -- the LMTD cannot be recomputed."
                            % (unit, uname))
            continue
        t_in, t_out = uT
        if Q < 0.0:
            d1, d2 = Ti - t_out, To - t_in
        else:
            d1, d2 = t_out - Ti, t_in - To
        lm = d1 if abs(d1 - d2) < 1e-9 * max(d1, d2) else (d1 - d2) / math.log(d1 / d2)
        A = abs(Q) * 1000.0 / (U * lm)
        for key, want in (("LMTD", lm), ("A", A)):
            got, tok = sheet_tok(unit, key)
            if got is None:
                problems.append("check_design_sheet(p): %s's sheet carries no "
                                "`%s`." % (unit, key))
            elif not close(got, want, 10.0 ** (-(_sig_digits(tok) - 1))):
                problems.append(
                    "check_design_sheet(p): %s's sheet says %s = %s, but the "
                    "counter-current LMTD of process %.6g -> %.6g K against "
                    "%s %.6g -> %.6g K is %.6f K, and |Q|/(U*LMTD) with the "
                    "case's U = %g is %.6f m2."
                    % (unit, key, tok, Ti, To, uname, t_in, t_out, lm, U, A))
        checked += 1

    for unit in rated:
        fd = (case / unit / "system" / "flowsheetDict").read_text(errors="replace")
        m = re.search(r'\barea\s+([0-9.eE+-]+)\s*m2\s*;', fd)
        line = kpi_line(unit)
        got, tok = sheet_tok(unit, "A")
        if not m or got is None:
            problems.append("check_design_sheet(p): rated %s declares no "
                            "`area ... m2` in its flowsheetDict, or its sheet "
                            "carries no `A` -- nothing to hold." % unit)
            continue
        if not close(got, float(m.group(1)), 10.0 ** (-(_sig_digits(tok) - 1))):
            problems.append("check_design_sheet(p): rated %s's sheet says A = "
                            "%s m2, but its own flowsheetDict declares area %s "
                            "m2 -- the rated area was not passed through."
                            % (unit, tok, m.group(1)))
        for key in ("U", "LMTD"):
            g, gt = sheet_tok(unit, key)
            k = kpi(line, key)
            if g is None or k is None or \
                    not close(g, k, 10.0 ** (-(_sig_digits(gt) - 1))):
                problems.append("check_design_sheet(p): rated %s's sheet %s = "
                                "%s is not the unit's own %s KPI (%s)."
                                % (unit, key, gt, key, k))
        checked += 1

    #  ---- probes: three copies, each refusing ONE item BY NAME ----------
    def edit_rules(unit, f):
        def ed(t):
            pat = re.compile(r'(\{\s*unitName\s+%s\s*;[^{]*designRules\s*\{)'
                             r'([^}]*)(\})' % unit)
            return pat.sub(lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                           t, count=1)
        return ed

    victim = routed[0][0]
    probes = (
        ("LMTD beside utility on %s" % victim,
         edit_rules(victim, lambda r: r + " LMTD 30; "), victim,
         r'BOTH[^\n]*utility[^\n]*LMTD'),
        ("the Chiller served by coolingWater (a temperature cross)",
         edit_rules("Chiller", lambda r: re.sub(r'\butility\s+\w+\s*;',
                                                'utility coolingWater;', r)),
         "Chiller", r'temperature cross'),
        ("%s with its U and utility deleted (no rated area)" % victim,
         edit_rules(victim, lambda r: re.sub(r'\b(U|utility)\s+[^;]*;', '', r)),
         victim, r'publishes no `area`'),
    )
    for what, ed, unit, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("check_design_sheet(p): the copy with %s failed "
                            "(rc=%d) -- a refused exchanger must refuse the "
                            "ITEM, never the run." % (what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (unit, pat), both):
            problems.append("check_design_sheet(p): a copy with %s is not "
                            "refused BY NAME (no `%s  FAILED:` line matching "
                            "/%s/)." % (what, unit, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)
    shutil.rmtree(twin.parent, ignore_errors=True)

    notes.append("exchanger routes: %d sheet(s) recomputed (LMTD from the run "
                 "and the utility record, the rated area passed through); "
                 "three probes refused by name" % checked)


#  THE CAPCOST 2017 FIXED-ROOF TANK ROW, transcribed HERE as well as in
#  `Turton.cpp` (2026-10-07): worksheet "Equipment Cost Data", block "Tank
#  Data", row "Fixed Roof", cells C204:I204.  A recomputation that read the
#  engine's own constants would agree with any transcription error.
TANK_K = (4.8509, -0.3973, 0.1445)
TANK_B1, TANK_VMIN, TANK_VMAX = 1.1, 90.0, 30000.0


def _record_scalars(path: Path, keys):
    t = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '',
               path.read_text(errors="replace"), flags=re.S))
    out = {}
    for k in keys:
        m = re.search(r'^\s*%s\s+([-0-9.eE+]+)' % k, t, re.M)
        if m:
            out[k] = float(m.group(1))
    return out


def _anchored_rackett_rho(case: Path, comp: dict, T: float):
    """The LIQUID density `ThermoPackage::density` documents, recomputed from
    the case's own component records: per component V = Vliq x
    Rackett(T)/Rackett(298.15) (bare Rackett where no Vliq), mole-weighted;
    a component at or above its Tc is given no volume (PhaseDensity.H).
    Returns (rho, excluded mole fraction)."""
    R = 8.314462618
    def rack(Tk, Tc, Pc_Pa, w):
        Tr = Tk / Tc
        return (R * Tc / Pc_Pa) * (0.29056 - 0.08775 * w) ** (1.0 + (1.0 - Tr) ** (2.0 / 7.0))
    zs, mbar, vmix, excl = 0.0, 0.0, 0.0, 0.0
    sub = {}
    for name, z in comp.items():
        rec = _record_scalars(case / "constant" / "components" / (name + ".dat"),
                              ("MW", "Tc", "Pc", "omega", "Vliq"))
        if z <= 0.0:
            continue
        if T >= rec["Tc"]:
            excl += z
            continue
        sub[name] = (z, rec)
    zs = sum(z for z, _ in sub.values())
    for name, (z, rec) in sub.items():
        Pc = rec["Pc"] * 1.0e5
        if "Vliq" in rec:
            v = rec["Vliq"] * rack(T, rec["Tc"], Pc, rec["omega"]) / \
                rack(298.15, rec["Tc"], Pc, rec["omega"])
        else:
            v = rack(T, rec["Tc"], Pc, rec["omega"])
        mbar += z / zs * rec["MW"] / 1000.0
        vmix += z / zs * v
    return mbar / vmix, excl


def check_storage(problems, notes):
    """(q) A STORAGE TANK IS SIZED FROM ITS STREAM AND COSTED ON THE ROW THE
    PROGRAM CARRIES (2026-10-07, DEV.md 4c C44 slice 2).  On
    `greenAmmoniaPEQ_baseCase`, whose postDict attaches `NH3Storage` to the
    boundary stream `ProductNH3`:

      * the tank's `massFlow` is the stream's own published `F_mass`;
      * its `rho` is RECOMPUTED from the case's component records (the
        anchored-Rackett liquid route, dissolved supercritical gases given no
        volume) at the stream's published T and composition;
      * V_stored = storageTime x massFlow / rho, V_tanks = V_stored /
        fillFraction, N = ceil(V_tanks / maxTankVolume), V_R = V_tanks / N
        -- RECOMPUTED from the postDict's own declarations, and exactly N
        sheets `design/NH3Storage/tank1..N` must exist carrying that V_R;
      * each tank's purchased, bare-module and total-module cost RECOMPUTED
        from the fixed-roof row transcribed above, the costing block's CEPCI
        and currency, B1 = 1.1, and 1.18;
      * the stored liquid is below 0 degC, so the run must say LOWER BOUND
        on the costing line of every tank and in the caveat block;
      * three copies: `storageTime` with no unit, the store attached to the
        VAPOUR stream FlashGas, each refused BY NAME (the run still exit 0);
        and `maxTankVolume 50000`, which must make ONE tank of V_tanks.

    SABOTAGES, BY HAND, 2026-10-07, each restored with `cp` and the engine
    rebuilt; the gate then returned OK:
      S1  StorageTankSize.cpp: V_tanks = V_stored (fillFraction ignored)
          -> FAILED: "NH3Storage/tank1 values.V_tanks = 32215.6846634,
          recomputed 35795.2052", and the V_R, the three costs and the
          sheet's V_R with it.
      S2  Turton.cpp: the refrigerated-service line suppressed  -> FAILED:
          "NH3Storage/tank1 stores a liquid at 238.15 K and its costing line
          does not say LOWER BOUND" (both tanks).
      S3  Turton.cpp: the tank row's size key V_R -> V_tanks (each tank
          priced at the WHOLE store's volume)  -> FAILED: "tank1
          cost.purchased = 2075006.28365, recomputed 1131204.02".
      S4  StorageTankSize.cpp: the unit requirement on storageTime removed
          -> FAILED: "a copy with storageTime with no unit is not refused BY
          NAME".
    NOT CHECKED: whether 21 days, 0.90 and 30 000 m3 are the right design
    basis -- they are the case's declared assumptions -- and whether the
    package's density is the TRUE density of liquid ammonia (it is the
    engine's; see the case README for the finding about the record's Vliq).
    """
    case = ROOT / HXROUTE
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    m = re.search(r'\bstorage\s*\(\s*\{([^}]*)\}', post_nc)
    if not m:
        problems.append("check_design_sheet(q): %s declares no `storage ( { "
                        "... } )` entry -- this arm CANNOT RUN; it must not "
                        "pass." % HXROUTE)
        return
    ent = m.group(1)

    def word(k):
        mm = re.search(r'\b%s\s+(\w+)\s*;' % k, ent)
        return mm.group(1) if mm else None

    def num(k):
        mm = re.search(r'\b%s\s+([-0-9.eE+]+)\s*(\w*)\s*;' % k, ent)
        return (float(mm.group(1)), mm.group(2)) if mm else (None, None)

    name, stream = word("name"), word("stream")
    t_val, t_unit = num("storageTime")
    fill, _ = num("fillFraction")
    vmax, _ = num("maxTankVolume")
    if None in (name, stream, t_val, fill, vmax) or t_unit not in ("day", "h"):
        problems.append("check_design_sheet(q): the storage entry does not "
                        "declare name/stream/storageTime (in day or h)/"
                        "fillFraction/maxTankVolume -- nothing to recompute.")
        return
    t_day = t_val if t_unit == "day" else t_val / 24.0

    cm = re.search(r'\bcosting\s*\{([^}]*)\}', post_nc)
    cepci = float(re.search(r'\bcepci\s+([0-9.]+)', cm.group(1)).group(1))
    cepci01 = float(re.search(r'\bcepci2001\s+([0-9.]+)', cm.group(1)).group(1))
    fx = float(re.search(r'\busdToEur\s+([0-9.]+)', cm.group(1)).group(1))

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(q): %s failed (rc=%d)." % (HXROUTE, rc))
        return
    sl = next((l for l in out.splitlines()
               if l.strip().startswith('"%s": {' % stream) and '"F_mass"' in l), "")
    fm = re.search(r'"F_mass": *([-0-9.eE+]+)', sl)
    Tm = re.search(r'"T": *([-0-9.eE+]+)', sl)
    comp = {k: float(v) for k, v in
            re.findall(r'"(\w+)": *([-0-9.eE+]+)',
                       (re.search(r'"composition": *\{([^}]*)\}', sl) or
                        re.search(r'()', '')).group(1))}
    if not (fm and Tm and comp):
        problems.append("check_design_sheet(q): stream %s is not in the result "
                        "JSON with F_mass, T and composition." % stream)
        return
    mdot, T = float(fm.group(1)), float(Tm.group(1))
    rho, excl = _anchored_rackett_rho(case, comp, T)

    V_stored = t_day * 86400.0 * mdot / rho
    V_tanks = V_stored / fill
    N = max(1, math.ceil(V_tanks / vmax - 1e-9))
    V_R = V_tanks / N

    eq = [l for l in out.splitlines() if '"item": "%s/tank' % name in l]
    if len(eq) != N:
        problems.append("check_design_sheet(q): %s should be %d tank(s) "
                        "(V_tanks %.6g m3 / at most %.6g m3), the result "
                        "carries %d." % (name, N, V_tanks, vmax, len(eq)))
    lc = math.log10(V_R)
    cp = 10.0 ** (TANK_K[0] + TANK_K[1] * lc + TANK_K[2] * lc * lc) \
        * cepci / cepci01 * fx
    want = {"values.massFlow": mdot, "values.rho": rho,
            "values.V_stored": V_stored, "values.V_tanks": V_tanks,
            "values.V_R": V_R, "values.nTanks": N,
            "cost.purchased": cp, "cost.bareModule": TANK_B1 * cp,
            "cost.totalModule": 1.18 * TANK_B1 * cp}
    for line in eq:
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        for key, w in want.items():
            sub, k = key.split(".")
            blk = re.search(r'"%s": \{([^}]*)' % ("values" if sub == "values" else "cost"),
                            line)
            g = re.search(r'"%s": *(-?[0-9.eE+]+)' % k, blk.group(1) if blk else "")
            if not g or not close(float(g.group(1)), w, 1e-6):
                problems.append("check_design_sheet(q): %s %s = %s, recomputed "
                                "%.9g (storageTime %g day x F_mass %.9g kg/s / "
                                "rho %.9g kg/m3, fill %g, at most %g m3; "
                                "CAPCOST fixed roof)."
                                % (item, key, g.group(1) if g else "(absent)",
                                   w, t_day, mdot, rho, fill, vmax))
        tag = item.split("/", 1)[1]
        f = case / "design" / name / tag
        if not f.is_file():
            problems.append("check_design_sheet(q): no sheet design/%s/%s."
                            % (name, tag))
        else:
            sz = parse_sheet(f.read_text(errors="replace"))["sizing"]
            if "V_R" not in sz or not close(sz["V_R"][0], V_R, 1e-6):
                problems.append("check_design_sheet(q): sheet design/%s/%s "
                                "V_R %s against %.9g." % (name, tag,
                                sz.get("V_R"), V_R))
        if T < 273.15 and not re.search(
                r"\[lower bound\] storageTank '%s'" % re.escape(item), out):
            problems.append("check_design_sheet(q): %s stores a liquid at "
                            "%.2f K and its costing line does not say LOWER "
                            "BOUND." % (item, T))
    if T < 273.15 and not re.search(r'"category": "costing"[^\n]*REFRIGERATED', out):
        problems.append("check_design_sheet(q): the refrigerated-storage floor "
                        "is not in the run's caveat record.")

    def edit_store(f):
        return lambda t: re.sub(r'(\bstorage\s*\(\s*\{)([^}]*)(\})',
                                lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                                t, count=1)
    probes = (
        ("storageTime with no unit",
         edit_store(lambda e: re.sub(r'storageTime\s+[^;]*;', 'storageTime 21;', e)),
         r'carries no unit'),
        ("the store attached to the vapour stream FlashGas",
         edit_store(lambda e: re.sub(r'\bstream\s+\w+\s*;', 'stream FlashGas;', e)),
         r'is a vapour'),
    )
    for what, ed, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        if rcp != 0:
            problems.append("check_design_sheet(q): the copy with %s failed "
                            "(rc=%d) -- a refused store must refuse the ITEM, "
                            "never the run." % (what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (name, pat), outp + errp):
            problems.append("check_design_sheet(q): a copy with %s is not "
                            "refused BY NAME (/%s/)." % (what, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)
    dst, rcp, outp, errp = _run_copy(case, edit_store(
        lambda e: re.sub(r'maxTankVolume\s+[^;]*;', 'maxTankVolume 50000;', e)),
        keep_layout=False)
    one = [l for l in outp.splitlines() if '"item": "%s/tank' % name in l]
    vr1 = re.search(r'"V_R": *([-0-9.eE+]+)', one[0]) if len(one) == 1 else None
    if rcp != 0 or len(one) != 1 or not vr1 or \
            not close(float(vr1.group(1)), V_tanks, 1e-6):
        problems.append("check_design_sheet(q): with maxTankVolume 50000 the "
                        "store should be ONE tank of %.9g m3; the copy made %d "
                        "(rc=%d)." % (V_tanks, len(one), rcp))
    shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("storage: %s on %s, %d tank(s) of %.1f m3 recomputed from "
                 "%g day x %.4g kg/s / %.2f kg/m3 / %g (%.3g mole fraction "
                 "given no volume), costed on the CAPCOST fixed-roof row, "
                 "LOWER BOUND said; three probes" % (name, stream, N, V_R,
                 t_day, mdot, rho, fill, excl))


def _srk_vapour_rho(case: Path, comp: dict, T: float, P: float):
    """SRK vapour density, kij = 0 (the case declares no binary block), the
    LARGEST real root -- recomputed here from the component records with the
    engine's own constants (Omega_a 0.42747, Omega_b 0.08664, Soave's m)."""
    R = 8.314462618
    zs = sum(comp.values())
    recs = {n: _record_scalars(case / "constant" / "components" / (n + ".dat"),
                               ("MW", "Tc", "Pc", "omega"))
            for n in comp}
    ai, bi = {}, {}
    for n, r in recs.items():
        Pc = r["Pc"] * 1.0e5
        m = 0.48508 + 1.55171 * r["omega"] - 0.15613 * r["omega"] ** 2
        alpha = (1.0 + m * (1.0 - math.sqrt(T / r["Tc"]))) ** 2
        ai[n] = 0.42747 * R * R * r["Tc"] ** 2 / Pc * alpha
        bi[n] = 0.08664 * R * r["Tc"] / Pc
    y = {n: z / zs for n, z in comp.items()}
    a = sum(y[i] * y[j] * math.sqrt(ai[i] * ai[j]) for i in y for j in y)
    b = sum(y[i] * bi[i] for i in y)
    A, B = a * P / (R * T) ** 2, b * P / (R * T)
    #  Z^3 - Z^2 + (A - B - B^2) Z - A B = 0: the largest real root, by
    #  Newton from Z = 1 (the vapour branch) -- no numpy in the gate.
    Z = 1.0
    for _ in range(200):
        f = Z ** 3 - Z ** 2 + (A - B - B * B) * Z - A * B
        d = 3 * Z * Z - 2 * Z + (A - B - B * B)
        Z -= f / d
    mbar = sum(y[n] * recs[n]["MW"] for n in y) / 1000.0
    return mbar / (Z * R * T / P)


def _stream_json(out: str, stream: str):
    sl = next((l for l in out.splitlines()
               if l.strip().startswith('"%s": {' % stream) and '"F_mass"' in l), "")
    if not sl:
        return None
    g = lambda k: float(re.search(r'"%s": *([-0-9.eE+]+)' % k, sl).group(1))
    comp = {k: float(v) for k, v in re.findall(
        r'"(\w+)": *([-0-9.eE+]+)', re.search(r'"composition": *\{([^}]*)\}', sl).group(1))}
    return {"T": g("T"), "P": g("P"), "vf": g("vf"), "F_mass": g("F_mass"),
            "comp": comp}


LINKED = "tutorials/plant/aceticAcid02_plant"
LINKPROBE = "tutorials/steady/economics/economics03_startup_years"


def _strip_comments(t):
    return re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', t, flags=re.S))


def _flowsheet_units(case: Path):
    """name -> (type, in, operation text) for every unit of a FLAT case's
    flowsheetDict, read from the declaration (comments stripped)."""
    t = _strip_comments((case / "system" / "flowsheetDict").read_text(errors="replace"))
    out = {}
    for m in re.finditer(r'\{\s*name\s+(\w+)\s*;\s*type\s+(\w+)\s*;'
                         r'\s*in\s+(\w+)\s*;([^{}]*?)(operation\s*\{[^{}]*\})?', t):
        out[m.group(1)] = (m.group(2), m.group(3), m.group(5) or "")
    return out


def _json_line(out: str, prefix: str):
    return next((l for l in out.splitlines() if l.strip().startswith(prefix)), "")


def _num(blob: str, key: str):
    g = re.search(r'"%s": *(-?[0-9.eE+]+)' % re.escape(key), blob)
    return float(g.group(1)) if g else None


def _copy_case(src: Path, edits):
    """A COPY of a case with each (relative file, edit) applied; run outputs
    left behind.  Returns the copy's directory."""
    tmp = Path(tempfile.mkdtemp(prefix="design_sheet_u_"))
    dst = tmp / src.name
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(
        "design", "reports", "converged", "postProcessing", "iterations"))
    for rel, ed in edits:
        f = dst / rel
        f.write_text(ed(f.read_text(errors="replace")))
    return dst


def check_storage_link(problems, notes):
    """(u) A TANK A FLOWSHEET UNIT HOLDS IS SIZED ON THE UNIT'S OWN HOLD TIME
    -- ONE HOME (2026-10-18, DEV.md 4c C87, Vitor: "um so sitio").  A
    `storage` entry that declares `unit <name>;` links a flowsheet
    `storageTank` unit and is sized on that unit's published
    `residenceTime_s` and `fillFraction` KPIs and on its inlet stream; the
    hold time, the fill fraction, the stream or a second name declared in
    the entry as well REFUSE by name, as does an unlinked entry that only
    carries a storageTank unit's name.

      * WITNESS `aceticAcid02_plant`, both entries linked: the postDict's
        entries declare `unit` and none of storageTime / fillFraction /
        stream / name; each tank's published storageTime x 86400, fill
        fraction and mass flow ARE the unit's KPIs, its inventory names the
        unit's declared inlet, its V_tanks equals the unit's own
        `vesselVolume_m3` (the same V = tau x Q / fill, computed by two
        homes from one declaration), and V_stored / V_tanks / V_R are
        RECOMPUTED from the unit's KPIs and the published density.
      * THE UNIT'S VALUE SIZES THE TANK: a copy whose methanolTank declares
        28 day and fillFraction 0.80 (the flowsheet ONLY -- the postDict is
        untouched) must size methanolTank/tank1 on exactly those, i.e.
        V_tanks = 2 x V_stored(witness) / 0.80, while acidTank/tank1 does not
        move.
      * REFUSALS, on copies of `economics03_startup_years` (a storageTank
        unit `T201` and a run of a fraction of a second) with a `storage`
        list added to its postDict: storageTime, fillFraction, stream and
        name each declared beside `unit T201;` are refused BY NAME; the
        round-one implicit form (`name T201;` with its own declarations) is
        refused naming the link; `unit makeupComp;` (a compressor) is
        refused; and the CLEAN link `{ unit T201; ... }` reaches the sizer's
        own pressure refusal NAMING `productNH3`, the unit's inlet -- the
        stream came from the unit, not from the entry.  Every copy exits 0:
        a refused store refuses the ITEM, never the run.
      * THE UNLINKED PATH is arm (q)'s: `greenAmmoniaPEQ_baseCase`'s
        `NH3Storage` declares no `unit` and is recomputed there from its own
        declarations, unchanged.

    SABOTAGES, by hand, 2026-10-18 (each in StorageTankSize.cpp, rebuilt,
    this arm run alone, restored, rebuilt):
      S1  the linked residence time replaced by a constant 14 days -> FAILED:
          acidTank/tank1 storageTime 14 against the unit's 7 day, and the
          28-day copy's methanolTank sized on 14.
      S2  the linked fill fraction replaced by a constant 0.9 -> FAILED on the
          copy only (the witness's two tanks both declare 0.90 -- a guard
          whose only case satisfies it is a guard nothing tests, which is why
          the copy moves the fill fraction too).
      S3  the loop that refuses the unit-owned keys removed -> FAILED: the
          four `... declared here AND ...` probes are not refused.
      S4  the implicit-name refusal removed -> FAILED: the round-one form is
          not refused.
    NOT CHECKED: a linked unit in a SECTORED case (no corpus case has one;
    the link matches the flattened unit name exactly, as `units` entries
    do), and whether the inlet or the outlet is read (a storageTank's outlet
    IS its inlet, so no output can tell them apart)."""
    case = ROOT / LINKED
    post = _strip_comments((case / "system" / "postDict").read_text(errors="replace"))
    sm = re.search(r'\bstorage\s*\((.*?)\n\s*\);', post, flags=re.S)
    if not sm:
        problems.append("check_design_sheet(u): %s declares no `storage` list "
                        "-- this arm CANNOT RUN; it must not pass." % LINKED)
        return
    entries = re.findall(r'\{([^{}]*)\}', sm.group(1))
    linked = []
    for e in entries:
        um = re.search(r'\bunit\s+(\w+)\s*;', e)
        if not um:
            problems.append("check_design_sheet(u): a %s storage entry is not "
                            "linked (`unit <name>;`)." % LINKED)
            continue
        for k in ("storageTime", "fillFraction", "stream", "name"):
            if re.search(r'\b%s\b' % k, e):
                problems.append("check_design_sheet(u): the %s entry linking "
                                "'%s' still declares `%s` -- the unit is its "
                                "one home." % (LINKED, um.group(1), k))
        linked.append(um.group(1))
    if not linked:
        problems.append("check_design_sheet(u): no linked storage entry in %s "
                        "-- nothing to hold." % LINKED)
        return
    units = _flowsheet_units(case)

    # The witness and the 28-day copy run together (each is about a minute).
    def bump(t):
        t2, n = re.subn(r'(name\s+methanolTank;.*?operation\s*\{)[^{}]*\}',
                        r'\1 residenceTime 28 day;  fillFraction 0.80; }',
                        t, count=1, flags=re.S)
        return t2 if n == 1 else t + "\n#error the probe found no methanolTank\n"
    cp = _copy_case(case, [("system/flowsheetDict", bump)])
    procs = [subprocess.Popen([str(ROOT / "choupoSolve"), str(d)],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True) for d in (case, cp)]
    (out, err), (cout, cerr) = (p.communicate() for p in procs)
    rcs = [p.returncode for p in procs]
    shutil.rmtree(cp.parent, ignore_errors=True)
    if rcs[0] != 0:
        problems.append("check_design_sheet(u): %s failed (rc=%d)." % (LINKED, rcs[0]))
        return

    base = {}
    for u in linked:
        if u not in units or units[u][0] != "storageTank":
            problems.append("check_design_sheet(u): `unit %s;` is not a "
                            "storageTank of %s's flowsheetDict." % (u, LINKED))
            continue
        k = _json_line(out, '"%s": {' % u)
        tau, fill = _num(k, "residenceTime_s"), _num(k, "fillFraction")
        mdot_u, vv = _num(k, "massFlow_kg_s"), _num(k, "vesselVolume_m3")
        eq = [l for l in out.splitlines() if '"item": "%s/tank' % u in l]
        if None in (tau, fill, mdot_u, vv) or len(eq) != 1:
            problems.append("check_design_sheet(u): %s: unit KPIs or ONE tank "
                            "item missing (found %d items)." % (u, len(eq)))
            continue
        vals = re.search(r'"values": \{([^}]*)', eq[0]).group(1)
        got = {key: _num(vals, key) for key in
               ("storageTime", "fillFraction", "massFlow", "rho",
                "V_stored", "V_tanks", "V_R")}
        want = {"storageTime": tau / 86400.0, "fillFraction": fill,
                "massFlow": mdot_u}
        if got["rho"]:
            want["V_stored"] = tau * mdot_u / got["rho"]
            want["V_tanks"] = want["V_stored"] / fill
            want["V_R"] = want["V_tanks"]
        for key, w in want.items():
            if got[key] is None or not close(got[key], w):
                problems.append("check_design_sheet(u): %s/tank1 %s = %s, but "
                                "the unit publishes / implies %.9g (tau %g s, "
                                "fill %g)." % (u, key, got[key], w, tau, fill))
        if got["V_tanks"] is None or not close(got["V_tanks"], vv):
            problems.append("check_design_sheet(u): %s/tank1 V_tanks %s against "
                            "the unit's own vesselVolume_m3 %.9g -- one "
                            "declaration, two homes that disagree."
                            % (u, got["V_tanks"], vv))
        inlet = units[u][1]
        if '"%s.fraction"' % inlet not in eq[0]:
            problems.append("check_design_sheet(u): %s/tank1 does not hold the "
                            "unit's inlet '%s'." % (u, inlet))
        base[u] = got

    if rcs[1] != 0:
        problems.append("check_design_sheet(u): the 28-day copy failed (rc=%d)."
                        % rcs[1])
    elif "methanolTank" in base and base["methanolTank"]["V_stored"]:
        for u, want_vt in (("methanolTank",
                            2.0 * base["methanolTank"]["V_stored"] / 0.80),
                           ("acidTank", base.get("acidTank", {}).get("V_tanks"))):
            ln = next((l for l in cout.splitlines()
                       if '"item": "%s/tank1"' % u in l), "")
            vt = _num(ln, "V_tanks")
            if want_vt is None or vt is None or not close(vt, want_vt):
                problems.append("check_design_sheet(u): with methanolTank "
                                "declaring 28 day and fill 0.80 (flowsheet "
                                "only), %s/tank1 V_tanks = %s, expected %s -- "
                                "the tank is not sized on the unit's value."
                                % (u, vt, want_vt))

    # Refusals, on a fast case with a storageTank unit.
    pcase = ROOT / LINKPROBE
    tail = "material SS316;  maxTankVolume 30000;"
    probes = (
        ("storageTime beside unit",
         "unit T201;  storageTime 48 h;  " + tail, r'`storageTime` is declared here AND'),
        ("fillFraction beside unit",
         "unit T201;  fillFraction 0.8;  " + tail, r'`fillFraction` is declared here AND'),
        ("stream beside unit",
         "unit T201;  stream productNH3;  " + tail, r'`stream` is declared here AND'),
        ("name beside unit",
         "unit T201;  name T201;  " + tail, r'`name` is declared here AND'),
        ("the unit's name without the link",
         "name T201;  stream productNH3;  storageTime 48 h;  fillFraction 0.8;  "
         + tail, r'carries the name of the flowsheet storageTank unit .T201. but'
                 r' does not link it.*`unit T201;`'),
        ("a link to a compressor",
         "unit makeupComp;  " + tail, r'is a `compressor`, not a `storageTank`'),
        ("the clean link (it must reach the stream's own refusal)",
         "unit T201;  " + tail, r"stream 'productNH3' is at 20"),
    )
    for what, ent, pat in probes:
        def add(t, ent=ent):
            t2, n = re.subn(r'(\n    \);\n)(\}\s*\ncosting)',
                            r'\1    storage ( { ' + ent + r' } );\n\2', t, count=1)
            return t2 if n == 1 else t + "\n#error the probe found no sizing block\n"
        d = _copy_case(pcase, [("system/postDict", add)])
        proc = subprocess.run([str(ROOT / "choupoSolve"), str(d)],
                              capture_output=True, text=True)
        both = proc.stdout + proc.stderr
        name = "makeupComp" if "makeupComp" in ent else "T201"
        if proc.returncode != 0:
            problems.append("check_design_sheet(u): the copy with %s failed "
                            "(rc=%d) -- a refused store must refuse the ITEM, "
                            "never the run." % (what, proc.returncode))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (name, pat), both):
            problems.append("check_design_sheet(u): a copy with %s is not "
                            "refused BY NAME (/%s/)." % (what, pat))
        shutil.rmtree(d.parent, ignore_errors=True)

    notes.append("storage link: %s on %s sized on the units' own residence "
                 "time, fill fraction and inlet (and equal to the units' "
                 "vesselVolume_m3); a flowsheet-only change of methanolTank "
                 "to 28 day / 0.80 moved its tank and not the other; seven "
                 "probes on %s refused by name, the clean link reaching the "
                 "inlet's own pressure refusal"
                 % (", ".join(linked), LINKED, LINKPROBE.split("/")[-1]))


def check_inventory(problems, notes):
    """(r) WHAT EACH ITEM HOLDS IS ITS VOLUME x FRACTION x DENSITY x
    COMPOSITION, AND NOTHING ELSE (2026-10-07, DEV.md 4c C44 slice 3).  On
    `greenAmmoniaPEQ_baseCase`, for every item whose result line carries an
    `inventory` object:

      * the volume is the item's own `V_R`; each held stream's fraction is
        the one its postDict `held ( ... )` declares (a storage tank: its
        `fillFraction`);
      * each phase's density is RECOMPUTED from the case's component
        records at the stream's published state -- the anchored-Rackett
        liquid route (components the package cannot price alone given no
        volume) or the SRK vapour root with kij = 0 -- and its mass is
        V x fraction x rho;
      * `mass.<c>` is the sum over the phases of mass x w_c, w from the
        stream's published composition and the records' molar masses, and
        `mass.total` their sum; the two product tanks together hold exactly
        storageTime of production;
      * the item's sheet carries an `inventory {}` block whose total is the
        same number, and the console lists every sized item WITHOUT one
        under NOT DECLARED (never as zero);
      * three copies: a declared `volume` beside a sized V_R, a TWO-PHASE
        stream, and fractions summing above 1 -- each REFUSED by name while
        the item keeps its size and the run exits 0.

    SABOTAGES, BY HAND, 2026-10-07, each restored with `cp` and the engine
    rebuilt; the gate then returned OK:
      S1  Inventory.cpp: a phase's volume = V (its fraction ignored)  ->
          FAILED: "Converter HotEffluent.volume = 21.5822428747, recomputed
          8.63289715", the mass and every component with it.
      S2  PhaseDensity.cpp: the per-component split on MOLE fractions  ->
          FAILED: "Converter mass.H2 = 120.796640979, recomputed 26.1629745".
      S3  Inventory.cpp: the declared-volume-beside-V_R refusal removed  ->
          FAILED: "a copy with a declared volume beside the Separator's sized
          V_R is not refused BY NAME".
      S4  SizingPass.cpp: the NOT DECLARED list suppressed  -> FAILED: "the
          items with no declared inventory are not listed as NOT DECLARED".
    NOT CHECKED: whether the declared fractions (bed voidage, liquid level)
    are right -- they are the case's assumptions; and whether the engine's
    densities are the TRUE ones (the README's Vliq finding).
    """
    case = ROOT / HXROUTE
    post_nc = re.sub(r'//[^\n]*', '', re.sub(
        r'/\*.*?\*/', '', (case / "system" / "postDict").read_text(errors="replace"),
        flags=re.S))
    declared = {}
    for unit, body in re.findall(
            r'\{\s*unitName\s+(\w+)\s*;[^{]*designRules\s*\{[^}]*\}\s*'
            r'inventory\s*\{\s*held\s*\((.*?)\)\s*;\s*\}', post_nc, re.S):
        declared[unit] = {s: float(f) for s, f in re.findall(
            r'\{\s*stream\s+(\w+)\s*;\s*fraction\s+([0-9.eE+-]+)\s*;\s*\}', body)}
    if not declared:
        problems.append("check_design_sheet(r): %s declares no unit "
                        "`inventory { held ( ... ); }` -- this arm CANNOT RUN; "
                        "it must not pass." % HXROUTE)
        return

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(r): %s failed (rc=%d)." % (HXROUTE, rc))
        return
    mw = {}
    for f in (case / "constant" / "components").glob("*.dat"):
        mw[f.stem] = _record_scalars(f, ("MW",))["MW"]

    #  A GAS STORE's vessels hold their stream's gas at the STORE's state, not
    #  the stream's: arm (v) recomputes them, so this arm leaves them alone.
    gas_stores = set(re.findall(r'\bgasStorage\s*\(\s*\{[^}]*?\bname\s+(\w+)',
                                post_nc))
    lines = [l for l in out.splitlines() if '"inventory": {' in l
             and re.search(r'"unit": "([^"]+)"', l).group(1) not in gas_stores]
    seen, tank_total, n_phase = set(), 0.0, 0
    for line in lines:
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        inv = dict((k, float(v)) for k, v in re.findall(
            r'"([A-Za-z_][\w.]*)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"inventory": \{([^}]*)\}', line).group(1)))
        vals = dict((k, float(v)) for k, v in re.findall(
            r'"(\w+)": *(-?[0-9][0-9.eE+-]*)',
            re.search(r'"values": \{([^}]*)\}', line).group(1)))
        seen.add(item)
        if "/tank" in item:
            stm = re.search(r'storage\s*\(\s*\{[^}]*\bstream\s+(\w+)', post_nc).group(1)
            held = {stm: vals["fillFraction"]}
        else:
            held = declared.get(item)
            if held is None:
                problems.append("check_design_sheet(r): %s publishes an "
                                "inventory the postDict does not declare." % item)
                continue
        if not close(inv.get("volume", -1.0), vals["V_R"], 1e-9):
            problems.append("check_design_sheet(r): %s inventory volume %s is "
                            "not its own V_R %s." % (item, inv.get("volume"), vals["V_R"]))
        want_c, total = {}, 0.0
        for stream, frac in held.items():
            sj = _stream_json(out, stream)
            if sj is None:
                problems.append("check_design_sheet(r): stream %s not in the "
                                "result." % stream)
                continue
            if sj["vf"] <= 1e-9:
                rho, _ = _anchored_rackett_rho(case, sj["comp"], sj["T"])
            else:
                rho = _srk_vapour_rho(case, sj["comp"], sj["T"], sj["P"])
            m = vals["V_R"] * frac * rho
            n_phase += 1
            for key, w in (("fraction", frac), ("volume", vals["V_R"] * frac),
                           ("rho", rho), ("mass", m)):
                got = inv.get("%s.%s" % (stream, key))
                if got is None or not close(got, w, 1e-6):
                    problems.append("check_design_sheet(r): %s %s.%s = %s, "
                                    "recomputed %.9g (V_R %.9g x %g x rho %.9g "
                                    "at %.2f K, %.6g Pa, vf %g)."
                                    % (item, stream, key, got, w, vals["V_R"],
                                       frac, rho, sj["T"], sj["P"], sj["vf"]))
            mbar = sum(z * mw[c] for c, z in sj["comp"].items())
            for c, z in sj["comp"].items():
                want_c[c] = want_c.get(c, 0.0) + m * z * mw[c] / mbar
            total += m
        for c, w in want_c.items():
            got = inv.get("mass." + c)
            if got is None or not close(got, w, 1e-6):
                problems.append("check_design_sheet(r): %s mass.%s = %s, "
                                "recomputed %.9g." % (item, c, got, w))
        if not close(inv.get("mass.total", -1.0), total, 1e-6):
            problems.append("check_design_sheet(r): %s mass.total = %s, "
                            "recomputed %.9g." % (item, inv.get("mass.total"), total))
        if "/tank" in item:
            tank_total += total
        name, _, tag = item.partition("/")
        sheet = case / "design" / name / (tag if tag else re.search(
            r'"type": "([^"]+)"', line).group(1))
        txt = sheet.read_text(errors="replace") if sheet.is_file() else ""
        mm = re.search(r'^inventory\s*\n\{.*?^\s*total\s+([-0-9.eE+]+)\s*kg\s*;',
                       txt, re.S | re.M)
        if not mm or not close(float(mm.group(1)), total, 1e-6):
            problems.append("check_design_sheet(r): %s's sheet carries no "
                            "`inventory {}` whose total is %.9g kg." % (item, total))

    for u in declared:
        if u not in seen:
            problems.append("check_design_sheet(r): %s declares an inventory "
                            "and the result publishes none." % u)
    #  The two tanks together hold storageTime of production.
    sm = re.search(r'storage\s*\(\s*\{([^}]*)\}', post_nc).group(1)
    stream = re.search(r'\bstream\s+(\w+)', sm).group(1)
    t_day = float(re.search(r'storageTime\s+([0-9.]+)\s*day', sm).group(1))
    prod = t_day * 86400.0 * _stream_json(out, stream)["F_mass"]
    if not close(tank_total, prod, 1e-6):
        problems.append("check_design_sheet(r): the tanks hold %.9g kg, and "
                        "%g day of %s is %.9g kg." % (tank_total, t_day, stream, prod))
    nd = re.search(r'NOT DECLARED \(no inventory computed -- not zero\):([^\n]*)', out)
    if not nd or "MakeupComp1" not in nd.group(1) or "Chiller" not in nd.group(1):
        problems.append("check_design_sheet(r): the items with no declared "
                        "inventory are not listed as NOT DECLARED.")

    def edit_held(unit, f):
        def ed(t):
            pat = re.compile(r'(\{\s*unitName\s+%s\s*;.*?inventory\s*\{)(.*?)(\}\s*\})'
                             % unit, re.S)
            return pat.sub(lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                           t, count=1)
        return ed
    probes = (
        ("a declared volume beside the Separator's sized V_R",
         edit_held("Separator", lambda b: b + " volume 5; "), r'beside a sized V_R'),
        ("the Separator holding the TWO-PHASE WaterCooledEffluent",
         edit_held("Separator", lambda b: b.replace("UnreactedGas",
                                                    "WaterCooledEffluent")),
         r'TWO-PHASE'),
        ("Separator fractions summing above 1",
         edit_held("Separator", lambda b: b.replace("fraction 0.75", "fraction 0.85")),
         r'sum to'),
    )
    for what, ed, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("check_design_sheet(r): the copy with %s failed "
                            "(rc=%d) -- a refused inventory must refuse the "
                            "INVENTORY, never the run." % (what, rcp))
        elif not re.search(r"REFUSED: inventory 'Separator'[^\n]*%s" % pat, both):
            problems.append("check_design_sheet(r): a copy with %s is not "
                            "refused BY NAME (/%s/)." % (what, pat))
        elif '"item": "Separator"' not in both or not re.search(
                r'"item": "Separator"[^\n]*"values"', both):
            problems.append("check_design_sheet(r): with %s the Separator lost "
                            "its SIZE -- a refused inventory must keep it." % what)
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("inventory: %d item(s), %d held phase(s) recomputed "
                 "(V x fraction x rho x w; rho from the records); the tanks "
                 "hold %.6g kg = storageTime of production; three probes"
                 % (len(lines), n_phase, tank_total))



#  ---- arm (s): THE DETAILED EXCHANGER DESIGN (2026-10-07, DEV.md 4c C48) --
#  Sinnott's bundle constants K1, n1 for D_b = d_o (N/K1)^(1/n1), per
#  (pattern, tube passes) -- transcribed HERE as well as in the engine's
#  htc/ShellTubeDesign.cpp, so a transcription error in either disagrees with
#  the other.  The bundle-to-shell clearance is the kernel's fixed 12 mm.
SINNOTT = {
    ("triangular", 1): (0.319, 2.142), ("triangular", 2): (0.249, 2.207),
    ("triangular", 4): (0.175, 2.285), ("triangular", 6): (0.0743, 2.499),
    ("triangular", 8): (0.0365, 2.675),
    ("square", 1): (0.215, 2.207), ("square", 2): (0.156, 2.291),
    ("square", 4): (0.158, 2.263), ("square", 6): (0.0402, 2.617),
    ("square", 8): (0.0331, 2.643),
}
SHELL_CLEARANCE = 0.012


def bowman_F(T1, T2, t1, t2):
    """The LMTD correction of one 1-2 shell (Bowman, Mueller & Nagle 1940),
    written out again here from the R-S form; an isothermal side is F = 1."""
    if abs(T1 - T2) < 1e-9 * max(abs(T1), 1.0) or \
            abs(t2 - t1) < 1e-9 * max(abs(t1), 1.0):
        return 1.0
    R = (T1 - T2) / (t2 - t1)
    S = (t2 - t1) / (T1 - t1)
    if abs(R - 1.0) < 1e-6:
        r2 = math.sqrt(2.0)
        return (S * r2 / (1 - S)) / math.log((2 - S * (2 - r2)) / (2 - S * (2 + r2)))
    rt = math.sqrt(R * R + 1)
    return rt * math.log((1 - S) / (1 - R * S)) / (
        (R - 1) * math.log((2 - S * (R + 1 - rt)) / (2 - S * (R + 1 + rt))))


def _block_body(text, start):
    """The body of the `{ ... }` that opens at or after `start`."""
    i = text.index("{", start)
    depth, j = 0, i
    while j < len(text):
        if text[j] == "{":
            depth += 1
        elif text[j] == "}":
            depth -= 1
            if depth == 0:
                return text[i + 1:j]
        j += 1
    return ""


def _len_m(tok, unit):
    return float(tok) * {"m": 1.0, "mm": 1e-3, "cm": 1e-2}[unit]


def design_entries(post_nc):
    """unit -> {material, utility, rules (dict of the design block)} for every
    shellTubeHX entry carrying a `design {}` block."""
    out = {}
    for m in re.finditer(r'\{\s*unitName\s+(\w+)\s*;\s*type\s+shellTubeHX\s*;'
                         r'\s*material\s+(\w+)\s*;', post_nc):
        unit, mat = m.group(1), m.group(2)
        rules = _block_body(post_nc, post_nc.index("designRules", m.end()))
        dm = re.search(r'\bdesign\s*\{', rules)
        if not dm:
            continue
        d = _block_body(rules, dm.start())
        ut = re.search(r'\butility\s+(\w+)\s*;', _drop_block(rules, "design"))
        e = {"material": mat, "utility": ut.group(1) if ut else None}
        for k in ("tubeOD", "tubeID", "tubeLength", "tubePitch"):
            mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*(mm|cm|m)\s*;' % k, d)
            e[k] = _len_m(mm.group(1), mm.group(2)) if mm else None
        for k in ("tubePasses", "baffleSpacingRatio", "shellsInSeries"):
            mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*;' % k, d)
            e[k] = float(mm.group(1)) if mm else None
        mm = re.search(r'\btubePattern\s+(\w+)\s*;', d)
        e["tubePattern"] = mm.group(1) if mm else None
        fb = re.search(r'\bfouling\s*\{([^}]*)\}', d)
        for side in ("tubeSide", "shellSide"):
            mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*m2\.K/W\s*;' % side,
                           fb.group(1)) if fb else None
            e["foul_" + side] = float(mm.group(1)) if mm else None
        mm = re.search(r'\butilitySideFilm\s+([0-9.eE+-]+)\s*W/m2/K\s*;', d)
        e["utilitySideFilm"] = float(mm.group(1)) if mm else None
        out[unit] = e
    return out


def check_exchanger_design(problems, notes):
    """(s) -- see the module docstring.  Every number a design sheet carries
    is RECOMPUTED here from the sheet's own other numbers, the case's
    declarations, the material and utility RECORDS and the run's KPIs, with
    arithmetic written out again in this file: the area from the tubes, U
    from the five resistances, each resistance from its film / wall /
    fouling, the shell from Sinnott's table, F from Bowman's formula, the
    LMTD from the terminal temperatures, the utility flow from the record's
    duty per kg, the cost size from the installed area.  A golden pins what
    the run PRINTS; only this can see a design that is wrong but stable.

    SABOTAGES, BY HAND, 2026-10-07: five, listed with what each produced in
    the module docstring under (s).  The sheet sabotage (S4) has to land
    BETWEEN the run and the check -- the run regenerates design/ whole --
    which is why the check is `check_exchanger_design_on`, callable on a
    run already made.
    """
    case = ROOT / HXROUTE
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    entries = design_entries(post_nc)
    singles = [u for u, e in entries.items() if e["utility"]]
    doubles = [u for u, e in entries.items() if not e["utility"]]
    if not singles or not doubles:
        problems.append("check_design_sheet(s): %s declares %d utility-served "
                        "and %d two-stream exchanger design(s) -- this arm needs "
                        "at least one of each and CANNOT RUN; it must not pass."
                        % (HXROUTE, len(singles), len(doubles)))
        return
    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("check_design_sheet(s): %s failed (rc=%d)." % (HXROUTE, rc))
        return
    return check_exchanger_design_on(case, out, entries, problems, notes)


def _utility_record(name):
    f = ROOT / "data" / "standards" / "utilities" / (name + ".dat")
    t = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '',
               f.read_text(errors="replace"), flags=re.S))
    g = lambda k, u: re.search(r'^\s*%s\s+([0-9.eE+-]+)\s*%s\s*;' % (k, u), t, re.M)
    a, b, q = g("T_in", "K"), g("T_out", "K"), g("dutyPerKg", "")
    mech = re.search(r'^\s*mechanism\s+(\w+)\s*;', t, re.M)
    return (float(a.group(1)), float(b.group(1)), float(q.group(1)),
            mech.group(1) if mech else "")


def _material_k(name):
    f = ROOT / "data" / "standards" / "assets" / (name + ".dat")
    m = re.search(r'^\s*thermalConductivity\s+([0-9.eE+-]+)\s*;',
                  f.read_text(errors="replace"), re.M)
    return float(m.group(1)) if m else None


def check_exchanger_design_on(case, out, entries, problems, notes):
    def kpi_line(unit):
        for line in out.splitlines():
            if ('"%s": {' % unit) in line and '"Q_kW"' in line:
                return line
        return ""

    def kpi(line, key):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, line)
        return float(m.group(1)) if m else None

    def flow_area(unit):
        f = (case / unit / "system" / "flowsheetDict").read_text(errors="replace")
        a = re.search(r'\barea\s+([0-9.eE+-]+)\s*m2\s*;', f)
        u = re.search(r'\bU\s+([0-9.eE+-]+)\s*W/m2/K\s*;', f)
        return (float(a.group(1)) if a else None, float(u.group(1)) if u else None)

    checked = 0
    for unit, e in entries.items():
        f = case / "design" / unit / "shellTubeHX"
        if not f.is_file():
            problems.append("check_design_sheet(s): %s designs %s, and no sheet "
                            "design/%s/shellTubeHX was written." % (HXROUTE, unit, unit))
            continue
        text = f.read_text(errors="replace")
        sh = parse_sheet(text)["sizing"]
        v = lambda k: sh[k][0] if k in sh else None
        need = ("A", "U", "U_clean", "LMTD", "F", "Q_kW", "nTubes", "tubesPerPass",
                "tubePasses", "shellsInSeries", "shellID", "tubeOD", "tubeID",
                "tubeLength", "R_film_tube", "R_wall", "R_film_shell",
                "R_foul_tube", "R_foul_shell", "h_tube", "h_shell", "wallK",
                "A_required", "baffleSpacing")
        miss = [k for k in need if v(k) is None]
        if miss:
            problems.append("check_design_sheet(s): %s's sheet carries no %s."
                            % (unit, ", ".join(miss)))
            continue

        def hold(what, got, want, tol=TOL):
            if not close(got, want, tol):
                problems.append("check_design_sheet(s): %s's sheet says %s = "
                                "%.9g, but %.9g is recomputed." % (unit, what,
                                                                   got, want))
        #  the declarations reach the sheet
        for k in ("tubeOD", "tubeID", "tubeLength"):
            hold(k + " (declared)", v(k), e[k])
        hold("tubePasses (declared)", v("tubePasses"), e["tubePasses"])
        hold("shellsInSeries (declared)", v("shellsInSeries"),
             e["shellsInSeries"] or 1.0)
        hold("R_foul_tube (declared)", v("R_foul_tube"), e["foul_tubeSide"])
        hold("R_foul_shell (declared)", v("R_foul_shell"), e["foul_shellSide"])
        hold("wallK (the %s record)" % e["material"], v("wallK"),
             _material_k(e["material"]))
        #  the bundle
        N, nP, nS = v("nTubes"), v("tubesPerPass"), v("shellsInSeries")
        hold("nTubes = tubesPerPass x tubePasses", N, nP * v("tubePasses"))
        OD, ID, L = v("tubeOD"), v("tubeID"), v("tubeLength")
        hold("A = n_shells pi d_o L N", v("A"), nS * math.pi * OD * L * N)
        K1, n1 = SINNOTT[(e["tubePattern"], int(v("tubePasses")))]
        Ds = OD * (N / K1) ** (1.0 / n1) + SHELL_CLEARANCE
        hold("shellID (Sinnott + 12 mm)", v("shellID"), Ds)
        hold("baffleSpacing = ratio x shellID", v("baffleSpacing"),
             e["baffleSpacingRatio"] * Ds)
        #  the resistances, each from its source, and U from their sum
        hold("R_film_tube = (d_o/d_i)/h_tube", v("R_film_tube"),
             (OD / ID) / v("h_tube"))
        hold("R_film_shell = 1/h_shell", v("R_film_shell"), 1.0 / v("h_shell"))
        hold("R_wall = (d_o/2) ln(d_o/d_i)/k_w", v("R_wall"),
             0.5 * OD * math.log(OD / ID) / v("wallK"))
        Rclean = v("R_film_tube") + v("R_wall") + v("R_film_shell")
        hold("U_clean = 1/(R_tube + R_wall + R_shell)", v("U_clean"), 1.0 / Rclean)
        hold("U = 1/(... + R_foul_shell + R_foul_tube d_o/d_i)", v("U"),
             1.0 / (Rclean + v("R_foul_shell") + v("R_foul_tube") * OD / ID))
        if e["utilitySideFilm"] is not None:
            hold("h_shell (declared utilitySideFilm)", v("h_shell"),
                 e["utilitySideFilm"])
        #  the temperatures: LMTD and F, from the run
        line = kpi_line(unit)
        Q = kpi(line, "Q_kW")
        if e["utility"]:
            t_in, t_out, dpk, mech = _utility_record(e["utility"])
            Ti, To = kpi(line, "T_in"), kpi(line, "T_out")
            if Q < 0:
                d1, d2, T1, T2, t1, t2 = Ti - t_out, To - t_in, Ti, To, t_in, t_out
            else:
                d1, d2, T1, T2, t1, t2 = t_out - Ti, t_in - To, t_in, t_out, Ti, To
            hold("mdot_utility = |Q|/dutyPerKg", v("mdot_utility") or -1.0,
                 abs(Q) * 1000.0 / dpk)
        else:
            Thi, Tho = kpi(line, "T_hot_in"), kpi(line, "T_hot_out")
            tci, tco = kpi(line, "T_cold_in"), kpi(line, "T_cold_out")
            d1, d2, T1, T2, t1, t2 = Thi - tco, Tho - tci, Thi, Tho, tci, tco
            A_r, U_r = flow_area(unit)
            hold("A_rated (the unit's declared area)", v("A_rated") or -1.0, A_r)
            hold("U_rated (the unit's declared U)", v("U_rated") or -1.0, U_r)
        lm = d1 if abs(d1 - d2) < 1e-9 * max(d1, d2) else (d1 - d2) / math.log(d1 / d2)
        hold("LMTD (counter-current, terminal)", v("LMTD"), lm)
        F = 1.0 if int(v("tubePasses")) == 1 else bowman_F(T1, T2, t1, t2)
        hold("F (Bowman-Mueller-Nagle 1-2)", v("F"), F)
        Areq = abs(Q) * 1000.0 / (v("U") * F * lm)
        hold("A_required = |Q|/(U F LMTD)", v("A_required"), Areq)
        if v("A") < v("A_required") * (1 - 1e-9):
            problems.append("check_design_sheet(s): %s installs %.6g m2 < the "
                            "%.6g m2 it requires -- an UNDERSIZED design."
                            % (unit, v("A"), v("A_required")))
        #  the cost is on the INSTALLED area
        jm = re.search(r'"unit": "%s", "item": "%s", "type": "shellTubeHX".*?'
                       r'"sizeKey": "A".*?"S": ([0-9.eE+-]+)' % (unit, unit), out)
        if not jm:
            problems.append("check_design_sheet(s): %s's cost record names no "
                            "size S on key A." % unit)
        else:
            hold("the cost's size S (the installed A)", float(jm.group(1)), v("A"))
        #  a condensing duty says so, and says which way it errs
        outlet = re.search(r'^outlets\s*\{(.*?)^\}', text, re.S | re.M)
        vfs = [float(x) for x in re.findall(r'vapourFraction\s+([0-9.eE+-]+)\s*;',
                                            outlet.group(1))] if outlet else []
        basis = re.search(r'^basis\s+"([^"]*)"', text, re.M)
        btxt = basis.group(1) if basis else ""
        if e["utility"] and vfs and 1e-9 < vfs[0] < 1 - 1e-9:
            if "CONDENSES" not in btxt or "OVER-SIZES" not in btxt:
                problems.append("check_design_sheet(s): %s's outlet is two-phase "
                                "(vf %.4f) and its basis does not say the design is "
                                "on the gas film and OVER-SIZES." % (unit, vfs[0]))
        if "DILUTE-gas" not in btxt:
            problems.append("check_design_sheet(s): %s's basis does not say its "
                            "gas transport is DILUTE-gas." % unit)
        checked += 1

    #  ---- probes: copies, each refusing ONE item BY NAME ------------------
    def edit_design(unit, f):
        def ed(t):
            m = re.search(r'\{\s*unitName\s+%s\s*;' % unit, t)
            k = t.index("design", t.index("designRules", m.end()) + 11)
            body_start = t.index("{", k)
            body = _block_body(t, k)
            end = body_start + 1 + len(body)
            return t[:body_start + 1] + f(body) + t[end:]
        return ed

    single, double = [u for u in entries if entries[u]["utility"]], \
                     [u for u in entries if not entries[u]["utility"]]
    boiler = [u for u in entries if entries[u]["utilitySideFilm"] is not None]
    probes = [
        ("no `fouling {}` on %s" % single[0],
         edit_design(single[0], lambda b: _drop_block(b, "fouling")),
         single[0], r'declares no `fouling'),
        ("`U` beside `design {}` on %s" % single[0],
         lambda t: re.sub(r'(\{\s*unitName\s+%s\s*;[^{]*designRules\s*\{)'
                          % single[0], lambda m: m.group(1) + " U 500; ", t,
                          count=1),
         single[0], r'design \{\}` block AND `U`'),
        ("two tube passes on the crossing %s" % double[0],
         edit_design(double[0], lambda b: re.sub(
             r'\bshellsInSeries\s+[^;]*;', '',
             re.sub(r'\btubePasses\s+[^;]*;', 'tubePasses 2;', b))),
         double[0], r'1-2 correction F'),
    ]
    if boiler:
        probes.append(("no `utilitySideFilm` on the boiling %s" % boiler[0],
                       edit_design(boiler[0], lambda b: re.sub(
                           r'\butilitySideFilm\s+[^;]*;', '', b)),
                       boiler[0], r'BOILS'))
    for what, ed, unit, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("check_design_sheet(s): the copy with %s failed "
                            "(rc=%d) -- a refused design must refuse the ITEM, "
                            "never the run." % (what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (unit, pat), both):
            problems.append("check_design_sheet(s): a copy with %s is not "
                            "refused BY NAME (no `%s  FAILED:` line matching "
                            "/%s/)." % (what, unit, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("exchanger designs: %d sheet(s) recomputed (area, shell, five "
                 "resistances, U, F, LMTD, utility flow, cost size); %d probes "
                 "refused by name" % (checked, len(probes)))


#  ---- arm (x): THE COLUMN'S CONDENSER AND REBOILER DESIGNED (2026-10-20,
#  DEV.md 4c C124) -----------------------------------------------------------
#  The witness: column09's column with its two exchangers on route 4, the
#  process side of each priced by a PHASE-CHANGE film.
COLX = "tutorials/steady/distillation/column17_exchanger_design"
COLX_UNIT = "column17"
G = 9.81


def _colx_rules(post_nc, block):
    """The `<block> {}` of the column's designRules: utility, pressureDesign
    and the `design {}` declarations this arm needs, read from the CASE."""
    rules = _block_body(post_nc, post_nc.index("designRules"))
    m = re.search(r'\b%s\s*\{' % block, rules)
    if not m:
        return None
    body = _block_body(rules, m.start())
    e = {}
    ut = re.search(r'\butility\s+(\w+)\s*;', body)
    e["utility"] = ut.group(1) if ut else None
    dm = re.search(r'\bdesign\s*\{', body)
    if not dm:
        return None
    d = _block_body(body, dm.start())
    for k in ("tubeOD", "tubeID", "tubeLength", "tubePitch"):
        mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*(mm|cm|m)\s*;' % k, d)
        e[k] = _len_m(mm.group(1), mm.group(2)) if mm else None
    mm = re.search(r'\btubePasses\s+([0-9.eE+-]+)\s*;', d)
    e["tubePasses"] = float(mm.group(1)) if mm else None
    mm = re.search(r'\btubePattern\s+(\w+)\s*;', d)
    e["tubePattern"] = mm.group(1) if mm else None
    fb = re.search(r'\bfouling\s*\{([^}]*)\}', d)
    for side in ("tubeSide", "shellSide"):
        mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*m2\.K/W\s*;' % side,
                       fb.group(1)) if fb else None
        e["foul_" + side] = float(mm.group(1)) if mm else None
    mm = re.search(r'\butilitySideFilm\s+([0-9.eE+-]+)\s*W/m2/K\s*;', d)
    e["utilitySideFilm"] = float(mm.group(1)) if mm else None
    mm = re.search(r'\borientation\s+(\w+)\s*;', d)
    e["orientation"] = mm.group(1) if mm else None
    for k in ("Csf", "s"):
        mm = re.search(r'\b%s\s+([0-9.eE+-]+)\s*;' % k, d)
        e[k] = float(mm.group(1)) if mm else None
    return e


def _stream_line(out, name):
    for line in out.splitlines():
        if re.match(r'\s*"%s": \{ "F":' % re.escape(name), line):
            return line
    return ""


def check_column_exchanger_design(problems, notes):
    """(x) -- THE COLUMN'S CONDENSER AND REBOILER, DESIGNED (C124).

    The column's two exchangers reach route 4 with a PHASE-CHANGE process
    film, and every number of the film is RECOMPUTED here, with the
    correlations written out AGAIN in this file from their sources, from the
    inputs the sheet itself publishes, the case's declarations, the material
    and utility RECORDS and the run's own KPIs and product streams:

      * the process temperatures are the COLUMN's: the condenser's
        T_process_in is the run's T_top KPI and its T_process_out the
        distillate stream's T; the reboiler's pool is the bottoms stream's T
        -- read from the run, never from the sheet;
      * the LMTD from those and the utility record, F from Bowman (the steam
        side isothermal: F = 1);
      * the condensing film: Nusselt, h_1 = 0.729 [k^3 rho_l (rho_l - rho_v)
        g h_fg' / (mu D dT)]^1/4 with h_fg' = h_fg + 0.68 cp dT, times
        N_rows^-1/4, N_rows = round(D_b / (sqrt(3) p)) for the triangular
        layout (square: p), D_b = shell ID - 12 mm; Re_film = 4 h_1 D dT /
        (mu h_fg');
      * the boiling film: Rohsenow, q = mu h_fg sqrt(g (rho_l - rho_v)/sigma)
        [cp dT_e / (C_sf h_fg Pr^s)]^3, h = q / dT_e, with C_sf and s the
        CASE's; Zuber, q_CHF = 0.149 h_fg rho_v^1/2 [sigma g (rho_l -
        rho_v)]^1/4, and the flux strictly below it;
      * THE ROOT: the film's flux equals U F LMTD (the one wall temperature
        where the film and everything in series with it carry the same
        heat), and T_wall = T_sat -/+ dT;
      * U from the five resistances, A = pi d_o L N, A >= A_required =
        |Q| / (U F LMTD), the shell from Sinnott, the utility flow from the
        record's dutyPerKg, the process flow |Q| / h_fg;
      * h_fg against the COLUMN's own vapour traffic: |Q_condenser| / h_fg
        is the overhead the condenser condenses, and the column's V_rect KPI
        times the distillate's molar mass is the same vapour counted by the
        MESH -- the one check here of a property the package supplied.

    Probes, each a COPY refusing ONE item BY NAME while the column's other
    items are still sized (the run exits 0): `U` beside `design {}`; a
    reboiler at the critical heat flux; no liquid viscosity model in the
    package; boiling inside the tubes; condensing inside horizontal tubes.

    SABOTAGES, BY HAND, 2026-10-20 (landed BETWEEN the run and the check:
    the run regenerates design/ whole, so `run_case` was wrapped for the
    duration and the sheet edited after it):  see the module docstring under
    (x) for what each produced.

    NOT CHECKED: that the liquid properties (rho_l, mu_l, lambda_l, cp_l,
    rho_v, sigma) are right -- they are the package's, taken as published;
    that C_sf is the right constant (it is the case's declaration, and is
    +/-100 % by nature); and the mixture corrections the engine itself says
    it does not credit.
    """
    case = ROOT / COLX
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    rc, out, err = run_case(COLX)
    if rc != 0:
        problems.append("check_design_sheet(x): %s failed (rc=%d).\n    %s"
                        % (COLX, rc, err.strip()[:300]))
        return
    check_column_exchanger_design_on(case, post_nc, out, problems, notes)

    #  ---- probes: copies, each refusing ONE item BY NAME ------------------
    def edit_block(block, f):
        def ed(t):
            k = t.index("designRules")
            m = re.search(r'\b%s\s*\{' % block, t[k:])
            start = k + m.start()
            body_start = t.index("{", start)
            body = _block_body(t, start)
            end = body_start + 1 + len(body)
            return t[:body_start + 1] + f(body) + t[end:]
        return ed

    def drop_liquid_viscosity(dst):
        tp = dst / "constant" / "thermoPhysPropDict"
        t = tp.read_text(errors="replace")
        tp.write_text(re.sub(r'viscosity\s*\{\s*model\s+Andrade\s*;\s*\}', '', t))

    probes = [
        ("`U` beside `design {}` on the condenser",
         edit_block("condenser", lambda b: " U 500; " + b), None,
         "condenser", r'design \{\}` block AND `U`'),
        ("a reboiler held to a steam level whose flux reaches the critical"
         " heat flux (steamHP, a clean 1e5 W/m2/K steam film, no fouling)",
         edit_block("reboiler", lambda b: re.sub(
             r'\butilitySideFilm\s+[^;]*;', 'utilitySideFilm 100000 W/m2/K;',
             re.sub(r'\bfouling\s*\{[^}]*\}',
                    'fouling { tubeSide 0 m2.K/W; shellSide 0 m2.K/W; }',
                    re.sub(r'\butility\s+steamLP\s*;', 'utility steamHP;', b)))),
         None, "reboiler", r'critical\s+heat flux.*BURNOUT'),
        ("no liquid viscosity model in the package",
         lambda t: t, drop_liquid_viscosity, "condenser", r'viscosity'),
        ("`processSide tube;` on the kettle",
         edit_block("reboiler", lambda b: re.sub(
             r'\bprocessSide\s+shell\s*;', 'processSide tube;', b)),
         None, "reboiler", r'flow boiling'),
        ("condensation inside horizontal tubes (the water moved to the shell)",
         edit_block("condenser", lambda b: re.sub(
             r'\btubeSide\s*\{\s*model\s+Gnielinski\s*;\s*\}',
             'shellSide { model Kern; }', re.sub(
                 r'\bprocessSide\s+shell\s*;', 'processSide tube;', b))),
         None, "condenser", r'INSIDE\s+horizontal tubes'),
    ]
    for what, ed, extra, item, pat in probes:
        tmp = Path(tempfile.mkdtemp(prefix="design_sheet_x_"))
        dst = tmp / case.name
        shutil.copytree(case, dst, ignore=shutil.ignore_patterns(
            "design", "reports", "converged", "postProcessing"))
        pd = dst / "system" / "postDict"
        pd.write_text(ed(pd.read_text(errors="replace")))
        if extra:
            extra(dst)
        p = subprocess.run([str(ROOT / "choupoSolve"), str(dst)],
                           capture_output=True, text=True)
        both = p.stdout + p.stderr
        line = re.search(r'\[not sized\] the %s of column \'%s\' was NOT sized:'
                         r'[^\n]*' % (item, COLX_UNIT), both)
        if p.returncode != 0:
            problems.append("check_design_sheet(x): the copy with %s failed "
                            "(rc=%d) -- a refused exchanger must refuse the "
                            "ITEM, never the column." % (what, p.returncode))
        elif not line or not re.search(pat, both[line.start():line.start() + 900],
                                       re.S):
            problems.append("check_design_sheet(x): a copy with %s is not "
                            "refused BY NAME (no `[not sized] the %s of column "
                            "'%s'` line matching /%s/)." % (what, item,
                                                            COLX_UNIT, pat))
        elif not (dst / "design" / COLX_UNIT / "shell").is_file():
            problems.append("check_design_sheet(x): the copy with %s refused "
                            "the %s and lost the column's shell sheet with it."
                            % (what, item))
        shutil.rmtree(tmp, ignore_errors=True)
    notes.append("column exchanger designs: %d probes refused by name"
                 % len(probes))


def check_column_exchanger_design_on(case, post_nc, out, problems, notes):
    kline = ""
    for line in out.splitlines():
        if ('"%s": {' % COLX_UNIT) in line and '"Q_condenser_kW"' in line:
            kline = line
            break
    if not kline:
        problems.append("check_design_sheet(x): the run emits no KPI object "
                        "for %s." % COLX_UNIT)
        return

    def kpi(key):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, kline)
        return float(m.group(1)) if m else None

    def stream(name, key):
        m = re.search(r'"%s": *(-?[0-9][0-9.eE+-]*)' % key, _stream_line(out, name))
        return float(m.group(1)) if m else None

    checked = 0
    for item, qkey in (("condenser", "Q_condenser_kW"), ("reboiler", "Q_reboiler_kW")):
        e = _colx_rules(post_nc, item)
        if e is None:
            problems.append("check_design_sheet(x): %s declares no `%s { design "
                            "{} }` -- this arm CANNOT RUN; it must not pass."
                            % (COLX, item))
            continue
        f = case / "design" / COLX_UNIT / item
        if not f.is_file():
            problems.append("check_design_sheet(x): no sheet design/%s/%s was "
                            "written." % (COLX_UNIT, item))
            continue
        text = f.read_text(errors="replace")
        sh = parse_sheet(text)["sizing"]
        v = lambda k: sh[k][0] if k in sh else None
        boil = (item == "reboiler")
        need = ["A", "U", "U_clean", "LMTD", "F", "Q_kW", "nTubes", "tubePasses",
                "shellID", "tubeOD", "tubeID", "tubeLength", "R_film_tube",
                "R_wall", "R_film_shell", "R_foul_tube", "R_foul_shell",
                "h_tube", "h_shell", "wallK", "A_required", "mdot_shell",
                "mdot_utility", "T_process_in", "T_process_out", "T_sat",
                "h_fg", "rho_l", "mu_l", "lambda_l", "cp_l", "rho_v", "q_flux",
                "T_wall", "T_shell_props"]
        need += (["dT_excess", "sigma", "Csf", "s_Prandtl", "q_CHF",
                  "fluxOverCHF"] if boil else ["dT_film", "Re_film", "N_rows"])
        miss = [k for k in need if v(k) is None]
        if miss:
            problems.append("check_design_sheet(x): the %s's sheet carries no %s."
                            % (item, ", ".join(miss)))
            continue

        def hold(what, got, want, tol=TOL):
            if want is None or got is None or not close(got, want, tol):
                problems.append("check_design_sheet(x): the %s's sheet says %s"
                                " = %s, but %s is recomputed."
                                % (item, what, got, want))

        #  the declarations reach the sheet
        for k in ("tubeOD", "tubeID", "tubeLength", "tubePasses"):
            hold(k + " (declared)", v(k), e[k])
        hold("R_foul_tube (declared)", v("R_foul_tube"), e["foul_tubeSide"])
        hold("R_foul_shell (declared)", v("R_foul_shell"), e["foul_shellSide"])
        hold("wallK (the carbonSteel record)", v("wallK"), _material_k("carbonSteel"))
        #  the process temperatures are the COLUMN's, read from the run
        Q = kpi(qkey)
        hold("Q_kW (the column's %s)" % qkey, v("Q_kW"), Q)
        if boil:
            Tb = stream("bottoms", "T")
            hold("T_process_in (the bottoms stream's T)", v("T_process_in"), Tb)
            hold("T_process_out (the bottoms stream's T)", v("T_process_out"), Tb)
            hold("T_sat (the pool's T)", v("T_sat"), Tb)
        else:
            hold("T_process_in (the column's T_top KPI)", v("T_process_in"),
                 kpi("T_top"))
            hold("T_process_out (the distillate stream's T)", v("T_process_out"),
                 stream("distillate", "T"))
            hold("T_sat (the mean condensing T)", v("T_sat"),
                 0.5 * (v("T_process_in") + v("T_process_out")))
        #  the bundle and the shell
        N, OD, ID, L = v("nTubes"), v("tubeOD"), v("tubeID"), v("tubeLength")
        hold("A = pi d_o L N", v("A"), math.pi * OD * L * N)
        K1, n1 = SINNOTT[(e["tubePattern"], int(v("tubePasses")))]
        Ds = OD * (N / K1) ** (1.0 / n1) + SHELL_CLEARANCE
        hold("shellID (Sinnott + 12 mm)", v("shellID"), Ds)
        #  the temperatures: LMTD and F, from the run and the utility record
        t_in, t_out, dpk, mech = _utility_record(e["utility"])
        Ti, To = v("T_process_in"), v("T_process_out")
        if Q < 0:
            d1, d2, T1, T2, t1, t2 = Ti - t_out, To - t_in, Ti, To, t_in, t_out
        else:
            d1, d2, T1, T2, t1, t2 = t_out - Ti, t_in - To, t_in, t_out, Ti, To
        lm = d1 if abs(d1 - d2) < 1e-9 * max(d1, d2) else (d1 - d2) / math.log(d1 / d2)
        hold("LMTD (counter-current, terminal)", v("LMTD"), lm)
        F = 1.0 if int(v("tubePasses")) == 1 else bowman_F(T1, T2, t1, t2)
        hold("F (Bowman-Mueller-Nagle 1-2; 1 for an isothermal side)", v("F"), F)
        hold("mdot_utility = |Q|/dutyPerKg", v("mdot_utility"), abs(Q) * 1000.0 / dpk)
        hold("mdot_shell = |Q|/h_fg (the mass that changes phase)",
             v("mdot_shell"), abs(Q) * 1000.0 / v("h_fg"))
        #  the phase-change film, from its published inputs
        rl, rv, mu, k, cp, hfg = (v("rho_l"), v("rho_v"), v("mu_l"),
                                  v("lambda_l"), v("cp_l"), v("h_fg"))
        if boil:
            dT, sig, Csf, s = v("dT_excess"), v("sigma"), v("Csf"), v("s_Prandtl")
            hold("Csf (declared)", Csf, e["Csf"])
            hold("s_Prandtl (declared)", s, e["s"])
            Pr = cp * mu / k
            q = (mu * hfg * math.sqrt(G * (rl - rv) / sig)
                 * (cp * dT / (Csf * hfg * Pr ** s)) ** 3)
            hold("q_flux (Rohsenow)", v("q_flux"), q)
            hold("h_shell = q / dT_excess", v("h_shell"), q / dT)
            qchf = 0.149 * hfg * math.sqrt(rv) * (sig * G * (rl - rv)) ** 0.25
            hold("q_CHF (Zuber)", v("q_CHF"), qchf)
            hold("fluxOverCHF", v("fluxOverCHF"), q / qchf)
            if not q < qchf:
                problems.append("check_design_sheet(x): the reboiler's flux %.6g "
                                "W/m2 is not below its critical heat flux %.6g "
                                "and the design was not refused." % (q, qchf))
            hold("T_wall = T_sat + dT_excess", v("T_wall"), v("T_sat") + dT)
            hold("T_shell_props = T_sat (saturated liquid)", v("T_shell_props"),
                 v("T_sat"))
            hold("h_tube (declared utilitySideFilm)", v("h_tube"),
                 e["utilitySideFilm"])
        else:
            dT = v("dT_film")
            hfgp = hfg + 0.68 * cp * dT
            C = 0.729 if e["orientation"] == "horizontalTube" else 0.943
            Lc = OD if e["orientation"] == "horizontalTube" else L
            h1 = C * (k ** 3 * rl * (rl - rv) * G * hfgp / (mu * Lc * dT)) ** 0.25
            rows = 1
            if e["orientation"] == "horizontalTube":
                pv = (math.sqrt(3.0) if e["tubePattern"] == "triangular" else 1.0) \
                    * e["tubePitch"]
                rows = max(1, int(math.floor((Ds - SHELL_CLEARANCE) / pv + 0.5)))
                hold("N_rows = round(D_b / vertical pitch)", v("N_rows"), rows)
            h = h1 * rows ** -0.25
            hold("h_shell (Nusselt, h_1 N_rows^-1/4)", v("h_shell"), h)
            hold("Re_film = 4 h_1 D dT/(mu h_fg')", v("Re_film"),
                 4.0 * h1 * Lc * dT / (mu * hfgp))
            q = h * dT
            hold("q_flux = h dT_film", v("q_flux"), q)
            hold("T_wall = T_sat - dT_film", v("T_wall"), v("T_sat") - dT)
            hold("T_shell_props = T_sat - dT_film/2", v("T_shell_props"),
                 v("T_sat") - 0.5 * dT)
            #  h_fg against the column's own vapour traffic
            Vr = kpi("V_rect")
            Fd, Fm = stream("distillate", "F"), stream("distillate", "F_mass")
            if Vr and Fd and Fm:
                #  3 %, NOT 1e-6, and the reason is a measured finding: the
                #  column prices Q_condenser_kW on V1 (Hvapour - Hliquid) at
                #  T_top -- the Watson rung -- while h_fg here is the latent
                #  heat on the surface the streams are priced on; the two
                #  differ by 1.96 % on this witness (C124 record, section 5).
                #  What this holds is the class of error a typed or mis-based
                #  h_fg makes: a molar/mass mix-up is a factor of ~80.
                hold("mdot_shell against V_rect x M_distillate (the column's "
                     "own overhead)", v("mdot_shell"), Vr * Fm / Fd, tol=3e-2)
            else:
                problems.append("check_design_sheet(x): V_rect or the distillate's"
                                " flows are not in the run, so h_fg is held to"
                                " nothing.")
        #  the resistances, U, the ROOT, and the area
        hold("R_film_shell = 1/h_shell", v("R_film_shell"), 1.0 / v("h_shell"))
        hold("R_film_tube = (d_o/d_i)/h_tube", v("R_film_tube"), (OD / ID) / v("h_tube"))
        hold("R_wall = (d_o/2) ln(d_o/d_i)/k_w", v("R_wall"),
             0.5 * OD * math.log(OD / ID) / v("wallK"))
        Rclean = v("R_film_tube") + v("R_wall") + v("R_film_shell")
        hold("U_clean", v("U_clean"), 1.0 / Rclean)
        U = 1.0 / (Rclean + v("R_foul_shell") + v("R_foul_tube") * OD / ID)
        hold("U = 1/(... + R_foul_shell + R_foul_tube d_o/d_i)", v("U"), U)
        hold("THE ROOT: the film's flux = U F LMTD (one wall temperature)",
             q, U * F * lm, tol=1e-6)
        Areq = abs(Q) * 1000.0 / (U * F * lm)
        hold("A_required = |Q|/(U F LMTD)", v("A_required"), Areq)
        if v("A") < Areq * (1 - 1e-9):
            problems.append("check_design_sheet(x): the %s installs %.6g m2 < "
                            "the %.6g m2 it requires -- UNDERSIZED."
                            % (item, v("A"), Areq))
        #  the sheet says which numbers the CASE declared, and which the column gave
        xb = re.search(r'^exchanger\s*\{(.*?)^\}', text, re.S | re.M)
        xt = xb.group(1) if xb else ""
        rword = "nucleateBoiling" if boil else "filmCondensation"
        if not re.search(r'role\s+process\s*;\s*regime\s+%s\s*;' % rword, xt):
            problems.append("check_design_sheet(x): the %s's `exchanger {}` block "
                            "does not say the process side's regime is `%s` (NOT"
                            " C48's `condensing`, the partial condenser on a gas"
                            " film)." % (item, rword))
        if not re.search(r'fromUnit\s*\(\s*Q_kW\s+T_process_in\s+T_process_out\s*\)', xt):
            problems.append("check_design_sheet(x): the %s's `exchanger {}` block "
                            "does not say Q_kW and the process temperatures were "
                            "read from the column." % item)
        if boil and not re.search(r'declared\s*\([^)]*\bCsf\b', xt):
            problems.append("check_design_sheet(x): the reboiler's `exchanger {}` "
                            "block does not list Csf as DECLARED.")
        checked += 1
    notes.append("column exchanger designs: %d sheet(s) recomputed" % checked)


MATERIAL_WITNESS = "tutorials/plant/ammoniaReactor03_equilibriumApproach"


def _record_scalar(name: str, key: str) -> float:
    text = (ROOT / "data" / "standards" / "assets" / (name + ".dat")).read_text()
    return float(re.search(r'^\s*%s\s+([-+0-9.eE]+)' % key, text, re.M).group(1))


def check_material_limits(problems, notes):
    """(t) -- see the module docstring."""
    tag = "check_design_sheet(t)"
    src = ROOT / MATERIAL_WITNESS
    T_LINE = re.compile(r"\[rating\] WARNING: (\w+ '[^']+'): service temperature "
                        r"([0-9.]+) K \(its hottest port, stream '([^']+)'")

    # --- the shipped case: SS316 everywhere hot, nothing to announce --------
    proc = subprocess.run([str(ROOT / "choupoSolve"), str(src)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        problems.append("%s: the shipped %s did not run (exit %d)"
                        % (tag, MATERIAL_WITNESS, proc.returncode))
        return
    if "service temperature" in proc.stdout:
        problems.append("%s: the SHIPPED %s announces a service temperature "
                        "although every vessel is within its record's maxT: %s"
                        % (tag, MATERIAL_WITNESS,
                           [l.strip() for l in proc.stdout.splitlines()
                            if "service temperature" in l][:3]))

    # --- the copy: the converter in aluminium -------------------------------
    def to_aluminium(text):
        new, n = re.subn(r'(unitName\s+converter;\s*type\s+vessel;\s*material\s+)\w+;',
                         r'\1aluminium;', text)
        if n != 1:
            raise RuntimeError("the converter's sizing entry was not found")
        return new
    try:
        dst, rc, out, err = _run_copy(src, to_aluminium)
    except RuntimeError as e:
        problems.append("%s: %s in %s's postDict" % (tag, e, MATERIAL_WITNESS))
        return
    try:
        if rc != 0:
            problems.append("%s: the aluminium copy did not run (exit %d) -- an "
                            "announcement must never refuse the run: %s"
                            % (tag, rc, err.strip()[-300:]))
            return
        site = [m for m in T_LINE.finditer(out)]
        conv = [m for m in site if m.group(1) == "vessel 'converter'"]
        others = [m.group(1) for m in site if m.group(1) != "vessel 'converter'"]
        if len(conv) != 1:
            problems.append("%s: the converter in aluminium (record maxT %.0f K) "
                            "printed %d service-temperature site line(s), "
                            "expected exactly ONE" %
                            (tag, _record_scalar("aluminium", "maxT"), len(conv)))
            return
        if others:
            problems.append("%s: the copy changed only the converter's material, "
                            "yet these items announce a service temperature: %s"
                            % (tag, others))
        m = conv[0]
        T_said, stream = float(m.group(2)), m.group(3)
        # recompute the hottest port from the run's own stream states
        fs = (src / "system" / "flowsheetDict").read_text(errors="replace")
        blk = fs[fs.index("name       converter;"):]
        blk = blk[:blk.index("operation")]
        ports = re.findall(r'\bin\s+(\w+);', blk) + \
            re.findall(r'outputs\s*\(\s*([^)]*)\)', blk)[0].split()
        temps = {}
        for p in ports:
            j = _stream_json(out, p)
            if j is not None:
                temps[p] = j["T"]
        if not temps:
            problems.append("%s: no port state of the converter was found in "
                            "the run's result JSON (%s)" % (tag, ports))
            return
        hot = max(temps, key=temps.get)
        if hot != stream or abs(temps[hot] - T_said) > 0.051:
            problems.append("%s: the announcement names stream '%s' at %.1f K, "
                            "but the converter's hottest port is '%s' at %.3f K "
                            "(ports %s)" % (tag, stream, T_said, hot, temps[hot], temps))
        maxT = _record_scalar("aluminium", "maxT")
        if "maxT %.1f K" % maxT not in m.string[m.start():m.start() + 400]:
            problems.append("%s: the line does not quote the record's maxT %.1f K"
                            % (tag, maxT))
        if "not a code allowable" not in m.string[m.start():m.start() + 600]:
            problems.append("%s: the line no longer says the limit is the "
                            "record's own, not a code allowable" % tag)
        # the end-of-run caveat block replays it (an entry in AdvisoryLog)
        replay = [l for l in out.splitlines()
                  if l.strip().startswith("- vessel 'converter': service temperature")]
        if not replay:
            problems.append("%s: the caveat block does not replay the converter's "
                            "maxT announcement -- printed at its site and recorded "
                            "nowhere, the slightly louder form of silence" % tag)
        notes.append("converter in aluminium: %.1f K on '%s' > maxT %.0f K, "
                     "announced once and replayed" % (T_said, stream, maxT))
    finally:
        shutil.rmtree(dst.parent, ignore_errors=True)

    # --- the column's four pressure-bearing items (DEV.md 4c C86) -----------
    #  C85 left the shell, the reflux drum and both exchangers publishing a
    #  `pressureDesign` that met no rating.  A COPY of the column witness in
    #  aluminium (record maxP 50 bar) at 60 bar on every item must announce
    #  each of the four ONCE, by its item id, and replay each in the caveat
    #  block; the shipped case (carbon steel, 2 bar) is silent.
    col_src = ROOT / COLUMN
    P_PROBE = 60.0
    m_unit = re.search(r'unitName\s+(\w+);\s*type\s+distillationColumn;',
                       (col_src / "system" / "postDict").read_text(errors="replace"))
    col_unit = m_unit.group(1) if m_unit else "?"

    def column_overrated(text):
        new, n = re.subn(r'(unitName\s+\w+;\s*type\s+distillationColumn;\s*'
                         r'material\s+)\w+;', r'\1aluminium;', text)
        if n != 1:
            raise RuntimeError("the column's sizing entry was not found")
        new, n = re.subn(r'(\bpressureDesign\s+)[-+0-9.eE]+;',
                         r'\g<1>%.1f;' % P_PROBE, new)
        if n != 4:
            raise RuntimeError("expected 4 `pressureDesign` lines (shell, "
                               "condenser, reboiler, drum), found %d" % n)
        return new
    try:
        cdst, crc, cout, cerr = _run_copy(col_src, column_overrated)
    except RuntimeError as e:
        problems.append("%s: %s in %s's postDict" % (tag, e, COLUMN))
        cdst = None
    if cdst is not None:
        n_before = len(problems)
        try:
            maxP_al = _record_scalar("aluminium", "maxP")
            if crc != 0:
                problems.append("%s: the over-rated column copy did not run "
                                "(exit %d) -- an announcement must never refuse "
                                "the run: %s" % (tag, crc, cerr.strip()[-300:]))
            else:
                want = {"vessel '%s/shell'" % col_unit,
                        "vessel '%s/refluxDrum'" % col_unit,
                        "shellTubeHX '%s/condenser'" % col_unit,
                        "shellTubeHX '%s/reboiler'" % col_unit}
                P_LINE = re.compile(r"^  \[rating\] WARNING: (\w+ '[^']+'): design "
                                    r"pressure ([0-9.]+) bar EXCEEDS material "
                                    r"'(\w+)' rating ([0-9.]+) bar", re.M)
                said = [m for m in P_LINE.finditer(cout)]
                who = [m.group(1) for m in said]
                for w in sorted(want):
                    if who.count(w) != 1:
                        problems.append("%s: %s at %.1f bar in aluminium "
                                        "(record maxP %.0f bar) printed %d "
                                        "design-pressure site line(s), expected "
                                        "exactly ONE" % (tag, w, P_PROBE,
                                                         maxP_al, who.count(w)))
                    if not any(l.strip().startswith("- %s: design pressure" % w)
                               for l in cout.splitlines()):
                        problems.append("%s: the caveat block does not replay "
                                        "%s's design-pressure announcement"
                                        % (tag, w))
                extra = sorted(set(who) - want)
                if extra:
                    problems.append("%s: the column copy announces a design "
                                    "pressure for items it has no reason to: %s"
                                    % (tag, extra))
                for m in said:
                    if (abs(float(m.group(2)) - P_PROBE) > 0.051
                            or m.group(3) != "aluminium"
                            or abs(float(m.group(4)) - maxP_al) > 0.051):
                        problems.append("%s: %s's line does not quote the "
                                        "declared %.1f bar and the record's "
                                        "maxP %.1f bar: %s" % (tag, m.group(1),
                                        P_PROBE, maxP_al, m.group(0)))
                if not [p for p in problems[n_before:]]:
                    notes.append("column in aluminium at %.0f bar: shell, reflux "
                                 "drum, condenser and reboiler each announced "
                                 "once and replayed" % P_PROBE)
        finally:
            shutil.rmtree(cdst.parent, ignore_errors=True)
        shipped = subprocess.run([str(ROOT / "choupoSolve"), str(col_src)],
                                 capture_output=True, text=True)
        if "design pressure" in shipped.stdout and "EXCEEDS material" in shipped.stdout:
            problems.append("%s: the SHIPPED %s (carbon steel, 2 bar) announces "
                            "a design pressure above its rating" % (tag, COLUMN))

    # --- source half: no sizer compares a record limit itself ---------------
    sizing = ROOT / "src" / "postProcessing" / "sizing"
    for f in sorted(sizing.glob("*.cpp")):
        if f.name == "MaterialLimits.cpp":
            continue
        code = re.sub(r'//[^\n]*', '', f.read_text(errors="replace"))
        #  ANY `.maxP` / `.maxT`, not only `material.`: a sizer that renames
        #  its Material reference is still comparing the record's limit.
        if re.search(r'\.max[PT]\b', code):
            problems.append("%s: %s compares a material record limit itself -- "
                            "`sizing/MaterialLimits` is the one home" % (tag, f.name))
        #  EVERY PUBLISHED DESIGN PRESSURE MEETS THE RATING (DEV.md 4c C86):
        #  as many `materialLimits::pressure(` calls as `set("pressureDesign"`
        #  sites, per sizer.  A COUNT, not a presence test: CatalystBedSize
        #  publishes two (the vessel and the multitubular bundle) and had one
        #  call until C86 -- a presence test passed it.
        n_pub = len(re.findall(r'\bset\(\s*"pressureDesign"', code))
        n_cmp = len(re.findall(r'\bmaterialLimits::pressure\(', code))
        if n_cmp < n_pub:
            problems.append("%s: %s publishes `pressureDesign` %d time(s) and "
                            "compares it with the material's rating %d time(s) "
                            "-- every published design pressure calls "
                            "`materialLimits::pressure`" % (tag, f.name, n_pub, n_cmp))
    #  Comments STRIPPED first: a commented-out call still contains the text,
    #  and prose is not a call (S3 SURVIVED this half until it did this).
    ml = re.sub(r'//[^\n]*', '',
                (sizing / "MaterialLimits.cpp").read_text(errors="replace"))
    if "AdvisoryLog::instance().add(" not in ml:
        problems.append("%s: MaterialLimits.cpp no longer records its "
                        "announcements in AdvisoryLog" % tag)


def check_gas_store(problems, notes):
    """(v) A GAS BUFFER IS SIZED FROM THE GAS IT GIVES BACK, ON THE CASE'S OWN
    EQUATION OF STATE (2026-10-18, DEV.md 4c C89).  On
    `greenAmmoniaPEQ_baseCase`, whose postDict attaches `H2Buffer` to the
    boundary stream `H2Feed` (`gasStorage ( ... )`), everything is RECOMPUTED
    here from the postDict's own declarations, the stream's published state
    and the case's component records -- never read off the sheet it checks:

      * rho(Pmax, T) and rho(Pmin, T): the SRK vapour root with kij = 0 (the
        case's own package; `_srk_vapour_rho`), at the stream's composition;
      * m_work = autonomy x F_mass; V_total = m_work / (rho_max - rho_min);
        N = ceil(V_total / maxVesselVolume); V_R = V_total / N; D from L/D;
        the wall t = P_g D / (2 sigma E - 1.2 P_g) + c at P_g = Pmax - 1 atm,
        and the weight rho_steel pi D H t, from the material record;
      * each vessel's COST BY ITS STEEL MASS (Vitor's ruling on C89):
        purchased = bare-module = total-module = weight x the declared
        `steelPrice` (installed; no index, no module factor, no 1.18), on the
        `declared-unit-price` shape, and the printed C_TM total equal to the
        sum of the items' totalModule;
      * the Turton COMPARISON, published as `comparison_*` factors and
        printed as an EXTRAPOLATION with its F_P and t/R, NOT in the total:
        the VERTICAL vessel set this gate transcribes (`VESSEL_VERTICAL`),
        the pressure factor max((t_w + 0.00315)/0.0063, 1) on the uncorroded
        wall, the record's F_M and the costing block's index and currency;
        also replayed in the caveat record;
      * each vessel's inventory = V_R x rho_max; the economics' raw-material
        stock = the buffer's full charge x the H2Feed purchase price (the
        case declares 0 days of stock for every raw material);
      * exactly N sheets `design/H2Buffer/vessel1..N` carrying V_R; every
        vessel PLACED on the plot plan at its own D and H, standing;
      * the charging compressor NOT INCLUDED is in the run's caveat record;
      * four copies, each REFUSED BY NAME while the run exits 0: maxPressure
        equal to minPressure, minPressure below the line's own 30 bar,
        autonomy with no unit, and the store attached to the LIQUID
        ProductNH3; and two more that refuse the vessel's COST by name while
        it keeps its SIZE and the total reads INCOMPLETE: no `steelPrice`,
        and no `steelPriceReason`.

    SABOTAGES, BY HAND, 2026-10-18, each restored with `cp` and the engine
    rebuilt; the gate then returned OK:
      S1  GasStoreSize.cpp: dRho = rhoMax (the cushion forgotten)  -> FAILED:
          "greenAmmoniaPEQ_baseCase failed (rc=2)" -- the store shrank to 7
          vessels and the case's plot plan, which places ten, REFUSED the run
          ("item `H2Buffer/vessel8` names no sized item").  Caught, but by the
          layout and not by the value arm; S2 is the one that reaches the
          values.
      S2  GasStoreSize.cpp: pressureDesign = Pmax * 1e-5 (ABSOLUTE)  -> FAILED
          (50 lines): "values.pressureDesign = 100, recomputed 98.98675", the
          wall (0.20291 against 0.20079 m), the weight and the two module
          costs, on every vessel.
      S3  GasStoreSize.cpp: the minPressure-below-the-line refusal disabled
          (`false &&`)  -> FAILED: "the copy with minPressure below the line's
          pressure failed (rc=2)" -- the copy sized a different number of
          vessels and its plot plan refused the run, so the absent refusal
          surfaced as a run failure, not as the missing message.
      S4  GasStoreSize.cpp: the charging-compressor AdvisoryLog entry removed
          (the console line kept)  -> FAILED: "the charging compressor is not
          in the run's caveat record".
    SECOND ROUND (the steel-mass cost), 2026-10-18, in
    costing/SteelMassCost.cpp, each restored with `cp` and rebuilt:
      S5  C_p = 1.18 x price x mass (a module factor applied)  -> FAILED (30
          lines): "cost.purchased = 4025338.11, recomputed 3411303.49" and the
          two module costs, on every vessel.
      S6  the item's totalModule set to the Turton comparison's  -> FAILED (10
          lines): "cost.totalModule = 30168312.13, recomputed 3411303.49".
          The total-equals-the-items arm did NOT fire on it (the table sums
          the very records it prints); the value arm is what catches it.
      S7  no steelPrice -> fall back to the costing model's own price  ->
          FAILED: "a copy with no steelPrice does not refuse the vessel's cost
          BY NAME".
      S8  the comparison's AdvisoryLog entry disabled (the console line kept)
          -> FAILED: "the Turton comparison is not in the caveat record".
    NOT CHECKED: whether 2 h, 100 bar, 32 bar, 400 m3 and 8 EUR/kg are the
    right design basis (the case's declared assumptions), whether SRK is the
    TRUE density of hydrogen at 100 bar, and whether a price per kg of SHELL
    steel covers heads, nozzles and supports (the declared price must fold
    them in; the weight is the cylindrical shell's alone)."""
    tag = "check_design_sheet(v)"
    case = ROOT / HXROUTE
    post = (case / "system" / "postDict").read_text(errors="replace")
    post_nc = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', post, flags=re.S))
    m = re.search(r'\bgasStorage\s*\(\s*\{([^}]*)\}', post_nc)
    if not m:
        problems.append("%s: %s declares no `gasStorage ( { ... } )` entry -- "
                        "this arm CANNOT RUN; it must not pass." % (tag, HXROUTE))
        return
    ent = m.group(1)

    def word(k):
        mm = re.search(r'\b%s\s+(\w+)\s*;' % k, ent)
        return mm.group(1) if mm else None

    def num(k):
        mm = re.search(r'\b%s\s+([-0-9.eE+]+)\s*(\w*)\s*;' % k, ent)
        return (float(mm.group(1)), mm.group(2)) if mm else (None, None)

    name, stream, mat = word("name"), word("stream"), word("material")
    aut, aut_u = num("autonomy")
    pmax, pmax_u = num("maxPressure")
    pmin, pmin_u = num("minPressure")
    T, T_u = num("temperature")
    vmax, _ = num("maxVesselVolume")
    LD, _ = num("L_over_D")
    ca, _ = num("corrosionAllow")
    je, _ = num("jointEfficiency")
    price, _ = num("steelPrice")
    if None in (name, stream, mat, aut, pmax, pmin, T, vmax, LD, ca, je,
                price) or \
            aut_u not in ("h", "day") or pmax_u != "bar" or pmin_u != "bar" \
            or T_u != "K":
        problems.append("%s: the gasStorage entry does not declare name/stream/"
                        "material/autonomy (h or day)/maxPressure and "
                        "minPressure (bar)/temperature (K)/maxVesselVolume/"
                        "L_over_D/corrosionAllow/jointEfficiency/steelPrice -- "
                        "nothing to "
                        "recompute." % tag)
        return
    aut_h = aut if aut_u == "h" else aut * 24.0
    Pmax, Pmin = pmax * 1.0e5, pmin * 1.0e5

    cm = re.search(r'\bcosting\s*\{([^}]*)\}', post_nc)
    cepci = float(re.search(r'\bcepci\s+([0-9.]+)', cm.group(1)).group(1))
    cepci01 = float(re.search(r'\bcepci2001\s+([0-9.]+)', cm.group(1)).group(1))
    fx = float(re.search(r'\busdToEur\s+([0-9.]+)', cm.group(1)).group(1))
    rec = _record_scalars(ROOT / "data/standards/assets" / (mat + ".dat"),
                          ("sigma_y", "density", "F_M"))

    rc, out, err = run_case(HXROUTE)
    if rc != 0:
        problems.append("%s: %s failed (rc=%d)." % (tag, HXROUTE, rc))
        return
    sj = _stream_json(out, stream)
    if sj is None:
        problems.append("%s: stream %s is not in the result JSON." % (tag, stream))
        return
    rho_max = _srk_vapour_rho(case, sj["comp"], T, Pmax)
    rho_min = _srk_vapour_rho(case, sj["comp"], T, Pmin)
    m_work = aut_h * 3600.0 * sj["F_mass"]
    V_total = m_work / (rho_max - rho_min)
    N = max(1, math.ceil(V_total / vmax - 1e-9))
    V_R = V_total / N
    D = (4.0 * V_R / (math.pi * LD)) ** (1.0 / 3.0)
    H = LD * D
    Pg = (Pmax - 101325.0) * 1.0e-5                     # bar g
    sig = rec["sigma_y"] * 1.0e6
    t = Pg * 1.0e5 * D / (2.0 * sig * je - 1.2 * Pg * 1.0e5) + ca
    weight = rec["density"] * math.pi * D * H * t
    K1, K2, K3, B1, B2 = VESSEL_VERTICAL
    lv = math.log10(V_R)
    cp = 10.0 ** (K1 + K2 * lv + K3 * lv * lv) * cepci / cepci01 * fx
    t_w = D * Pg / (2.0 * (rec["sigma_y"] * 10.0 - 0.6 * Pg))
    FP = max((t_w + 0.00315) / 0.0063, 1.0)
    cbm = cp * (B1 + B2 * rec.get("F_M", 1.0) * FP)
    #  THE COST IS THE STEEL (Vitor's ruling on C89): weight x the declared
    #  installed price, no index, no module factor; the Turton vessel cost is
    #  a COMPARISON published under `comparison_*` and in no total.
    c_steel = weight * price
    want = {"values.V_R": V_R, "values.V_total": V_total, "values.nVessels": N,
            "values.D": D, "values.H": H, "values.t_wall": t,
            "values.weight": weight, "values.pressureDesign": Pg,
            "values.m_working": m_work, "values.rho_max": rho_max,
            "values.rho_min": rho_min, "inventory.mass.total": V_R * rho_max,
            "values.t_over_R": t / (0.5 * D),
            "cost.purchased": c_steel, "cost.bareModule": c_steel,
            "cost.totalModule": c_steel, "factors.steelPrice": price,
            "factors.comparison_C_p": cp, "factors.comparison_C_BM": cbm,
            "factors.comparison_C_TM": 1.18 * cbm,
            "factors.comparison_F_P": FP}

    eq = [l for l in out.splitlines() if '"item": "%s/vessel' % name in l]
    if len(eq) != N:
        problems.append("%s: %s should be %d vessel(s) (V_total %.6g m3 / at "
                        "most %.6g m3), the result carries %d."
                        % (tag, name, N, V_total, vmax, len(eq)))
    for line in eq:
        item = re.search(r'"item": "([^"]+)"', line).group(1)
        if '"type": "vessel"' not in line:
            problems.append("%s: %s is not sized AS a `vessel`." % (tag, item))
        for key, w in want.items():
            sub, k = key.split(".", 1)
            blk = re.search(r'"%s": \{([^}]*)' % sub, line)
            g = re.search(r'"%s": *(-?[0-9.eE+]+)' % re.escape(k),
                          blk.group(1) if blk else "")
            if not g or not close(float(g.group(1)), w, 1e-6):
                problems.append("%s: %s %s = %s, recomputed %.9g (%g h x "
                                "F_mass %.9g kg/s / (rho %.9g - %.9g) kg/m3 at "
                                "%g/%g bar, %g K; at most %g m3; L/D %g; "
                                "cost = weight x %g EUR/kg)."
                                % (tag, item, key, g.group(1) if g else "(absent)",
                                   w, aut_h, sj["F_mass"], rho_max, rho_min,
                                   pmax, pmin, T, vmax, LD, price))
        if '"correlation": "declared-unit-price"' not in line:
            problems.append("%s: %s is not priced on the declared-unit-price "
                            "shape." % (tag, item))
        vtag = item.split("/", 1)[1]
        f = case / "design" / name / vtag
        if not f.is_file():
            problems.append("%s: no sheet design/%s/%s." % (tag, name, vtag))
        else:
            sz = parse_sheet(f.read_text(errors="replace"))["sizing"]
            if "V_R" not in sz or not close(sz["V_R"][0], V_R, 1e-6):
                problems.append("%s: sheet design/%s/%s V_R %s against %.9g."
                                % (tag, name, vtag, sz.get("V_R"), V_R))
        lay = next((l for l in out.splitlines()
                    if '"id": "%s"' % item in l and '"footprintFrom"' in l), "")
        dx = re.search(r'"dx": *([-0-9.eE+]+)', lay)
        dz = re.search(r'"dz": *([-0-9.eE+]+)', lay)
        if not (lay and '"orientation": "vertical"' in lay and dx and dz
                and close(float(dx.group(1)), D, 1e-6)
                and close(float(dz.group(1)), H, 1e-6)):
            problems.append("%s: %s is not placed STANDING on the plot plan at "
                            "its own D %.6g m and H %.6g m." % (tag, item, D, H))

    #  The buffer's full charge is the H2 raw-material stock, at its price.
    econ = (case / "constant" / "economics").read_text(errors="replace")
    pm = re.search(r'\bstream\s+%s\s*;[^}]*?\bprice\s+([0-9.eE+-]+)' % stream,
                   re.sub(r'//[^\n]*', '', econ), re.S)
    wc = re.search(r'"WC_rawMaterialStock": *([-0-9.eE+]+)', out)
    if not pm or not wc or not close(float(wc.group(1)),
                                     N * V_R * rho_max * float(pm.group(1)), 1e-6):
        problems.append("%s: WC_rawMaterialStock = %s, and the full buffer x "
                        "the %s price is %s." % (tag, wc.group(1) if wc else
                        "(absent)", stream, (N * V_R * rho_max * float(
                            pm.group(1))) if pm else "(no price)"))
    #  THE TOTAL IS THE DECLARED COSTS: the printed C_TM total equals the sum
    #  of every item's totalModule, so no comparison rode into it.
    tot = re.search(r'TOTALS \(EUR\)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)', out)
    s_tm = sum(float(x) for x in re.findall(
        r'"cost": \{ "purchased": [-0-9.eE+]+, "bareModule": [-0-9.eE+]+, '
        r'"totalModule": ([-0-9.eE+]+)', out))
    if not tot or abs(float(tot.group(3)) - s_tm) > 1.0:
        problems.append("%s: the printed C_TM total %s is not the sum of the "
                        "items' totalModule %.0f." % (tag, tot.group(3) if tot
                                                      else "(absent)", s_tm))
    if not re.search(r"\[comparison\] vessel '%s/vessel1'[^\n]*EXTRAPOLATED"
                     r"[^\n]*F_P[^\n]*t/R[^\n]*NOT in the total" % name, out):
        problems.append("%s: the Turton comparison is not printed for %s/vessel1 "
                        "as an EXTRAPOLATION with its F_P and t/R, not in the "
                        "total." % (tag, name))
    if not re.search(r'"category": "costing"[^\n]*EXTRAPOLATED[^\n]*COMPARISON', out):
        problems.append("%s: the Turton comparison is not in the caveat record."
                        % tag)
    if not re.search(r'"category": "costing"[^\n]*CHARGING COMPRESSOR', out):
        problems.append("%s: the charging compressor is not in the run's "
                        "caveat record -- the buffer's cost is a lower bound "
                        "and must say so." % tag)

    def edit_store(f):
        return lambda tx: re.sub(r'(\bgasStorage\s*\(\s*\{)([^}]*)(\})',
                                 lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                                 tx, count=1)
    probes = (
        ("maxPressure equal to minPressure",
         edit_store(lambda e: re.sub(r'maxPressure\s+[^;]*;',
                                     'maxPressure %g bar;' % pmin, e)),
         r'is not above minPressure'),
        ("minPressure below the line's pressure",
         edit_store(lambda e: re.sub(r'minPressure\s+[^;]*;',
                                     'minPressure 25 bar;', e)),
         r'is BELOW the pressure of stream'),
        ("autonomy with no unit",
         edit_store(lambda e: re.sub(r'autonomy\s+[^;]*;', 'autonomy 2;', e)),
         r'`autonomy` carries no unit'),
        ("the store attached to the LIQUID ProductNH3",
         edit_store(lambda e: re.sub(r'\bstream\s+\w+\s*;', 'stream ProductNH3;', e)),
         r'is a liquid'),
    )
    for what, ed, pat in probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        if rcp != 0:
            problems.append("%s: the copy with %s failed (rc=%d) -- a refused "
                            "store must refuse the ITEM, never the run."
                            % (tag, what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (name, pat), outp + errp):
            problems.append("%s: a copy with %s is not refused BY NAME (/%s/)."
                            % (tag, what, pat))
        shutil.rmtree(dst.parent, ignore_errors=True)

    #  THE PRICE IS REQUIRED, and its absence refuses the COST, not the size:
    #  the vessels stay sized and the total reads INCOMPLETE.
    cost_probes = (
        ("no steelPrice",
         edit_store(lambda e: re.sub(r'\bsteelPrice\s+[^;]*;', '', e)),
         r'no\s+`steelPrice` is declared'),
        ("no steelPriceReason",
         edit_store(lambda e: re.sub(r'\bsteelPriceReason\s+"[^"]*"\s*;', '', e)),
         r'no `steelPriceReason`'),
    )
    for what, ed, pat in cost_probes:
        dst, rcp, outp, errp = _run_copy(case, ed)
        both = outp + errp
        if rcp != 0:
            problems.append("%s: the copy with %s failed (rc=%d) -- a missing "
                            "price refuses the COST, never the run." % (tag, what, rcp))
        elif not re.search(r'%s/vessel1\s+FAILED:[^\n]*%s' % (name, pat), both):
            problems.append("%s: a copy with %s does not refuse the vessel's "
                            "cost BY NAME (/%s/)." % (tag, what, pat))
        elif "TOTALS (EUR) -- INCOMPLETE" not in both:
            problems.append("%s: with %s the cost total does not read "
                            "INCOMPLETE." % (tag, what))
        elif not re.search(r'"item": "%s/vessel1"[^\n]*"values"' % name, both):
            problems.append("%s: with %s the vessel lost its SIZE -- a missing "
                            "price must keep it." % (tag, what))
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("gas store: %s on %s, %d vessel(s) of %.1f m3 (D %.3f m, wall "
                 "%.1f mm) recomputed from %g h x %.4g kg/s / (%.4f - %.4f) "
                 "kg/m3 SRK, each costed %.0f EUR = %.0f kg x %g EUR/kg (Turton "
                 "comparison %.0f EUR, F_P %.2f, not in the total); six refusals"
                 % (name, stream, N, V_R, D, t * 1000.0, aut_h, sj["F_mass"],
                    rho_max, rho_min, c_steel, weight, price, 1.18 * cbm, FP))



PRESSURE_STORES = "tutorials/plant/ammonia02_full_plant"
#  THE GAS-STORE LINK'S WITNESS IS A PROBE (DEV.md 4c C93): ammonia02 no
#  longer stores its syngas, so the `gasStorage { unit <name>; }` link is
#  exercised on a copy of economics03_startup_years, whose flowsheet still
#  holds the 25 bar syngas in the storageTank T101, with this entry added.
GAS_STORE_PROBE = "tutorials/steady/economics/economics03_startup_years"
GAS_STORE_ENTRY = ('unit T101;  material carbonSteel;  maxPressure 100 bar;  '
                   'minPressure 27 bar;  temperature 300 K;  maxVesselVolume 400;  '
                   'L_over_D 3;  corrosionAllow 0.003;  jointEfficiency 1.0;  '
                   'steelPrice 8;  steelPriceReason "the gate probe price";')


def _entry_of(post_nc, listname):
    m = re.search(r'\b%s\s*\(\s*\{([^}]*)\}' % listname, post_nc)
    return m.group(1) if m else None


def _entry_num(ent, k):
    mm = re.search(r'\b%s\s+([-0-9.eE+]+)\s*(\w*)\s*;' % k, ent)
    return (float(mm.group(1)), mm.group(2)) if mm else (None, None)


def _item_values(line):
    blk = re.search(r'"values": \{([^}]*)', line)
    return blk.group(1) if blk else ""


def check_pressure_store_link(problems, notes):
    """(w) THE PRESSURE STORES A FLOWSHEET UNIT HOLDS, AND THE PRESSURISED
    LIQUID STORE (2026-10-18, DEV.md 4c C92; the gas witness moved by C93).
    Both pressure stores LINK the flowsheet `storageTank` unit that holds
    their stream (`unit <name>;`, the C87 rule: one home for the hold time),
    and everything is RECOMPUTED here from the unit's published KPIs, the
    declarations, the case's component and material records and the stream's
    published state -- never read off the sheet it checks:

      * THE GAS STORE, on a copy of `economics03_startup_years` (whose
        flowsheet still holds its 25 bar syngas in the storageTank `T101`)
        with a `gasStorage { unit T101; ... }` entry added to its postDict --
        the C92 witness `ammonia02_full_plant` no longer holds the syngas at
        all (Vitor's ruling on C92: it arrives by pipeline), so the link is
        exercised by this probe instead of by a shipped case.  Each vessel's
        autonomy is the unit's residenceTime_s, its mass flow the unit's, its
        stream the unit's inlet; rho(Pmax) and rho(Pmin) the SRK vapour root
        (kij 0); V_total = tau x F_mass / (rho_max - rho_min), N, V_R, D, H,
        the wall at Pmax - 1 atm, the weight and cost = weight x the price;
      * THE LIQUID STORE, on `ammonia02_full_plant` as shipped
        (`liquefiedGasStorage { unit T201; ... }`): each bullet's storage
        time, fill fraction and mass flow are the unit's KPIs; its liquid
        density the anchored Rackett recomputed here; V_total = tau x mdot /
        (rho x fill) EQUALS the unit's own vesselVolume_m3; N, V_R, D, L, the
        wall at designPressure - 1 atm, the weight, the cost; the inventory;
        and the BUBBLE PRESSURE equals the let-down drum's declared P (the
        stored liquid is that drum's liquid at that drum's temperature);
        every bullet placed LYING at its own D and L;
      * a FLOWSHEET-ONLY change doubles each store's V_total (T101 1 h on the
        gas copy, T201 96 h on a copy of ammonia02);
      * REFUSED BY NAME while the run exits 0: autonomy and stream beside
        `unit T101;`, `name T101;` with its own declarations (the implicit
        link), a liquefied store linked to the GAS T101 (on the gas copy);
        storageTime and fillFraction beside `unit T201;`, a liquefied store
        linked to a compressor, and a designPressure below the bubble
        pressure (on ammonia02).

    SABOTAGES, BY HAND, 2026-10-18, each in the engine source, rebuilt, this
    arm run alone, restored with `cp` and rebuilt:
      S1  GasStoreSize.cpp, linked route: t_s = 1800 s (a constant) in place
          of the unit's KPI -> FAILED (1 line): the flowsheet-only copy's
          T101 V_total did not double.  ONLY that probe sees it: the unit's
          half hour IS 1800 s -- a guard whose only case satisfies it is a
          guard nothing tests, which is why the copy moves the hold time.
      S2  GasStoreSize.cpp, liquefied route: fill = 0.9 in place of the
          unit's KPI -> FAILED (64 lines): fillFraction, V_total, V_R, D, the
          wall, the weight and the cost on every bullet.
      S3  the bubble-pressure refusal disabled (`false &&`) -> FAILED: the
          copy at 18 bar is not refused BY NAME.
      S4  StorageLink.cpp: the loop refusing the unit-owned keys disabled ->
          FAILED: the four `... declared here AND ...` probes here, and the
          four of arm (u).
      S5  the liquefied wall at ABSOLUTE pressure (the bank handed Pd + 1 atm)
          -> FAILED (28 lines): pressureDesign, t_wall, weight and the cost
          on every bullet.
    (S1-S5 were first run with the gas store on ammonia02's own T101; the
    C93 move re-ran S1 and S4 on the economics03 probe -- see the C93 commit.)
    NOT CHECKED: whether 100/27 bar, 22 bar, 250 K, 400 and 700 m3 and
    8 EUR/kg are the right design basis (declared assumptions); whether the
    case's SRK and Rackett are the TRUE densities; the main component's Psat
    printed beside the bubble pressure (a print, not a size); an UNLINKED
    pressurised liquid store (no corpus case has one)."""
    tag = "check_design_sheet(w)"
    case = ROOT / PRESSURE_STORES
    gcase = ROOT / GAS_STORE_PROBE
    post_nc = _strip_comments((case / "system" / "postDict").read_text(errors="replace"))
    liq = _entry_of(post_nc, "liquefiedGasStorage")
    if liq is None:
        problems.append("%s: %s declares no `liquefiedGasStorage` entry -- this arm "
                        "CANNOT RUN; it must not pass." % (tag, PRESSURE_STORES))
        return
    gas = GAS_STORE_ENTRY

    def word(ent, k):
        mm = re.search(r'\b%s\s+(\w+)\s*;' % k, ent)
        return mm.group(1) if mm else None
    gu, lu = word(gas, "unit"), word(liq, "unit")
    if not lu:
        problems.append("%s: %s's liquefied store is not linked (`unit <name>;`)."
                        % (tag, PRESSURE_STORES))
        return
    for k in ("storageTime", "fillFraction", "stream", "name"):
        if re.search(r'\b%s\b' % k, liq):
            problems.append("%s: the entry linking '%s' still declares `%s` -- the "
                            "unit is its one home." % (tag, lu, k))
    units = _flowsheet_units(case)
    gunits = _flowsheet_units(gcase)
    if lu not in units or units[lu][0] != "storageTank":
        problems.append("%s: `unit %s;` is not a storageTank of %s." % (tag, lu, PRESSURE_STORES))
        return
    if gu not in gunits or gunits[gu][0] != "storageTank":
        problems.append("%s: the gas probe's `unit %s;` is not a storageTank of %s -- the "
                        "probe no longer reaches the case it is about." % (tag, gu, GAS_STORE_PROBE))
        return

    def add_list(listname, entry):
        def ed(t):
            t2, n = re.subn(r'(\n    \);\n)(\}\s*\ncosting)',
                            r'\1    ' + listname + ' ( { ' + entry.replace('\\', '\\\\')
                            + r' } );\n\2', t, count=1)
            return t2 if n == 1 else t + "\n#error the probe found no sizing block\n"
        return ed

    def residence(unit, old, new):
        def ed(t):
            t2, n = re.subn(r'(name %s;.*?operation\s*\{\s*residenceTime\s+)%s;'
                            % (unit, re.escape(old)), r'\g<1>%s;' % new, t, count=1,
                            flags=re.S)
            return t2 if n == 1 else t + "\n#error the probe found no %s\n" % unit
        return ed

    #  The four runs together: the gas copy, its 1 h twin, ammonia02 as
    #  shipped and its 96 h twin.
    gcp = _copy_case(gcase, [("system/postDict", add_list("gasStorage", gas))])
    gcp2 = _copy_case(gcase, [("system/postDict", add_list("gasStorage", gas)),
                              ("system/flowsheetDict", residence(gu, "0.5 h", "1 h"))])
    lcp2 = _copy_case(case, [("system/flowsheetDict", residence(lu, "48 h", "96 h"))])
    procs = [subprocess.Popen([str(ROOT / "choupoSolve"), str(d)],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              text=True) for d in (gcp, gcp2, case, lcp2)]
    outs = [p.communicate() for p in procs]
    rcs = [p.returncode for p in procs]
    for d in (gcp, gcp2, lcp2):
        shutil.rmtree(d.parent, ignore_errors=True)
    gout, g2out, out, l2out = (o[0] for o in outs)
    for rc, what in zip(rcs, ("the gas probe", "the gas probe at 1 h", PRESSURE_STORES,
                              "ammonia02 at 96 h")):
        if rc != 0:
            problems.append("%s: %s failed (rc=%d)." % (tag, what, rc))
    if rcs[0] != 0 or rcs[2] != 0:
        return

    def material(c, ent):
        mat = word(ent, "material")
        rec_path = c / "constant" / "assets" / (mat + ".dat")
        if not rec_path.is_file():
            rec_path = ROOT / "data/standards/assets" / (mat + ".dat")
        return _record_scalars(rec_path, ("sigma_y", "density"))

    def vessels(c, V_total, vmax, LD, P_abs, ent):
        rec = material(c, ent)
        ca, _u = _entry_num(ent, "corrosionAllow")
        je, _u = _entry_num(ent, "jointEfficiency")
        N = max(1, math.ceil(V_total / vmax - 1e-9))
        V_R = V_total / N
        D = (4.0 * V_R / (math.pi * LD)) ** (1.0 / 3.0)
        H = LD * D
        Pg = (P_abs - 101325.0) * 1.0e-5
        sig = rec["sigma_y"] * 1.0e6
        t = Pg * 1.0e5 * D / (2.0 * sig * je - 1.2 * Pg * 1.0e5) + ca
        weight = rec["density"] * math.pi * D * H * t
        return N, V_R, D, H, Pg, t, weight

    def check_items(text, name, N, want, placed_lying, D, H):
        eq = [l for l in text.splitlines()
              if '"item": "%s/vessel' % name in l and '"values"' in l]
        if len(eq) != N:
            problems.append("%s: %s should be %d vessel(s), the result carries %d."
                            % (tag, name, N, len(eq)))
        for line in eq:
            item = re.search(r'"item": "([^"]+)"', line).group(1)
            for key, w in want.items():
                sub, k = key.split(".", 1)
                blk = re.search(r'"%s": \{([^}]*)' % sub, line)
                g = re.search(r'"%s": *(-?[0-9.eE+]+)' % re.escape(k),
                              blk.group(1) if blk else "")
                if not g or not close(float(g.group(1)), w, 1e-6):
                    problems.append("%s: %s %s = %s, recomputed %.9g."
                                    % (tag, item, key, g.group(1) if g else "(absent)", w))
            if not placed_lying:
                continue
            lay = next((l for l in text.splitlines()
                        if '"id": "%s"' % item in l and '"footprintFrom"' in l), "")
            o = re.search(r'"orientation": "(\w+)"', lay)
            dims = [float(re.search(r'"%s": *([-0-9.eE+]+)' % k, lay).group(1))
                    for k in ("dx", "dy", "dz")] if lay else []
            if not (lay and o and o.group(1) in ("alongX", "alongY")
                    and close(dims[2], D, 1e-6) and close(max(dims[0], dims[1]), H, 1e-6)):
                problems.append("%s: %s is not placed LYING on the plot plan at its own "
                                "D %.6g m and L %.6g m." % (tag, item, D, H))
        return len(eq)

    # ---- T101: the gas store, on the unit's hold time (the probe) ---------
    k = _json_line(gout, '"%s": {' % gu)
    tau, mdot_u = _num(k, "residenceTime_s"), _num(k, "massFlow_kg_s")
    sj = _stream_json(gout, gunits[gu][1])
    pmax, _u1 = _entry_num(gas, "maxPressure")
    pmin, _u2 = _entry_num(gas, "minPressure")
    T, _u3 = _entry_num(gas, "temperature")
    vmax, _u4 = _entry_num(gas, "maxVesselVolume")
    LD, _u5 = _entry_num(gas, "L_over_D")
    price, _u6 = _entry_num(gas, "steelPrice")
    if None in (tau, mdot_u, pmax, pmin, T, vmax, LD, price) or sj is None:
        problems.append("%s: T101's KPIs, its inlet's state or the probe's "
                        "declarations are missing -- nothing to recompute." % tag)
        return
    rmax = _srk_vapour_rho(gcase, sj["comp"], T, pmax * 1e5)
    rmin = _srk_vapour_rho(gcase, sj["comp"], T, pmin * 1e5)
    Vt = tau * sj["F_mass"] / (rmax - rmin)
    N, V_R, D, H, Pg, t, wgt = vessels(gcase, Vt, vmax, LD, pmax * 1e5, gas)
    want = {"values.autonomy": tau / 3600.0, "values.massFlow": mdot_u,
            "values.V_total": Vt, "values.V_R": V_R, "values.D": D, "values.H": H,
            "values.rho_max": rmax, "values.rho_min": rmin, "values.t_wall": t,
            "values.pressureDesign": Pg, "values.weight": wgt,
            "cost.totalModule": wgt * price}
    check_items(gout, gu, N, want, False, D, H)
    if '"%s.fraction"' % gunits[gu][1] not in next(
            (l for l in gout.splitlines()
             if '"item": "%s/vessel1"' % gu in l and '"values"' in l), ""):
        problems.append("%s: %s/vessel1 does not store the unit's inlet '%s'."
                        % (tag, gu, gunits[gu][1]))
    t101 = (N, V_R, D, t)

    # ---- T201: the pressurised liquid store ------------------------------
    k = _json_line(out, '"%s": {' % lu)
    tau2, fill, mdot2, vv = (_num(k, key) for key in
                             ("residenceTime_s", "fillFraction", "massFlow_kg_s",
                              "vesselVolume_m3"))
    sj2 = _stream_json(out, units[lu][1])
    pd, _u7 = _entry_num(liq, "designPressure")
    T2, _u8 = _entry_num(liq, "temperature")
    vmax2, _u9 = _entry_num(liq, "maxVesselVolume")
    LD2, _u10 = _entry_num(liq, "L_over_D")
    price2, _u11 = _entry_num(liq, "steelPrice")
    if None in (tau2, fill, mdot2, vv, pd, T2, vmax2, LD2, price2) or sj2 is None:
        problems.append("%s: T201's KPIs, its inlet's state or its store's "
                        "declarations are missing -- nothing to recompute." % tag)
        return
    rho, _excl = _anchored_rackett_rho(case, sj2["comp"], T2)
    Vt2 = tau2 * mdot2 / (rho * fill)
    if not close(Vt2, vv, 1e-6):
        problems.append("%s: T201's store V_total %.9g m3 recomputed against the "
                        "unit's own vesselVolume_m3 %.9g -- one declaration, two "
                        "homes that disagree." % (tag, Vt2, vv))
    N2, V_R2, D2, L2, Pg2, t2, wgt2 = vessels(case, Vt2, vmax2, LD2, pd * 1e5, liq)
    #  The let-down drum whose liquid T201 stores: the isothermal flash whose
    #  FIRST outlet (its liquid) is T201's inlet; its operating P is that
    #  liquid's bubble pressure at the drum's T, read off the flowsheetDict.
    fs_nc = _strip_comments((case / "system" / "flowsheetDict").read_text(errors="replace"))
    drum = re.findall(r'\{\s*name\s+\w+\s*;\s*type\s+isothermalFlash\s*;[^{}]*?'
                      r'outputs\s*\(\s*%s\b[^{}]*operation\s*\{[^{}]*?'
                      r'\bP\s+([0-9.]+)\s*bar' % re.escape(units[lu][1]), fs_nc)
    pdrum = float(drum[0]) if len(drum) == 1 else None
    want2 = {"values.storageTime": tau2 / 86400.0, "values.fillFraction": fill,
             "values.massFlow": mdot2, "values.rho": rho, "values.V_total": Vt2,
             "values.V_R": V_R2, "values.D": D2, "values.H": L2,
             "values.t_wall": t2, "values.pressureDesign": Pg2,
             "values.weight": wgt2, "cost.totalModule": wgt2 * price2,
             "inventory.mass.total": V_R2 * fill * rho}
    check_items(out, lu, N2, want2, True, D2, L2)
    first = next((l for l in out.splitlines()
                  if '"item": "%s/vessel1"' % lu in l and '"values"' in l), "")
    pb = _num(_item_values(first), "P_bubble")
    if pdrum is None or pb is None or not close(pb, pdrum * 1e5, 1e-6):
        problems.append("%s: T201's published bubble pressure %s Pa, and the let-down "
                        "drum whose liquid it stores operates at %s bar -- the liquid "
                        "is saturated there." % (tag, pb, pdrum))

    # ---- the flowsheet-only copies: both stores read their units ----------
    for rc, text, u, base, what in ((rcs[1], g2out, gu, Vt, "T101 at 1 h"),
                                    (rcs[3], l2out, lu, Vt2, "T201 at 96 h")):
        if rc != 0:
            continue
        ln = next((l for l in text.splitlines()
                   if '"item": "%s/vessel1"' % u in l and '"values"' in l), "")
        vt = _num(_item_values(ln), "V_total")
        if vt is None or not close(vt, 2.0 * base, 1e-6):
            problems.append("%s: with %s in the flowsheetDict ONLY, its store's "
                            "V_total = %s, expected %.9g -- the store is not sized on "
                            "the unit's value." % (tag, what, vt, 2.0 * base))

    # ---- refusals, each of the ITEM, never of the run ---------------------
    def edit_list(listname, f):
        return lambda tx: re.sub(r'(\b%s\s*\(\s*\{)([^}]*)(\})' % listname,
                                 lambda mm: mm.group(1) + f(mm.group(2)) + mm.group(3),
                                 tx, count=1)
    add = lambda extra: (lambda e: e + "  " + extra + "  ")
    liq_on_t101 = re.sub(r'\bunit\s+\w+\s*;', 'unit %s;' % gu, liq)
    #  (what, case, postDict edit, refused name, pattern, keep the layout)
    probes = (
        ("autonomy beside unit T101", gcase,
         add_list("gasStorage", gas + "  autonomy 1 h;"), gu,
         r'`autonomy` is declared here AND', True),
        ("stream beside unit T101", gcase,
         add_list("gasStorage", gas + "  stream makeup;"), gu,
         r'`stream` is declared here AND', True),
        ("the unit's name without the link", gcase,
         add_list("gasStorage", re.sub(r'\bunit\s+T101\s*;',
                  'name T101;  stream makeup;  autonomy 0.5 h;', gas)), gu,
         r"carries the name of the flowsheet storageTank unit .T101. but does not link it",
         True),
        ("a liquefied store linked to the gas T101", gcase,
         add_list("liquefiedGasStorage", liq_on_t101), gu,
         r"stream 'makeup' is a vapour", True),
        ("storageTime beside unit T201", case,
         edit_list("liquefiedGasStorage", add("storageTime 2 day;")),
         lu, r'`storageTime` is declared here AND', True),
        ("fillFraction beside unit T201", case,
         edit_list("liquefiedGasStorage", add("fillFraction 0.9;")),
         lu, r'`fillFraction` is declared here AND', True),
        ("a liquefied store linked to a compressor", case,
         edit_list("liquefiedGasStorage",
                   lambda e: re.sub(r'\bunit\s+T201\s*;', 'unit makeupComp;', e)),
         "makeupComp", r'is a `compressor`, not a `storageTank`', False),
        ("a design pressure below the bubble pressure", case,
         edit_list("liquefiedGasStorage",
                   lambda e: re.sub(r'\bdesignPressure\s+[^;]*;', 'designPressure 18 bar;', e)),
         lu, r'designPressure \(18 bar\) is BELOW the bubble pressure', True),
    )
    n_ref = 0
    #  `keep`: the plot plan stays (a refused store leaves its OWN items
    #  unplaced and announced, C79) -- except where the refused entry is
    #  named after ANOTHER unit, so T201's bullets name no sized item at all.
    for what, c, ed, name, pat, keep in probes:
        dst, rcp, outp, errp = _run_copy(c, ed, keep_layout=keep)
        if rcp != 0:
            problems.append("%s: the copy with %s failed (rc=%d) -- a refused store "
                            "must refuse the ITEM, never the run." % (tag, what, rcp))
        elif not re.search(r'%s\s+FAILED:[^\n]*%s' % (name, pat), outp + errp):
            problems.append("%s: a copy with %s is not refused BY NAME (/%s/)."
                            % (tag, what, pat))
        else:
            n_ref += 1
        shutil.rmtree(dst.parent, ignore_errors=True)

    notes.append("pressure stores: %s linked (probe on %s), %d vessel(s) of %.1f m3 "
                 "(D %.3f m, wall %.1f mm) on the unit's %g h; %s linked, %d bullet(s) of "
                 "%.1f m3 (D %.3f m x L %.3f m, wall %.1f mm) on the unit's %g h and fill "
                 "%g, V_total the unit's vesselVolume_m3, the bubble pressure the let-down "
                 "drum's %g bar; a flowsheet-only change doubles both; %d refusals by name"
                 % (gu, GAS_STORE_PROBE.split("/")[-1], t101[0], t101[1], t101[2],
                    t101[3] * 1000.0, tau / 3600.0, lu, N2, V_R2, D2, L2, t2 * 1000.0,
                    tau2 / 3600.0, fill, pdrum or float("nan"), n_ref))


def main() -> int:
    problems, notes = [], []

    all_units = []
    n1 = check_case(SECTORED, True,  problems, notes, all_units)
    n2 = check_case(FLAT,    False, problems, notes, all_units)
    n3 = check_case(COLUMN,  False, problems, notes, all_units)

    if n1 == 0:
        problems.append("%s: no sheet was checked at all -- the arms above "
                        "cannot fire." % SECTORED)
    if n2 == 0:
        problems.append("%s: no sheet was checked at all." % FLAT)
    if n3 == 0:
        problems.append("%s: no sheet was checked at all -- the 1:N address "
                        "is then exercised by nothing." % COLUMN)
    check_column_items(problems, notes)
    check_catalyst_bed(problems, notes)
    check_space_velocity_basis(problems, notes)
    check_exchanger_routes(problems, notes)
    check_storage(problems, notes)
    check_storage_link(problems, notes)
    check_inventory(problems, notes)
    check_exchanger_design(problems, notes)
    check_column_exchanger_design(problems, notes)
    check_material_limits(problems, notes)
    check_gas_store(problems, notes)
    check_pressure_store_link(problems, notes)

    check_ignored(problems)
    check_refusal(problems)
    check_basis_stated(problems)
    check_unit_words_readable(all_units, problems, notes)
    check_gui_fixture(problems, notes)

    if problems:
        print("check_design_sheet: FAILED")
        for p in problems:
            print("  " + p)
        return 1

    print("check_design_sheet: OK -- %d specification sheet(s) on the sectored "
          "witness, %d on the flat one and %d on the multi-item column "
          "(one flowsheet unit, five physical items -- shell, trays, "
          "condenser, reboiler, reflux drum -- whose two exchanger areas, "
          "tower height, per-section diameters and swage gap are RECOMPUTED "
          "here from the case declaration and the run KPIs, and whose tray "
          "stack's cost is RECOMPUTED by hand from its printed size with a "
          "sieve-tray set this gate transcribes from CAPCOST 2017 and ties to "
          "that program's own worked tower, while copies declaring no or an "
          "unknown tray material class refuse the trays BY NAME and mark the "
          "total INCOMPLETE) and on "
          "the kinetic-bed witness (one `pfr`, two items: the SHELL's V_R is "
          "the unit's own solved KPI to the sheet's printed precision, the "
          "CHARGE's mass and price are RECOMPUTED from the case's declared "
          "density and unit price with no index and no module factor, and two "
          "copies run without the price and without the density each refuse "
          "the charge BY NAME and mark the total INCOMPLETE) and on the "
          "space-velocity witness (the converter's V_R RECOMPUTED from its "
          "inlet KPI and the declared spaceVelocity on the NORMAL gas basis "
          "the case declares; a copy with no basis and one declaring "
          "`standard` each refused BY NAME, and one declaring `actual` "
          "recomputed on the unit's own T and P) and on the exchanger-routes "
          "witness's ESTIMATE TWIN (its exchanger designs taken out: every "
          "cooler declaring a `utility` has its LMTD and area "
          "RECOMPUTED from its own T_in/T_out KPIs, the declared U and the "
          "utility record; the rated interchanger's area is its own declared "
          "one; copies with an LMTD beside a utility, a temperature cross and "
          "a cooler with no basis each refused BY NAME) and on the same "
          "witness's six Kern DESIGNS (area, shell, five resistances, U, F, "
          "LMTD, utility flow and cost size RECOMPUTED from each sheet, the "
          "case and the records; four malformed designs refused BY NAME) and "
          "on the storage "
          "witness (the product tanks' density, volumes, count and three "
          "costs RECOMPUTED from the case's records, its declarations, the "
          "stream's own mass flow and the CAPCOST fixed-roof row; LOWER BOUND "
          "said per tank for refrigerated storage; a unitless storage time "
          "and a vapour stream refused BY NAME) and on the linked-storage "
          "witness (two tanks sized on their flowsheet units' own residence "
          "time, fill fraction and inlet; a flowsheet-only change moves its "
          "tank; the hold time, fill fraction, stream or name declared beside "
          "`unit`, the unit's name without the link and a link to a "
          "compressor refused BY NAME) and on the inventory "
          "witness (every held phase's density, mass and per-component split "
          "RECOMPUTED from the case's records and declarations, the tanks "
          "held to storageTime of production, the undeclared items listed as "
          "NOT DECLARED, three malformed declarations refused BY NAME) and on "
          "the material-limit witness (the converter copied into aluminium "
          "announces its record maxT ONCE, at its hottest port RECOMPUTED "
          "from the run's own stream states, and the caveat block replays "
          "it; the shipped SS316 case is silent; a copy of the column in "
          "aluminium at 60 bar announces its shell, reflux drum, condenser "
          "and reboiler once each, replayed, while the shipped column is "
          "silent; no sizer compares a record limit outside "
          "sizing/MaterialLimits, and every sizer calls it at least as often "
          "as it publishes a pressureDesign) and on the gas-store witness "
          "(the H2 buffer's working gas, vessel count, volume, diameter, wall, "
          "weight and inventory RECOMPUTED from its declared autonomy and "
          "pressures, the stream's own mass flow and SRK densities from the "
          "case's records; each vessel costed as its steel weight x the "
          "declared installed price, the Turton cost printed beside it as an "
          "announced extrapolation that enters no total; its full charge "
          "priced as raw-material stock; every vessel placed standing at its "
          "own D and H; the charging compressor in the caveat record; four "
          "malformed declarations refused BY NAME, and a missing price or "
          "price reason refusing the COST and marking the total INCOMPLETE) "
          "and on the pressure-store witnesses (a gas store on a probe copy "
          "of economics03 and ammonia02's pressurised "
          "liquid store LINKED to their storageTank units and sized on the "
          "units' own hold time, fill fraction and inlet -- the liquid "
          "store's volume equal to the unit's vesselVolume_m3 and its bubble "
          "pressure the let-down drum's own P, both recomputed; a "
          "flowsheet-only change doubles both stores; eight malformed "
          "declarations refused BY NAME), "
          "and on the column-exchanger witness (a column's condenser and "
          "reboiler DESIGNED with phase-change films: Nusselt with its tier "
          "correction, Rohsenow and the Zuber critical heat flux, the "
          "one-wall-temperature root, U, the area, the shell, the flows and "
          "the column's own process temperatures RECOMPUTED, h_fg held to the "
          "column's vapour traffic at 3 %%; five copies refuse the ITEM by "
          "name), "
          "each "
          "at the address its own "
          "sizing.csv row dictates (sector directory where the row names a "
          "sector, NO extra level where it does not); every `sizing {}` entry "
          "reproduces that row's cell AND carries a declared unit, every "
          "`cost {}` reproduces costs.csv, and each sheet's inlet and outlet "
          "mass flows sum to the unit's own row in massBalance_byUnit.csv "
          "(%s) -- a report this writer does not produce, which is the only "
          "arm that could catch a port mass computed without the crystals.  "
          "EVERY sizing unit word survives the tokenizer's own word-char set "
          "and is a name core/Units.cpp AND the GUI parser's mirror (gui/src/dict/units.ts) register, except the %d pinned in "
          "SHEET_UNIT_WORDS_UNPARSEABLE (whose remedy MOVES a "
          "number and is reserved) -- the arm that closed this gate's own "
          "declared blind spot and found three on the day it was written; and "
          "each GUI reader's transcribed fixture still matches the sheets the "
          "run just wrote -- header words, sizing triples AND port lines, in "
          "the test file that holds it.  A "
          "refusal for a value with no declared unit is still in the writer, "
          "and no sizer writes past `set()` (a SOURCE arm: a gate that "
          "rebuilds the engine is the 2026-08-18 shape, so the refusal was "
          "fired by hand under the journal instead -- see the docstring).  The tree is gitignored and excluded from the GUI case "
          "glob, and a NEW file under docs/design/ is NOT ignored -- both "
          "directions, because the obvious rule swallows this project's "
          "design records.  NOT CHECKED: that the engine's own parser accepts "
          "a sheet IN FULL (arms (h) and (k) cover its structure and its unit "
          "words, which is where every failure found so far lived, but neither "
          "is a round trip through Dictionary::fromFile), whether any number "
          "is RIGHT beyond the crystalliser volume (arm (j) recomputes THAT "
          "from the declared operation.volume, which is how a kmol holdup "
          "labelled m3 would have been caught), whether any stated basis is "
          "TRUE of its sizer (arm (i) only requires that every sizer states "
          "one), nesting deeper than one level (no corpus case nests twice), "
          "and every case but these THREE.  The GUI's Case tree is recursive "
          "since 2026-09-05 and carries its own tests."
          % (n1, n2, n3, "; ".join(notes[:3]) if notes else "no balance rows read",
             len(SHEET_UNIT_WORDS_UNPARSEABLE)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
