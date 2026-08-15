#!/usr/bin/env python3
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

SAFETY.  Every sabotage is applied to the working tree and reverted from bytes
held in memory, inside try/finally.  The gate REFUSES TO START if any file it
would touch has uncommitted changes -- it cannot promise to restore an edit it
did not make.  After each revert the bytes are compared to the original, and a
failed restore is a hard error naming the file, because leaving a corrupted
record behind would be far worse than any missed check.
"""
import subprocess
import sys
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
SOURCE_SABOTAGES = [
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
]


def platform_dir():
    base = ROOT / "build"
    if not base.is_dir():
        return None
    c = [d for d in sorted(base.iterdir())
         if d.is_dir() and not d.name.endswith("Debug") and d.name != "wasm"]
    return c[0] if c else None


def rebuild():
    p = subprocess.run(["make", "all", "-j4"], capture_output=True, text=True,
                       cwd=ROOT, timeout=1800)
    return p.returncode == 0, (p.stdout + p.stderr)[-2000:]


def artefact_stamp(bdir):
    """Newest mtime across the built artefacts -- the evidence that a rebuild
    actually produced something, not that make decided it had nothing to do."""
    if bdir is None:
        return 0.0
    return max((f.stat().st_mtime for f in bdir.iterdir() if f.is_file()),
               default=0.0)


def run_gate(name):
    p = subprocess.run([sys.executable, str(ROOT / "bin" / "curate" / name)],
                       capture_output=True, text=True, timeout=900, cwd=ROOT)
    return p.returncode, (p.stdout + p.stderr)


def dirty(rel):
    p = subprocess.run(["git", "status", "--porcelain", "--", rel],
                       capture_output=True, text=True, cwd=ROOT)
    return bool(p.stdout.strip())


def main() -> int:
    fail, results = [], []

    total_gates = len(list((ROOT / "bin" / "curate").glob("check_*.py")))
    covered = sorted({s["gate"] for s in SABOTAGES})

    #  PRECONDITION.  Restoring is only a promise this can keep over files it
    #  alone edited.
    for rel in sorted({s["file"] for s in SABOTAGES}):
        if not (ROOT / rel).exists():
            print(f"check_gate_selftest: FAILED\n  {rel} does not exist -- the "
                  "sabotage subject is gone, so this meta-gate is stale.  That "
                  "is exactly the condition it was built to catch, so it "
                  "refuses rather than reporting success over nothing.")
            return 1
    #  A DIRTY FILE IS SKIPPED, NOT FATAL -- but never silently.  Failing the
    #  whole suite because someone is mid-edit on a record is how a gate gets
    #  commented out, and a disabled gate checks nothing at all.  So the
    #  sabotage is dropped and NAMED in the verdict, which is the honest
    #  trade: reduced coverage that says it is reduced.  If every sabotage is
    #  skipped there is nothing left to report and the gate fails, because a
    #  green line over zero verified sabotages is precisely the vacuity this
    #  gate exists to catch.
    skipped = []
    for rel in sorted({s["file"] for s in SABOTAGES}):
        if dirty(rel):
            skipped.append(rel)

    for s in SABOTAGES:
        if s["file"] in skipped:
            continue
        path = ROOT / s["file"]
        original = path.read_bytes()
        text = original.decode("utf-8")

        if s["find"] not in text:
            fail.append(
                f"{s['gate']} [{s['kind']}]: the sabotage target '{s['find']}' "
                f"is no longer present in {s['file']}.  The record moved and "
                "this sabotage now changes NOTHING -- it would run the gate "
                "over an unmodified tree and read the resulting PASS as "
                "'undetected'.  Re-aim it.")
            continue

        try:
            path.write_text(text.replace(s["find"], s["replace"]),
                            encoding="utf-8")
            if path.read_bytes() == original:
                fail.append(f"{s['gate']} [{s['kind']}]: the tree did not "
                            "actually change; the sabotage is inert")
                continue
            rc, out = run_gate(s["gate"])
        finally:
            path.write_bytes(original)

        if path.read_bytes() != original:
            print(f"check_gate_selftest: FAILED\n  {s['file']} was NOT "
                  "restored after sabotage.  Restore it by hand from git "
                  "before anything else -- a corrupted curated record is worse "
                  "than every check this gate performs.")
            return 1

        if rc == 0:
            fail.append(
                f"{s['gate']} [{s['kind']}] PASSED under sabotage.  "
                f"{s['why']}\n      The gate exited 0 over a tree where the "
                "condition it claims to detect was true.  Its last line was: "
                + (out.strip().splitlines() or ["(no output)"])[-1][:200])
        else:
            results.append(f"{s['gate']} [{s['kind']}] -> exit {rc}")

    #  THE FAILURE CHECK LIVES BELOW THE SOURCE TIER, and it has to.
    #  It used to sit HERE, above it -- so every `fail.append` the source tier
    #  makes landed after the only code that reads the list, and a
    #  non-compiling source sabotage printed OK while quietly dropping its
    #  gate from the results.  Found by sabotaging this file's own sabotage
    #  (replacing the C++ with `this_is_not_valid_cxx(((;`) and watching it
    #  report success.  A check that cannot fail, inside the gate that exists
    #  to catch checks that cannot fail, added by the person extending it.
    #  Do not move this block back up.

    # ---- SOURCE TIER -------------------------------------------------
    src_results, src_skipped = [], []
    bdir = platform_dir()
    for src in SOURCE_SABOTAGES:
        rel = src["file"]
        if not (ROOT / rel).exists() or dirty(rel):
            src_skipped.append(rel)
            continue
        path = ROOT / rel
        original = path.read_bytes()
        text = original.decode("utf-8")
        if src["find"] not in text:
            fail.append(f"{src['gate']} [{src['kind']}]: the sabotage target "
                        f"is not in {rel} -- this arm is stale and is testing "
                        f"nothing, which is the condition this file exists to "
                        f"refuse")
            continue
        try:
            before = artefact_stamp(bdir)
            path.write_text(text.replace(src["find"], src["replace"], 1))
            ok, log = rebuild()
            if not ok:
                fail.append(f"{src['gate']} [{src['kind']}]: the sabotage does "
                            f"NOT COMPILE, so the gate would have run against "
                            f"the previous binary and its result would mean "
                            f"nothing.  Build tail: {log[-300:]}")
            elif artefact_stamp(bdir) <= before:
                fail.append(f"{src['gate']} [{src['kind']}]: the build produced "
                            f"no newer artefact, so the sabotage never reached "
                            f"the binary the gate runs")
            else:
                rc, _ = run_gate(src["gate"])
                if rc == 0:
                    fail.append(f"{src['gate']} [{src['kind']}]: PASSED with "
                                f"the sabotage in the ENGINE and built into "
                                f"the binary.  {src['why']}")
                else:
                    src_results.append(f"{src['gate']} [{src['kind']}] -> "
                                       f"exit {rc}")
        finally:
            path.write_bytes(original)
            if path.read_bytes() != original:
                print("check_gate_selftest: FAILED\n  could not restore "
                      + rel + " -- the tree is left SABOTAGED.  Fix by hand "
                      "before running anything else.")
                return 1
            ok, log = rebuild()
            if not ok:
                print("check_gate_selftest: FAILED\n  the RESTORE build "
                      "failed for " + rel + ".  The source is back but the "
                      "binary is not; every later gate and case would run "
                      "against a sabotaged engine.  Build tail: " + log[-300:])
                return 1

    #  THE ONLY PROOF THE TREE CAME BACK.  Bytes restored and a build that
    #  exits 0 are necessary, not sufficient -- the gates themselves must
    #  agree, on the rebuilt binary, that nothing is wrong any more.
    for src in SOURCE_SABOTAGES:
        if src["file"] in src_skipped:
            continue
        rc, out = run_gate(src["gate"])
        if rc != 0:
            print("check_gate_selftest: FAILED\n  " + src["gate"] + " does "
                  "NOT pass after its source sabotage was reverted and the "
                  "tree rebuilt.  The restore is incomplete.\n  " + out[-400:])
            return 1

    if fail:
        print("check_gate_selftest: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    if not results and not src_results:
        print("check_gate_selftest: FAILED\n  NOT ONE sabotage ran"
              + (" -- every target file has uncommitted changes ("
                 + ", ".join(skipped + src_skipped) + ")" if skipped or src_skipped else "")
              + ".  A green verdict over zero verified sabotages is the exact "
              "vacuity this gate exists to catch, so it refuses to give one.")
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
           f"vouched for): {', '.join(skipped)} -- coverage is lower than it "
           "looks on this run.  " if skipped else "")
        + f"COVERAGE IS {n_cov} of {total_gates} gates, and the other "
        f"{total_gates - n_cov} are UNAUDITED -- not implied sound.  Both "
        "sabotage kinds are exercised at the DATA tier: an input REMOVED (the "
        "check_true_ions shape, where the subject disappears and the gate "
        "agrees with nothing) and a value CORRUPTED.  The SOURCE tier "
        "(2026-08-14) edits the ENGINE, rebuilds, and requires the gate to "
        "fail on the rebuilt binary -- with the build's exit status AND a "
        "newer artefact both checked, because a sabotage that does not "
        "compile silently tests the previous binary.  The source is then "
        "restored, rebuilt, and the covered gates RE-RUN and required to "
        "pass, which is the only proof the tree came back.  NOT COVERED: "
        "the gates not listed, and any defect needing more than a "
        "single-substring edit to express.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
