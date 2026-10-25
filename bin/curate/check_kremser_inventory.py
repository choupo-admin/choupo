#!/usr/bin/env python3
"""check_kremser_inventory -- the Kremser columns route every mole they are fed,
or refuse by name.

WHY.  `Absorber` and `Stripper` classify each component as a SOLUTE (moved
between the phases by the stage tridiagonal), the SOLVENT (held in the liquid)
or an INERT (held in the gas), and then write each class's molar flows into the
outlets.  Material that arrives in the stream its class does not expect had no
row and left in NEITHER outlet, at exit 0 (C131 separations review,
2026-10-25, measured on the engine of origin/main 79d152339):

  * a stripper whose stripping gas carries the solvent -- live steam, the
    commonest stripping medium: stripper01_NH3_water with 20 of its 100 kmol/h
    of gas as water closed on mass at 91.807 %, a 1363 kW first-law hole;
  * a stripper whose rich liquid carries a non-solute (5 kmol/h of N2):
    96.986 %, with `recovery_N2 = 1` for material that reached no outlet;
  * an absorber whose solvent carries a non-solute (5 kmol/h of N2 in
    absorber01's wash): 97.469 %;
  * a stripper on a package with no solvent: the Absorber has refused that
    since 2026-08-12 ("nothing to absorb"), the Stripper -- same
    classification, same molar-flow loop -- never learnt it, so the whole
    rich liquid would have vanished.

The default mass-balance report saw each one; the unit did not.  A unit that
has determined it cannot route a mole must not hand a fabricated answer to a
report and hope the report objects.

WHAT IT CHECKS
  K1  stripper, steam in the stripping gas: REFUSED, naming the solvent and
      the stripping gas.
  K2  stripper, an inert in the rich liquid: REFUSED, naming the component.
  K3  absorber, an inert in the solvent stream: REFUSED, naming the component.
  K4  stripper on a gammaPhi package (no solvent): REFUSED, naming the
      missing SOLVENT -- and the absorber on the same package, the mirror the
      stripper copies (that refusal was ungated until this gate).
  K5  a TRACE below the refusal threshold (1e-12 of its stream) is CARRIED,
      never deleted: steam at 1e-13 of the stripping gas runs, the mass
      closure is 100.000 % and the rich gas carries the water.
  K6  the negatives: absorber01_NH3_water and stripper01_NH3_water, as
      shipped, run and close at 100.000 % -- the refusals do not fire on the
      corpus.

WHAT IT DOES NOT CHECK, stated so nothing is implied:
  * whether the Kremser answer is right (the corpus goldens pin it; the
    EduTool Kremser page plots it against the closed form);
  * the lumped-Cp energy residuals of both units (check_lumped_cp_note and
    check_energy_closure's KNOWN_OPEN_KW own those);
  * a solvent arriving with an ABSORBER's gas: that routes to the liquid by
    the 2026-08-12 rule, and acetone05's golden pins it.

FAIL-FIRST, observed 2026-10-25: with Absorber.cpp and Stripper.cpp restored
to origin/main (79d152339) and rebuilt, this gate printed
  K1: the probe RAN (exit 0, mass closure 91.807 %)
  K2: the probe RAN (exit 0, mass closure 96.986 %)
  K3: the probe RAN (exit 0, mass closure 97.469 %)
  K4 (stripper): the probe RAN (exit 0, mass closure 60.926 %)
  K5: the rich gas carries no water -- the trace was deleted
and K4 (absorber) and K6 passed, as they must (that refusal already existed,
and the corpus is untouched); the fix restored and rebuilt, every arm passes.
Record: docs/design/review-c131-separations.md.

Exit 0 = every arm holds.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "choupoSolve"
ABS = ROOT / "tutorials/steady/absorption/absorber01_NH3_water"
STR = ROOT / "tutorials/steady/absorption/stripper01_NH3_water"

failures = []


def run(case: Path):
    p = subprocess.run([str(SOLVE), str(case)], capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def probe(src: Path, dst: Path) -> Path:
    shutil.copytree(src, dst)
    #  A modified case legitimately diverges from its seal and its golden.
    for junk in ("converged", "reports", "design", "expected",
                 "constant/propertyManifest"):
        t = dst / junk
        if t.is_dir():
            shutil.rmtree(t)
        elif t.exists():
            t.unlink()
    return dst


def edit(path: Path, old: str, new: str, arm: str) -> bool:
    t = path.read_text()
    if old not in t:
        failures.append(f"{arm}: the fixture could not be built -- {path.name}"
                        f" no longer contains {old!r}")
        return False
    path.write_text(t.replace(old, new, 1))
    return True


def closure(out: str):
    m = re.search(r"global closure ([0-9.]+) %", out)
    return float(m.group(1)) if m else None


def expect_refusal(arm: str, case: Path, needles):
    rc, out = run(case)
    if rc == 0:
        failures.append(f"{arm}: the probe RAN (exit 0, mass closure"
                        f" {closure(out)} %) -- it must refuse")
        return
    for nd in needles:
        if nd not in out:
            failures.append(f"{arm}: the refusal does not name {nd!r}")


GAMMA_PHI = """recordType    thermophysicalPropertySystem;
schemaVersion 2;
components       ( NH3  N2  water );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
"""


def main() -> int:
    if not SOLVE.exists():
        print("check_kremser_inventory: choupoSolve missing -- build first")
        return 1
    with tempfile.TemporaryDirectory(prefix="kremser_inv_") as td:
        td = Path(td)

        # -- K1: steam in the stripping gas
        k1 = probe(STR, td / "k1_steam")
        if edit(k1 / "0/strippingGas", "    N2    100 kmol/h;",
                "    N2    80 kmol/h;\n    water 20 kmol/h;", "K1"):
            expect_refusal("K1", k1, ["Stripper:", "stripping gas",
                                      "SOLVENT 'water'"])

        # -- K2: an inert in the rich liquid
        k2 = probe(STR, td / "k2_inert")
        if edit(k2 / "0/liquidFeed", "    water    95 kmol/h;",
                "    water    90 kmol/h;\n    N2    5 kmol/h;", "K2"):
            expect_refusal("K2", k2, ["Stripper:", "liquid feed", "'N2'"])

        # -- K3: an inert in the absorber's solvent
        k3 = probe(ABS, td / "k3_inert")
        sv = k3 / "0/solvent"
        t = sv.read_text()
        t2 = re.sub(r"(componentMolarFlows\s*\{)", r"\1\n    N2    5 kmol/h;",
                    t, count=1)
        if t2 == t:
            failures.append("K3: the fixture could not be built")
        else:
            sv.write_text(t2)
            expect_refusal("K3", k3, ["Absorber:", "solvent stream", "'N2'"])

        # -- K4: no solvent in the package, both units
        for tag, src, unit in (("stripper", STR, "Stripper:"),
                               ("absorber", ABS, "Absorber:")):
            k4 = probe(src, td / f"k4_{tag}")
            (k4 / "constant/thermoPhysPropDict").write_text(GAMMA_PHI)
            expect_refusal(f"K4 ({tag})", k4,
                           [unit, "names no SOLVENT"])

        # -- K5: a trace is carried, never deleted
        k5 = probe(STR, td / "k5_trace")
        if edit(k5 / "0/strippingGas", "    N2    100 kmol/h;",
                "    N2    100 kmol/h;\n    water 1e-11 kmol/h;", "K5"):
            rc, out = run(k5)
            c = closure(out)
            if rc != 0:
                failures.append(f"K5: a 1e-13 trace of steam was REFUSED"
                                f" (exit {rc}) -- below the threshold it must"
                                f" be carried")
            elif c is None or abs(c - 100.0) > 5e-4:
                failures.append(f"K5: the trace run closes at {c} % -- the"
                                f" trace was not carried")
            else:
                m = re.search(r'"richGas": \{[^}]*"composition": \{([^}]*)\}',
                              out)
                wat = re.search(r'"water": ([-0-9.eE+]+)', m.group(1)) if m else None
                if not wat or float(wat.group(1)) <= 0.0:
                    failures.append("K5: the rich gas carries no water -- the"
                                    " trace was deleted")

        # -- K6: the corpus as shipped
        for case in (ABS, STR):
            rc, out = run(case)
            c = closure(out)
            if rc != 0 or c is None or abs(c - 100.0) > 5e-4:
                failures.append(f"K6: {case.name} as shipped exits {rc} with"
                                f" closure {c} % -- a refusal fired on the"
                                f" corpus, or the routing moved")

    if failures:
        print("check_kremser_inventory: FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print("check_kremser_inventory: OK -- the stripper refuses steam in its"
          " stripping gas (K1), a non-solute in its rich liquid (K2) and a"
          " package with no solvent (K4), the absorber a non-solute in its"
          " solvent (K3) and a package with no solvent (K4); a trace below"
          " 1e-12 of its stream is carried, not deleted (K5); absorber01 and"
          " stripper01 as shipped close at 100.000 % (K6).  NOT CHECKED:"
          " whether the Kremser answer is right, the lumped-Cp energy"
          " residuals, the absorber's solvent-in-gas rule.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
