#!/usr/bin/env python3
"""Gate: a declared Cp validity window is USED, and its two failures differ.

    bin/curate/check_cp_range_announced.py

WHY THIS EXISTS.  `PolynomialCp` -- the most common heat-capacity model in the
corpus -- assigned `Tmin_`/`Tmax_` in its constructor and NEVER READ THEM
AGAIN.  The declared validity window was parsed and discarded, so invariant I4

    "a number outside its fitted range is ANNOUNCED, never silently
     extrapolated and never refused"

was not implemented on that path at all.

It also explains why the six inverted windows the provenance audit pinned did
no visible harm: nothing looked at them.  HARMLESS-BECAUSE-UNCHECKED IS NOT
SAFETY.  `check_validity_windows` gated the DATA while the engine ignored the
field -- the same shape as the review-status defect found the same day.

TWO FAILURES, TWO SENTENCES, and the gate checks they stay distinct:

  * NOT A WINDOW (hi <= lo).  "Outside the range" would be nonsense here --
    every T is outside an empty interval -- so the message names the DEFECT:
    the fit's domain is unknown and the Cp carries no validity claim.
  * OUTSIDE A VALID WINDOW.  Announced, and the value still returned.  I4 is
    explicit that extrapolation is a legitimate choice knowingly made.

If those two ever collapse into one message, a reader can no longer tell "you
extrapolated" from "this record is broken", and the second is the one that
needs curation rather than judgement.

THE NEGATIVE IS THE LOAD-BEARING CHECK.  An in-range evaluation must be
SILENT.  Sweeping the corpus, only 2 of 40 steady cases announce; if that ever
becomes most of them the announcement has stopped being information.  This
gate therefore requires a known-silent case to stay silent AND a known-loud
one to stay loud -- a warning that fires everywhere is read nowhere.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
PROPS = ROOT / "build" / "linux64Gcc" / "choupoProps"

SILENT = "tutorials/steady/flash/flash01_benzene_toluene"
LOUD = "tutorials/steady/drying/solidDryer01_sugar"

#  A record whose liquid-Cp window is inverted (hi <= lo).  Pinned in
#  check_validity_windows as awaiting re-derivation; used here as the fixture
#  for the OTHER branch, so the two gates describe one defect from both sides.
BAD_WINDOW_RECORD = "data/standards/components/neon.dat"

CTRL = 'application   choupoProps;\ndescription   "cp range probe";\nverbosity 3;\n'
SYS = ('recordType thermophysicalPropertySystem;\nschemaVersion 2;\n'
       'components ( {c} );\nequilibrium {{ formulation gammaPhi;'
       ' liquid {{ activityModel ideal; }}'
       ' vapour {{ fugacityModel idealGas; }} }}\n')
OPS = ('operations\n(\n    {{ name p; type propertyPoint;\n'
       '      state {{ T {T} K; P 1 bar; composition {{ {c} 1.0; }} }}\n'
       '      properties ( cpLiquid ); }}\n);\n')


def run(binary, case):
    p = subprocess.run([str(binary), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def props_probe(comp, T):
    td = tempfile.mkdtemp()
    c = Path(td) / "probe"
    (c / "system").mkdir(parents=True)
    (c / "constant").mkdir()
    (c / "system" / "controlDict").write_text(CTRL)
    (c / "constant" / "thermoPhysPropDict").write_text(SYS.format(c=comp))
    (c / "system" / "propsDict").write_text(OPS.format(c=comp, T=T))
    return run(PROPS, c)


def bad_window_probe():
    """A component whose EVALUATED Cp block declares hi <= lo."""
    td = tempfile.mkdtemp()
    c = Path(td) / "probe"
    (c / "system").mkdir(parents=True)
    (c / "constant" / "components").mkdir(parents=True)
    src = (ROOT / "data/standards/components/water.dat").read_text()
    #  Invert the ideal-gas window the same way the pinned records invert
    #  their liquid one.  Nothing else about the record is touched.
    out = re.sub(r'(idealGasHeatCapacity\s*\{[^{}]*?Trange\s*\()\s*[\d.]+\s+[\d.]+(\s*\))',
                 r'\g<1>400 300\g<2>', src, count=1, flags=re.S)
    if out == src:
        return 1, "PROBE-STALE: water.dat has no idealGasHeatCapacity Trange"
    (c / "constant" / "components" / "water.dat").write_text(out)
    (c / "system" / "controlDict").write_text(CTRL)
    (c / "constant" / "thermoPhysPropDict").write_text(SYS.format(c="water"))
    (c / "system" / "propsDict").write_text(OPS.format(c="water", T=350))
    return run(PROPS, c)


def main() -> int:
    fail, checked = [], []
    for b in (SOLVE, PROPS):
        if not b.exists():
            print(f"check_cp_range_announced: FAILED\n  {b.name} not built")
            return 1

    #  (a) THE NEGATIVE.  An in-range case says nothing.
    rc, out = run(SOLVE, ROOT / SILENT)
    if rc != 0:
        fail.append(f"{Path(SILENT).name} does not run (exit {rc})")
    elif "[cp]" in out:
        fail.append(f"{Path(SILENT).name} evaluates every Cp inside its "
                    "declared window yet announces an extrapolation.  A "
                    "warning that fires on a healthy case is not read on a "
                    "sick one.")
    else:
        checked.append("silent in-range control")

    #  (b) EXTRAPOLATION IS ANNOUNCED, on a case that really does it.
    rc, out = run(SOLVE, ROOT / LOUD)
    if rc != 0:
        fail.append(f"{Path(LOUD).name} does not run (exit {rc})")
    else:
        m = re.search(r'\[cp\].*OUTSIDE its declared Trange \(([\d.]+) ([\d.]+)\)',
                      out)
        if not m:
            fail.append(
                f"{Path(LOUD).name} evaluates a polynomial Cp outside its "
                "fitted range and says nothing.  The window is declared in "
                "the record and would be parsed and discarded again -- which "
                "is the defect this gate exists for (I4).")
        elif float(m.group(2)) <= float(m.group(1)):
            fail.append("the extrapolation message was emitted for a window "
                        "that is not an interval -- the two failures must "
                        "stay distinct, or 'you extrapolated' and 'this "
                        "record is broken' become the same sentence")
        else:
            checked.append(f"extrapolation announced ({Path(LOUD).name}, "
                           f"Trange {m.group(1)}-{m.group(2)})")

    #  (c) A WINDOW THAT IS NOT A WINDOW gets its OWN message.
    rec = ROOT / BAD_WINDOW_RECORD
    if not rec.exists():
        fail.append(f"{BAD_WINDOW_RECORD} is missing -- the fixture is stale")
    else:
        liq = re.search(r'liquidHeatCapacity\s*\{.*?Trange\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)',
                        rec.read_text(), re.S)
        if not liq:
            fail.append(f"{rec.name} no longer declares a liquidHeatCapacity "
                        "Trange -- re-point this fixture at a record that does")
        elif float(liq.group(2)) > float(liq.group(1)):
            fail.append(f"{rec.name}'s window has been REPAIRED "
                        f"({liq.group(1)} {liq.group(2)}) -- good, but this "
                        "fixture no longer exercises the branch.  Re-point it "
                        "at another pinned record, or retire the check with "
                        "the last of them.")
        else:
            #  FIXTURE BY CONSTRUCTION, not by finding a case that uses one
            #  of the six pinned records.  Asking a props op for `cpLiquid`
            #  does NOT reach the liquid polynomial for those records -- the
            #  probe came back with the IDEAL-GAS model's message instead,
            #  and reading that as "the branch fired" would have been the
            #  witness-that-cannot-fail mistake.  So the fixture puts the
            #  inverted window on the block that IS evaluated, copying the
            #  real defect's shape (hi <= lo on a four-term polynomial)
            #  without depending on which model a props op happens to select.
            rc, out = bad_window_probe()
            if "not an interval" not in out:
                fail.append(
                    "a Cp whose declared window has hi <= lo produced no "
                    "message naming that defect.  Reporting it as 'outside "
                    "the range' would be nonsense (every T is outside an "
                    "empty interval) and reporting nothing hides a record "
                    "whose fitted domain is unknown.")
            else:
                checked.append(f"non-interval window named ({rec.stem})")

    if fail:
        print("check_cp_range_announced: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_cp_range_announced: OK -- " + "; ".join(checked)
          + ".  The two failures stay distinct, and an in-range case stays "
            "silent, so the announcement is information rather than decoration.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
