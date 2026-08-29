#!/usr/bin/env python3
"""Gate: a unit's MASS balance closes, and a broken one is never silent.

    bin/curate/check_mass_closure.py

WHY THIS EXISTS.  Reported by Vitor on 2026-08-09: flash21's mass balance
did not close and the run finished without a single warning.  Both halves
were real defects, and the second is the one that let the first travel.

  * THE ARITHMETIC.  Two mass surfaces disagreed about whether a crystal is
    matter.  The GLOBAL balance reads `componentMassFlow` (solids counted)
    and closed at 100.000 %; the PER-UNIT balance used `F_mass` = F*MW(z),
    the FLUID mass, and read 58.8 % -- the missing 857.5 kg/h being exactly
    the ice (47.6 kmol/h * 18.015).  `F_massTotal` is now the named
    whole-stream mass on every balance surface.
  * THE SILENCE.  The 58.8 was written into a CSV and the run exited 0 with
    nothing on screen, which is how it reached the owner instead of the
    engine.  A per-unit closure outside 0.1 % now warns on stderr and rides
    AdvisoryLog.

WHAT THIS CHECKS.
  (a) EVERY solid-bearing witness closes per unit: the cases below carry a
      crystal in `s[]`, which is precisely where the two surfaces used to
      disagree.  Closure is read from the case's own
      reports/balances/massBalance_byUnit.csv after a fresh run.
  (b) The GLOBAL and PER-UNIT surfaces AGREE on a solid-bearing case -- the
      arity claim itself, since agreeing by accident is what 100.000 % vs
      58.8 % looked like from the global side alone.
  (c) The warning EXISTS and is wired to both surfaces (stderr + advisory).

WHAT THIS DOES NOT CHECK, said plainly:
  * That the warning FIRES.  It cannot be provoked from a case file -- a
    non-closing unit is an engine defect, not something a dict can declare
    -- so it was SABOTAGE-VERIFIED by hand on 2026-08-09: reverting
    `F_massTotal` to `F_mass` in MassBalanceReport.cpp and rebuilding
    reproduced, with the warning firing on each:

        flash21 freezer01     58.8142 %   (-857.5 kg/h, the ice)
        crystalliser01 cryst  69.5143 %   (-2032.1 kg/h of sugar crystals)
        crystalliser05 cryst  94.2245 %   (-132.1 kg/h of NaCl)
        flash19 flash01       99.9063 %   (-1.9 kg/h; INSIDE the 0.1 % band,
                                           so no warning -- the same defect
                                           too small to be seen, which is
                                           why the band is a numerical
                                           tolerance and never a licence)

    THE CRYSTALLISERS WERE WRONG ALL ALONG.  This was never a flash21 bug:
    the per-unit surface has been dropping crystal product since crystal
    streams existed, and flash21 merely made the error large enough
    (41 %) for a human to notice.  Restoring `F_massTotal` returns all
    three to exactly 100.0000 %.  If that sabotage is ever repeated and
    does NOT fire, this gate is lying by omission.
  * Whether a closing balance is RIGHT: closure is conservation, not
    correctness.  A unit can conserve mass perfectly while computing the
    wrong split.
"""
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

#  Solid-bearing witnesses: each carries crystals in s[] on some stream.
CASES = [
    "tutorials/steady/flash/flash21_freeze_concentration",
    "tutorials/steady/flash/flash19_organic_and_precipitate",
    "tutorials/steady/flash/flash16_calcite_precipitation",
    "tutorials/steady/crystallisation/crystalliser01_sugar",
    "tutorials/steady/crystallisation/crystalliser05_nacl_pitzer",
]
BAND_PCT = 0.1


def closures(case: pathlib.Path):
    """(unit, closure_pct) rows from the case's per-unit balance."""
    f = case / "reports" / "balances" / "massBalance_byUnit.csv"
    if not f.is_file():
        return None
    rows = []
    for line in f.read_text().splitlines()[1:]:
        p = line.split(",")
        if len(p) >= 5:
            try:
                rows.append((p[0], float(p[4])))
            except ValueError:
                pass
    return rows


def global_closure(case: pathlib.Path):
    f = case / "reports" / "balances" / "massBalance.csv"
    if not f.is_file():
        return None
    for line in f.read_text().splitlines():
        if line.startswith("closure_pct"):
            try:
                return float(line.split(",")[-1])
            except ValueError:
                return None
    return None


def main() -> int:
    fail = []
    checked = 0
    for rel in CASES:
        case = ROOT / rel
        if not case.is_dir():
            fail.append(f"witness missing from the corpus: {rel}")
            continue
        r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(case)],
                           capture_output=True, text=True, timeout=900,
                           env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
        if r.returncode != 0:
            fail.append(f"{rel}: run failed (rc={r.returncode})")
            continue
        rows = closures(case)
        if rows is None:
            fail.append(f"{rel}: no massBalance_byUnit.csv -- the per-unit "
                        "surface did not run, and a check that cannot run "
                        "must not pass")
            continue
        for unit, pct in rows:
            checked += 1
            if abs(pct - 100.0) > BAND_PCT:
                fail.append(f"{rel}: unit '{unit}' closes at {pct:.4f} % "
                            "on MASS -- matter is not created or destroyed "
                            "by a unit operation")
        #  (b) the two surfaces must AGREE, not merely each look plausible.
        g = global_closure(case)
        if g is None:
            fail.append(f"{rel}: no global closure row")
        elif abs(g - 100.0) > BAND_PCT:
            fail.append(f"{rel}: GLOBAL closure {g:.4f} %")

    #  (c) the warning is wired to both surfaces.
    src = (ROOT / "src" / "reporting" / "MassBalanceReport.cpp").read_text()
    for needle, what in (("does not close on MASS", "the warning text"),
                         ("AdvisoryLog::instance().add", "the advisory leg"),
                         ("std::cerr", "the stderr leg")):
        if needle not in src:
            fail.append(f"{what} is gone from MassBalanceReport -- a broken "
                        "balance would finish silently again")
    if "F_massTotal" not in src:
        fail.append("MassBalanceReport no longer uses F_massTotal -- the "
                    "per-unit surface is back on FLUID mass and a crystal "
                    "has stopped being matter")

    #  (d) OBSERVER witness (reported by Vitor 2026-08-29, the OTHER way for
    #      this surface to lie): bubbleT01's only unit declares `outputs ( )`
    #      -- a saturation calculation that transforms no matter -- and the
    #      boundary balances used to publish closure 0 %, the ELEMENT BALANCE
    #      FAILED banner and a false "defect in the unit" warning about it.
    #      The truthful record: closure n/a, the reason in massBalance.meta,
    #      and NO warning, because nothing is wrong.
    obs = ROOT / "tutorials/steady/flash/bubbleT01_ethanol_water"
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(obs)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    blob = r.stdout + r.stderr
    gcsv = (obs / "reports/balances/massBalance.csv").read_text()
    meta = (obs / "reports/balances/massBalance.meta").read_text()
    if r.returncode != 0:
        fail.append("bubbleT01: run failed -- the observer arm cannot judge")
    if "closure_pct,,,n/a" not in gcsv:
        fail.append("bubbleT01: global closure is not n/a -- an observed "
                    "feed is being counted as boundary intake again")
    if "does not close on MASS" in blob:
        fail.append("bubbleT01: the false 'does not close' warning is back "
                    "on a unit that transforms no matter")
    if "ELEMENT BALANCE FAILED" in blob:
        fail.append("bubbleT01: the ELEMENT BALANCE FAILED banner fires on "
                    "a saturation observer")
    for needle, what in (("observerUnit.bubble01", "the observer unit"),
                         ("observedFeed.feed", "the observed feed"),
                         ("status,NOT_APPLICABLE", "the n/a status")):
        if needle not in meta:
            fail.append(f"bubbleT01: massBalance.meta lost {what} -- the "
                        "n/a would stand with no stated reason")

    #  (e) CLOSED CYCLE: rankine02 has no boundary material streams at all.
    #      0/0 used to print closure 0.0000; now n/a with the closedCycle
    #      reason, and the per-unit rows CARRY the verification -- so this
    #      arm also requires all four to close.
    cyc = ROOT / "tutorials/steady/power/rankine02_water"
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(cyc)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    if r.returncode != 0:
        fail.append("rankine02: run failed -- the closed-cycle arm cannot judge")
    gcsv = (cyc / "reports/balances/massBalance.csv").read_text()
    meta = (cyc / "reports/balances/massBalance.meta").read_text()
    if "closure_pct,,,n/a" not in gcsv:
        fail.append("rankine02: closed-cycle closure is not n/a -- 0/0 is "
                    "being printed as a verdict again")
    if "closedCycle" not in meta:
        fail.append("rankine02: massBalance.meta lost the closedCycle reason")
    rows = closures(cyc) or []
    if len(rows) < 4:
        fail.append("rankine02: fewer than 4 per-unit rows -- the surface "
                    "that carries the closed-cycle verification shrank")
    for unit, pct in rows:
        if abs(pct - 100.0) > BAND_PCT:
            fail.append(f"rankine02: unit '{unit}' at {pct:.4f} % -- the "
                        "cycle's own verification does not close")

    #  (f) NEGATIVE: an ordinary open case is untouched by the observer
    #      machinery -- numeric closure, status FULL, no observer rows.
    neg = ROOT / "tutorials/steady/flash/flash01_benzene_toluene"
    r = subprocess.run([str(ROOT / "bin" / "runCase"), "-f", str(neg)],
                       capture_output=True, text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    if r.returncode != 0:
        fail.append("flash01: run failed -- the negative arm cannot judge")
    g = global_closure(neg)
    meta = (neg / "reports/balances/massBalance.meta").read_text()
    if g is None or abs(g - 100.0) > BAND_PCT:
        fail.append(f"flash01: global closure {g} -- the observer machinery "
                    "touched an ordinary open case")
    if "status,FULL" not in meta or "observer" in meta:
        fail.append("flash01: meta is not a clean FULL -- observer rows on "
                    "a case with none")

    if fail:
        print("check_mass_closure: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"check_mass_closure: OK -- {checked} unit(s) across "
          f"{len(CASES)} solid-bearing case(s) close on MASS within "
          f"{BAND_PCT} %, the per-unit and global surfaces agree (both count "
          "the crystal), and the non-closure warning is wired to stderr AND "
          "the durable advisory surface.  Observer arm: bubbleT01 reports "
          "n/a with its reason in massBalance.meta and raises NO warning and "
          "no element banner; closed-cycle arm: rankine02 reports n/a with "
          "the closedCycle reason while its four per-unit rows carry the "
          "verification; negative: flash01 stays numeric FULL.  NOT CHECKED: "
          "that the non-closure warning FIRES (not provokable from a case "
          "file; verified by hand once by reverting F_massTotal -> F_mass, "
          "which reproduced flash21 at 58.8 % WITH the warning), and whether "
          "a closing balance is right -- closure is conservation, never "
          "correctness.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
