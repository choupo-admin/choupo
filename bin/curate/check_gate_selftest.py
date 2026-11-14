#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Meta-gate: a gate that cannot FAIL is not a gate.

    bin/curate/check_gate_selftest.py

WHY THIS EXISTS.  Ordered by Vitor 2026-08-07, against the failure mode this
project hit twice in one week -- a verifier printing PASS while no longer
observing the thing it claims to verify:

  * `check_true_ions` reported PASS on every run after BOTH its inputs had been
    deleted.  It was retired rather than repaired.
  * `check_ebullioscopic`'s K_f arm asserted the constant was unconsumed and was
    keyed on the ACCESSOR `K_f()`.  The promotion arrived through the INPUTS --
    SolidPhase reads subHfus()/subTripleT() directly -- so the arm went on
    printing "K_f is REFERENCE-ONLY and verified unconsumed: it cannot be
    derived (no record declares a heat of fusion)" while a record declared one,
    the engine derived from it, and a phase consumed it.  Every clause false,
    exit 0.

Both are the same defect and neither is detectable by reading the gate: the
code looks right, and it runs, and it says the reassuring thing.  The only
question that separates a live gate from a dead one is EMPIRICAL -- if the
condition it claims to catch were true right now, would it exit non-zero?

So this gate creates each condition and demands the failure.  Green here means
the covered gates were observed FAILING on purpose, not observed passing.

TWO SABOTAGE KINDS, because the two dead gates died differently.

  VACUITY -- remove the gate's primary INPUT.  This is the check_true_ions
  shape: the subject disappears and the gate, finding nothing to disagree with,
  agrees.  A gate must refuse to pass when it cannot see what it audits, and a
  gate that reports "0 problems found" over 0 records is reporting nothing.

  DETECTION -- corrupt a VALUE the gate claims to check.  This is the ordinary
  sense of a working gate, and it is the weaker of the two: a gate can detect a
  bad value and still be vacuous when the file goes missing.  Both are run.

WHAT THIS DOES NOT COVER, stated plainly because a meta-gate that implies more
than it has is worse than the gates it audits.

  * ONLY DATA-LEVEL SABOTAGE.  Every sabotage here edits a curated record, not
    C++ source.  A source sabotage needs a rebuild to be observed, and a gate
    harness that rebuilds the tree is a gate harness nobody will run.  So the
    engine-behaviour arms of these gates -- the refusals, the announcements --
    are NOT re-verified here; they were sabotage-verified by hand when written,
    and that verification is a moment in time, not a standing guarantee.  This
    is a real limit and it is the obvious next slice.
  * ONLY THE GATES LISTED BELOW.  The count of covered-versus-total is printed
    on every run, derived by counting both, never transcribed.  The uncovered
    ones are not implied to be sound; they are unaudited.

SAFETY (rewritten 2026-11-14, C394).  No sabotage is applied to the tree this
gate is run in: every arm runs in a WORKER, a copy of the tree outside it, and
the arms run in a pool (THE POOL, below the arm lists, says how and why).  In
the worker each sabotage is reverted from bytes held in memory, inside
try/finally and on SIGINT/SIGTERM, and compared by sha256.  A file with
uncommitted changes in the tree is still skipped and NAMED -- the worker
copies the edit, and a sabotage of a file mid-edit would test the edit.  At the
end, the sha256 of every sabotage subject and of every built artefact of the
tree must equal what they were before the pool started.
"""
import concurrent.futures
import errno
import fcntl
import hashlib
import os
import queue
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WATER = "data/standards/components/water.dat"

#  ASSEMBLED, NOT WRITTEN OUT -- and the reason is worth keeping.  The first
#  version of this file spelled the deprecated basis wording literally, to
#  inject it into a record and prove check_glossary_bans still catches it.
#  check_glossary_bans scans `bin/` and `.py`, so it caught THIS FILE, and the
#  suite went red on the gate that tests the scanner.  Correct behaviour, and a
#  general rule: A SCANNER'S TEST PAYLOAD MUST NOT BE A LITERAL IN A SCANNED
#  FILE.  Building it from fragments keeps the probe live without giving the
#  scanner a true positive to find in its own test.  Do not "simplify" this
#  back into one string -- the suite will fail, correctly, and the joined value
#  is what the ban's own regex matches, so the probe loses nothing.
BANNED_PROBE = "tr" + "ue" + " " + "basis"


#  Each entry: the gate, the file, and what is done to it.
#
#  `find`/`replace` is a literal substring swap -- deliberately not a regex.
#  A regex sabotage that silently matches nothing produces a gate run over an
#  UNCHANGED tree, which passes, which reads exactly like a gate that failed to
#  detect.  A literal swap can be verified to have changed the bytes, and is.
SABOTAGES = [
    {
        "gate": "check_ebullioscopic.py",
        "kind": "detection",
        "file": WATER,
        "find": "K_b",
        "replace": "K_b_DISABLED_BY_SELFTEST",
        "why": "water.dat's declared K_b is the anchor the derivation is "
               "cross-checked against.  Rename the key and the anchor is gone: "
               "the gate must notice that its comparison has no second side, "
               "rather than pass on the derivation alone.",
    },
    {
        "gate": "check_ebullioscopic.py",
        "kind": "vacuity",
        "file": WATER,
        "find": "Tb",
        "replace": "Tb_DISABLED_BY_SELFTEST",
        "why": "K_b = R*Tb^2*M/dHvap cannot be derived without Tb.  This is "
               "the check_true_ions shape -- an input removed.  The gate has "
               "an explicit arm for it ('the probe is stale, not the engine'), "
               "and this proves that arm is reached rather than assumed.",
    },
    {
        "gate": "check_ice_freezing.py",
        "kind": "detection",
        "file": WATER,
        "find": "Hfus",
        "replace": "Hfus_DISABLED_BY_SELFTEST",
        "why": "the crystal's reference fugacity and the derived K_f both come "
               "off the heat of fusion.  Removing it must break the gate, not "
               "quietly return an underived K_f that reads like the honest "
               "'no record declares one' answer -- which is precisely the "
               "sentence the old check_ebullioscopic printed while false.",
    },
    {
        "gate": "check_ion_pins.py",
        "kind": "vacuity",
        "file": "data/standards/components/NaCl.dat",
        "find": "dissolutionEnthalpy",
        "replace": "dissolutionEnthalpy_DISABLED_BY_SELFTEST",
        "why": "the ion-derived salt contract checks Hf_solid = "
               "sum(nu*hfAq) - dH_soln against each salt's declared anchor.  "
               "Take the heat of solution away and the comparison has no "
               "second side.  Verified 2026-08-07 to report 'ANCHOR FAIL: "
               "NaCl.dat has no dissolutionEnthalpy' rather than skipping the "
               "salt and passing -- silently skipping an unreadable subject is "
               "how a gate goes quietly vacuous.",
    },
    {
        "gate": "check_glossary_bans.py",
        "kind": "detection",
        "file": WATER,
        "find": "CAS ",
        "replace": "//  " + BANNED_PROBE + "  <- injected by selftest\nCAS ",
        "why": "the deprecated basis wording is banned -- ruled 2026-08-05, "
               "because a student reads a philosophical claim where the code "
               "means the species the equilibrium solver works in.  The ban is "
               "only worth having if the scanner still reaches every file it "
               "claims to, so the phrase is injected into a .dat under data/, "
               "one of the declared SCAN_ROOTS, and must be caught.",
    },
    {
        "gate": "check_lesson_references.py",
        "kind": "detection",
        "file": "gui/src/ui/methods/lessonReferences.json",
        "find": "\"method\": \"pdf\"",
        "replace": "\"method\": \"memory\"",
        "why": "a reference is admitted only with how it was verified "
               "(DEV.md 4c C259 (a)).  A verification method that is not one "
               "of crossref, pdf, catalogue, official -- 'memory' is the one "
               "the C259 audit caught resolving to a different paper -- must "
               "fail the gate, on every entry it touches.",
    },
    {
        "gate": "check_feature_documented.py",
        "kind": "detection",
        "file": "bin/curate/feature_documented_debt.tsv",
        "find": "ActivityModel\tcosmoSAC\t",
        "replace": "ActivityModel\tcosmoSAC_DISABLED_BY_SELFTEST\t",
        "why": "the debt pin is a ratchet (DEV.md 4c C338).  Rename a pinned "
               "row and the registered name cosmoSAC is undocumented AND "
               "unpinned (a NEW undocumented name) while the renamed row "
               "names nothing registered: the gate must fail on both, rather "
               "than pass over a pin list that no longer matches the tree.",
    },
    {
        "gate": "check_lesson_references.py",
        "kind": "vacuity",
        "file": "gui/src/ui/methods/lessonReferences.json",
        "find": "\"lessons\": {",
        "replace": "\"lessons_DISABLED_BY_SELFTEST\": {",
        "why": "with the lessons object gone there is nothing to audit; the "
               "gate must refuse rather than report '0 of 76 pages carry "
               "references' as a pass.",
    },
]


#  ---------------------------------------------------------------------
#  SOURCE-LEVEL SABOTAGE (2026-08-14) -- the slice this file named as next.
#
#  The docstring above declined it on the grounds that "a source sabotage
#  needs a rebuild, and a gate harness that rebuilds the tree is a gate
#  harness nobody will run".  That was true of a FULL rebuild and false of the
#  one actually needed: a one-file incremental `make all` was MEASURED at
#  3.3 s.  The objection was to a cost nobody had priced.
#
#  Two traps, both paid for by hand the same day and both guarded below:
#
#    * A SABOTAGE THAT DOES NOT COMPILE TESTS THE PREVIOUS BINARY.  The gate
#      then runs against the unsabotaged engine, passes, and reads exactly
#      like a gate that failed to detect.  So the build's exit status is
#      checked AND the binary's mtime must have advanced.  VERIFIED, not
#      asserted: replacing this arm's C++ with `this_is_not_valid_cxx(((;`
#      yields "the sabotage does NOT COMPILE, so the gate would have run
#      against the previous binary", exit 1.  That same probe is what exposed
#      the dead failure-check described at the source tier below -- before the
#      fix it printed OK and dropped the gate from its own results.
#    * A HARNESS THAT MUTATES THE BUILD MUST LEAVE IT CORRECT.  A data
#      sabotage left behind corrupts a record; a SOURCE sabotage left behind
#      corrupts the binary every later gate and every case runs against --
#      "a green run over the wrong binary looks exactly like a green run".
#      So the restore rebuilds, and the covered gates are re-run at the end
#      and must PASS, which is the only proof the tree came back.
#  Data-tier additions 2026-08-15, from the fleet census (A=38 B=6 C=34 D=62
#  across 140 gates): the best no-rebuild candidates, each guarding a settled
#  contract that had NO re-run sabotage evidence.  The retired-names probe is
#  ASSEMBLED (see BANNED_PROBE above): its token is a literal this scanner
#  would find in THIS file.
RETIRED_PROBE = "species" + "Map"

SABOTAGES += [
    {
        "gate": "check_golden_bands.py",
        "kind": "detection",
        "file": "bin/curate/golden_bands.tsv",
        "find": "\titer|.*iterations|.*evaluations\trel\t2.0\t",
        "replace": "\titer|.*iterations|.*evaluations\trel\t1e-4\t",
        "why": "the class table is what the cross-platform comparison is made "
               "of (C384): a count class that no longer gives 2.0 leaves the "
               "runner red on the rows it cannot reproduce, and the gate's "
               "transformation arm must fail it.",
    },
    {
        "gate": "check_golden_bands.py",
        "kind": "detection",
        "file": "tutorials/steady/flowsheets/proxy01_gas_loop/expected",
        "find": "H_closure_gap_kW 1.16937215466e-09 abs:7.012e-08\n",
        "replace": "H_closure_gap_kW 1.16937215466e-09 1e-4\n",
        "why": "a closure RESIDUAL with a relative band is a golden over "
               "round-off (C384): it must carry an absolute band written in "
               "the row, and the gate must fail the relative one.",
    },
]

SABOTAGES += [
    {
        "gate": "check_workspace_truth.py",
        "kind": "detection/poisoned-overlay",
        "file": "src/propertyOps/EvidencePartition.H",
        "find": "R5 SHIPPED 2026-08-11",
        "replace": "R5 SHIPPED [SELFTEST-REMOVED]",
        "why": "the workspace-truth gate detects the recycler's poisoned "
               "overlay by what it REMOVES: a dirty copy of this file "
               "lacking the shipped sentinel while HEAD carries it.  Erase "
               "the sentinel and P2 must refuse naming the file -- "
               "otherwise the overlay defence is a sentence in a docstring.",
    },
    {
        "gate": "check_legacy_schema.py",
        "kind": "detection",
        "file": "data/standards/parameters/Henry/Ar-water.dat",
        "find": "gasSpecies        Ar;",
        "replace": "gas               Ar;",
        "why": "the D2 migration is CLOSED: legacy `gas`/`dissolved` keys are "
               "gone from the dev corpus and the gate refuses them anywhere "
               "in standards.  Reintroduce one and it must fire -- otherwise "
               "the closed migration is quietly reopening.",
    },
    {
        "gate": "check_cosmo_scrub.py",
        "kind": "detection",
        "file": "data/standards/components/1Butene.dat",
        "find": "licence     externalRestricted;",
        "replace": "licence     externalRestricted;\n"
                   "        sigmaProfile ( 0.0 0.001 0.002 );",
        "why": "the VT-2005 licence separation ships ZERO restricted VALUES.  "
               "The first attempt flipped `installed false -> true` and the "
               "gate rightly ignored it -- a lying flag is not a value leak, "
               "and the meta-gate rejected the sabotage as PASSED-under-"
               "sabotage.  Injecting an actual sigmaProfile into a restricted "
               "set is the leak the scrub's own OK line claims to count.",
    },
    {
        "gate": "check_validity_windows.py",
        "kind": "detection",
        "file": "data/standards/components/water.dat",
        "find": "Trange        (273  373);",
        "replace": "Trange        (373  273);",
        "why": "AP3: an impossible interval (hi <= lo) must be refused -- "
               "extrapolation needs a real domain to extrapolate from.  "
               "water.dat is the most-read record in the tree.",
    },
    {
        "gate": "check_retired_names.py",
        "kind": "detection",
        "file": "data/standards/components/NaCl.dat",
        "find": "dissociatesTo  { Na 1; Cl 1; }",
        "replace": RETIRED_PROBE + "  { Na 1; Cl 1; }",
        "why": "the F2 campaign retired `speciesMap` in favour of "
               "dissociatesTo{} on COMPONENT RECORDS -- which is where the "
               "gate's regex looks.  The first attempt injected the token "
               "into a 0/ snapshot, outside the regex's file class, and the "
               "meta-gate rejected it as PASSED-under-sabotage.  The probe "
               "token is assembled because this file is inside the scanner's "
               "own scope (bin/curate .py).",
    },
    {
        "gate": "check_property_route_bench.py",
        "kind": "detection",
        "file": "data/standards/components/methanol.dat",
        "find": "Vliq        4.070e-5;",
        "replace": "Vliq        4.071e-5;",
        "why": "the bench pins every liquid-property route bit for bit "
               "(C378 slice 0, TR-16).  One stored liquid volume moved in "
               "its last digit moves methanol's density block and the "
               "water-methanol mixture block, and the gate must NAME them "
               "-- a hash of the total would only say that something moved.",
    },
    {
        "gate": "check_liquid_property_ratchet.py",
        "kind": "detection",
        "file": "bin/curate/liquid_property_ratchet_debt.tsv",
        "find": "src/unitOperations/heatTransfer/SprayDryer.cpp\tvliq\t6",
        "replace": "src/unitOperations/heatTransfer/SprayDryer.cpp\tvliq\t5",
        "why": "the ratchet must see a unit pricing a liquid property itself "
               "beyond its pin (C378 slice 0).  Lowering the spray dryer's pin "
               "below the six `.Vliq()` reads its source holds is the same as one "
               "new raw read: the gate must NAME the file, not pass.",
    },
    {
        "gate": "check_vliq_datum.py",
        "kind": "detection",
        "file": "data/standards/components/CO2.dat",
        "find": "VliqT       273.15;",
        "replace": "VliqT       298.15;",
        "why": "a record whose `Vliq` comment states 273 K but whose `VliqT` "
               "says 298.15 K is the TR-12 defect itself -- a datum read at "
               "a temperature it does not belong to (C378).  The gate must "
               "name CO2, not pass.",
    },
    {
        "gate": "check_source_headers.py",
        "kind": "detection",
        "file": "bin/curate/gate_claim.py",
        "find": "# Copyright (C) 2026 V\u00edtor Geraldes\n",
        "replace": "",
        "why": "a code file that loses its copyright line (DEV.md 4c C393) "
               "must make arm (a) name it: the gate is the only thing that "
               "keeps a file copied out of the tree carrying its holder.",
    },
    {
        "gate": "check_liquid_density_entry_callers.py",
        "kind": "detection",
        "file": "src/unitOperations/valve/Valve.cpp",
        "find": "#include \"thermo/LiquidPropertyDoor.H\"",
        "replace": "#include \"thermo/LiquidPropertyDoor.H\"\nstatic double c378Probe(const Choupo::liquidProperty::Request& q) { return Choupo::liquidProperty::density(q).value; }",
        "why": "the pilot's entry is scaffolding (C378): a unit beyond the "
               "pump and the CSTR that starts calling it is a fourth caller "
               "nobody decided.  The gate must NAME Valve.cpp.",
    },
]

SOURCE_SABOTAGES = [
    {
        "gate": "check_density_pilot.py",
        "kind": "source/unit-keeps-its-own-number",
        "file": "src/unitOperations/rotating/Pump.cpp",
        "find": "const scalar rho   = liquidProperty::density(densityAsk).value;   // kg/m^3",
        "replace": "const scalar rho   = liquidProperty::density(densityAsk).value * (1.0 + 1.0e-7);   // kg/m^3",
        "why": "the review's PP-04 (C378): a pump that takes the kernel's value and then "
               "prices with a number of its own -- here one part in 1e7 -- moves no "
               "golden the 1e-4 reltol can see.  The wiring arm compares the unit's "
               "density with the kernel's own double to 1e-9 and must NAME the pump.",
    },
    {
        "gate": "check_pure_fluid_phase_asked.py",
        "kind": "source/phase-dropped",
        "file": "src/unitOperations/rotating/Pump.cpp",
        "find": "thermo.H_real(T_in, P_in, x, DensityPhase::Liquid) + w_real;",
        "replace": "thermo.H_real(T_in, P_in, x) + w_real;",
        "why": "C378 pilot, defect 3: the pump's suction enthalpy asked "
               "without the phase the pump holds.  A suction on the "
               "saturation line is then read on whichever root the last bit "
               "of P picks -- the runner's 125 K pump.  The gate's seven "
               "perturbed suctions must disagree and NAME the spread.",
    },
    {
        "gate": "check_property_route_bench.py",
        "kind": "source/route-relabelled",
        "file": "src/thermo/liquidProperty/DensityLeaf.cpp",
        "find": "        case Route::anchoredRackett: return \"each component's \" + where + \" scaled to temperature by Rackett\";",
        "replace": "        case Route::anchoredRackett: return \"each component's \" + where + \", with no temperature effect (its record has no critical constants)\";",
        "why": "the door review's SB-3 (C378 slice 0, DR-11): the scaled route "
               "described with the flat route's words, every value unchanged.  "
               "The bench pins the door's method id and label per state "
               "(property_route_labels.sha256.tsv), so the relabelled blocks "
               "must be NAMED.",
    },
    {
        "gate": "check_property_source_witnesses.py",
        "kind": "source/site-retagged",
        "file": "src/thermo/liquidProperty/PureFluidLeaf.cpp",
        "find": ": \"referenceEquation.\" + equation_;",
        "replace": ": \"pureFluid.\" + equation_;",
        "why": "the door review's SB-2 (DR-11), carried to the pilot's kernel: "
               "the reference leaf a pump on pure water resolves to records "
               "the id of the case-selection route.  No value moves and the "
               "ratchet counts nothing; the witness of pump01_water must see "
               "the wrong sourceId.",
    },
    {
        "gate": "check_lumped_cp_note.py",
        "kind": "source/guard-removed",
        "file": "src/unitOperations/separation/Absorber.cpp",
        "find": "    if (nonIso) announceLumpedCpColumnEnergy(type(), verbosity);",
        "replace": "    announceLumpedCpColumnEnergy(type(), verbosity);",
        "why": "the note is a confession about the NON-isothermal energy "
               "model.  Fired unconditionally it also lands on isothermal "
               "columns, which make no temperature claim and have no such "
               "approximation -- a note that always fires carries no "
               "information.  A5 must catch it.",
    },
    {
        "gate": "check_convergence_residual.py",
        "kind": "source/acceptance-always-true",
        "file": "src/solver/Convergence.H",
        "find": "    if (normNow <= c.tolerance)",
        "replace": "    if (true)   /* SELFTEST */",
        "why": "the ONE convergence home decides `normFinal <= tolerance`.  "
               "Accept unconditionally and a DECLARED tolerance the run never "
               "meets is waved through as converged -- the silent pass the "
               "2026-08-09 ruling exists to prevent, since a dimensional "
               "residual is a magnitude and not a verdict.  The gate's "
               "unmeetable-tolerance arm must catch it.",
    },
    {
        "gate": "check_model_boundary_ledger.py",
        "kind": "source/filter-restored",
        "file": "src/reporting/EnergyBalanceReport.cpp",
        "find": "        if (r.kind != 0) continue;",
        "replace": "        if (r.kind != 0 || !r.declares) continue;",
        "why": "this restores the filter that limited the model-boundary "
               "audit to units DECLARING a duty, leaving every adiabatic "
               "boundary unaudited and its enthalpy step published as the "
               "unit's own duty at a trivially perfect closure.  A6 must "
               "catch it.",
    },
    {
        "gate": "check_estimated_species_announced.py",
        "kind": "detection",
        "file": "src/thermo/electrolyte/SaltFromCatalogue.H",
        "find": "    const Origin o = originFromWord(word);\n",
        "replace": "    const Origin o = originFromWord(word);\n    if (true) return;\n",
        "why": "silences the announcement of a species datum that is not a "
               "measurement.  The witness consumes an estimated hfAq, so arm "
               "(a) must see the missing line and the missing advisory.",
    },    {
        "gate": "check_ratebased_segment.py",
        "kind": "source/interface-energy-dropped",
        "file": "src/unitOperations/distillation/RateBasedSegment.cpp",
        "find": "                R[r++] = (eV - eL) / lamRef;",
        "replace": "                R[r++] = wt;   /* SELFTEST */",
        "why": "C329 B1: the interface energy balance is what fixes the two "
               "fluxes of a binary (the bootstrap) and what makes the bed's "
               "first law a CHECK and not an identity.  Replaced by equimolar "
               "counter-diffusion the rate model still converges, but e_V and "
               "e_L part, and the reboiler's own envelope no longer meets "
               "-Q_condenser: arm (2) must see the closure published "
               "notVerified (measured by hand: a 3.85 kW gap on ratebased01).",
    },
    {
        "gate": "check_packing_record.py",
        "kind": "source/reads-not-carried-back",
        "file": "src/unitOperations/distillation/PackingRecord.cpp",
        "find": "        if (!present.count(k)) continue;",
        "replace": "        continue;   /* SELFTEST */",
        "why": "C398 slice (e), review PK-05 (E2): a record-backed column solves "
               "on a COPY of its dictionary; without the reads carried back the "
               "case's own operation{} is audited as unread and the run tells "
               "the user that P, the condenser and the bed's diameter 'had NO "
               "effect'.  Arm (1) must see the audit speak on the witness.",
    },
    {
        "gate": "check_packing_record.py",
        "kind": "source/range-check-off",
        "file": "src/unitOperations/distillation/PackingRecord.cpp",
        "find": "    if (!inRange(f, v))",
        "replace": "    if (false && !inRange(f, v))   /* SELFTEST */",
        "why": "review PK-03 (E4): a void fraction of 1.5 must be refused in a "
               "record, under `installed` and inline alike; with the check off "
               "the bed runs to exit 0 on an impossible geometry.  Arm (7) must "
               "see its four range probes run.",
    },
    {
        "gate": "check_packing_record.py",
        "kind": "source/estimate-mark-dropped",
        "file": "src/unitOperations/distillation/PackingRecord.cpp",
        "find": "            how = \"nominal (record)\";\n            if (const auto* p = rec.provenanceOf(f))",
        "replace": "            how = \"nominal (record)\";\n            if (const auto* p = static_cast<const PackingRecord::Provenance*>(nullptr))   /* SELFTEST */",
        "why": "review E8: an estimated value in a packing record must say so on "
               "every run that uses it (the module-record contract); dropping "
               "the mark prints a guess as a nominal datum.  Arm (5) must see "
               "the nominal line lose its ESTIMATE note.",
    },
]


#  =====================================================================
#  THE POOL (DEV.md 4c C394, decision 3, 2026-11-14).
#
#  WHY.  The arms ran one after another: 20 data sabotages, 11 source
#  sabotages each followed by two rebuilds, 11 re-runs -- 383 s on an idle
#  machine and 688 s on the loaded sweep of 2026-11-14, one core most of the
#  time.  And two self-tests ran at once on 2026-11-13 and loaded twenty
#  compilers.
#
#  WHY NOT IN THE TREE.  Two arms cannot share one working tree: a sabotage of
#  water.dat is visible to every other gate running at that moment, which
#  would then fail for the WRONG reason and read as a detection -- a pool in
#  place would manufacture exactly the false evidence this gate exists to
#  refuse.  So each arm runs in a WORKER: a full copy of this tree outside it
#  (a `git clone --shared` of this repository, checked out at HEAD, with this
#  tree's uncommitted and untracked files and its build copied over), under
#  ~/.cache/choupo/gate-selftest/<this tree's hash>/w<i>.  The gate script that
#  runs is the worker's copy, so its ROOT is the worker; the tree this gate
#  was asked about is NEVER edited and its build is NEVER rebuilt -- which
#  also retires the 2026-08-18 failure (a self-test killed mid-sabotage left a
#  poisoned binary in the tree): there is no longer a sabotage in the tree to
#  leave behind.
#
#  WHAT MAKES A DETECTION HONEST IN A COPY: THE CONTROL.  Before any arm, every
#  covered gate runs in a clean worker and must PASS there.  An arm counts as
#  observed only if its gate passed unsabotaged in the pool and failed
#  sabotaged; a gate that fails in a copy for an environmental reason is
#  reported NOT OBSERVED, and fails this gate, never read as a detection.
#  (The old source tier re-ran its gates after the restore for the same
#  reason; the control now covers the data tier too.)
#
#  BOUNDED BY THE JOBS IT IS GIVEN: CHOUPO_GATE_JOBS, else CHOUPO_JOBS (which
#  bin/runTests exports from its -j), else every CPU less two, at most eight.
#  At most that many workers, at most that many gates at once, and ONE build
#  at a time (`make -j<jobs>`), so the compilers never exceed the job count.
#  CHOUPO_GATE_JOBS=1 is one worker, the arms in their old order.
#
#  ONE AT A TIME ON THIS MACHINE: a second self-test REFUSES while one is
#  alive (an flock on a per-user file outside every tree, so two worktrees
#  are refused too; the kernel drops the lock when its holder dies, so a
#  killed run leaves no stale lock).
#
#  RESTORED EVEN WHEN INTERRUPTED.  Every sabotage is undone in its worker in
#  try/finally from bytes held in memory and compared by sha256; SIGINT and
#  SIGTERM are turned into an orderly stop that kills the running children,
#  waits for every finally, and then restores from the registry whatever is
#  still sabotaged.  SIGKILL cannot be caught: a worker then keeps its
#  sabotage until the next self-test, whose sync resets it from this tree
#  (`checkout -f`, `clean -fd`, and the files and build copied again) before
#  anything runs -- and the tree itself had nothing to restore.
#  =====================================================================

LOCK = Path(os.environ.get("XDG_RUNTIME_DIR") or "/tmp") / \
    f"choupo-gate-selftest-{os.getuid()}.lock"
POOL_HOME = Path(os.environ.get("CHOUPO_SELFTEST_POOL") or
                 (Path.home() / ".cache" / "choupo" / "gate-selftest"))


def platform_dir(root=ROOT):
    base = root / "build"
    if not base.is_dir():
        return None
    c = [d for d in sorted(base.iterdir())
         if d.is_dir() and not d.name.endswith("Debug") and d.name != "wasm"
         and (d / "src").is_dir()]
    return c[0] if c else None


def gate_jobs():
    for var in ("CHOUPO_GATE_JOBS", "CHOUPO_JOBS"):
        raw = os.environ.get(var, "")
        if raw.isdigit() and int(raw) >= 1:
            return int(raw)
    try:
        n = len(os.sched_getaffinity(0))
    except (AttributeError, OSError):
        n = os.cpu_count() or 1
    return max(1, min(8, n - 2))


def sha(p: Path):
    try:
        return hashlib.sha256(p.read_bytes()).hexdigest()
    except OSError:
        return "MISSING"


def artefact_stamp(bdir):
    """Newest mtime across the built artefacts -- the evidence that a rebuild
    actually produced something, not that make decided it had nothing to do."""
    if bdir is None:
        return 0.0
    return max((f.stat().st_mtime for f in bdir.iterdir() if f.is_file()),
               default=0.0)


def has_no_subject(out):
    """True when the gate's own output says NO SUBJECT (exit 0, nothing observed)."""
    return any(l.startswith("NO SUBJECT") or ": NO SUBJECT --" in l for l in out.splitlines())


def dirty(rel):
    p = subprocess.run(["git", "status", "--porcelain", "--", rel],
                       capture_output=True, text=True, cwd=ROOT)
    return bool(p.stdout.strip())


#  ---- children: every one is registered, so a stop can kill them --------
_CHILDREN = set()
_CHILD_LOCK = threading.Lock()
STOP = threading.Event()


def run_child(argv, cwd, env, timeout):
    """(rc, output) of a child the stop path can kill."""
    if STOP.is_set():
        return 130, "(not started: the self-test is stopping)"
    p = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True)
    with _CHILD_LOCK:
        _CHILDREN.add(p)
    try:
        out, _ = p.communicate(timeout=timeout)
        return p.returncode, out
    except subprocess.TimeoutExpired:
        p.kill()
        out, _ = p.communicate()
        return 124, (out or "") + "\n(timed out)"
    finally:
        with _CHILD_LOCK:
            _CHILDREN.discard(p)


def kill_children():
    with _CHILD_LOCK:
        for p in list(_CHILDREN):
            try:
                p.terminate()
            except OSError:
                pass


#  ---- the workers ------------------------------------------------------
def _git(cwd, *args, check=True):
    p = subprocess.run(["git", "-C", str(cwd)] + list(args),
                       capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} in {cwd}: {p.stderr.strip()[:300]}")
    return p.stdout


class Worker:
    def __init__(self, path: Path):
        self.path = path
        env = dict(os.environ)
        for k in ("CHOUPO_SUITE_OUTPUTS", "CHOUPO_SUITE_SCOPE",
                  "CHOUPO_SUITE_SCOPE_KIND"):
            env.pop(k, None)
        env["PATH"] = os.pathsep.join(
            str(path) if e == str(ROOT) else str(path / "bin")
            if e == str(ROOT / "bin") else e
            for e in env.get("PATH", "").split(os.pathsep))
        env["CHOUPO_HOME"] = str(path)
        self.env = env
        #  a gate the pool runs must not take a pool of its own on top of it
        self.env["CHOUPO_GATE_JOBS"] = "1"
        self.env["CHOUPO_THREADS"] = "1"

    def sync(self, head, branch, changed, deleted, plat):
        w = self.path
        if not (w / ".git").exists():
            w.parent.mkdir(parents=True, exist_ok=True)
            if w.exists():
                shutil.rmtree(w)
            subprocess.run(["git", "clone", "--quiet", "--shared", "--no-checkout",
                            str(ROOT), str(w)], check=True, capture_output=True)
        _git(w, "fetch", "--quiet", str(ROOT), head, check=False)
        if branch:
            _git(w, "checkout", "--quiet", "-f", "-B", branch, head)
        else:
            _git(w, "checkout", "--quiet", "-f", "--detach", head)
        _git(w, "clean", "-fdq")                 # never -x: the build stays
        for rel in changed:                       # this tree's own edits
            src, dst = ROOT / rel, w / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            if dst.is_symlink() or dst.exists():
                dst.unlink()
            shutil.copy2(src, dst, follow_symlinks=False)
        for rel in deleted:
            if (w / rel).exists():
                (w / rel).unlink()
        #  The tracked sources keep THIS tree's mtimes, so the copied build is
        #  current in the worker and a sabotage rebuilds one file, not all.
        subprocess.run(["rsync", "-a", "--files-from=-", str(ROOT) + "/", str(w) + "/"],
                       input=_git(ROOT, "ls-files", "--", "src", "make", "Makefile",
                                  "generated"), text=True, check=True,
                       capture_output=True)
        (w / "build").mkdir(exist_ok=True)
        subprocess.run(["rsync", "-a", "--delete", str(plat) + "/",
                        str(w / "build" / plat.name) + "/"], check=True,
                       capture_output=True)
        gv = ROOT / "generated" / "gitVersion.H"
        if gv.is_file():
            shutil.copy2(gv, w / "generated" / "gitVersion.H")
        for link in ROOT.iterdir():               # ./choupoSolve and friends
            if link.is_symlink() and link.name.startswith("choupo"):
                tgt = w / link.name
                if tgt.is_symlink() or tgt.exists():
                    tgt.unlink()
                os.symlink(os.readlink(link), tgt)
        #  The private tiers are ignored and hold tracked files beside them:
        #  data/local is copied (small), each ignored entry of thirdParty/<x>/
        #  is linked (gigabytes, and read-only to every covered gate).
        if (ROOT / "data" / "local").is_dir():
            subprocess.run(["rsync", "-a", str(ROOT / "data" / "local") + "/",
                            str(w / "data" / "local") + "/"], check=True,
                           capture_output=True)
        tp = ROOT / "thirdParty"
        if tp.is_dir():
            for d in sorted(x for x in tp.iterdir() if x.is_dir()):
                (w / "thirdParty" / d.name).mkdir(parents=True, exist_ok=True)
                for e in d.iterdir():
                    dst = w / "thirdParty" / d.name / e.name
                    if not dst.exists() and not dst.is_symlink():
                        os.symlink(e, dst)

    def run_gate(self, name):
        return run_child([sys.executable, str(self.path / "bin" / "curate" / name)],
                         cwd=self.path, env=self.env, timeout=900)

    def rebuild(self, jobs, build_lock):
        with build_lock:
            rc, out = run_child(["make", "all", f"-j{jobs}"], cwd=self.path,
                                env=self.env, timeout=1800)
        return rc == 0, out[-2000:]


#  ---- what is sabotaged right now, for the stop path --------------------
_ACTIVE = {}             # Path in a worker -> original bytes
_ACTIVE_LOCK = threading.Lock()


def _restore_all():
    """Restore every sabotage still standing; -> files that would not."""
    bad = []
    with _ACTIVE_LOCK:
        for p, original in list(_ACTIVE.items()):
            try:
                p.write_bytes(original)
                if p.read_bytes() == original:
                    del _ACTIVE[p]
                    continue
            except OSError:
                pass
            bad.append(str(p))
    return bad


def _unsabotage(path: Path):
    with _ACTIVE_LOCK:
        original = _ACTIVE.pop(path, None)
    if original is None:
        return True
    path.write_bytes(original)
    return hashlib.sha256(path.read_bytes()).hexdigest() == \
        hashlib.sha256(original).hexdigest()


def arm_data(w: Worker, s):
    """One data arm in worker w -> (kind, message)."""
    path = w.path / s["file"]
    text = path.read_bytes().decode("utf-8")
    if s["find"] not in text:
        return "fail", (f"{s['gate']} [{s['kind']}]: the sabotage target '{s['find']}' "
                        f"is no longer present in {s['file']}.  The record moved and "
                        "this sabotage now changes NOTHING -- it would run the gate "
                        "over an unmodified tree and read the resulting PASS as "
                        "'undetected'.  Re-aim it.")
    try:
        with _ACTIVE_LOCK:
            _ACTIVE[path] = path.read_bytes()
        path.write_text(text.replace(s["find"], s["replace"]), encoding="utf-8")
        if path.read_bytes() == _ACTIVE[path]:
            return "fail", (f"{s['gate']} [{s['kind']}]: the tree did not actually "
                            "change; the sabotage is inert")
        rc, out = w.run_gate(s["gate"])
    finally:
        if not _unsabotage(path):
            return "fatal", (f"{s['file']} in the pool worker {w.path} was NOT "
                             "restored (sha256 differs); the next self-test resets "
                             "the worker from the tree")
    return _judge(s, rc, out, data=True)


def arm_source(w: Worker, s, jobs, build_lock):
    rel = s["file"]
    path = w.path / rel
    text = path.read_bytes().decode("utf-8")
    if s["find"] not in text:
        return "fail", (f"{s['gate']} [{s['kind']}]: the sabotage target is not in "
                        f"{rel} -- this arm is stale and is testing nothing, which is "
                        "the condition this file exists to refuse")
    bdir = platform_dir(w.path)
    try:
        before = artefact_stamp(bdir)
        with _ACTIVE_LOCK:
            _ACTIVE[path] = path.read_bytes()
        path.write_text(text.replace(s["find"], s["replace"], 1), encoding="utf-8")
        ok, log = w.rebuild(jobs, build_lock)
        if not ok:
            return "fail", (f"{s['gate']} [{s['kind']}]: the sabotage does NOT "
                            "COMPILE, so the gate would have run against the previous "
                            f"binary and its result would mean nothing.  Build tail: "
                            f"{log[-300:]}")
        if artefact_stamp(bdir) <= before:
            return "fail", (f"{s['gate']} [{s['kind']}]: the build produced no newer "
                            "artefact, so the sabotage never reached the binary the "
                            "gate runs")
        rc, out = w.run_gate(s["gate"])
    finally:
        #  The worker's source comes back at once; its BINARY is rebuilt by
        #  the next source arm that worker takes (the restored file is newer
        #  than its object), a source worker runs no data arm and no control,
        #  and every run starts by copying the tree's own build back over it --
        #  so no arm ever sees another's sabotage.
        if not _unsabotage(path):
            return "fatal", (f"could not restore {rel} in the pool worker {w.path}; "
                             "the next self-test resets the worker from the tree")
    return _judge(s, rc, out, data=False)


def _judge(s, rc, out, data):
    if rc == 0 and has_no_subject(out):
        return "ok", (f"{s['gate']} [{s['kind']}] -> NO SUBJECT on this platform "
                      "(the arm was NOT observed)")
    if rc == 0:
        if data:
            return "fail", (f"{s['gate']} [{s['kind']}] PASSED under sabotage.  "
                            f"{s['why']}\n      The gate exited 0 over a tree where the "
                            "condition it claims to detect was true.  Its last line was: "
                            + (out.strip().splitlines() or ["(no output)"])[-1][:200])
        return "fail", (f"{s['gate']} [{s['kind']}]: PASSED with the sabotage in the "
                        f"ENGINE and built into the binary.  {s['why']}")
    if rc in (124, 130) or STOP.is_set():
        return "fail", (f"{s['gate']} [{s['kind']}]: NOT OBSERVED -- the run was "
                        f"stopped or timed out (exit {rc})")
    return "ok", f"{s['gate']} [{s['kind']}] -> exit {rc}"


def acquire_lock():
    """-> an open file holding the machine-wide lock, or None (refused)."""
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    f = open(LOCK, "a+")
    try:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as e:
        if e.errno not in (errno.EAGAIN, errno.EACCES):
            raise
        f.seek(0)
        who = f.read().strip() or "an unknown process"
        f.close()
        print("check_gate_selftest: REFUSED -- another self-test is running on "
              f"this machine ({who}; lock {LOCK}).  Two at once loaded twenty "
              "compilers on 2026-11-13 (DEV.md 4c C394): wait for it, then run "
              "this again.  A check that cannot run must not pass.")
        return None
    f.seek(0)
    f.truncate()
    f.write(f"pid {os.getpid()}, tree {ROOT}, started "
            f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.flush()
    return f


def tree_snapshot(files):
    """sha256 of every file the arms touch and of the tree's binaries."""
    snap = {rel: sha(ROOT / rel) for rel in files}
    bdir = platform_dir()
    if bdir is not None:
        for f in sorted(bdir.iterdir()):
            if f.is_file():
                snap["build:" + f.name] = sha(f)
    return snap


def main() -> int:
    t_start = time.monotonic()
    fail, results, src_results = [], [], []
    total_gates = len(list((ROOT / "bin" / "curate").glob("check_*.py")))

    #  PRECONDITION.  Every subject exists here.
    for rel in sorted({s["file"] for s in SABOTAGES}):
        if not (ROOT / rel).exists():
            print(f"check_gate_selftest: FAILED\n  {rel} does not exist -- the "
                  "sabotage subject is gone, so this meta-gate is stale.  That "
                  "is exactly the condition it was built to catch, so it "
                  "refuses rather than reporting success over nothing.")
            return 1
    #  A DIRTY FILE IS SKIPPED, NOT FATAL -- but never silently.  (Kept from
    #  the in-place design: the workers copy this tree's edits, so a sabotage
    #  of a file mid-edit would test the edit, not the record; the arm is
    #  dropped and NAMED, reduced coverage that says it is reduced.)
    skipped = sorted(rel for rel in {s["file"] for s in SABOTAGES} if dirty(rel))
    src_skipped = sorted(rel for rel in {s["file"] for s in SOURCE_SABOTAGES}
                         if not (ROOT / rel).exists() or dirty(rel))
    data_arms = [s for s in SABOTAGES if s["file"] not in skipped]
    source_arms = [s for s in SOURCE_SABOTAGES if s["file"] not in src_skipped]
    if not data_arms and not source_arms:
        print("check_gate_selftest: FAILED\n  NOT ONE sabotage ran"
              + (" -- every target file has uncommitted changes ("
                 + ", ".join(skipped + src_skipped) + ")" if skipped or src_skipped else "")
              + ".  A green verdict over zero verified sabotages is the exact "
              "vacuity this gate exists to catch, so it refuses to give one.")
        return 1

    plat = platform_dir()
    if plat is None:
        print("check_gate_selftest: FAILED\n  no platform build under build/ -- the "
              "source tier has no binary to sabotage.  Run `make all`.")
        return 1
    jobs = gate_jobs()
    snap_files = sorted({s["file"] for s in SABOTAGES} | {s["file"] for s in SOURCE_SABOTAGES})
    snap_before = tree_snapshot(snap_files)

    #  ---- the pool -----------------------------------------------------
    gates = sorted({s["gate"] for s in data_arms + source_arms})
    n_workers = max(1, min(jobs, len(data_arms) + len(source_arms)))
    home = POOL_HOME / hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
    head = _git(ROOT, "rev-parse", "HEAD").strip()
    branch = _git(ROOT, "rev-parse", "--abbrev-ref", "HEAD").strip()
    branch = "" if branch == "HEAD" else branch
    changed = [l for l in _git(ROOT, "ls-files", "-m", "-o", "--exclude-standard",
                                "-z").split("\0") if l and (ROOT / l).exists()]
    deleted = [l for l in _git(ROOT, "ls-files", "-d", "-z").split("\0") if l]
    workers = [Worker(home / f"w{i}") for i in range(n_workers)]
    t0 = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=n_workers) as ex:
        errs = [f.exception() for f in [ex.submit(w.sync, head, branch, changed,
                                                   deleted, plat) for w in workers]]
    errs = [e for e in errs if e is not None]
    if errs:
        print("check_gate_selftest: FAILED\n  the pool could not be prepared "
              f"under {home}: {errs[0]}.  No arm ran.")
        return 1
    t_sync = time.monotonic() - t0
    #  WHO DOES WHAT.  A source arm leaves its worker's BINARY sabotaged until
    #  that worker's next build, so source arms get workers of their own (at
    #  most two: one builds while the other runs its gate, and the build lock
    #  lets one `make` run at a time) and never run a control or a data arm.
    #  With one worker, it does everything in order: controls, data, source.
    if n_workers >= 2 and source_arms:
        k = min(2, len(source_arms), n_workers - 1)
        src_workers, data_workers = workers[:k], workers[k:]
    else:
        src_workers = data_workers = workers
    free_data = queue.Queue()
    for w in data_workers:
        free_data.put(w)
    if src_workers is data_workers:
        free_src = free_data
    else:
        free_src = queue.Queue()
        for w in src_workers:
            free_src.put(w)
    build_lock = threading.Lock()

    def with_worker(q, fn, *a):
        w = q.get()
        try:
            if STOP.is_set():
                return "fail", "NOT RUN: the self-test was stopped"
            return fn(w, *a)
        finally:
            q.put(w)

    #  CONTROLS FIRST, on clean workers: a gate that does not pass unsabotaged
    #  in the pool cannot have an arm observed there.
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(data_workers)) as ex:
        ctrl = dict(zip(gates, ex.map(
            lambda g: with_worker(free_data, lambda w, g: w.run_gate(g), g), gates)))
    bad_ctrl = {g: ro for g, ro in ctrl.items() if ro[0] != 0}

    #  THE ARMS, results kept in the order the lists above declare them.
    tasks = [("data", s) for s in data_arms] + [("source", s) for s in source_arms]

    def do(task):
        kind, s = task
        if s["gate"] in bad_ctrl:
            rc, out = bad_ctrl[s["gate"]]
            last = (str(out).strip().splitlines() or ["(no output)"])[-1][:200]
            return "fail", (f"{s['gate']} [{s['kind']}]: NOT OBSERVED -- the gate "
                            f"FAILS in the pool's copy of the tree WITHOUT the "
                            f"sabotage (exit {rc}: {last}), so a failure under "
                            "sabotage would prove nothing")
        if kind == "data":
            return with_worker(free_data, arm_data, s)
        return with_worker(free_src, arm_source, s, jobs, build_lock)

    t_arms = time.monotonic()
    if src_workers is data_workers:          # one worker: everything in order
        outcome = [do(t) for t in tasks]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(src_workers)) as exs, \
                concurrent.futures.ThreadPoolExecutor(max_workers=len(data_workers)) as exd:
            futs = [(exs if t[0] == "source" else exd).submit(do, t) for t in tasks]
            outcome = [f.result() for f in futs]
    t_arms = time.monotonic() - t_arms

    for (kind, s), (verdict, msg) in zip(tasks, outcome):
        if verdict == "fatal":
            print("check_gate_selftest: FAILED\n  " + msg)
            return 1
        if verdict == "fail":
            fail.append(msg)
        else:
            (results if kind == "data" else src_results).append(msg)

    #  THE TREE WAS NOT TOUCHED -- the proof the old design took by re-running
    #  the gates after a restore, taken here by hash: every file an arm
    #  sabotages and every binary of this tree's build is byte-identical to
    #  what it was before the pool started.
    snap_after = tree_snapshot(snap_files)
    moved = sorted(k for k in snap_before if snap_after.get(k) != snap_before[k])
    if moved:
        print("check_gate_selftest: FAILED\n  the tree under test CHANGED while "
              "the pool ran (" + ", ".join(moved[:5]) + "): the self-test never "
              "edits it, so something else did, and nothing measured here can "
              "be trusted.  Re-run when the tree is quiet.")
        return 1

    if fail:
        print("check_gate_selftest: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    if not results and not src_results:
        print("check_gate_selftest: FAILED\n  NOT ONE sabotage was observed.  A "
              "green verdict over zero verified sabotages is the exact vacuity "
              "this gate exists to catch, so it refuses to give one.")
        return 1

    #  COVERAGE COUNTS ARMS THAT WERE OBSERVED, never arms that were merely
    #  attempted: an arm that failed reaches the FAILED path above, so by here
    #  every gate named in the results really did fail on purpose.
    n_cov = len({r.split()[0] for r in results + src_results})
    print(
        "check_gate_selftest: OK -- every sabotage below was OBSERVED failing "
        "its gate, not assumed to.  "
        + "; ".join(results + src_results) + ".  "
        + (f"SKIPPED (uncommitted changes, so the original could not be "
           f"vouched for): {', '.join(skipped + src_skipped)} -- coverage is "
           "lower than it looks on this run.  " if skipped or src_skipped else "")
        + f"COVERAGE IS {n_cov} of {total_gates} gates, and the other "
        f"{total_gates - n_cov} are UNAUDITED -- not implied sound.  Both "
        "sabotage kinds are exercised at the DATA tier: an input REMOVED (the "
        "check_true_ions shape, where the subject disappears and the gate "
        "agrees with nothing) and a value CORRUPTED.  The SOURCE tier "
        "(2026-08-14) edits the ENGINE, rebuilds, and requires the gate to "
        "fail on the rebuilt binary -- with the build's exit status AND a "
        "newer artefact both checked, because a sabotage that does not "
        "compile silently tests the previous binary.  THE POOL (C394): "
        f"{len(tasks)} arms in {n_workers} worker copies of this tree, "
        f"{len(src_workers) if src_workers is not data_workers else 0} of them "
        f"for the source tier, at most {jobs} jobs and one build at a time "
        f"(sync {t_sync:.0f} s, arms {t_arms:.0f} s, "
        f"{time.monotonic() - t_start:.0f} s in all), "
        f"each covered gate first required to PASS unsabotaged in the pool "
        f"({len(gates)} controls); this tree was never edited and its "
        f"build never rebuilt, verified by sha256 of the {len(snap_files)} "
        "sabotage subjects and every built artefact.  NOT COVERED: "
        "the gates not listed, and any defect needing more than a "
        "single-substring edit to express.")
    return 0


def guarded_main() -> int:
    """The lock, then main(), with every stop turned into a restore.

    WHY THERE IS NO DESTRUCTIVE JOURNAL ANY MORE (C394, 2026-11-14).  From
    2026-08-18 to 2026-11-14 this gate sabotaged the tree it was run in and
    declared that in a disk journal (destructive_session.py), because a
    SIGKILL mid-sabotage left a poisoned build behind and every harness that
    produces evidence had to refuse while the journal stood.  The arms now
    run in worker copies OUTSIDE the tree (THE POOL, above), so the tree and
    its build are never mutated -- the hazard the journal declared does not
    occur, and the tree's state is verified by hash at the end instead.
    destructive_session.py stays for any future gate that must mutate the
    tree; this one no longer does.
    """
    lock = acquire_lock()
    if lock is None:
        return 1

    def on_signal(signum, _frame):
        STOP.set()
        kill_children()
        raise KeyboardInterrupt(f"signal {signum}")

    old_int = signal.signal(signal.SIGINT, on_signal)
    old_term = signal.signal(signal.SIGTERM, on_signal)
    try:
        return main()
    except KeyboardInterrupt as e:
        STOP.set()
        kill_children()
        #  give the threads their finally blocks, then restore what is left
        deadline = time.monotonic() + 60
        while _ACTIVE and time.monotonic() < deadline:
            time.sleep(0.2)
        bad = _restore_all()
        print(f"check_gate_selftest: INTERRUPTED ({e}) -- the tree under test "
              "was never edited; every sabotage in the pool's worker copies was "
              + ("restored, byte for byte." if not bad else
                 "restored EXCEPT " + ", ".join(bad) + " (the next self-test "
                 "resets the workers from the tree before anything runs)."))
        return 130
    finally:
        signal.signal(signal.SIGINT, old_int)
        signal.signal(signal.SIGTERM, old_term)
        try:
            fcntl.flock(lock, fcntl.LOCK_UN)
            lock.close()
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(guarded_main())
