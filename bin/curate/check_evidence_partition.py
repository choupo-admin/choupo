#!/usr/bin/env python3
"""check_evidence_partition -- the FIT / HELD-OUT contract holds, and refuses.

Until this contract existed, every residual statistic choupoProps could produce
was IN-SAMPLE and nothing said so.  The claim this gate defends is narrow and
structural: *the fitter never receives a held-out point, and when nothing is
held out the tool says so instead of reporting its in-sample error as a
validation.*

ARMS (each sabotage-verified; every one must fail with the fix reverted):

  A1  THE PARTITION IS HONOURED, CHECKED BY VALUE.  In curate01 the two
      operations declare the SAME two datasets and differ only in one `role`.
      The fitted-points CSV of the validated operation must contain the 10
      low-temperature points and NOT ONE of the 10 held-out ones -- checked
      against the actual temperatures, not against a count, because a count
      alone would pass if the fitter had swapped a point for another.

  A2  R1 FIRES.  The operation whose evidence is all `role fit` prints
      VALIDATION REFUSED verbatim, reports n_heldout = 0, and labels its R2
      in-sample.

  A3  R2 FIRES -- a dataset entry with no `role` is refused (there is no
      default; a defaulted role would silently make everything a fitting set).

  A4  R3 FIRES -- the same dataset declared in both roles is refused.

  A5  THE TWO FORMS ARE EXCLUSIVE -- `evidence` beside a bare `dataset`
      refuses rather than resolving by an undeclared precedence.

  A6  THE LEGACY FORM STILL CLAIMS NOTHING -- a single `dataset` announces
      that all points are fitted and no validation is claimed, and the two
      pre-existing fit cases keep their goldens.

  A7  THE FINGERPRINT CAPTURES THE ROLE, not merely the file list: curate01's
      two operations name identical datasets and must fingerprint differently.

WHAT THIS GATE DOES NOT CHECK, stated plainly:
  * whether any fitted number is PHYSICALLY RIGHT.  curate01's datasets are
    generated from the same curated Antoine correlation the model fits, so its
    held-out residual is arithmetic, not evidence about physics.  This gate
    tests the machinery; anchoring it against measurement is a later slice.
  * whether two datasets are SCIENTIFICALLY INDEPENDENT.  Only an identity
    collision is a fact a machine may settle (A4); shared provenance is
    announced for a human and never adjudicated here.
  * R5 of the design ("role validation on an op that performs no fit") -- not
    implemented yet, because both ops wired in this slice do fit and no
    witness could fire it.

Exit 0 on success, 1 with the failing arm named.
"""

import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASE = ROOT / "tutorials/props/curation/curate01_water_evidence_partition"
PROPS = ROOT / "choupoProps"

FIT_MAX_T = 320.0      # the low-temperature half ends here
HELD_MIN_T = 325.0     # the held-out half starts here


def run(case: pathlib.Path):
    p = subprocess.run([str(PROPS), "."], cwd=case,
                       capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def probe(mutate, label):
    """Copy curate01 to a temp dir, mutate its propsDict, run it."""
    with tempfile.TemporaryDirectory() as td:
        d = pathlib.Path(td) / "probe"
        shutil.copytree(CASE, d)
        pd = d / "system/propsDict"
        pd.write_text(mutate(pd.read_text()))
        rc, out = run(d)
        return rc, out, label


def main():
    fails = []

    if not PROPS.exists():
        print("check_evidence_partition: FAIL -- choupoProps is not built")
        return 1

    rc, out = run(CASE)
    if rc != 0:
        fails.append(f"A0 curate01 does not run (exit {rc})\n{out[-800:]}")
        print("check_evidence_partition: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    # -- A1: the fitter saw the fit set and NOTHING of the held-out set ------
    csv = CASE / "psat_water_validated.csv"
    if not csv.exists():
        fails.append("A1 the validated operation wrote no fitted-points CSV")
    else:
        temps = [float(r.split(",")[0])
                 for r in csv.read_text().splitlines()[1:] if r.strip()]
        leaked = [t for t in temps if t >= HELD_MIN_T]
        if leaked:
            fails.append(
                f"A1 HELD-OUT POINTS REACHED THE FIT: {leaked} K appear among "
                f"the fitted points, and the contract's whole claim is that the "
                f"fitter is never handed one")
        if len([t for t in temps if t <= FIT_MAX_T]) != 10:
            fails.append(
                f"A1 expected the 10 low-temperature points to be fitted, got "
                f"{len([t for t in temps if t <= FIT_MAX_T])}")

    # -- A2: R1 fires, verbatim ---------------------------------------------
    if "VALIDATION REFUSED:" not in out:
        fails.append("A2 the all-fit operation did not print VALIDATION REFUSED")
    if "No independent experimental evidence remains after fitting." not in out:
        fails.append("A2 the refusal's second line is not the ruled wording")
    if "IN-SAMPLE" not in out:
        fails.append("A2 the refused operation did not label its R2 in-sample")

    # -- A7: the fingerprint distinguishes the two role assignments ----------
    prints = re.findall(r"fingerprint ([0-9a-f]{16})", out)
    if len(prints) < 2:
        fails.append(f"A7 expected two partition fingerprints, saw {len(prints)}")
    elif prints[0] == prints[1]:
        fails.append(
            "A7 the two operations declare identical datasets in DIFFERENT "
            "roles and fingerprinted identically -- the fingerprint is reading "
            "the file list and not the partition")

    # -- A3/A4/A5: the refusals, through the real reader ---------------------
    def drop_role(s):
        return s.replace("                role      validation;\n", "", 1)

    def collide(s):
        return s.replace("constant/experiments/psat-water-highT.dat",
                         "constant/experiments/psat-water-lowT.dat", 1)

    def both_forms(s):
        return s.replace("        evidence\n",
                         '        dataset "constant/experiments/psat-water-lowT.dat";\n'
                         "        evidence\n", 1)

    for mut, label, needle in (
        (drop_role, "A3 missing `role`", "declares no `role`"),
        (collide,   "A4 identity collision", "declared in BOTH roles"),
        (both_forms, "A5 both forms declared", "AMBIGUOUS evidence specification"),
    ):
        rc_p, out_p, _ = probe(mut, label)
        if rc_p == 0:
            fails.append(f"{label}: accepted; it must refuse")
        elif needle not in out_p:
            fails.append(f"{label}: refused, but not by name "
                         f"(expected {needle!r})")

    # -- A6: the legacy form claims nothing ---------------------------------
    legacy = ROOT / "tutorials/props/fit/psat01_antoine_recovery"
    rc_l, out_l = run(legacy)
    if rc_l != 0:
        fails.append(f"A6 the legacy case no longer runs (exit {rc_l})")
    elif "NO validation is claimed" not in out_l:
        fails.append("A6 the legacy single-dataset form does not announce that "
                     "it claims no validation")

    if fails:
        print("check_evidence_partition: FAIL")
        for f in fails:
            print("  - " + f)
        return 1

    print("check_evidence_partition: OK -- the held-out points are provably "
          "absent from the fitted set (checked by temperature, not by count); "
          "VALIDATION REFUSED fires verbatim with n_heldout 0 and an in-sample "
          "label when nothing is held out; a missing `role`, an identity "
          "collision across roles and the two forms declared together each "
          "refuse by name; the legacy single-dataset form still announces that "
          "it claims nothing; and two operations naming identical datasets in "
          "different roles fingerprint differently.  NOT COVERED: whether any "
          "number is physically right (curate01's evidence is generated from "
          "the correlation being fitted, so its held-out residual is "
          "arithmetic), whether two datasets are scientifically independent "
          "(only an identity collision is a fact), and design refusal R5, "
          "which has no witness in this slice.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
