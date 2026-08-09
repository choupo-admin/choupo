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
  (e) flash13_acetic_ethanol_vacuum_flash keeps a LARGE duty -- the
      negative control.  Its feed is at 1 atm and it operates at 0.65 atm,
      so its 669 kW is genuine pressure-drop work; a gate that drove every
      flash duty to zero would be measuring its own wish.  This arm exists
      because the first blast-radius sweep DID predict flash13 would move
      (it compared temperature and forgot pressure).

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
    there is no closed form to assert -- they ride their goldens.
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
          "pressure-drop duty.  NOT CHECKED: whether a NON-zero duty is right "
          "(only the identity has a closed form), and the multi-condition "
          "cases, which ride their goldens.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
